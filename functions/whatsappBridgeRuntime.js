const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {GoogleAuth} = require("google-auth-library");
const admin = require("firebase-admin");

const REGION = "us-central1";
const INSTANCE_REGION = "southamerica-east1";
const INSTANCE = "bluportal-whatsapp-bridge-lowcost";
const TIME_ZONE = "America/Fortaleza";
const SERVICE_ACCOUNT =
  "whatsapp-bridge-scheduler@blu-app-camara.iam.gserviceaccount.com";
const ATTENDANCE_START_MINUTE = 8 * 60;
const ATTENDANCE_END_MINUTE = 14 * 60;
const TEST_EXTENSION_DATE = "2026-11-04";
const TEST_EXTENSION_END_MINUTE = 17 * 60;
const API_BASE = `https://run.googleapis.com/v2/projects/${
  process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT
}/locations/${INSTANCE_REGION}/instances/${INSTANCE}`;
const googleAuth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

/**
 * Returns calendar and clock values in the attendance timezone.
 * @param {Date} date Current instant
 * @return {{year: number, month: number, day: number, weekday: string,
 *   hour: number, minute: number}} Fortaleza date/time parts
 */
function getFortalezaDateParts(date = new Date()) {
  const values = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    dateKey: `${values.year}-${values.month}-${values.day}`,
    weekday: values.weekday,
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

/**
 * Calculates Easter Sunday in the Gregorian calendar.
 * @param {number} year Calendar year
 * @return {Date} Easter Sunday at UTC midnight
 */
function getEasterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Checks national holidays and Ceará dates previously selected for the portal.
 * @param {{year: number, month: number, day: number}} parts Local date parts
 * @return {boolean} Whether the date is a configured holiday
 */
function isAttendanceHoliday({year, month, day}) {
  const monthDay = `${String(month).padStart(2, "0")}-` +
    String(day).padStart(2, "0");
  const fixedHolidays = new Set([
    "01-01", "03-19", "03-25", "04-21", "05-01", "09-07",
    "10-12", "11-02", "11-15", "11-20", "12-25",
  ]);
  if (fixedHolidays.has(monthDay)) return true;

  // Include Good Friday as a local religious no-service day.
  const goodFriday = new Date(getEasterSunday(year).getTime() - 2 * 86400000);
  return goodFriday.getUTCMonth() + 1 === month &&
    goodFriday.getUTCDate() === day;
}

/**
 * Attendance may run Monday-Friday from 08:00 until (but not including) 14:00.
 * @param {Date} date Current instant
 * @return {boolean} Whether the WhatsApp service is within its allowed window
 */
function isWithinAttendanceWindow(date = new Date()) {
  const parts = getFortalezaDateParts(date);
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri"]
      .includes(parts.weekday);
  const minuteOfDay = parts.hour * 60 + parts.minute;
  const endMinute = parts.dateKey === TEST_EXTENSION_DATE ?
    TEST_EXTENSION_END_MINUTE : ATTENDANCE_END_MINUTE;
  return weekday && !isAttendanceHoliday(parts) &&
    minuteOfDay >= ATTENDANCE_START_MINUTE &&
    minuteOfDay < endMinute;
}

/**
 * Reads the current Cloud Run instance state.
 * @param {object} client Authorized Google API client
 * @return {Promise<string>} Instance state
 */
async function getInstanceState(client) {
  const response = await client.request({url: API_BASE, method: "GET"});
  const instance = response.data || {};
  const terminalCondition = instance.terminalCondition;
  if (!terminalCondition || instance.reconciling) {
    return "UNKNOWN";
  }
  if (terminalCondition.state === "CONDITION_SUCCEEDED") return "RUNNING";
  if (terminalCondition.instanceReason === "INSTANCE_STOPPED" ||
      terminalCondition.instanceReason === "INSTANCE_STOPPING") {
    return "STOPPED";
  }
  return "UNKNOWN";
}

/**
 * Starts or stops the bridge only when its current state differs.
 * @param {boolean} shouldRun Whether at least one service counter is open
 * @return {Promise<string>} Result description
 */
async function setBridgeState(shouldRun) {
  const client = await googleAuth.getClient();
  const state = await getInstanceState(client);
  const desiredState = shouldRun ? "RUNNING" : "STOPPED";
  if (state === desiredState) {
    return shouldRun ? "already_running" : "already_stopped";
  }
  if (state !== "RUNNING" && state !== "STOPPED") {
    throw new Error(
        `Não foi possível determinar o estado da instância: ${state}`,
    );
  }
  const action = shouldRun ? "start" : "stop";
  await client.request({
    url: `${API_BASE}:${action}`,
    method: "POST",
    data: {},
  });
  return `${action}_requested`;
}

/**
 * Checks the persisted Baileys registration without starting Cloud Run.
 * @return {Promise<{registered: boolean, status: string}>} Saved session state
 */
async function getSavedWhatsAppSession() {
  const db = admin.firestore();
  const [authSnapshot, runtimeSnapshot] = await Promise.all([
    db.collection("whatsappPrivate").doc("baileysAuth").get(),
    db.collection("whatsappRuntime").doc("session").get(),
  ]);
  const creds = authSnapshot.data() && authSnapshot.data().creds;
  // Baileys may preserve a valid account identity with registered=false after
  // a reconnect. The persisted account JID is the durable pairing indicator.
  const registered = Boolean(creds && creds.me && creds.me.id);
  const status = String(runtimeSnapshot.data()?.status || "disconnected");
  return {registered, status};
}

/**
 * Reads live Baileys health from the bridge process.
 * @param {string} baseUrl Configured Cloud Run URL
 * @return {Promise<{status: string}|null>} Live connection state if reachable
 */
async function getLiveBridgeStatus(baseUrl) {
  if (!baseUrl) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${baseUrl}/health`, {
      method: "GET",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const health = await response.json();
    return {status: String(health.status || "disconnected")};
  } catch (error) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Starts only a previously paired WhatsApp and stops Cloud Run if it cannot
 * establish a live Baileys connection.
 * @return {Promise<{ok: boolean, result: string, message: string}>}
 *   Start result
 */
async function startBridgeForPairedWhatsApp() {
  const db = admin.firestore();
  const runtimeRef = db.collection("whatsappRuntime").doc("session");
  const savedSession = await getSavedWhatsAppSession();
  if (!isWithinAttendanceWindow()) {
    const stopResult = await setBridgeState(false);
    const message = "O WhatsApp só pode funcionar em dias úteis, " +
      "das 08h às 14h (horário de Fortaleza).";
    await runtimeRef.set({
      status: savedSession.status === "logged_out" ? "logged_out" :
        "disconnected",
      instanceAvailability: "outside_attendance_window",
      instanceRunning: false,
      lastInstanceAction: stopResult,
      lastInstancePreflightAt: admin.firestore.FieldValue.serverTimestamp(),
      lastError: message,
    }, {merge: true});
    return {ok: false, result: "outside_attendance_window", message};
  }

  const settingsSnapshot = await db.collection("whatsappSettings")
      .doc("config").get();
  const baseUrl = String(settingsSnapshot.data()?.bridgeUrl || "")
      .trim().replace(/\/+$/, "");
  if (!savedSession.registered ||
      ["logged_out", "qr_required"].includes(savedSession.status) || !baseUrl) {
    const stopResult = await setBridgeState(false);
    const message = savedSession.status === "logged_out" ?
      "O WhatsApp encerrou o pareamento. Gere um QR Code na Configuração." :
      savedSession.status === "qr_required" ?
        "O WhatsApp precisa ser pareado. Gere um QR Code na Configuração." :
      !baseUrl ?
        "Configure o endereço do WhatsApp antes de iniciar o atendimento." :
        "Nenhum WhatsApp pareado. Conecte um aparelho na Configuração.";
    const blockedStatus = savedSession.status === "logged_out" ?
      "logged_out" : "disconnected";
    await runtimeRef.set({
      status: blockedStatus,
      instanceAvailability: "blocked_no_paired_whatsapp",
      instanceRunning: false,
      lastInstanceAction: stopResult,
      lastInstancePreflightAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(!savedSession.registered ? {phone: "", qrCode: ""} : {}),
      lastError: message,
    }, {merge: true});
    return {ok: false, result: "not_started_no_paired_whatsapp", message};
  }

  const startRequestedAt = admin.firestore.Timestamp.now();
  await runtimeRef.set({
    instanceAvailability: "starting_after_pairing_check",
    instanceRunning: true,
    connectionStartRequestedAt: startRequestedAt,
    lastInstancePreflightAt: admin.firestore.FieldValue.serverTimestamp(),
  }, {merge: true});

  const result = await setBridgeState(true);
  const timeoutAt = Date.now() + 45000;
  let liveStatus = null;
  while (Date.now() < timeoutAt) {
    liveStatus = await getLiveBridgeStatus(baseUrl);
    if (liveStatus?.status === "connected") {
      await runtimeRef.set({
        status: "connected",
        instanceAvailability: "connected",
        instanceRunning: true,
        lastInstanceAction: result,
        lastConnectionVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastError: "",
      }, {merge: true});
      return {
        ok: true,
        result,
        message: "WhatsApp conectado; atendimento iniciado.",
      };
    }
    if (["logged_out", "qr_required"].includes(liveStatus?.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  await setBridgeState(false);
  const disconnectedMessage = liveStatus?.status === "logged_out" ?
    "O WhatsApp encerrou o pareamento. A Cloud Run foi desligada; " +
    "gere um novo QR Code na Configuração." :
    liveStatus?.status === "qr_required" ?
      "O WhatsApp precisa ser pareado. A Cloud Run foi desligada; " +
      "gere o QR Code na Configuração." :
      "A conexão do WhatsApp não foi confirmada. A Cloud Run foi desligada.";
  await runtimeRef.set({
    status: liveStatus?.status === "logged_out" ? "logged_out" : "disconnected",
    instanceAvailability: "stopped_whatsapp_not_connected",
    instanceRunning: false,
    openCounterSession: false,
    lastInstanceAction: "stopped_without_live_whatsapp",
    lastConnectionCheckAt: admin.firestore.FieldValue.serverTimestamp(),
    lastError: disconnectedMessage,
  }, {merge: true});
  return {
    ok: false,
    result: "stopped_without_live_whatsapp",
    message: disconnectedMessage,
  };
}

/**
 * Records the actual disconnected state after stopping the server process.
 * @param {string} availability Operational reason for stopping
 * @param {string} action Result of the Cloud Run stop request
 * @param {object} extra Extra runtime fields
 * @return {Promise<void>} Completion
 */
async function recordBridgeStopped(availability, action, extra = {}) {
  const runtimeRef = admin.firestore()
      .collection("whatsappRuntime").doc("session");
  const snapshot = await runtimeRef.get();
  const previousStatus = String(snapshot.data()?.status || "");
  await runtimeRef.set({
    ...extra,
    status: previousStatus === "logged_out" ? "logged_out" : "disconnected",
    qrCode: "",
    instanceAvailability: availability,
    instanceRunning: false,
    openCounterSession: false,
    lastInstanceAction: action,
    lastInstanceStoppedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, {merge: true});
}

/**
 * Closes every open counter session and returns any active ticket to the queue.
 * @param {string} reason Why the sessions are being closed
 * @param {string} actor Who initiated the close
 * @return {Promise<{sessions: number, counters: number, tickets: number}>}
 *   Number of records closed or returned to the queue
 */
async function closeAllCounterSessions(reason, actor) {
  const db = admin.firestore();
  const [sessionsSnapshot, countersSnapshot, activeTicketsSnapshot] =
    await Promise.all([
      db.collection("atendimento-guiche-relatorios")
          .where("status", "==", "Aberta").get(),
      db.collection("atendimento-guiches")
          .where("sessaoAtiva", "==", true).get(),
      db.collection("atendimento-fila")
          .where("status", "in", ["Chamando", "Em Atendimento"]).get(),
    ]);
  const activeCounterIds = new Set(
      countersSnapshot.docs.map((item) => item.id),
  );
  const activeTicketIds = new Set(
      countersSnapshot.docs.map((item) => item.data().ticketAtualId)
          .filter(Boolean),
  );
  const ticketsToReturn = activeTicketsSnapshot.docs.filter((ticket) =>
    activeCounterIds.has(ticket.data().guicheId) ||
    activeTicketIds.has(ticket.id),
  );
  const now = new Date();
  const writes = [
    ...sessionsSnapshot.docs.map((session) => ({
      ref: session.ref,
      data: {
        encerradoEm: now,
        status: "Encerrada",
        encerradaPorSistema: true,
        motivoEncerramento: reason,
        atualizadoEm: now,
      },
    })),
    ...countersSnapshot.docs.map((counter) => ({
      ref: counter.ref,
      data: {
        sessaoAtiva: false,
        sessaoId: null,
        sessaoIniciadaEm: null,
        atendenteUid: null,
        atendenteNome: null,
        atendenteEmail: null,
        senhaAtual: null,
        ticketAtualId: null,
        atualizadoEm: now,
        encerradoPorSistema: true,
      },
    })),
    ...ticketsToReturn.map((ticket) => ({
      ref: ticket.ref,
      data: {
        status: "Aguardando",
        guiche: null,
        guicheId: null,
        retornouFilaEm: now,
        atualizadoEm: now,
        atualizadoPor: actor,
        motivoRetornoFila: reason,
      },
    })),
  ];

  for (let index = 0; index < writes.length; index += 450) {
    const batch = db.batch();
    writes.slice(index, index + 450).forEach((write) => {
      batch.set(write.ref, write.data, {merge: true});
    });
    await batch.commit();
  }

  return {
    sessions: sessionsSnapshot.size,
    counters: countersSnapshot.size,
    tickets: ticketsToReturn.length,
  };
}

/**
 * Restricts manual WhatsApp operations to configured portal administrators.
 * @param {object} request Callable request
 */
async function requireWhatsAppAdmin(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Autenticação necessária.");
  }
  const db = admin.firestore();
  const [userSnapshot, portalSnapshot] = await Promise.all([
    db.collection("users").doc(request.auth.uid).get(),
    db.collection("system-control").doc("portal").get(),
  ]);
  const user = userSnapshot.data() || {};
  const portal = portalSnapshot.data() || {};
  const email = String(request.auth.token.email || "").trim().toLowerCase();
  const configuredRoots = Array.isArray(
      portal.security && portal.security.rootEmails,
  ) ?
    portal.security.rootEmails.map((item) =>
      String(item).trim().toLowerCase(),
    ) :
    [];
  const roots = configuredRoots.length ? configuredRoots : ["leo@gmail.com"];
  if (!roots.includes(email) &&
      !["Admin", "Administrador"].includes(user.tipo || user.role)) {
    throw new HttpsError(
        "permission-denied",
        "Somente administradores podem controlar os atendimentos WhatsApp.",
    );
  }
  return {uid: request.auth.uid, email};
}

/** Manually starts WhatsApp or closes all guichês and stops it. */
exports.whatsappAttendanceControl = onCall({
  region: REGION,
  serviceAccount: SERVICE_ACCOUNT,
  timeoutSeconds: 120,
}, async (request) => {
  const actor = await requireWhatsAppAdmin(request);
  const action = String((request.data && request.data.action) || "");
  const runtimeRef = admin.firestore()
      .collection("whatsappRuntime").doc("session");

  if (action === "start") {
    const result = await startBridgeForPairedWhatsApp();
    if (!result.ok) return result;
    await runtimeRef.set({
      instanceAvailability: "manually_started",
      instanceRunning: true,
      lastInstanceAction: result.result,
      lastInstanceActionAt: admin.firestore.FieldValue.serverTimestamp(),
      lastInstanceActionBy: actor.email,
    }, {merge: true});
    return {
      ok: true,
      result: result.result,
      message: result.message,
    };
  }

  if (action === "pairing") {
    if (!isWithinAttendanceWindow()) {
      const result = await setBridgeState(false);
      const message = "O pareamento do WhatsApp fica disponível em dias " +
        "úteis, das 08h às 14h (horário de Fortaleza).";
      await runtimeRef.set({
        status: "disconnected",
        instanceAvailability: "outside_attendance_window",
        instanceRunning: false,
        lastInstanceAction: result,
        lastInstanceActionAt: admin.firestore.FieldValue.serverTimestamp(),
        lastInstanceActionBy: actor.email,
        lastError: message,
      }, {merge: true});
      return {ok: false, result: "outside_attendance_window", message};
    }

    const result = await setBridgeState(true);
    await runtimeRef.set({
      instanceAvailability: "pairing_setup",
      instanceRunning: true,
      lastInstanceAction: result,
      lastInstanceActionAt: admin.firestore.FieldValue.serverTimestamp(),
      lastInstanceActionBy: actor.email,
    }, {merge: true});
    return {
      ok: true,
      result,
      message: "Instância iniciada para gerar ou atualizar o pareamento.",
    };
  }

  if (action === "stop") {
    const closed = await closeAllCounterSessions(
        "Encerramento manual do atendimento", actor.email,
    );
    const result = await setBridgeState(false);
    await recordBridgeStopped("manually_closed", result, {
      lastInstanceActionAt: admin.firestore.FieldValue.serverTimestamp(),
      lastInstanceActionBy: actor.email,
    });
    return {
      ok: true,
      result,
      closed,
      message:
        `Atendimento encerrado. ${closed.counters} guichê(s) fechado(s); ` +
        "Cloud Run parado.",
    };
  }

  throw new HttpsError("invalid-argument", "Ação de atendimento inválida.");
});

/**
 * Closes forgotten sessions and stops WhatsApp at 14h every day.
 */
exports.whatsappAttendanceDailyCutoff = onSchedule({
  schedule: "0 14 * * *",
  timeZone: TIME_ZONE,
  region: REGION,
  serviceAccount: SERVICE_ACCOUNT,
  invoker: SERVICE_ACCOUNT,
  retryCount: 1,
}, async () => {
  const nowInFortaleza = getFortalezaDateParts();
  const minuteOfDay = nowInFortaleza.hour * 60 + nowInFortaleza.minute;
  if (nowInFortaleza.dateKey === TEST_EXTENSION_DATE &&
      minuteOfDay < TEST_EXTENSION_END_MINUTE) {
    console.log("Corte das 14h adiado pela extensão de teste até 17h.");
    return;
  }

  const closed = await closeAllCounterSessions(
      "Encerramento automático diário às 14h", "Sistema",
  );
  const result = await setBridgeState(false);
  await recordBridgeStopped("closed_by_daily_cutoff", result, {
    dailyCutoffAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log("Corte diário das 14h do atendimento WhatsApp concluído.", {
    closed,
    result,
  });
});

/**
 * Temporary test-day cutoff. The guard makes the annual cron a no-op in later
 * years; remove the Cloud Scheduler job after the November 4, 2026 run.
 */
exports.whatsappAttendanceTestDayCutoff = onSchedule({
  schedule: "0 17 4 11 *",
  timeZone: TIME_ZONE,
  region: REGION,
  serviceAccount: SERVICE_ACCOUNT,
  invoker: SERVICE_ACCOUNT,
  retryCount: 1,
}, async () => {
  if (getFortalezaDateParts().dateKey !== TEST_EXTENSION_DATE) return;

  const closed = await closeAllCounterSessions(
      "Encerramento extraordinário de teste às 17h", "Sistema",
  );
  const result = await setBridgeState(false);
  await recordBridgeStopped("closed_after_test_extension", result, {
    testExtensionCutoffAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log("Corte excepcional do teste às 17h concluído.", {
    closed,
    result,
  });
});

/**
 * Starts WhatsApp at 08h on weekdays only when a counter session is open.
 */
exports.whatsappAttendanceMorningStart = onSchedule({
  schedule: "0 8 * * 1-5",
  timeZone: TIME_ZONE,
  region: REGION,
  serviceAccount: SERVICE_ACCOUNT,
  invoker: SERVICE_ACCOUNT,
  timeoutSeconds: 120,
  retryCount: 1,
}, async () => {
  const openSessions = await admin.firestore()
      .collection("atendimento-guiche-relatorios")
      .where("status", "==", "Aberta")
      .limit(1)
      .get();
  if (openSessions.empty) {
    const result = await setBridgeState(false);
    await recordBridgeStopped("stopped_no_open_counters", result, {
      morningCheckAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log("Nenhum guichê aberto às 08h; WhatsApp mantido desligado.", {
      result,
    });
    return;
  }

  const result = await startBridgeForPairedWhatsApp();
  console.log("Verificação de abertura do atendimento WhatsApp às 08h.", {
    openCounterSession: true,
    result: result.result,
    connected: result.ok,
  });
});

/**
 * Keeps the bridge on while at least one real counter session is open.
 * The query avoids acting on stale or out-of-order event payloads.
 */
exports.whatsappBridgeSyncWithCounterSessions = onDocumentWritten({
  document: "atendimento-guiche-relatorios/{sessionId}",
  region: REGION,
  serviceAccount: SERVICE_ACCOUNT,
  retry: true,
  timeoutSeconds: 120,
}, async (event) => {
  const beforeStatus = event.data && event.data.before.exists ?
    event.data.before.data().status : null;
  const afterStatus = event.data && event.data.after.exists ?
    event.data.after.data().status : null;

  // Session metrics may be updated while the counter remains open. Those writes
  // do not change whether the WhatsApp instance should be running.
  if (beforeStatus === afterStatus) return;

  const openSessions = await admin.firestore()
      .collection("atendimento-guiche-relatorios")
      .where("status", "==", "Aberta")
      .limit(1)
      .get();
  const shouldRun = !openSessions.empty;
  const result = shouldRun ?
    await startBridgeForPairedWhatsApp() :
    {ok: true, result: await setBridgeState(false)};
  if (!shouldRun) {
    await recordBridgeStopped(
        "stopped_no_open_counters", result.result,
        {lastCounterSessionId: event.params.sessionId},
    );
  }

  console.log("Estado do WhatsApp sincronizado com os guichês.", {
    sessionId: event.params.sessionId,
    openCounterSession: shouldRun,
    result: result.result,
    connected: result.ok,
  });
});
