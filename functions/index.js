const {
  onDocumentCreated,
  onDocumentWritten,
} = require("firebase-functions/v2/firestore");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {onRequest} = require("firebase-functions/v2/https");
const {defineString, defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin"); // Keep admin for database operations
const {VertexAI} = require("@google-cloud/vertexai");
const nodemailer = require("nodemailer");

admin.initializeApp();

const gmailEmail = defineString("GMAIL_EMAIL");
const gmailAppPassword = defineSecret("GMAIL_APP_PASSWORD");

let genAI;
let mailTransport;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

const youtubeFunctionsBaseUrl =
    "https://southamerica-east1-blu-app-camara.cloudfunctions.net";

const allowedYoutubeFunctions = {
  atualizarPlaylistYoutube: {
    endpoint: `${youtubeFunctionsBaseUrl}/atualizarPlaylistYoutube`,
    method: "POST",
    label: "Atualizar playlist do YouTube",
  },
  youtubeChannelWebhook: {
    endpoint: `${youtubeFunctionsBaseUrl}/youtubeChannelWebhook`,
    method: "GET",
    label: "Webhook do canal YouTube",
  },
  renovarWebhookYoutube: {
    endpoint: `${youtubeFunctionsBaseUrl}/renovarWebhookYoutube`,
    method: "POST",
    label: "Renovar webhook YouTube",
  },
  listarVideosTvCamara: {
    endpoint: `${youtubeFunctionsBaseUrl}/listarVideosTvCamara`,
    method: "GET",
    label: "Listar vídeos da TV Câmara",
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
      secrets: [gmailAppPassword],
    },
    async (event) => {
      const pass = await gmailAppPassword.value();
      if (!mailTransport) {
        mailTransport = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: gmailEmail.value(),
            pass: pass,
          },
        });
      }

      const snapshot = event.data;

      if (!snapshot) return;

      const mailData = snapshot.data();

      const emailFooter = "<br><br><hr><p><i>Por favor não responda " +
          "este email. Email oficial da câmara:<br/>" +
          "balcaocidadao25@gmail.com</i></p>" +
          "<p>Este email foi enviado automaticamente pelo sistema do " +
          "Portal de Serviços da Câmara Municipal de Paraipaba.<br/>" +
          " Se você tiver dúvidas ou precisar de assistência, por " +
          "favor entre em contato com a câmara através do email " +
          "acima. Obrigado por utilizar o Portal de Serviços da " +
          "Câmara Municipal de Paraipaba. <strong>" +
          "Atenciosamente,<br>Blu Tecnologias</strong></p>";

      const mailOptions = {
        from: `"Portal de Serviços" <${gmailEmail.value()}>`,
        to: mailData.to,
        subject: mailData.message.subject,
        html: `${mailData.message.html}${emailFooter}`,
      };

      try {
        await mailTransport.sendMail(mailOptions);

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

        return snapshot.ref.delete();
      } catch (error) {
        console.error(`Erro ao enviar email para ${mailData.to}:`, error);
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

      if (!genAI) {
        genAI = new VertexAI({
          project: process.env.GCLOUD_PROJECT,
          location: "us-central1",
        });
      }
      const model = genAI.getGenerativeModel({model: "gemini-2.5-flash"});

      try {
        const prompt = req.body?.prompt;
        if (!prompt || typeof prompt !== "string") {
          return res.status(400).json({
            error: "Campo prompt é obrigatório.",
          });
        }

        const result = await model.generateContent({
          contents: [{role: "user", parts: [{text: prompt}]}],
          generationConfig: {
            temperature: 0.7,
          },
        });

        const response = await result.response;
        const generatedText =
            response.candidates[0].content.parts[0].text || "";

        const cleanedText = generatedText.replace(/```html|```/g, "").trim();
        return res.json({text: cleanedText});
      } catch (error) {
        console.error("Erro no generateNews:", error);
        return res.status(500).json({error: "Erro interno ao gerar texto."});
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
            error: "Função YouTube não permitida.",
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

exports.atualizarPlaylistYoutubeAutomatico = onSchedule(
    {
      schedule: "every 30 minutes",
      timeZone: "America/Fortaleza",
    },
    async () => {
      try {
        await invokeYoutubeTarget("atualizarPlaylistYoutube",
            "schedule-atualizarPlaylistYoutubeAutomatico");
      } catch (error) {
        console.error("Erro no atualizarPlaylistYoutubeAutomatico:", error);
      }
      return null;
    },
);

exports.renovarWebhookYoutubeAutomatico = onSchedule(
    {
      schedule: "every 24 hours",
      timeZone: "America/Fortaleza",
    },
    async () => {
      try {
        await invokeYoutubeTarget("renovarWebhookYoutube",
            "schedule-renovarWebhookYoutubeAutomatico");
      } catch (error) {
        console.error("Erro no renovarWebhookYoutubeAutomatico:", error);
      }
      return null;
    },
);

exports.verificarVideosTvCamaraAutomatico = onSchedule(
    {
      schedule: "every 15 minutes",
      timeZone: "America/Fortaleza",
    },
    async () => {
      try {
        await invokeYoutubeTarget("listarVideosTvCamara",
            "schedule-verificarVideosTvCamaraAutomatico");
      } catch (error) {
        console.error("Erro no verificarVideosTvCamaraAutomatico:", error);
      }
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
    "every 1 hours",
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
