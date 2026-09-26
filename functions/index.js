const {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentWritten,
} = require("firebase-functions/v2/firestore");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {onCall, onRequest, HttpsError} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin"); // Keep admin for database operations
const {Logging} = require("@google-cloud/logging");
const {SecretManagerServiceClient} = require("@google-cloud/secret-manager");
const {
  becameDocumentReady,
  escapeHtml,
  getReceptionEmail,
  isReceptionWalkIn,
} = require("./documentReadyAutomation");
admin.initializeApp();
Object.assign(exports, require("./videoConference"));
Object.assign(exports, require("./administrative"));

const youtubeClientId = defineSecret("YOUTUBE_CLIENT_ID");
const youtubeClientSecret = defineSecret("YOUTUBE_CLIENT_SECRET");
const whatsappAccessTokenSecretName = "WHATSAPP_ACCESS_TOKEN";
const whatsappVerifyTokenSecretName = "WHATSAPP_VERIFY_TOKEN";

exports.saveWhatsAppCredentials = onCall(
    {cors: true}, async (request) => {
      if (!request.auth) {
        throw new HttpsError(
            "unauthenticated", "Autenticação necessária.");
      }
      const user = await admin.firestore().collection("users")
          .doc(request.auth.uid).get();
      const data = user.data() || {};
      if (!["Admin", "Administrador"].includes(data.tipo)) {
        throw new HttpsError(
            "permission-denied",
            "Apenas administradores podem configurar o WhatsApp.");
      }
      const accessToken = String(request.data?.accessToken || "").trim();
      const verifyToken = String(request.data?.verifyToken || "").trim();
      if (!accessToken && !verifyToken) {
        throw new HttpsError(
            "invalid-argument", "Informe pelo menos um token.");
      }
      const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
      const client = getSecretManagerClient();
      const saveSecret = async (name, value) => {
        if (!value) return;
        const parent = `projects/${projectId}`;
        const secret = `${parent}/secrets/${name}`;
        try {
          await client.getSecret({name: secret});
        } catch (error) {
          if (error.code !== 5) throw error;
          await client.createSecret({
            parent, secretId: name, secret: {replication: {automatic: {}}},
          });
        }
        await client.addSecretVersion({
          parent: secret, payload: {data: Buffer.from(value, "utf8")},
        });
      };
      await saveSecret(whatsappAccessTokenSecretName, accessToken);
      await saveSecret(whatsappVerifyTokenSecretName, verifyToken);
      await admin.firestore().collection("whatsappSettings").doc("config").set({
        tokenConfigured: Boolean(accessToken),
        verifyTokenConfigured: Boolean(verifyToken),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: request.auth.uid,
      }, {merge: true});
      return {
        saved: true,
        tokenConfigured: Boolean(accessToken),
        verifyTokenConfigured: Boolean(verifyToken),
      };
    });

/**
 * Verifies the authenticated portal administrator and the TV Câmara flag.
 * @param {object} request Callable request
 * @return {Promise<object>} User and portal settings
 */
async function requireTvCamaraAdmin(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Autenticação necessária.");
  }
  const firestore = admin.firestore();
  const [userSnapshot, settingsSnapshot] = await Promise.all([
    firestore.collection("users").doc(request.auth.uid).get(),
    firestore.collection("system-control").doc("portal").get(),
  ]);
  const userData = userSnapshot.data() || {};
  const portal = settingsSnapshot.data() || {};
  const email = normalizeEmail(request.auth.token.email || "");
  const rootEmails = (portal.security?.rootEmails || [])
      .map(normalizeEmail);
  const isRoot = rootEmails.includes(email);
  const isAdmin = ["Admin", "Administrador"].includes(userData.tipo);
  if (!isAdmin && !isRoot) {
    throw new HttpsError(
        "permission-denied",
        "Apenas administradores podem usar a transcrição da TV Câmara.",
    );
  }
  if (portal.modules?.tvCamara?.admin !== true && !isRoot) {
    throw new HttpsError(
        "failed-precondition",
        "O módulo TV Câmara está desativado para administradores.",
    );
  }
  return {userData, email, isRoot};
}

/**
 * Creates a private transcription job for a playlist video.
 */
