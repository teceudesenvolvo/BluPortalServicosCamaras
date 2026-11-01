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
const API_BASE = `https://run.googleapis.com/v2/projects/${
  process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT
}/locations/${INSTANCE_REGION}/instances/${INSTANCE}`;
const googleAuth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

/**
 * Reads the current Cloud Run instance state.
 * @param {object} client Authorized Google API client
 * @return {Promise<string>} Instance state
 */
async function getInstanceState(client) {
  const response = await client.request({url: API_BASE, method: "GET"});
  const terminalCondition = response.data && response.data.terminalCondition;
  if (!terminalCondition || terminalCondition.type !== "Running") {
    return "UNKNOWN";
  }
  if (terminalCondition.state === "CONDITION_SUCCEEDED") return "RUNNING";
  if (terminalCondition.state === "CONDITION_FAILED") return "STOPPED";
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
}, async (request) => {
  const actor = await requireWhatsAppAdmin(request);
  const action = String((request.data && request.data.action) || "");
  const runtimeRef = admin.firestore()
      .collection("whatsappRuntime").doc("session");

  if (action === "start") {
    const result = await setBridgeState(true);
    await runtimeRef.set({
      instanceAvailability: "manually_started",
      instanceRunning: true,
      lastInstanceAction: result,
      lastInstanceActionAt: admin.firestore.FieldValue.serverTimestamp(),
      lastInstanceActionBy: actor.email,
    }, {merge: true});
    return {
      ok: true,
      result,
      message: "Atendimento iniciado e Cloud Run acionado.",
    };
  }

  if (action === "stop") {
    const closed = await closeAllCounterSessions(
        "Encerramento manual do atendimento", actor.email,
    );
    const result = await setBridgeState(false);
    await runtimeRef.set({
      instanceAvailability: "manually_closed",
      instanceRunning: false,
      openCounterSession: false,
      lastInstanceAction: result,
      lastInstanceActionAt: admin.firestore.FieldValue.serverTimestamp(),
      lastInstanceActionBy: actor.email,
    }, {merge: true});
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
 * Closes forgotten sessions and stops the WhatsApp instance every day at 15h.
 */
exports.whatsappAttendanceDailyCutoff = onSchedule({
  schedule: "0 15 * * *",
  timeZone: TIME_ZONE,
  region: REGION,
  serviceAccount: SERVICE_ACCOUNT,
  invoker: SERVICE_ACCOUNT,
  retryCount: 1,
}, async () => {
  const closed = await closeAllCounterSessions(
      "Encerramento automático diário às 15h", "Sistema",
  );
  const result = await setBridgeState(false);
  await admin.firestore().collection("whatsappRuntime").doc("session").set({
    instanceAvailability: "closed_by_daily_cutoff",
    instanceRunning: false,
    openCounterSession: false,
    dailyCutoffAt: admin.firestore.FieldValue.serverTimestamp(),
    lastInstanceAction: result,
  }, {merge: true});
  console.log("Corte diário do atendimento WhatsApp concluído.", {
    closed,
    result,
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
  const result = await setBridgeState(shouldRun);
  const instanceAvailability = shouldRun ?
    "active_with_open_counter" : "stopped_no_open_counters";

  await admin.firestore().collection("whatsappRuntime").doc("session").set({
    instanceAvailability,
    instanceRunning: shouldRun,
    openCounterSession: shouldRun,
    lastCounterSessionId: event.params.sessionId,
    lastCounterSessionChangeAt: admin.firestore.FieldValue.serverTimestamp(),
    lastInstanceAction: result,
  }, {merge: true});

  console.log("Estado do WhatsApp sincronizado com os guichês.", {
    sessionId: event.params.sessionId,
    openCounterSession: shouldRun,
    result,
  });
});
