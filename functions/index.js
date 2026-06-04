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
      const model = genAI.getGenerativeModel({model: "gemini-1.5-flash"});

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

      const db = admin.firestore();
      console.log("Iniciando notificação de nova notícia: " +
          event.params.noticiaId);
      const usersSnapshot = await db.collection("users").get();
      console.log(`Encontrados ${usersSnapshot.size} usuários para processar.`);

      const promises = [];
      usersSnapshot.forEach((userDoc) => {
        const userData = userDoc.data() || {};
        const email = userData.email || userData.userEmail;
        const notificationPayload = {
          isRead: false,
          protocolo: event.params.noticiaId,
          targetUserId: userDoc.id,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          tituloNotification: "📢 " + afterData.titulo,
          descricaoNotification: afterData.subtitulo ||
              "Nova notícia publicada. Confira os detalhes no portal!",
          userEmail: email || null,
          userId: userDoc.id,
        };

        promises.push(db.collection("notifications").add(notificationPayload));

        if (email) {
          // 2. Adiciona à fila de e-mail (processado por sendMailOnNewRequest)
          promises.push(db.collection("mail").add({
            to: email,
            message: {
              subject: `Informativo: ${afterData.titulo}`,
              html: `<h3>${afterData.titulo}</h3>` +
                    `<p>${afterData.subtitulo || ""}</p>` +
                    `<hr>` +
                    `<p>Uma nova notícia foi publicada no Portal de ` +
                    `Serviços da ` +
                    `Câmara Municipal de Paraipaba.</p>` +
                    `<p>Acesse o aplicativo para ler o conteúdo completo.</p>`,
            },
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
          }));
        } else {
          console.log(`Usuário ${userDoc.id} sem email; ` +
              "notificação gravada em Firestore apenas.");
        }
      });

      await Promise.all(promises);
      console.log("Notificações enviadas com sucesso para " +
          `${promises.length / 2} usuários.`);
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