exports.startTvCamaraTranscription = onCall(
    {cors: true}, async (request) => {
      const {email} = await requireTvCamaraAdmin(request);
      const videoId = String(request.data?.videoId || "").trim();
      const videoTitle = String(
          request.data?.videoTitle || "Sessão da TV Câmara",
      ).trim().slice(0, 240);
      const videoSource = String(request.data?.videoSource || "playlist")
          .trim().slice(0, 40);
      if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
        throw new HttpsError("invalid-argument", "ID do vídeo inválido.");
      }
      const job = await admin.firestore()
          .collection("tv-camara-transcriptions").add({
            videoId,
            videoTitle,
            videoSource,
            youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
            status: "queued",
            createdBy: request.auth.uid,
            createdByEmail: email,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
      return {jobId: job.id};
    });

/**
 * Converts YouTube's VTT caption file into plain text and timestamped cues.
 * @param {string} content VTT caption file
 * @return {{transcript: string, segments: object[]}} Parsed transcript
 */
function parseYoutubeVtt(content) {
  const lines = String(content || "").replace(/^\uFEFF/, "").split(/\r?\n/);
  const segments = [];
  let timestamp = "";
  for (const line of lines) {
    const trimmed = line.trim();
    const timeMatch = trimmed.match(
        /^(\d{2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})\s+-->/,
    );
    if (timeMatch) {
      timestamp = timeMatch[1];
      continue;
    }
    if (!trimmed || trimmed === "WEBVTT" || trimmed.startsWith("NOTE")) {
      continue;
    }
    if (/^\d+$/.test(trimmed) || trimmed.includes("-->")) continue;
    const text = trimmed.replace(/<[^>]*>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;|&apos;/g, "'")
        .replace(/\s+/g, " ").trim();
    if (text) segments.push({timestamp, text});
  }
  const uniqueSegments = segments.filter((segment, index) =>
    index === 0 || segment.text !== segments[index - 1].text);
  return {
    transcript: uniqueSegments.map((segment) => segment.text).join(" "),
    segments: uniqueSegments,
  };
}

/**
 * Gets a human-readable error from a YouTube Data API response.
 * @param {Response} response Fetch response
 * @param {string} operation API operation for a useful diagnosis
 * @return {Promise<string>} API error detail
 */
async function youtubeApiError(response, operation) {
  try {
    const payload = await response.json();
    const reason = payload.error?.errors?.[0]?.reason;
    const apiMessage = payload.error?.message || "";
    if (reason === "quotaExceeded") {
      return "A cota diária da API do YouTube foi atingida.";
    }
    if (["insufficientPermissions", "insufficientAuthenticationScopes"]
        .includes(reason) ||
        /insufficient authentication scopes|insufficient.*scope/i
            .test(apiMessage)) {
      return "O OAuth não concedeu o escopo youtube.force-ssl. Gere uma " +
        "nova autorização na página Admin TV Câmara, selecione a conta " +
        "que administra o canal, aceite o acesso e atualize o refresh " +
        "token. Se já fez isso, revogue o acesso antigo do Portal em " +
        "myaccount.google.com/permissions e autorize novamente. " +
        "Detalhe do YouTube: " + apiMessage;
    }
    if (response.status === 403 && operation === "download-caption") {
      return "O OAuth tem acesso à faixa, mas o YouTube não autorizou o " +
        "download. A conta Google conectada precisa ser proprietária ou " +
        "ter permissão de edição neste vídeo. Detalhe: " + apiMessage;
    }
    if (response.status === 403 && operation === "list-captions") {
      return "O YouTube bloqueou a consulta das legendas. Confirme o " +
        "escopo youtube.force-ssl (reautorize o canal) e que a conta " +
        "conectada tem acesso de edição ao vídeo. Detalhe: " + apiMessage;
    }
    return apiMessage ||
      `A API do YouTube retornou HTTP ${response.status}.`;
  } catch (error) {
    return `A API do YouTube retornou HTTP ${response.status}.`;
  }
}

/**
 * Transcribes a YouTube video after the callable has created its job.
 */
exports.processTvCamaraTranscription = onDocumentCreated({
  document: "tv-camara-transcriptions/{jobId}",
  region: "us-central1",
  timeoutSeconds: 540,
  memory: "1GiB",
  secrets: [youtubeClientId, youtubeClientSecret],
}, async (event) => {
  const jobSnapshot = event.data;
  if (!jobSnapshot || jobSnapshot.data().status !== "queued") return;
  const jobRef = jobSnapshot.ref;
  const job = jobSnapshot.data();
  await jobRef.update({
    status: "processing",
    startedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  try {
    const accessToken = await getTvCamaraYoutubeAccessToken();
    const captionsParams = new URLSearchParams({
      part: "snippet",
      videoId: job.videoId,
    });
    const captionsResponse = await fetch(
        `https://youtube.googleapis.com/youtube/v3/captions?${captionsParams}`,
        {
          headers: {Authorization: `Bearer ${accessToken}`},
          signal: AbortSignal.timeout(30000),
        },
    );
    if (!captionsResponse.ok) {
      throw new Error(await youtubeApiError(
          captionsResponse, "list-captions",
      ));
    }
    const captionPayload = await captionsResponse.json();
    const availableTracks = (captionPayload.items || []).filter((track) =>
      track.snippet?.status !== "failed" &&
      track.snippet?.isDraft !== true,
    );
    if (!availableTracks.length) {
      throw new Error(
          "O YouTube não disponibilizou legendas para este vídeo. " +
          "Publique uma faixa de legendas ou aguarde a geração automática " +
          "do YouTube e tente novamente.",
      );
    }
    const selectedTrack = availableTracks.sort((first, second) => {
      const languageRank = (track) => {
        const language = String(track.snippet?.language || "").toLowerCase();
        if (language === "pt-br") return 0;
        if (language === "pt") return 1;
        return 2;
      };
      return languageRank(first) - languageRank(second);
    })[0];
    const downloadParams = new URLSearchParams({tfmt: "vtt"});
    const downloadResponse = await fetch(
        `https://youtube.googleapis.com/youtube/v3/captions/` +
        `${encodeURIComponent(selectedTrack.id)}?${downloadParams}`,
        {
          headers: {Authorization: `Bearer ${accessToken}`},
          signal: AbortSignal.timeout(60000),
        },
    );
    if (!downloadResponse.ok) {
      throw new Error(await youtubeApiError(
          downloadResponse, "download-caption",
      ));
    }
    const {transcript, segments} = parseYoutubeVtt(
        await downloadResponse.text(),
    );
    if (!transcript) {
      throw new Error("A faixa de legendas do YouTube está vazia.");
    }
    await jobRef.update({
      status: "completed",
      transcription: transcript,
      segments,
      language: selectedTrack.snippet?.language || "pt",
      captionTrackKind: selectedTrack.snippet?.trackKind || "standard",
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error("Falha na transcrição da TV Câmara", {
      jobId: event.params.jobId,
      videoId: job.videoId,
      message: error.message,
    });
    await jobRef.update({
      status: "error",
      error: error.message || "Não foi possível transcrever o vídeo.",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
});

let secretManagerClient;
let loggingClient;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

exports.buscarUsuarioParaGabinete = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Autenticação necessária.");
  }
  const email = String(request.data?.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError("invalid-argument", "Informe um e-mail válido.");
  }
  const caller = await admin.firestore().collection("users")
      .doc(request.auth.uid).get();
  if (!["Vereador", "Admin"].includes(caller.data()?.tipo)) {
    throw new HttpsError(
        "permission-denied",
        "Apenas vereador ou administrador pode buscar assessores.",
    );
  }
  const users = await admin.firestore().collection("users")
      .where("email", "==", email).limit(1).get();
  if (users.empty) return {found: false};
  const user = users.docs[0];
  return {
    found: true,
    user: {
      id: user.id,
      name: user.data().name || "",
      email: user.data().email || email,
    },
  };
});

const getCabinetRecipientIds = async (db, cabinetId) => {
  if (!cabinetId) return [];
  const members = await db.collection("gabinetes-equipe")
      .where("gabineteId", "==", cabinetId)
      .where("ativo", "==", true)
      .get();
  return [...new Set([
    cabinetId,
    ...members.docs.map((item) => item.data().userId).filter(Boolean),
  ])];
};

const notifyCabinet = async ({
  db, cabinetId, notificationKey, title, message, data = {},
}) => {
  const recipients = await getCabinetRecipientIds(db, cabinetId);
  await Promise.all(recipients.map((userId) => db.collection("notifications")
      .doc(`cabinet_${notificationKey}_${userId}`)
      .set({
        userId,
        targetUserId: userId,
        tituloNotification: title,
        descricaoNotification: message,
        message,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
        isRead: false,
        source: "gabinete-vereador",
        data: {screen: "GabineteVereador", cabinetId, ...data},
      }, {merge: false})));
  return recipients.length;
};

// Use a distinct export name because the deployed project already contains an
// HTTPS function named `notificarNovaDemandaGabinete`. Firebase does not allow
// changing a function's trigger type in place.
exports.notificarNovaDemandaGabineteFirestore = onDocumentCreated(
    "solicitacoes-vereadores/{requestId}",
    async (event) => {
      const requestData = event.data?.data() || {};
      const details = requestData.dadosSolicitacao || {};
      const cabinetId = details.vereadorId || requestData.gabineteId;
      const category = requestData.tipoDemanda || details.categoriaDemanda;
      if (!cabinetId || !category || category === "Atendimento no gabinete") {
        return;
      }
      await notifyCabinet({
        db: admin.firestore(),
        cabinetId,
        notificationKey: `new-demand_${event.params.requestId}`,
        title: "Nova demanda recebida",
        message: `Uma nova demanda de ${category} chegou ao gabinete.`,
        data: {type: "new-demand", requestId: event.params.requestId},
      });
    },
);

exports.notificarAtualizacaoDemandaVereador = onDocumentUpdated(
    "solicitacoes-vereadores/{requestId}",
    async (event) => {
      const before = event.data?.before.data() || {};
      const after = event.data?.after.data() || {};
      if (!after.userId || before.status === after.status) return;
      await admin.firestore().collection("notifications")
          .doc(`citizen_demand_${event.params.requestId}_${after.status}`)
          .set({
            userId: after.userId,
            targetUserId: after.userId,
            tituloNotification: "Atualização da sua solicitação",
            descricaoNotification:
              `O status foi atualizado para ${after.status}.`,
            message: `O status foi atualizado para ${after.status}.`,
            protocolo: after.protocolo || event.params.requestId,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            read: false,
            isRead: false,
            source: "gabinete-vereador",
          }, {merge: false});
    },
);

const parseCabinetDate = (value) => {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  const text = String(value);
  const parsed = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(text) ?
    text : `${text}:00-03:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const cabinetMonthDay = (value) => {
  if (!value) return "";
  if (typeof value === "string") {
    const match = value.match(/(?:\d{4}-)?(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}`;
  }
  const date = value.toDate?.() || new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getMonth() + 1).padStart(2, "0")}-` +
    String(date.getDate()).padStart(2, "0");
};

exports.notificarAgendaDosGabinetes = onSchedule(
    {schedule: "every 30 minutes", timeZone: "America/Fortaleza"},
    async () => {
      const db = admin.firestore();
      const now = new Date();
      const windowEnd = new Date(now.getTime() + 31 * 60 * 1000);
      const timedCollections = [
        ["gabinetes-tarefas", "Tarefa próxima", "task"],
        ["gabinetes-eventos", "Evento próximo", "event"],
      ];
      for (const [collectionName, title, type] of timedCollections) {
        const snapshot = await db.collection(collectionName).get();
        for (const item of snapshot.docs) {
          const value = item.data();
          if (!value.gabineteId || ["Concluído", "Cancelado"]
              .includes(value.status)) continue;
          const dueAt = parseCabinetDate(value.dataHora);
          if (!dueAt) continue;
          const noticeAt = new Date(dueAt.getTime() -
            (Number(value.antecedenciaHoras) || 0) * 60 * 60 * 1000);
          if (noticeAt < now || noticeAt >= windowEnd) continue;
          await notifyCabinet({
            db,
            cabinetId: value.gabineteId,
            notificationKey: `${type}_${item.id}_${dueAt.getTime()}`,
            title,
            message: `${value.titulo || title} está programado para ` +
              dueAt.toLocaleString("pt-BR", {timeZone: "America/Fortaleza"}) +
              ".",
            data: {type, itemId: item.id},
          });
        }
      }

      const fortalezaParts = new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Fortaleza", month: "2-digit", day: "2-digit",
        hour: "2-digit", hour12: false,
      }).formatToParts(now);
      const part = (name) => fortalezaParts.find((item) =>
        item.type === name)?.value;
      if (part("hour") !== "08") return;
      const todayMonthDay = `${part("month")}-${part("day")}`;
      const requests = await db.collection("solicitacoes-vereadores").get();
      const birthdays = new Map();
      requests.docs.forEach((item) => {
        const value = item.data();
        const person = value.dadosUsuario || {};
        const cabinetId = value.dadosSolicitacao?.vereadorId ||
          value.gabineteId;
        const birthDate = person.birthDate || person.dataNascimento ||
          person.nascimento;
        if (cabinetId && cabinetMonthDay(birthDate) === todayMonthDay) {
          const key = `${cabinetId}_${person.id || person.email || item.id}`;
          birthdays.set(key, {cabinetId, person, requestId: item.id});
        }
      });
      for (const [key, birthday] of birthdays) {
        await notifyCabinet({
          db,
          cabinetId: birthday.cabinetId,
          notificationKey: `visitor-birthday_${todayMonthDay}_${key}`,
          title: "Aniversariante na base de visitantes",
          message: `${birthday.person.name || "Um visitante"} faz ` +
            "aniversário hoje.",
          data: {type: "visitor-birthday", requestId: birthday.requestId},
        });
      }
    },
);

const youtubeFunctionsBaseUrl =
    "https://southamerica-east1-blu-app-camara.cloudfunctions.net";
const tvCamaraPublicPlaylistId = "PL2jvfc9q3EZ0CXi2qg5aDPydeCYdCsq59";
let tvCamaraPlaylistCache = {
  expiresAt: 0,
  result: {videos: [], pageCount: 0, apiReportedTotal: 0},
};
const youtubePlaylistCacheTtlMs = 5 * 60 * 1000;
const youtubeOAuthRedirectUri = "http://localhost";
const youtubeOAuthScope =
  "https://www.googleapis.com/auth/youtube.force-ssl";
const youtubeOAuthScopes = [
  "https://www.googleapis.com/auth/youtube",
  youtubeOAuthScope,
].join(" ");

const allowedYoutubeFunctions = {
  listarVideosTvCamara: {
    endpoint: `${youtubeFunctionsBaseUrl}/listarVideosTvCamara`,
    method: "GET",
    label: "Listar vídeos da TV Câmara",
  },
};

const youtubeCloudLogTargets = {
  atualizarPlaylistYoutube: {
    functionId: "atualizarPlaylistYoutube",
    functionName: "atualizarPlaylistYoutube",
    functionLabel: "Atualizar playlist do YouTube",
    endpoint: `${youtubeFunctionsBaseUrl}/atualizarPlaylistYoutube`,
    serviceName: "atualizarplaylistyoutube",
  },
  youtubeChannelWebhook: {
    functionId: "youtubeChannelWebhook",
    functionName: "youtubeChannelWebhook",
    functionLabel: "Webhook do canal YouTube",
    endpoint: `${youtubeFunctionsBaseUrl}/youtubeChannelWebhook`,
    serviceName: "youtubechannelwebhook",
  },
  renovarWebhookYoutube: {
    functionId: "renovarWebhookYoutube",
    functionName: "renovarWebhookYoutube",
    functionLabel: "Renovar webhook YouTube",
    endpoint: `${youtubeFunctionsBaseUrl}/renovarWebhookYoutube`,
    serviceName: "renovarwebhookyoutube",
  },
  listarVideosTvCamara: {
    functionId: "listarVideosTvCamara",
    functionName: "listarVideosTvCamara",
    functionLabel: "Listar vídeos da TV Câmara",
    endpoint: `${youtubeFunctionsBaseUrl}/listarVideosTvCamara`,
    serviceName: "listarvideostvcamara",
  },
};

const receptionLinkedCollections = [
  "balcao-cidadao",
  "assessoria-microempreendedor",
  "ouvidoria",
  "procuradoria-mulher",
  "piel-atendimentos",
  "procon-atendimentos",
  "procon-consumidores",
  "procon-agendamentos",
];

/**
 * Normalizes email values for linking reception records to app users.
 * @param {string} email Email to normalize.
 * @return {string} Normalized email.
 */
function normalizeEmail(email = "") {
  return String(email).trim().toLowerCase();
}

/**
 * Applies CORS headers to HTTP responses.
 * @param {object} res Express response object
 */
function applyCors(res) {
  Object.entries(corsHeaders).forEach(([key, value]) => res.set(key, value));
}

/**
 * Returns the Secret Manager client singleton.
 * @return {SecretManagerServiceClient} Secret Manager client
 */
function getSecretManagerClient() {
  if (!secretManagerClient) {
    secretManagerClient = new SecretManagerServiceClient();
  }
  return secretManagerClient;
}

/**
 * Returns the Cloud Logging client singleton.
 * @return {Logging} Cloud Logging client
 */
function getLoggingClient() {
  if (!loggingClient) {
    loggingClient = new Logging();
  }
  return loggingClient;
}

/**
 * Returns whether a Cloud Logging message should be ignored for UI sync.
 * @param {string} message Log message
 * @return {boolean} True when the message is infra-noise
 */
function shouldIgnoreYoutubeCloudMessage(message) {
  const text = String(message || "").toLowerCase();
  return !text ||
    text.includes("starting new instance") ||
    text.includes("default startup tcp probe succeeded") ||
    text.includes("the request was not authenticated") ||
    text.includes("deployment_rollout");
}

/**
 * Normalizes a Cloud Logging entry into the shape needed by the UI.
 * @param {object} entry Logging entry
 * @param {object} target Target metadata
 * @return {object|null} Normalized log or null
 */
function normalizeYoutubeCloudLogEntry(entry, target) {
  const metadata = entry.metadata || {};
  const jsonPayload = metadata.jsonPayload || {};
  const textPayload = metadata.textPayload || "";
  const message = jsonPayload.message || jsonPayload.error || textPayload || "";

  if (shouldIgnoreYoutubeCloudMessage(message)) {
    return null;
  }

  const severity = String(metadata.severity || "DEFAULT").toUpperCase();
  const loweredMessage = String(message).toLowerCase();
  const status = severity === "ERROR" ||
    loweredMessage.includes("falha") ||
    loweredMessage.includes("invalid_grant") ?
    "error" : "success";

  return {
    status,
    functionId: target.functionId,
    functionName: target.functionName,
    functionLabel: target.functionLabel,
    endpoint: target.endpoint,
    message: String(message || "").trim(),
    httpStatus: jsonPayload.httpStatus || null,
    durationMs: 0,
    details: {
      source: "cloud-logging-sync",
      severity,
      serviceName: target.serviceName,
      timestamp: metadata.timestamp || null,
    },
  };
}

/**
 * Reads the latest meaningful Cloud Logging entry for a YouTube function.
 * @param {object} target Target metadata
 * @return {Promise<object|null>} Normalized log or null
 */
async function getLatestYoutubeCloudLog(target) {
  const [entries] = await getLoggingClient().getEntries({
    filter: [
      "resource.type=\"cloud_run_revision\"",
      `resource.labels.service_name="${target.serviceName}"`,
    ].join(" AND "),
    orderBy: "timestamp desc",
    pageSize: 20,
  });

  for (const entry of entries) {
    const normalized = normalizeYoutubeCloudLogEntry(entry, target);
    if (normalized) return normalized;
  }

  return null;
}

/**
 * Verifies a Firebase Auth bearer token and checks admin permissions.
 * @param {object} req Express request object
 * @return {Promise<object>} Authenticated user data
 */
async function requireAdminUser(req) {
  const authorization = req.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ?
    authorization.slice("Bearer ".length) : "";

  if (!token) {
    const error = new Error("Token de autenticação ausente.");
    error.status = 401;
    throw error;
  }

  const decodedToken = await admin.auth().verifyIdToken(token);
  const userSnap = await admin.firestore()
      .collection("users")
      .doc(decodedToken.uid)
      .get();
  const userData = userSnap.exists ? userSnap.data() || {} : {};
  const systemControlSnap = await admin.firestore()
      .collection("system-control")
      .doc("portal")
      .get();
  const rootEmails = systemControlSnap.exists &&
      Array.isArray(systemControlSnap.data()?.security?.rootEmails) ?
    systemControlSnap.data().security.rootEmails
        .map((email) => String(email).trim().toLowerCase()) : [];
  const allowed = userData.tipo === "Admin" ||
      rootEmails.includes(String(decodedToken.email || "").toLowerCase());

  if (!allowed) {
    const error = new Error("Usuário sem permissão administrativa.");
    error.status = 403;
    throw error;
  }

  return {
    uid: decodedToken.uid,
    email: decodedToken.email || userData.email || "",
    tipo: userData.tipo || "",
  };
}

exports.getAdminAuthUserCount = onRequest({}, async (req, res) => {
  applyCors(res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "GET") {
    return res.status(405).json({error: "Method Not Allowed"});
  }
  try {
    await requireAdminUser(req);
    let total = 0;
    let pageToken;
    do {
      const page = await admin.auth().listUsers(1000, pageToken);
      total += page.users.length;
      pageToken = page.pageToken;
    } while (pageToken);
    res.set("Cache-Control", "private, max-age=300");
    return res.json({ok: true, total});
  } catch (error) {
    console.error("Erro ao contar usuários do Auth:", error);
    return res.status(error.status || 500).json({
      error: error.message || "Falha ao contar usuários.",
    });
  }
});

/**
 * Extracts the OAuth code from a full callback URL or raw code.
 * @param {string} value Full callback URL or code
 * @return {string} OAuth authorization code
 */
function extractYoutubeOAuthCode(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  try {
    const parsedUrl = new URL(text);
    return parsedUrl.searchParams.get("code") || "";
  } catch (error) {
    return text.includes("code=") ?
      new URL(`http://localhost/?${text.split("?").pop()}`).searchParams
          .get("code") || "" :
      text;
  }
}

/**
 * Persists a new Secret Manager version for YOUTUBE_REFRESH_TOKEN.
 * @param {string} refreshToken New OAuth refresh token
 * @return {Promise<string>} Secret version name
 */
async function saveYoutubeRefreshTokenSecret(refreshToken) {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
  if (!projectId) {
    throw new Error("Projeto Google Cloud não identificado.");
  }

  const parent = `projects/${projectId}/secrets/YOUTUBE_REFRESH_TOKEN`;
  const [version] = await getSecretManagerClient().addSecretVersion({
    parent,
    payload: {
      data: Buffer.from(refreshToken, "utf8"),
    },
  });

  return version.name || parent;
}

/**
 * Gets an access token for the portal's configured YouTube channel account.
 * @return {Promise<string>} Google OAuth access token
 */
async function getTvCamaraYoutubeAccessToken() {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
  if (!projectId) {
    throw new Error("Projeto Google Cloud não identificado.");
  }
  const secretName = `projects/${projectId}/secrets/` +
    "YOUTUBE_REFRESH_TOKEN/versions/latest";
  const [refreshTokenVersion] = await getSecretManagerClient()
      .accessSecretVersion({name: secretName});
  const refreshToken = refreshTokenVersion.payload.data.toString("utf8")
      .trim().replace(/[\r\n]+/g, "");
  const clientId = youtubeClientId.value()?.trim();
  const clientSecret = youtubeClientSecret.value()?.trim();
  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error("Configure as credenciais OAuth do YouTube no portal.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {"Content-Type": "application/x-www-form-urlencoded"},
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
    signal: AbortSignal.timeout(30000),
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description ||
      "Não foi possível autenticar na API do YouTube.");
  }
  const scopeInfoUrl = new URL("https://oauth2.googleapis.com/tokeninfo");
  scopeInfoUrl.searchParams.set("access_token", payload.access_token);
  const scopeInfoResponse = await fetch(scopeInfoUrl, {
    signal: AbortSignal.timeout(15000),
  });
  const scopeInfo = await scopeInfoResponse.json().catch(() => ({}));
  const grantedScopes = String(scopeInfo.scope || payload.scope || "")
      .split(/\s+/).filter(Boolean);
  if (!grantedScopes.includes(youtubeOAuthScope)) {
    throw new Error(
        "O refresh token salvo no Firebase gera um access token sem " +
        "youtube.force-ssl. Revogue o acesso antigo do Portal em " +
        "myaccount.google.com/permissions, gere uma nova autorização " +
        "na página Admin TV Câmara e salve o novo refresh token. Escopos " +
        "concedidos: " + (grantedScopes.join(", ") || "não informados") +
        ".",
    );
  }
  return payload.access_token;
}

