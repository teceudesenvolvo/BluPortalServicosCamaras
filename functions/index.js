const {
  onDocumentCreated,
  onDocumentWritten,
} = require("firebase-functions/v2/firestore");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin"); // Keep admin for database operations
const {Logging} = require("@google-cloud/logging");
const {SecretManagerServiceClient} = require("@google-cloud/secret-manager");

admin.initializeApp();

const youtubeClientId = defineSecret("YOUTUBE_CLIENT_ID");
const youtubeClientSecret = defineSecret("YOUTUBE_CLIENT_SECRET");

let secretManagerClient;
let loggingClient;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

const youtubeFunctionsBaseUrl =
    "https://southamerica-east1-blu-app-camara.cloudfunctions.net";
const tvCamaraPublicPlaylistId = "PL2jvfc9q3EZ0CXi2qg5aDPydeCYdCsq59";
const tvCamaraPublicChannelId = "UC-gpASXvFBoe1H6C-alYLzg";
const youtubeOAuthRedirectUri = "http://localhost";
const youtubeOAuthScope = "https://www.googleapis.com/auth/youtube";

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
  const allowed = userData.tipo === "Admin" ||
      decodedToken.email === "leo@gmail.com" ||
      decodedToken.email === "blutecnologiasbr@gmail.com";

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
 * Decodes XML entities used by YouTube public feeds.
 * @param {string} value XML text
 * @return {string} Decoded text
 */
function decodeXmlText(value) {
  return String(value || "")
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"")
      .replace(/&#39;/g, "'");
}

/**
 * Reads the first matching XML tag from a feed entry.
 * @param {string} entry Feed entry XML
 * @param {string[]} tagNames Tag names to try
 * @return {string} Tag text
 */
function readXmlTag(entry, tagNames) {
  for (const tagName of tagNames) {
    const pattern = new RegExp(
        `<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
    const match = entry.match(pattern);
    if (match?.[1]) return decodeXmlText(match[1].trim());
  }
  return "";
}

/**
 * Converts a YouTube feed entry to the public video shape used by the portal.
 * @param {string} entry Feed entry XML
 * @param {number} position Entry position
 * @return {object|null} Normalized video
 */
function parseYoutubeFeedEntry(entry, position) {
  const videoId = readXmlTag(entry, ["yt:videoId", "videoId"]) ||
      readXmlTag(entry, ["id"]).split(":").pop();
  if (!videoId) return null;

  const thumbnailMatch = entry.match(
      /<media:thumbnail\b[^>]*\burl="([^"]+)"/i);

  return {
    videoId,
    title: readXmlTag(entry, ["title"]) || "Vídeo da TV Câmara",
    description: readXmlTag(entry, ["media:description", "description"]),
    thumbnailUrl: thumbnailMatch?.[1] ? decodeXmlText(thumbnailMatch[1]) :
      `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    publishedAt: readXmlTag(entry, ["published", "updated"]) || null,
    position,
  };
}

/**
 * Fetches videos from the public YouTube RSS feed.
 * @return {Promise<object[]>} Public videos
 */
async function fetchPublicTvCamaraFeedVideos() {
  const feedUrls = [
    `https://www.youtube.com/feeds/videos.xml?playlist_id=${tvCamaraPublicPlaylistId}`,
    `https://www.youtube.com/feeds/videos.xml?channel_id=${tvCamaraPublicChannelId}`,
  ];

  for (const feedUrl of feedUrls) {
    const response = await fetch(feedUrl);
    if (!response.ok) {
      console.warn(`Feed público TV Câmara retornou HTTP ${response.status}`);
      continue;
    }

    const xml = await response.text();
    const entries = xml.match(/<entry>[\s\S]*?<\/entry>/gi) || [];
    const videos = entries
        .map((entry, index) => parseYoutubeFeedEntry(entry, index))
        .filter(Boolean)
        .sort((firstVideo, secondVideo) => {
          const firstTime = firstVideo.publishedAt ?
            Date.parse(firstVideo.publishedAt) : 0;
          const secondTime = secondVideo.publishedAt ?
            Date.parse(secondVideo.publishedAt) : 0;
          return secondTime - firstTime;
        });

    if (videos.length > 0) return videos;
  }

  return [];
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
        const videos = await fetchPublicTvCamaraFeedVideos();
        res.set("Cache-Control", "public, max-age=300, s-maxage=300");
        return res.json({
          ok: true,
          source: "youtube-public-feed",
          videos,
        });
      } catch (error) {
        console.error("Erro no listarVideosTvCamaraFallback:", error);
        return res.status(500).json({
          ok: false,
          error: "Falha ao carregar feed público da TV Câmara.",
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
        authUrl.searchParams.set("scope", youtubeOAuthScope);
        authUrl.searchParams.set("access_type", "offline");
        authUrl.searchParams.set("prompt", "consent");
        authUrl.searchParams.set("include_granted_scopes", "true");

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
          "denuncias-procon",
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