/**
 * Lists every item in the configured public playlist, following page tokens.
 * @return {Promise<object[]>} Normalized YouTube playlist videos
 */
async function fetchAllTvCamaraPlaylistVideos() {
  if (tvCamaraPlaylistCache.expiresAt > Date.now()) {
    return tvCamaraPlaylistCache.result;
  }

  const accessToken = await getTvCamaraYoutubeAccessToken();
  const videos = [];
  let pageToken = "";
  let pageCount = 0;
  let apiReportedTotal = null;
  do {
    const params = new URLSearchParams({
      part: "snippet,contentDetails",
      playlistId: tvCamaraPublicPlaylistId,
      maxResults: "50",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await fetch(
        `https://youtube.googleapis.com/youtube/v3/playlistItems?${params}`,
        {
          headers: {Authorization: `Bearer ${accessToken}`},
          signal: AbortSignal.timeout(30000),
        },
    );
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error?.message ||
        `YouTube Data API retornou HTTP ${response.status}.`);
    }
    apiReportedTotal = payload.pageInfo?.totalResults ?? apiReportedTotal;

    for (const item of payload.items || []) {
      const snippet = item.snippet || {};
      const videoId = snippet.resourceId?.videoId ||
        item.contentDetails?.videoId;
      if (!videoId) continue;
      const thumbnails = snippet.thumbnails || {};
      const thumbnail = thumbnails.maxres || thumbnails.standard ||
        thumbnails.high || thumbnails.medium || thumbnails.default;
      videos.push({
        videoId,
        title: snippet.title || "Vídeo da TV Câmara",
        description: snippet.description || "",
        thumbnailUrl: thumbnail?.url ||
          `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        publishedAt: item.contentDetails?.videoPublishedAt ||
          snippet.publishedAt || null,
        position: snippet.position ?? null,
      });
    }
    pageToken = payload.nextPageToken || "";
    pageCount += 1;
    if (pageCount >= 200 && pageToken) {
      throw new Error("A playlist excedeu o limite seguro de paginação.");
    }
  } while (pageToken);

  const uniqueVideos = Array.from(
      new Map(videos.map((video) => [video.videoId, video])).values(),
  ).sort((first, second) => {
    const firstTime = first.publishedAt ? Date.parse(first.publishedAt) : 0;
    const secondTime = second.publishedAt ? Date.parse(second.publishedAt) : 0;
    return secondTime - firstTime;
  });
  const result = {
    videos: uniqueVideos,
    pageCount,
    apiReportedTotal,
  };
  tvCamaraPlaylistCache = {
    expiresAt: Date.now() + youtubePlaylistCacheTtlMs,
    result,
  };
  return result;
}

/**
 * Converts Firestore or raw date values to milliseconds.
 * @param {*} value Date-like value
 * @return {number} Timestamp in milliseconds
 */
function getDateMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/**
 * Returns the current month range using local server time.
 * @return {{start: Date, end: Date, label: string}}
 */
function getCurrentMonthBalanceRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  end.setHours(23, 59, 59, 999);
  const monthLabel = now.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  return {
    start,
    end,
    label: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
  };
}

/**
 * Creates app notifications for a published news item.
 * @param {string} noticiaId News document ID
 * @param {object} noticiaData News document data
 * @param {string} source Source identifier for logs/debugging
 * @return {Promise<object>} Processing summary
 */
async function notifyUsersAboutNews(noticiaId, noticiaData, source) {
  const db = admin.firestore();
  console.log("Iniciando notificação de notícia: " + noticiaId);
  const usersSnapshot = await db.collection("users").get();
  console.log(`Encontrados ${usersSnapshot.size} usuários para processar.`);

  let batch = db.batch();
  let batchOperations = 0;
  let created = 0;
  const title = "📢 " + (noticiaData.titulo || "Nova notícia");
  const description = noticiaData.subtitulo || "Novidade no app.";

  if (usersSnapshot.empty) {
    console.warn("Nenhum usuário encontrado para notificação de notícias.");
  }

  for (const userDoc of usersSnapshot.docs) {
    const userData = userDoc.data() || {};
    const notificationRef = db.collection("notifications").doc();

    batch.set(notificationRef, {
      userId: userDoc.id,
      flavorId: userData.flavorId || "paraipaba",
      tituloNotification: title,
      descricaoNotification: description,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      read: false,
      isRead: false,
      protocolo: noticiaId,
      source: source || "news",
      data: {
        screen: "Notificacoes",
        type: "news",
        noticiaId: noticiaId,
        protocolo: noticiaId,
      },
    });

    batchOperations += 1;
    created += 1;

    if (batchOperations >= 450) {
      await batch.commit();
      batch = db.batch();
      batchOperations = 0;
    }
  }

  if (batchOperations > 0) {
    await batch.commit();
  }

  console.log(`Notificações de notícias processadas: ${created}.`);
  return {
    usersCount: usersSnapshot.size,
    notificationsCount: created,
  };
}

/**
 * Persists a TV Câmara function execution log in Firestore.
 * @param {object} logData Log payload
 * @return {Promise<void>}
 */
async function saveYoutubeFunctionLog(logData) {
  await admin.firestore().collection("tv-camara-logs").add({
    category: "youtube",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: logData.createdBy || "system",
    ...logData,
  });
}

/**
 * Gets a Google identity token for protected Cloud Run/Functions endpoints.
 * @param {string} audience Target URL used as token audience
 * @return {Promise<string>} Identity token
 */
async function getGoogleIdentityToken(audience) {
  const metadataUrl = "http://metadata/computeMetadata/v1/instance/" +
      "service-accounts/default/identity?audience=" +
      encodeURIComponent(audience);
  const response = await fetch(metadataUrl, {
    headers: {"Metadata-Flavor": "Google"},
  });

  if (!response.ok) {
    throw new Error(`Falha ao gerar token Google: HTTP ${response.status}`);
  }

  return response.text();
}

/**
 * Calls target endpoint and retries with a Google identity token on 403/401.
 * @param {object} target Function target metadata
 * @param {string} source Invocation source
 * @return {Promise<object>} HTTP response metadata and payload
 */
async function callYoutubeEndpoint(target, source) {
  const buildOptions = (identityToken = "") => ({
    method: target.method,
    headers: {
      "Accept": "application/json, text/plain, */*",
      ...(target.method === "POST" ? {"Content-Type": "application/json"} :
        {}),
      ...(identityToken ? {"Authorization": `Bearer ${identityToken}`} : {}),
    },
    ...(target.method === "POST" ? {
      body: JSON.stringify({
        source,
        calledAt: new Date().toISOString(),
      }),
    } : {}),
  });

  let usedIdentityToken = false;
  let response = await fetch(target.endpoint, buildOptions());

  if (response.status === 401 || response.status === 403) {
    try {
      const identityToken = await getGoogleIdentityToken(target.endpoint);
      usedIdentityToken = true;
      response = await fetch(target.endpoint, buildOptions(identityToken));
    } catch (tokenError) {
      console.error("Não foi possível obter token Google:", tokenError);
    }
  }

  const contentType = response.headers.get("content-type") || "";
  const responseText = await response.text();
  let payload = responseText;

  if (contentType.includes("application/json") && responseText) {
    payload = JSON.parse(responseText);
  }

  return {
    response,
    contentType,
    payload,
    usedIdentityToken,
  };
}

/**
 * Calls a known YouTube function and records the result.
 * @param {string} functionName Function key
 * @param {string} source Invocation source
 * @return {Promise<object>} Call result
 */
async function invokeYoutubeTarget(functionName, source) {
  const target = allowedYoutubeFunctions[functionName];

  if (!target) {
    const error = new Error("Função YouTube não permitida.");
    error.allowed = Object.keys(allowedYoutubeFunctions);
    throw error;
  }

  const startedAt = Date.now();

  try {
    const {response, contentType, payload, usedIdentityToken} =
        await callYoutubeEndpoint(target, source);
    const durationMs = Date.now() - startedAt;

    await saveYoutubeFunctionLog({
      status: response.ok ? "success" : "error",
      functionId: functionName,
      functionName,
      functionLabel: target.label,
      endpoint: target.endpoint,
      httpStatus: response.status,
      durationMs,
      message: response.ok ?
        `${functionName} executada automaticamente.` :
        `${functionName} retornou HTTP ${response.status}.`,
      details: {
        source,
        method: target.method,
        usedIdentityToken,
        responseType: contentType || "text/plain",
        payloadPreview: typeof payload === "string" ?
          payload.slice(0, 500) : Object.keys(payload || {}),
      },
    });

    return {
      success: response.ok,
      functionName,
      endpoint: target.endpoint,
      method: target.method,
      httpStatus: response.status,
      durationMs,
      payload,
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    await saveYoutubeFunctionLog({
      status: "error",
      functionId: functionName,
      functionName,
      functionLabel: target.label,
      endpoint: target.endpoint,
      durationMs,
      message: error.message || `Erro ao executar ${functionName}.`,
      details: {
        source,
        method: target.method,
        errorName: error.name || "Error",
      },
    });
    throw error;
  }
}

exports.sendMailOnNewRequest = onDocumentCreated(
    {
      document: "mail/{mailId}",
    },
    async (event) => {
      const snapshot = event.data;
      if (!snapshot) return;
      const mailData = snapshot.data();
      if (mailData.emailOnly) {
        console.log(
            "Email transacional preservado para processamento externo:",
            mailData.templateType || "generic",
        );
        return null;
      }
      try {
        if (mailData.userId) {
          const db = admin.firestore();
          const protocolo = mailData.protocolo || "";
          const status = mailData.status || "Atualizado";
          const desc = `O status da sua solicitação (Protocolo: ${protocolo})` +
              ` foi alterado para: ${status}.`;

          await db.collection("notifications").add({
            userId: mailData.userId,
            flavorId: "paraipaba",
            tituloNotification: "Status de Solicitação Atualizado",
            descricaoNotification: desc,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            read: false,
            isRead: false,
            data: {
              protocolo: protocolo,
              solicitacaoId: protocolo,
              status: status,
              collection: mailData.collection || "balcao-cidadao",
            },
          });
        }

        console.log("Envio de email externo desativado; notificação " +
            `in-app processada para ${mailData.userId || "sem userId"}.`);
        return snapshot.ref.delete();
      } catch (error) {
        console.error("Erro ao processar notificação in-app:", error);
        return null;
      }
    },
);

exports.linkReceptionRequestsOnUserCreated = onDocumentCreated(
    {
      document: "users/{userId}",
    },
    async (event) => {
      if (!event.data || !event.data.exists) return null;

      const userData = event.data.data() || {};
      const email = userData.email || "";
      const normalizedEmail = normalizeEmail(email);
      if (!normalizedEmail) return null;

      const db = admin.firestore();
      const userId = event.params.userId;
      const linkedUserData = {
        id: userId,
        uid: userId,
        name: userData.name || userData.nome || "",
        email,
        cpf: userData.cpf || "",
        telefone: userData.telefone || userData.phone || "",
        phone: userData.phone || userData.telefone || "",
      };
      const linkedAt = admin.firestore.FieldValue.serverTimestamp();
      const updates = [];

      const requestSnapshots = await Promise.all(
          receptionLinkedCollections.map(async (collectionName) => ({
            collectionName,
            snapshot: await db.collection(collectionName)
                .where(
                    "emailVinculoUsuarioNormalizado",
                    "==",
                    normalizedEmail,
                )
                .get(),
          })),
      );

      requestSnapshots.forEach(({collectionName, snapshot}) => {
        snapshot.docs.forEach((docSnap) => {
          const requestData = docSnap.data() || {};
          if (requestData.userId !== "recepcao") return;

          updates.push({
            ref: db.collection(collectionName).doc(docSnap.id),
            data: {
              userId,
              targetUserId: userId,
              dadosUsuario: linkedUserData,
              aguardandoVinculoUsuario: false,
              vinculadoAoUsuarioEm: linkedAt,
              vinculadoAoUsuarioPor: "cadastro-email",
              ultimaAtualizacao: linkedAt,
            },
          });
        });
      });

      const queueSnapshot = await db.collection("atendimento-fila")
          .where("userEmailNormalizado", "==", normalizedEmail)
          .get();

      queueSnapshot.docs.forEach((docSnap) => {
        const queueData = docSnap.data() || {};
        if (queueData.userId !== "recepcao") return;

        updates.push({
          ref: db.collection("atendimento-fila").doc(docSnap.id),
          data: {
            userId,
            targetUserId: userId,
            userEmail: email,
            vinculadoAoUsuarioEm: linkedAt,
            vinculadoAoUsuarioPor: "cadastro-email",
          },
        });
      });

      for (let index = 0; index < updates.length; index += 450) {
        const batch = db.batch();
        updates.slice(index, index + 450).forEach((update) => {
          batch.update(update.ref, update.data);
        });
        await batch.commit();
      }

      console.log(
          `Vinculados ${updates.length} registro(s) da recepcao ao usuario ` +
          `${userId}.`,
      );
      return null;
    },
);

exports.generateNews = onRequest(
    {},
    async (req, res) => {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Methods", "POST,OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        return res.status(204).send("");
      }
      if (req.method !== "POST") {
        return res.status(405).send("Method Not Allowed");
      }

      try {
        const prompt = req.body?.prompt;
        if (!prompt || typeof prompt !== "string") {
          return res.status(400).json({
            error: "Campo prompt é obrigatório.",
          });
        }

        return res.status(503).json({
          error: "Geração por IA temporariamente desativada para reduzir " +
            "custos de Non-Firebase Services.",
          disabled: true,
        });
      } catch (error) {
        console.error("Erro no generateNews:", error);
        return res.status(500).json({error: "Erro interno ao gerar texto."});
      }
    },
);

exports.listarVideosTvCamaraFallback = onRequest(
    {
      secrets: [youtubeClientId, youtubeClientSecret],
      timeoutSeconds: 300,
    },
    async (req, res) => {
      applyCors(res);

      if (req.method === "OPTIONS") {
        return res.status(204).send("");
      }
      if (req.method !== "GET") {
        return res.status(405).json({error: "Method Not Allowed"});
      }

      try {
        const result = await fetchAllTvCamaraPlaylistVideos();
        const {videos} = result;
        res.set("Cache-Control", "public, max-age=300, s-maxage=300");
        return res.json({
          ok: true,
          source: "youtube-data-api-paginated",
          playlistId: tvCamaraPublicPlaylistId,
          total: videos.length,
          apiReportedTotal: result.apiReportedTotal,
          pageCount: result.pageCount,
          videos,
        });
      } catch (error) {
        console.error("Erro ao listar playlist completa da TV Câmara:", error);
        return res.status(500).json({
          ok: false,
          error: error.message || "Falha ao carregar a playlist da TV Câmara.",
        });
      }
    },
);

exports.getBalcaoPublicBalance = onRequest(
    {},
    async (req, res) => {
      applyCors(res);

      if (req.method === "OPTIONS") {
        return res.status(204).send("");
      }
      if (req.method !== "GET") {
        return res.status(405).json({error: "Method Not Allowed"});
      }

      try {
        const {start, end, label} = getCurrentMonthBalanceRange();
        const snapshot = await admin.firestore()
            .collection("balcao-cidadao")
            .orderBy("dataSolicitacao", "desc")
            .limit(1500)
            .get();

        const counts = {
          total: 0,
          aguardando: 0,
          agendados: 0,
          concluidos: 0,
          reenviados: 0,
        };
        const statusCounts = {};

        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const time = getDateMillis(data.dataSolicitacao);
          if (!time || time < start.getTime() || time > end.getTime()) return;

          const status = data.status || "Não Classificado";
          counts.total += 1;
          statusCounts[status] = (statusCounts[status] || 0) + 1;

          if (status === "Aguardando Atendimento") counts.aguardando += 1;
          if (status === "Agendado") counts.agendados += 1;
          if (status === "Concluído") counts.concluidos += 1;
          if (status === "Documentação Reenviada") counts.reenviados += 1;
        });

        res.set("Cache-Control", "public, max-age=300, s-maxage=300");
        return res.json({
          ok: true,
          period: {
            label,
            start: start.toISOString(),
            end: end.toISOString(),
          },
          counts,
          statusCounts,
        });
      } catch (error) {
        console.error("Erro no getBalcaoPublicBalance:", error);
        return res.status(500).json({
          ok: false,
          error: "Falha ao carregar balanço do Balcão do Cidadão.",
        });
      }
    },
);

/**
 * Converts the stored appointment date and time to Fortaleza local time.
 * @param {string} dateValue Appointment date in YYYY-MM-DD or DD/MM/YYYY
 * @param {string} timeValue Appointment time in HH:mm
 * @return {number} UTC timestamp or NaN when the values are invalid
 */
function getBalcaoAppointmentTimestamp(dateValue, timeValue) {
  const isoMatch = String(dateValue || "").match(
      /^(\d{4})-(\d{2})-(\d{2})$/,
  );
  const brMatch = String(dateValue || "").match(
      /^(\d{2})\/(\d{2})\/(\d{4})$/,
  );
  const timeMatch = String(timeValue || "").match(/^(\d{1,2}):(\d{2})/);
  if ((!isoMatch && !brMatch) || !timeMatch) return NaN;

  const year = isoMatch ? isoMatch[1] : brMatch[3];
  const month = isoMatch ? isoMatch[2] : brMatch[2];
  const day = isoMatch ? isoMatch[3] : brMatch[1];
  const hour = String(timeMatch[1]).padStart(2, "0");
  const minute = timeMatch[2];

  // Paraipaba uses America/Fortaleza (UTC-03) without daylight saving time.
  return Date.parse(`${year}-${month}-${day}T${hour}:${minute}:00-03:00`);
}

/**
 * Returns today's date key in the America/Fortaleza timezone.
 * @return {string} Date in YYYY-MM-DD format
 */
function getFortalezaTodayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Normalizes supported appointment date formats to YYYY-MM-DD.
 * @param {string} value Stored appointment date
 * @return {string} Normalized date or an empty string
 */
function normalizeAppointmentDateKey(value) {
  const text = String(value || "").trim();
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return text;
  const brMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return brMatch ? `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}` : "";
}

/**
 * Returns today's MM-DD key in Fortaleza.
 * @return {string} Current month-day key
 */
function getFortalezaTodayMonthDay() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const month = parts.find((part) => part.type === "month")?.value || "";
  const day = parts.find((part) => part.type === "day")?.value || "";
  return month && day ? `${month}-${day}` : "";
}

// Sends a reminder at 07:00 for every appointment scheduled for today.
exports.notificarAgendamentosDoDia = onSchedule(
    {
      schedule: "0 7 * * *",
      timeZone: "America/Fortaleza",
    },
    async () => {
      const db = admin.firestore();
      const todayKey = getFortalezaTodayKey();
      const appointmentCollections = [
        {name: "balcao-cidadao", sector: "Balcão do Cidadão"},
        {
          name: "assessoria-microempreendedor",
          sector: "Assessoria ao Microempreendedor",
        },
        {name: "ouvidoria", sector: "Ouvidoria"},
        {name: "procuradoria-mulher", sector: "Procuradoria da Mulher"},
        {name: "piel-atendimentos", sector: "PIEL"},
      ];

      const snapshots = await Promise.all(appointmentCollections.map(
          async (item) => ({
            ...item,
            snapshot: await db.collection(item.name)
                .where("status", "==", "Agendado")
                .limit(1000)
                .get(),
          }),
      ));

      let batch = db.batch();
      let batchOperations = 0;
      let created = 0;

      for (const item of snapshots) {
        for (const docSnap of item.snapshot.docs) {
          const data = docSnap.data() || {};
          const appointmentDate = data.appointmentDate ||
            data.dadosSolicitacao?.appointmentDate;
          if (normalizeAppointmentDateKey(appointmentDate) !== todayKey) {
            continue;
          }

          const userId = data.userId || data.dadosUsuario?.uid ||
            data.dadosUsuario?.id;
          if (!userId || userId === "anonimo" || userId === "recepcao") {
            console.warn(`Agendamento ${docSnap.id} sem usuário notificável.`);
            continue;
          }

          const appointmentTime = data.appointmentTime ||
            data.dadosSolicitacao?.appointmentTime || "horário informado";
          const notificationId = [
            "appointment-reminder",
            todayKey,
            item.name,
            docSnap.id,
          ].join("_");
          const notificationRef = db.collection("notifications")
              .doc(notificationId);
          const title = "Lembrete: seu atendimento é hoje";
          const description = `Seu atendimento no ${item.sector} está ` +
            `agendado para hoje às ${appointmentTime}. Protocolo: ` +
            `${docSnap.id}.`;

          batch.set(notificationRef, {
            userId,
            targetUserId: userId,
            userEmail: data.dadosUsuario?.email || "",
            flavorId: "paraipaba",
            tituloNotification: title,
            descricaoNotification: description,
            message: description,
            protocolo: docSnap.id,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            read: false,
            isRead: false,
            source: "appointment-daily-reminder",
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            data: {
              screen: "Notificacoes",
              type: "appointment-reminder",
              solicitacaoId: docSnap.id,
              protocolo: docSnap.id,
              collection: item.name,
              sector: item.sector,
              appointmentDate: todayKey,
              appointmentTime,
            },
          }, {merge: false});
          batchOperations += 1;
          created += 1;

          if (batchOperations >= 450) {
            await batch.commit();
            batch = db.batch();
            batchOperations = 0;
          }
        }
      }

      if (batchOperations > 0) await batch.commit();
      console.log(`${created} lembrete(s) de atendimento enviado(s) para ` +
        `${todayKey}.`);
    },
);

// Sends a birthday greeting at midnight to users with a registered birth date.
exports.notificarAniversariantesDoDia = onSchedule(
    {
      schedule: "0 0 * * *",
      timeZone: "America/Fortaleza",
    },
    async () => {
      const db = admin.firestore();
      const todayMonthDay = getFortalezaTodayMonthDay();
      if (!todayMonthDay) return;

      const snapshot = await db.collection("users")
          .where("aniversarioMesDia", "==", todayMonthDay)
          .limit(2000)
          .get();

      if (snapshot.empty) {
        console.log(`Nenhum aniversariante encontrado para ${todayMonthDay}.`);
        return;
      }

      let batch = db.batch();
      let ops = 0;
      let created = 0;

      for (const docSnap of snapshot.docs) {
        const userData = docSnap.data() || {};
        const userId = docSnap.id;
        if (!userId) continue;

        const notificationRef = db.collection("notifications").doc(
            `birthday_${todayMonthDay}_${userId}`,
        );
        batch.set(notificationRef, {
          userId,
          targetUserId: userId,
          userEmail: userData.email || "",
          flavorId: "paraipaba",
          tituloNotification: "Feliz Aniversário!",
          descricaoNotification:
            "A Câmara Municipal de Paraipaba deseja um dia especial para você.",
          message:
            "A Câmara Municipal de Paraipaba deseja um dia especial para você.",
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          read: false,
          isRead: false,
          source: "birthday-greeting",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          data: {
            screen: "Notificacoes",
            type: "birthday-greeting",
            monthDay: todayMonthDay,
          },
        }, {merge: false});
        ops += 1;
        created += 1;

        if (ops >= 450) {
          await batch.commit();
          batch = db.batch();
          ops = 0;
        }
      }

      if (ops > 0) {
        await batch.commit();
      }

      console.log(`${created} notificação(ões) de aniversário enviada(s).`);
    },
);

// Releases missed appointments at the end of the day so late citizens can
// still be received as walk-ins before the day closes.
exports.liberarAgendamentosBalcaoNaoComparecidos = onSchedule(
    {
      schedule: "55 23 * * *",
      timeZone: "America/Fortaleza",
      region: "southamerica-east1",
      cpu: "gcf_gen1",
    },
    async () => {
      const db = admin.firestore();
      const snapshot = await db.collection("balcao-cidadao")
          .where("status", "==", "Agendado")
          .limit(1000)
          .get();
      const now = Date.now();
      const missed = snapshot.docs.filter((docSnap) => {
        const data = docSnap.data() || {};
        const appointmentDate = data.appointmentDate ||
          data.dadosSolicitacao?.appointmentDate;
        const appointmentTime = data.appointmentTime ||
          data.dadosSolicitacao?.appointmentTime;
        const appointmentTimestamp = getBalcaoAppointmentTimestamp(
            appointmentDate,
            appointmentTime,
        );
        const hasConfirmedArrival = Boolean(
            data.chegadaRecepcaoEm ||
            data.senhaAtendimento ||
            ["Aguardando Atendimento Presencial", "Chamando",
              "Em Atendimento", "Atendimento Presencial Concluído"]
                .includes(data.statusFila),
        );
        return Number.isFinite(appointmentTimestamp) &&
          appointmentTimestamp < now && !hasConfirmedArrival;
      });

      if (!missed.length) {
        console.log("Nenhum agendamento ausente para liberar.");
        return;
      }

      const batch = db.batch();

      missed.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const appointmentDate = data.appointmentDate ||
          data.dadosSolicitacao?.appointmentDate;
        const appointmentTime = data.appointmentTime ||
          data.dadosSolicitacao?.appointmentTime;
        batch.update(docSnap.ref, {
          status: "Agendamento Liberado",
          statusFila: "Não compareceu",
          agendamentoAnteriorData: appointmentDate,
          agendamentoAnteriorHorario: appointmentTime,
          agendamentoLiberadoAutomaticamenteEm:
            admin.firestore.FieldValue.serverTimestamp(),
          ultimaAtualizacao: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      await batch.commit();
      console.log(
          `${missed.length} agendamento(s) ausente(s) marcado(s) como ` +
          `"Agendamento Liberado" sem reabrir os horarios perdidos.`,
      );
    },
);

exports.notifyUsersOnNewsPublished = onDocumentWritten(
    "noticias/{noticiaId}",
    async (event) => {
      const beforeData = event.data.before ? event.data.before.data() : null;
      const afterData = event.data.after ? event.data.after.data() : null;

      // Caso de exclusão de documento
      if (!afterData) return null;

      // Verifica se o status mudou para "Publicado" (ou se foi criado já
      // publicado)
      const isNewlyPublished = afterData.status === "Publicado" &&
          (!beforeData || beforeData.status !== "Publicado");

      if (!isNewlyPublished) return null;

      await notifyUsersAboutNews(event.params.noticiaId, afterData,
          "news-trigger");
      return null;
    },
);

// Invites the citizen to rate the in-person service once the request moves
// into the document preparation/emission stage.
exports.notifyBalcaoServiceEvaluation = onDocumentWritten(
    {
      document: "balcao-cidadao/{solicitacaoId}",
    },
    async (event) => {
      const beforeData = event.data.before ?
        event.data.before.data() || {} : {};
      const afterData = event.data.after ?
        event.data.after.data() || {} : {};
      if (!event.data.after || !event.data.after.exists) return null;

      const targetStatuses = [
        "Documento em emissão",
        "Documento em preparação",
        "Documento sendo preparado",
      ];
      if (!targetStatuses.includes(afterData.status) ||
          beforeData.status === afterData.status) {
        return null;
      }

      const userId = afterData.userId || afterData.dadosUsuario?.id;
      if (!userId || userId === "recepcao" || userId === "anonimo") {
        return null;
      }

      const db = admin.firestore();
      const notificationRef = db.collection("notifications").doc(
          `service-evaluation_${event.params.solicitacaoId}`,
      );
      const title = "Como foi seu atendimento?";
      const description = "Seu atendimento presencial foi concluído. " +
        "Avalie sua experiência no Balcão do Cidadão.";

      await notificationRef.set({
        userId,
        targetUserId: userId,
        userEmail: afterData.dadosUsuario?.email || "",
        flavorId: "paraipaba",
        tituloNotification: title,
        descricaoNotification: description,
        message: description,
        protocolo: event.params.solicitacaoId,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
        isRead: false,
        source: "service-evaluation",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        data: {
          screen: "Notificacoes",
          type: "service-evaluation",
          solicitacaoId: event.params.solicitacaoId,
          protocolo: event.params.solicitacaoId,
          collection: "balcao-cidadao",
          webPath: `/avaliar-atendimento/${event.params.solicitacaoId}`,
        },
      }, {merge: true});

      return null;
    },
);

// Sends the document-ready app notification to registered users and queues an
// email exclusively for walk-ins created by reception.
exports.notificarDocumentoProntoBalcao = onDocumentWritten(
    {
      document: "balcao-cidadao/{solicitacaoId}",
      region: "southamerica-east1",
      cpu: "gcf_gen1",
    },
    async (event) => {
      if (!event.data.after || !event.data.after.exists) return null;

      const beforeData = event.data.before && event.data.before.exists ?
        event.data.before.data() || {} : {};
      const afterData = event.data.after.data() || {};
      if (!becameDocumentReady(beforeData, afterData)) return null;

      const db = admin.firestore();
      const requestId = event.params.solicitacaoId;
      const userId = afterData.userId || afterData.targetUserId ||
        afterData.dadosUsuario?.id || "";
      const email = getReceptionEmail(afterData);
      const receptionWalkIn = isReceptionWalkIn(afterData);
      const title = "Seu documento está pronto para retirada";
      const description = "Seu documento está disponível para retirada na " +
        "Câmara Municipal. A retirada deve ser feita pelo titular ou por um " +
        "parente de primeiro grau, com documento oficial de identificação.";
      const writes = [];

      if (userId && userId !== "recepcao" && userId !== "anonimo") {
        writes.push(db.collection("notifications")
            .doc(`document-ready_${requestId}`).set({
              userId,
              targetUserId: userId,
              userEmail: afterData.dadosUsuario?.email || email,
              flavorId: "paraipaba",
              tituloNotification: title,
              descricaoNotification: description,
              message: description,
              protocolo: requestId,
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              read: false,
              isRead: false,
              source: "document-ready",
              data: {
                screen: "Notificacoes",
                type: "document-ready",
                solicitacaoId: requestId,
                protocolo: requestId,
                collection: "balcao-cidadao",
              },
            }, {merge: true}));
      }

      if (receptionWalkIn && email) {
        const citizenName = escapeHtml(afterData.dadosBeneficiario?.name ||
          afterData.dadosBeneficiario?.nome ||
          afterData.dadosUsuario?.name || "Cidadão");
        writes.push(db.collection("mail").doc(`document-ready-${requestId}`)
            .set({
              to: email,
              emailOnly: true,
              templateType: "reception-walk-in-document-ready",
              protocolo: requestId,
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
              message: {
                subject: title,
                html: `<p>Olá, ${citizenName}.</p>` +
                  `<p>${description}</p>` +
                  "<p><strong>Protocolo:</strong> " +
                  `${escapeHtml(requestId)}</p>` +
                  "<p>Compareça dentro do horário de atendimento da Câmara " +
                  "Municipal de Paraipaba.</p>",
              },
            }, {merge: true}));
        writes.push(event.data.after.ref.set({
          documentoProntoEmailEnfileiradoEm:
            admin.firestore.FieldValue.serverTimestamp(),
          documentoProntoEmailDestino: email,
        }, {merge: true}));
      }

      await Promise.all(writes);
      console.log(
          `Documento pronto ${requestId}: notificacao=${Boolean(userId &&
          userId !== "recepcao" && userId !== "anonimo")}, ` +
          `emailRecepcao=${Boolean(receptionWalkIn && email)}.`,
      );
      return null;
    },
);

// Notifies the citizen whenever a counter starts or repeats their call.
exports.notificarCidadaoChamadoNoGuiche = onDocumentWritten(
    {
      document: "atendimento-fila/{ticketId}",
    },
    async (event) => {
      if (!event.data.after || !event.data.after.exists) return null;
      const beforeData = event.data.before && event.data.before.exists ?
        event.data.before.data() || {} : {};
      const afterData = event.data.after.data() || {};
      if (afterData.status !== "Chamando") return null;

      const beforeCallMs = beforeData.chamadoEm?.toMillis ?
        beforeData.chamadoEm.toMillis() : 0;
      const afterCallMs = afterData.chamadoEm?.toMillis ?
        afterData.chamadoEm.toMillis() : 0;
      if (beforeData.status === "Chamando" &&
          beforeCallMs === afterCallMs) return null;

      const db = admin.firestore();
      const allowedCollections = new Set([
        "balcao-cidadao",
        "assessoria-microempreendedor",
        "ouvidoria",
        "procuradoria-mulher",
        "piel-atendimentos",
      ]);
      const collectionName = allowedCollections.has(afterData.collectionName) ?
        afterData.collectionName : "balcao-cidadao";
      let requestData = {};
      if (afterData.protocolo) {
        const requestSnapshot = await db.collection(collectionName)
            .doc(afterData.protocolo).get();
        if (requestSnapshot.exists) requestData = requestSnapshot.data() || {};
      }

      const userId = afterData.userId || afterData.targetUserId ||
        requestData.userId || requestData.dadosUsuario?.uid ||
        requestData.dadosUsuario?.id;
      if (!userId || userId === "recepcao" || userId === "anonimo") {
        console.log(
            `Chamada ${event.params.ticketId} sem usuário notificável.`,
        );
        return null;
      }

      const beneficiary = requestData.dadosBeneficiario ||
        requestData.beneficiario || requestData.beneficiary || {};
      const beneficiaryName = beneficiary.name || beneficiary.nome || "";
      const citizenName = afterData.beneficiarioNome || beneficiaryName ||
        afterData.nome ||
        requestData.dadosUsuario?.name || "Cidadão";
      const counterName = afterData.guiche || "guichê de atendimento";
      const description = `${citizenName}, o ${counterName} está chamando ` +
        "você. Dirija-se ao guichê para iniciar seu atendimento.";
      const notificationId = `counter-call_${event.params.ticketId}_` +
        `${afterCallMs || Date.now()}`;

      const writes = [db.collection("notifications").doc(notificationId).set({
        userId,
        targetUserId: userId,
        userEmail: afterData.userEmail || requestData.dadosUsuario?.email || "",
        flavorId: "paraipaba",
        tituloNotification: `${counterName} está chamando você`,
        descricaoNotification: description,
        message: description,
        protocolo: afterData.protocolo || "",
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
        isRead: false,
        source: "counter-call",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        data: {
          screen: "Notificacoes",
          type: "counter-call",
          ticketId: event.params.ticketId,
          protocolo: afterData.protocolo || "",
          collection: collectionName,
          guiche: counterName,
          senha: afterData.senha || "",
          beneficiario: citizenName,
        },
      })];
      if (beneficiaryName && afterData.nome !== beneficiaryName) {
        writes.push(event.data.after.ref.set({
          nome: beneficiaryName,
          beneficiarioNome: beneficiaryName,
          solicitanteNome: requestData.dadosUsuario?.name || "",
        }, {merge: true}));
      }
      await Promise.all(writes);
      return null;
    },
);

exports.notifyNewsNow = onRequest(
    {},
    async (req, res) => {
      applyCors(res);

      if (req.method === "OPTIONS") {
        return res.status(204).send("");
      }
      if (req.method !== "POST") {
        return res.status(405).json({error: "Method Not Allowed"});
      }

      try {
        const noticiaId = req.body?.noticiaId;
        if (!noticiaId || typeof noticiaId !== "string") {
          return res.status(400).json({error: "noticiaId é obrigatório."});
        }

        const db = admin.firestore();
        const noticiaSnap = await db.collection("noticias").doc(noticiaId)
            .get();

        if (!noticiaSnap.exists) {
          return res.status(404).json({error: "Notícia não encontrada."});
        }

        const noticiaData = noticiaSnap.data() || {};
        if (noticiaData.status !== "Publicado") {
          return res.status(400).json({
            error: "A notícia precisa estar publicada para notificar.",
          });
        }

        const result = await notifyUsersAboutNews(noticiaId, noticiaData,
            "news-manual");
        return res.json({success: true, ...result});
      } catch (error) {
        console.error("Erro no notifyNewsNow:", error);
        return res.status(500).json({error: error.message || "Erro interno."});
      }
    },
);

exports.getYoutubeOAuthUrl = onRequest(
    {
      secrets: [youtubeClientId],
    },
    async (req, res) => {
      applyCors(res);

      if (req.method === "OPTIONS") {
        return res.status(204).send("");
      }
      if (req.method !== "POST") {
        return res.status(405).json({error: "Method Not Allowed"});
      }

      try {
        const adminUser = await requireAdminUser(req);
        const clientId = youtubeClientId.value()?.trim();
        if (!clientId) {
          return res.status(500).json({
            ok: false,
            error: "YOUTUBE_CLIENT_ID não configurado.",
          });
        }

        const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        authUrl.searchParams.set("client_id", clientId);
        authUrl.searchParams.set("redirect_uri", youtubeOAuthRedirectUri);
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("scope", youtubeOAuthScopes);
        authUrl.searchParams.set("access_type", "offline");
        authUrl.searchParams.set("prompt", "consent select_account");
        authUrl.searchParams.set("include_granted_scopes", "false");

        await saveYoutubeFunctionLog({
          status: "success",
          functionId: "youtubeOAuthRefreshToken",
          functionName: "youtubeOAuthRefreshToken",
          functionLabel: "Renovar token OAuth YouTube",
          endpoint: "getYoutubeOAuthUrl",
          message: "URL de autorização OAuth gerada.",
          createdBy: adminUser.email || "admin",
          details: {
            action: "generate-auth-url",
            redirectUri: youtubeOAuthRedirectUri,
          },
        });

        return res.json({
          ok: true,
          authUrl: authUrl.toString(),
          redirectUri: youtubeOAuthRedirectUri,
        });
      } catch (error) {
        console.error("Erro no getYoutubeOAuthUrl:", error);
        return res.status(error.status || 500).json({
          ok: false,
          error: error.message || "Erro interno.",
        });
      }
    },
);

exports.updateYoutubeRefreshToken = onRequest(
    {
      secrets: [youtubeClientId, youtubeClientSecret],
    },
    async (req, res) => {
      applyCors(res);

      if (req.method === "OPTIONS") {
        return res.status(204).send("");
      }
      if (req.method !== "POST") {
        return res.status(405).json({error: "Method Not Allowed"});
      }

      const startedAt = Date.now();

      try {
        const adminUser = await requireAdminUser(req);
        const callbackUrl = req.body?.callbackUrl || req.body?.code || "";
        const code = extractYoutubeOAuthCode(callbackUrl);

        if (!code) {
          return res.status(400).json({
            ok: false,
            error: "Informe a URL de retorno do Google ou o parâmetro code.",
          });
        }

        const clientId = youtubeClientId.value()?.trim();
        const clientSecret = youtubeClientSecret.value()?.trim();
        if (!clientId || !clientSecret) {
          return res.status(500).json({
            ok: false,
            error: "Client ID/Secret do YouTube não configurados no Firebase.",
          });
        }

        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
          },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: youtubeOAuthRedirectUri,
            grant_type: "authorization_code",
          }).toString(),
        });

        const tokenPayload = await tokenResponse.json();
        if (!tokenResponse.ok) {
          throw new Error(tokenPayload.error_description ||
            tokenPayload.error ||
            `Falha HTTP ${tokenResponse.status} ao trocar OAuth code.`);
        }

        const refreshToken = tokenPayload.refresh_token;
        if (!refreshToken) {
          throw new Error([
            "Google não retornou refresh_token.",
            "Gere a URL novamente e confirme o consentimento",
            "da conta do canal.",
          ].join(" "));
        }

        let grantedScopes = tokenPayload.scope || "";
        if (!grantedScopes && tokenPayload.access_token) {
          const tokenInfoUrl = new URL(
              "https://oauth2.googleapis.com/tokeninfo",
          );
          tokenInfoUrl.searchParams.set(
              "access_token", tokenPayload.access_token,
          );
          const tokenInfoResponse = await fetch(tokenInfoUrl, {
            signal: AbortSignal.timeout(15000),
          });
          const tokenInfo = await tokenInfoResponse.json().catch(() => ({}));
          if (tokenInfoResponse.ok) grantedScopes = tokenInfo.scope || "";
        }
        if (!grantedScopes.split(/\s+/).includes(youtubeOAuthScope)) {
          throw new Error(
              "O Google não concedeu o escopo youtube.force-ssl. " +
              "Gere uma nova URL de autorização, escolha a conta que " +
              "administra o canal e aceite todas as permissões solicitadas.",
          );
        }

        const versionName = await saveYoutubeRefreshTokenSecret(refreshToken);
        const durationMs = Date.now() - startedAt;

        await saveYoutubeFunctionLog({
          status: "success",
          functionId: "youtubeOAuthRefreshToken",
          functionName: "youtubeOAuthRefreshToken",
          functionLabel: "Renovar token OAuth YouTube",
          endpoint: "updateYoutubeRefreshToken",
          durationMs,
          message: "Refresh token do YouTube atualizado no Secret Manager.",
          createdBy: adminUser.email || "admin",
          details: {
            action: "update-refresh-token",
            secretVersion: versionName,
            expiresIn: tokenPayload.expires_in || null,
            scope: tokenPayload.scope || youtubeOAuthScope,
            nextStep: [
              "Reimplante ou reinicie as funções YouTube para garantir",
              "leitura da versão mais recente do secret.",
            ].join(" "),
          },
        });

        return res.json({
          ok: true,
          message: "Refresh token atualizado com sucesso.",
          secretVersion: versionName,
          expiresIn: tokenPayload.expires_in || null,
        });
      } catch (error) {
        const durationMs = Date.now() - startedAt;
        console.error("Erro no updateYoutubeRefreshToken:", error);
        try {
          await saveYoutubeFunctionLog({
            status: "error",
            functionId: "youtubeOAuthRefreshToken",
            functionName: "youtubeOAuthRefreshToken",
            functionLabel: "Renovar token OAuth YouTube",
            endpoint: "updateYoutubeRefreshToken",
            durationMs,
            message: error.message || "Erro ao atualizar refresh token.",
            details: {
              action: "update-refresh-token",
              errorName: error.name || "Error",
            },
          });
        } catch (logError) {
          console.error("Erro ao registrar log OAuth YouTube:", logError);
        }
        return res.status(error.status || 500).json({
          ok: false,
          error: error.message || "Erro interno.",
        });
      }
    },
);

exports.invokeYoutubeFunction = onRequest(
    {},
    async (req, res) => {
      applyCors(res);

      if (req.method === "OPTIONS") {
        return res.status(204).send("");
      }
      if (req.method !== "POST") {
        return res.status(405).json({error: "Method Not Allowed"});
      }

      try {
        const functionName = req.body?.functionName;

        if (!allowedYoutubeFunctions[functionName]) {
          return res.status(400).json({
            error: "Função YouTube não permitida para chamada manual.",
            message: "atualizarPlaylistYoutube e renovarWebhookYoutube são " +
              "automações do projeto blu-app-camaras; youtubeChannelWebhook " +
              "é chamado apenas pelo YouTube/WebSub.",
            allowed: Object.keys(allowedYoutubeFunctions),
          });
        }

        const result = await invokeYoutubeTarget(functionName,
            "invokeYoutubeFunction");
        return res.status(result.success ? 200 : result.httpStatus)
            .json(result);
      } catch (error) {
        console.error("Erro no invokeYoutubeFunction:", error);
        return res.status(500).json({error: error.message || "Erro interno."});
      }
    },
);

exports.syncYoutubeFunctionLogs = onRequest(
    {},
    async (req, res) => {
      applyCors(res);

      if (req.method === "OPTIONS") {
        return res.status(204).send("");
      }
      if (req.method !== "POST") {
        return res.status(405).json({error: "Method Not Allowed"});
      }

      try {
        const adminUser = await requireAdminUser(req);
        const requestedFunctionId = String(
            req.body?.functionId || "all").trim();
        const targets = requestedFunctionId === "all" ?
          Object.values(youtubeCloudLogTargets) :
          [youtubeCloudLogTargets[requestedFunctionId]].filter(Boolean);

        if (!targets.length) {
          return res.status(400).json({
            ok: false,
            error: "Função de log do YouTube não reconhecida.",
          });
        }

        const syncedLogs = [];

        for (const target of targets) {
          const normalizedLog = await getLatestYoutubeCloudLog(target);
          if (!normalizedLog) continue;

          await saveYoutubeFunctionLog({
            ...normalizedLog,
            createdBy: adminUser.email || "admin",
          });
          syncedLogs.push(normalizedLog);
        }

        return res.json({
          ok: true,
          syncedCount: syncedLogs.length,
          logs: syncedLogs,
        });
      } catch (error) {
        console.error("Erro no syncYoutubeFunctionLogs:", error);
        return res.status(error.status || 500).json({
          ok: false,
          error: error.message || "Erro interno.",
        });
      }
    },
);

exports.atualizarPlaylistYoutubeAutomatico = onSchedule(
    {
      schedule: "every 30 minutes",
      timeZone: "America/Fortaleza",
    },
    async () => {
      console.log("Automação original atualizarPlaylistYoutube gerenciada " +
          "pelo projeto blu-app-camaras. Suporte local não executa chamada.");
      return null;
    },
);

exports.renovarWebhookYoutubeAutomatico = onSchedule(
    {
      schedule: "every 24 hours",
      timeZone: "America/Fortaleza",
    },
    async () => {
      console.log("Automação original renovarWebhookYoutube gerenciada " +
          "pelo projeto blu-app-camaras. Suporte local não executa chamada.");
      return null;
    },
);

exports.verificarVideosTvCamaraAutomatico = onSchedule(
    {
      schedule: "every 15 minutes",
      timeZone: "America/Fortaleza",
    },
    async () => {
      console.log("Verificação automática de vídeos desativada neste " +
          "projeto. A home consulta listarVideosTvCamara sob demanda.");
      return null;
    },
);


/**
 * Remove arquivos do Storage baseados nos dados da solicitação
 * @param {object} request Dados da solicitação
 * @param {Array} promises Array de promessas de exclusão
 */
function cleanupFiles(request, promises) {
  const reqId = request.id || "N/A";
  console.log(`Limpando anexos da solicitação: ${reqId}`);
  let filesToDelete = [];
  if (Array.isArray(request.arquivos)) {
    filesToDelete = [...request.arquivos];
  }
  const balcaoAnexos = request.dadosSolicitacao?.anexos;
  if (balcaoAnexos) {
    Object.values(balcaoAnexos).forEach((fieldArray) => {
      if (Array.isArray(fieldArray)) {
        filesToDelete = filesToDelete.concat(fieldArray);
      }
    });
  }
  filesToDelete.forEach((file) => {
    // Garante que só tentamos deletar se a URL pertencer ao nosso projeto
    if (file.url && file.url.includes("firebasestorage.googleapis.com")) {
      try {
        const urlParts = file.url.split("/o/");
        const filePath = decodeURIComponent(urlParts[1].split("?")[0]);
        promises.push(
            admin.storage().bucket().file(filePath).delete()
                .catch((err) => console.error(
                    `Erro no arquivo ${filePath}: `, err.message,
                )),
        );
      } catch (e) {
        console.error("URL malformada");
      }
    }
  });
}

/**
 * Realiza a limpeza de arquivos e remove o registro do banco
 * @param {Object} snapshot Snapshot do Firebase
 * @param {Array} promises Array de promessas
 * @param {string} collName Nome da coleção
 */
function processDeletion(snapshot, promises, collName) {
  const data = snapshot.data();
  cleanupFiles(data, promises);

  // Limpeza do slot específico no calendário se for Balcão do Cidadão
  if (collName === "balcao-cidadao" && data) {
    const appDate = data.appointmentDate ||
                   data.dadosSolicitacao?.appointmentDate;
    const appTime = data.appointmentTime ||
                   data.dadosSolicitacao?.appointmentTime;
    if (appDate && appTime) {
      const bookedSlotsRef = admin.firestore()
          .collection("balcao-config").doc("bookedSlots");
      promises.push(bookedSlotsRef.update({
        [appDate]: admin.firestore.FieldValue.arrayRemove(appTime),
      }));
    }
  }

  promises.push(snapshot.ref.delete());
}

// Concludes requests five days after the document-ready notification.
exports.concluirDocumentosProntosBalcao = onSchedule(
    {
      schedule: "15 2 * * *",
      timeZone: "America/Fortaleza",
    },
    async () => {
      const db = admin.firestore();
      const now = Date.now();
      const readySnapshot = await db.collection("balcao-cidadao")
          .where("status", "==", "Documento Pronto")
          .get();

      let batch = db.batch();
      let operations = 0;
      let completed = 0;

      for (const requestDoc of readySnapshot.docs) {
        const data = requestDoc.data() || {};
        const deadline = data.documentoProntoConclusaoPrevistaEm;
        const notifiedAt = data.documentoProntoNotificadoEm;
        const deadlineMs = deadline?.toMillis ? deadline.toMillis() :
          new Date(deadline || 0).getTime();
        const notifiedAtMs = notifiedAt?.toMillis ? notifiedAt.toMillis() :
          new Date(notifiedAt || 0).getTime();
        const effectiveDeadline = deadlineMs ||
          (notifiedAtMs ? notifiedAtMs + 5 * 24 * 60 * 60 * 1000 : 0);

        if (!effectiveDeadline || effectiveDeadline > now) continue;

        batch.update(requestDoc.ref, {
          status: "Concluído",
          concluidoAutomaticamenteEm:
            admin.firestore.FieldValue.serverTimestamp(),
          motivoConclusaoAutomatica:
            "Cinco dias após a notificação de documento pronto",
          deletionTimestamp: now + 5 * 24 * 60 * 60 * 1000,
        });
        operations += 1;
        completed += 1;

        if (operations >= 450) {
          await batch.commit();
          batch = db.batch();
          operations = 0;
        }
      }

      if (operations > 0) await batch.commit();
      console.log(`${completed} documento(s) pronto(s) concluído(s).`);
    },
);

// Função agendada para apagar solicitações expiradas
exports.cleanupExpiredRequests = onSchedule(
    {
      schedule: "0 3 * * *",
      timeZone: "America/Fortaleza",
    },
    async (event) => {
      const now = Date.now();
      const db = admin.firestore();
      try {
        const deletionPromises = [];
        const collections = [
          "balcao-cidadao",
          "procon-atendimentos",
          "atendimento-juridico",
          "procuradoria-mulher",
          "ouvidoria",
        ];

        for (const collName of collections) {
          const expiredSnapshot = await db.collection(collName)
              .where("deletionTimestamp", "<=", now)
              .where("deletionTimestamp", ">", 0)
              .get();

          expiredSnapshot.forEach((doc) => {
            const val = doc.data();
            if (!val) return;

            // Status finais que permitem a exclusão após o prazo
            const finalStatuses = [
              "Concluído", "Concluída", "Cancelado", "Cancelada",
              "Finalizada", "Respondida",
            ];

            const isFinalStatus = finalStatuses.includes(val.status);

            // Proteção: só apaga se o deletionTimestamp venceu
            // e o status for um dos estados finais autorizados.
            if (isFinalStatus) {
              console.log(`DELETANDO: Solicitação ${doc.id} ` +
                  `(Status: ${val.status}) expirou.`);
              processDeletion(doc, deletionPromises, collName);
            } else {
              const diffMs = val.deletionTimestamp - now;
              const waitTime = Math.round(diffMs / (1000 * 60 * 60));
              console.log(`MANTENDO: ${doc.id} ainda tem ` +
                  `${waitTime} horas de carência (Status: ${val.status}).`);
            }
          });
        }

        await Promise.all(deletionPromises);
        console.log(`Limpeza concluída. Operações: ${deletionPromises.length}`);
        return null;
      } catch (error) {
        console.error("Erro na cleanupExpiredRequests:", error);
        return null;
      }
    });

exports.esic = require("./esic").esic;

/* eslint-disable max-len */
// Motor único para o módulo de Protocolo. A numeração, os eventos e a
// auditoria ficam no servidor; não há tenantId porque cada Firebase é uma
// instalação independente da Câmara.
// Estas Functions não precisam de CPU dedicada: limitar instâncias evita que
// a criação delas concorra com as Functions legadas pela cota regional.
const protocolRuntime = {
  cors: true,
  // Callable IAM is managed on Cloud Run; onCall ignores the invoker option
  // in this SDK. processCommand validates request.auth before any operation.
  region: "us-central1",
  memory: "256MiB",
  cpu: "gcf_gen1",
  concurrency: 1,
  maxInstances: 1,
};

const removeUndefined = (value) => {
  if (Array.isArray(value)) return value.map(removeUndefined);
  if (value === null || typeof value !== "object") return value;
  const prototype = Object.getPrototypeOf(value);
  const plainObject = prototype === Object.prototype || prototype === null;
  if (!plainObject) return value;
  return Object.fromEntries(
      Object.entries(value)
          .filter(([, item]) => item !== undefined)
          .map(([key, item]) => [key, removeUndefined(item)]),
  );
};

const processCommandHandler = async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Autenticação necessária.");
  const db = admin.firestore();
  const input = request.data || {};
  const user = await db.collection("users").doc(request.auth.uid).get();
  const role = user.data()?.tipo || "Cidadão";
  const privileged = ["Admin", "Administrador", "Protocolo", "Servidor", "Gestor de Setor", "Secretaria Legislativa", "Vereador", "Assessor"].includes(role);
  const now = admin.firestore.FieldValue.serverTimestamp();
  const actor = {userId: request.auth.uid, userName: user.data()?.name || user.data()?.nome || request.auth.token.email || "Usuário"};
  const event = async (processRef, action, visibility = "internal", detail = "", extra = {}) => {
    const entry = {...actor, action, visibility, detail, createdAt: now, ...extra};
    const batch = db.batch();
    batch.set(processRef.collection("timeline").doc(), entry);
    batch.set(processRef.collection("auditLogs").doc(), {...entry, origin: "processCommand", userAgent: request.rawRequest?.headers?.["user-agent"] || "", ip: request.rawRequest?.ip || ""});
    batch.set(db.collection("processEvents").doc(), {...entry, processId: processRef.id});
    if (["PROCESS_RECEIVED", "PROCESS_FORWARDED"].includes(action)) batch.set(processRef.collection("movements").doc(), entry);
    await batch.commit();
  };

  if (input.action === "create") {
    const typeId = String(input.typeId || "").trim();
    const subject = String(input.subject || "").trim();
    if (!typeId || !subject) throw new HttpsError("invalid-argument", "Informe tipo e assunto.");
    const type = await db.collection("processTypes").doc(typeId).get();
    if (!type.exists || type.data()?.active === false) {
      throw new HttpsError("failed-precondition", "Tipo de processo indisponível.");
    }
    const typeData = type.data() || {};
    const [numberingDoc, deadlinesDoc] = await Promise.all([
      db.collection("protocolSettings").doc("numbering").get(),
      db.collection("protocolSettings").doc("deadlines").get(),
    ]);
    const numbering = numberingDoc.data() || {};
    const deadlineSettings = deadlinesDoc.data() || {};
    const origin = input.origin === "presencial" || input.origin === "interno" ? input.origin : "digital";
    if ((origin !== "digital" && !privileged) ||
      (origin === "digital" && typeData.allowCitizenOpen === false && !privileged)) {
      throw new HttpsError("permission-denied", "Sem permissão para esta abertura.");
    }
    const year = new Date().getFullYear();
    const result = await db.runTransaction(async (tx) => {
      const counter = db.collection("processCounters").doc(numbering.restart === "never" ? "global" : String(year));
      const count = await tx.get(counter);
      const sequence = (count.data()?.sequence || 0) + 1;
      const processRef = db.collection("processes").doc();
      tx.set(counter, {sequence, updatedAt: now}, {merge: true});
      const digits = Math.min(12, Math.max(3, Number(numbering.digits || 6)));
      const number = String(numbering.format || "{ANO}.{SEQUENCIAL}").replace("{ANO}", String(year)).replace("{SEQUENCIAL}", String(sequence).padStart(digits, "0"));
      const initialDepartment = input.destinationId || typeData.initialDepartmentId || "protocolo";
      const defaultDays = Number(typeData.defaultDeadlineDays ?? deadlineSettings.defaultDays ?? 0);
      const deadlineAt = input.deadlineAt ? admin.firestore.Timestamp.fromDate(new Date(input.deadlineAt)) : defaultDays > 0 ? admin.firestore.Timestamp.fromMillis(Date.now() + defaultDays * 86400000) : null;
      tx.set(processRef, removeUndefined({protocolNumber: number, year, sequence, typeId, typeName: String(typeData.name || typeData.nome || "Processo"), subject, description: String(input.description || ""), requesterId: input.requesterId || request.auth.uid, requesterName: String(input.requesterName || input.metadata?.requesterName || user.data()?.name || user.data()?.nome || "Interessado"), requesterDocument: String(input.requesterDocument || input.metadata?.requesterDocument || ""), requesterEmail: String(input.requesterEmail || input.metadata?.requesterEmail || ""), requesterPhone: String(input.requesterPhone || input.metadata?.requesterPhone || ""), requesterType: input.requesterType || (privileged && origin !== "digital" ? "presencial" : "cidadao"), origin, status: "awaiting_receipt", currentDepartmentId: initialDepartment, currentResponsibleId: input.currentResponsibleId || "", accessLevel: input.accessLevel || input.confidentiality || typeData.accessLevel || "restricted", priority: input.priority === "urgent" ? "urgent" : "normal", deadlineAt, authenticationCode: processRef.id.slice(0, 6).toUpperCase() + String(sequence).padStart(6, "0"), createdBy: request.auth.uid, createdAt: now, updatedAt: now, metadata: input.metadata || {}}));
      return processRef;
    });
    await event(result, "PROCESS_CREATED", "public", "Processo protocolado e encaminhado ao setor inicial.");
    return {id: result.id, protocolNumber: (await result.get()).data().protocolNumber};
  }

  const processRef = db.collection("processes").doc(String(input.processId || ""));
  const process = await processRef.get();
  if (!process.exists) throw new HttpsError("not-found", "Processo não encontrado.");
  if (!privileged && process.data().requesterId !== request.auth.uid) throw new HttpsError("permission-denied", "Acesso não autorizado.");
  if (input.action === "answerPending" && process.data().requesterId === request.auth.uid) {
    const pendingRef = processRef.collection("pendingItems").doc(String(input.pendingId || ""));
    if (input.pendingId) await pendingRef.set({status: "answered", answer: String(input.detail || ""), answeredAt: now, answeredBy: request.auth.uid}, {merge: true});
    await processRef.update({status: "in_progress", updatedAt: now});
    await event(processRef, "PENDING_ANSWERED", "public", String(input.detail || "")); return {ok: true};
  }
  if (input.action === "document" && process.data().requesterId === request.auth.uid) {
    if (input.accessLevel && input.accessLevel !== "public") throw new HttpsError("permission-denied", "O cidadão só pode anexar documentos públicos ao próprio processo.");
    const {action: ignoredAction, processId: ignoredProcessId, ...record} = input;
    void ignoredAction; void ignoredProcessId;
    await processRef.collection("documents").add({...record, accessLevel: "public", authorId: request.auth.uid, authorName: process.data().requesterName || actor.userName, status: "active", createdAt: now});
    await processRef.update({updatedAt: now});
    await event(processRef, "DOCUMENT_UPLOADED", "public", String(input.name || "Documento anexado"));
    return {ok: true};
  }
  if (!privileged) throw new HttpsError("permission-denied", "Operação administrativa necessária.");
  const actions = {receive: ["in_progress", "PROCESS_RECEIVED"], move: ["awaiting_receipt", "PROCESS_FORWARDED"], document: [process.data().status, "DOCUMENT_UPLOADED"], dispatch: ["in_progress", "DISPATCH_CREATED"], pending: ["awaiting_citizen", "PENDING_CREATED"], complete: ["completed", "PROCESS_COMPLETED"], archive: ["archived", "PROCESS_ARCHIVED"], reopen: ["in_progress", "PROCESS_REOPENED"], suspend: ["suspended", "PROCESS_SUSPENDED"], cancel: ["cancelled", "PROCESS_CANCELLED"], signature: [process.data().status, "SIGNATURE_REQUESTED"], relationship: [process.data().status, "PROCESS_RELATED"], update: [process.data().status, "PROCESS_UPDATED"], event: [process.data().status, "EVENT_REGISTERED"]};
  if (!actions[input.action]) throw new HttpsError("invalid-argument", "Ação inválida.");
  const [status, label] = actions[input.action];
  const updates = {status, updatedAt: now};
  if (input.destinationId) updates.currentDepartmentId = String(input.destinationId);
  if (input.responsibleId !== undefined) updates.currentResponsibleId = String(input.responsibleId || "");
  if (input.priority) updates.priority = input.priority === "urgent" ? "urgent" : "normal";
  if (input.accessLevel) updates.accessLevel = input.accessLevel;
  if (input.deadlineAt) updates.deadlineAt = admin.firestore.Timestamp.fromDate(new Date(input.deadlineAt));
  if (input.action === "receive") {
    updates.receivedAt = now; updates.receivedBy = request.auth.uid;
  }
  if (input.action === "complete") {
    updates.completedAt = now; updates.completion = {result: input.result || "completed", detail: String(input.detail || "")};
  }
  if (input.action === "archive") {
    updates.archivedAt = now; updates.archive = {classification: input.classification || "", note: String(input.detail || ""), userId: request.auth.uid};
  }
  await processRef.update(updates);
  const childCollections = {document: "documents", dispatch: "dispatches", pending: "pendingItems", signature: "signatures", relationship: "relationships"};
  if (childCollections[input.action]) {
    const {action: ignoredAction, processId: ignoredProcessId, ...record} = input;
    void ignoredAction; void ignoredProcessId;
    await processRef.collection(childCollections[input.action]).add({...record, authorId: request.auth.uid, authorName: actor.userName, status: input.action === "signature" ? "awaiting_signature" : input.action === "pending" ? "open" : "active", createdAt: now});
  }
  await event(processRef, label, input.visibility === "public" ? "public" : "internal", String(input.detail || input.note || ""), {fromDepartmentId: process.data().currentDepartmentId || "", toDepartmentId: input.destinationId || ""});
  return {ok: true};
};

exports.processCommand = onCall(protocolRuntime, async (request) => {
  try {
    return await processCommandHandler(request);
  } catch (error) {
    console.error("Erro em processCommand", {
      action: request.data?.action || "",
      userId: request.auth?.uid || "",
      message: error?.message || String(error),
      stack: error?.stack || "",
    });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "Não foi possível registrar o protocolo.");
  }
});

// Consulta pública limitada: exige número e código de autenticação e nunca
// devolve dados pessoais, documentos ou observações internas.
exports.publicProcessLookup = onCall(protocolRuntime, async (request) => {
  const protocolNumber = String(request.data?.protocolNumber || "").trim();
  const authenticationCode = String(request.data?.authenticationCode || "").trim().toUpperCase();
  if (!protocolNumber || !authenticationCode) throw new HttpsError("invalid-argument", "Informe número e código de autenticação.");
  const snapshot = await admin.firestore().collection("processes").where("protocolNumber", "==", protocolNumber).limit(1).get();
  if (snapshot.empty) throw new HttpsError("not-found", "Protocolo não encontrado.");
  const process = snapshot.docs[0];
  if (process.data().authenticationCode !== authenticationCode) throw new HttpsError("permission-denied", "Código de autenticação inválido.");
  const data = process.data();
  return {id: process.id, protocolNumber: data.protocolNumber, subject: data.subject, typeName: data.typeName || "Processo", status: data.status, createdAt: data.createdAt || null, completedAt: data.completedAt || null};
});
