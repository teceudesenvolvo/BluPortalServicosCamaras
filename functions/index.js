const {onValueCreated} = require("firebase-functions/v2/database");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {defineString, defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin"); // Keep admin for database operations
const nodemailer = require("nodemailer");

admin.initializeApp();

const gmailEmail = defineString("GMAIL_EMAIL");
const gmailAppPassword = defineSecret("GMAIL_APP_PASSWORD");

let mailTransport;

exports.sendMailOnNewRequest = onValueCreated(
    {
      ref: "/{city}/mail/{pushId}",
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

      const mailData = snapshot.val();

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

      await mailTransport.sendMail(mailOptions);

      return snapshot.ref.remove();
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
    if (file.url && file.url.includes("firebasestorage")) {
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
 */
function processDeletion(snapshot, promises) {
  cleanupFiles(snapshot.val(), promises);
  promises.push(snapshot.ref.remove());
}

/**
 * Realiza a limpeza por ID e dados
 * @param {string} id ID do item
 * @param {object} data Dados do item
 * @param {string} path Caminho completo no banco
 * @param {Array} promises Array de promessas
 */
function processDeletionById(id, data, path, promises) {
  cleanupFiles(data, promises);
  const itemRef = admin.database().ref().child(`${path}/${id}`);
  promises.push(itemRef.remove());
}

// Função agendada para apagar solicitações expiradas
exports.cleanupExpiredRequests = onSchedule(
    "every 1 hours",
    async (event) => {
      const now = Date.now();
      const rootRef = admin.database().ref();
      try {
        const snapshot = await rootRef.once("value");
        const citiesData = snapshot.val();
        if (!citiesData) return null;
        const deletionPromises = [];
        const today = new Date();
        const todayStr = today.toISOString().split("T")[0];

        for (const cityKey in citiesData) {
          if (Object.prototype.hasOwnProperty.call(citiesData, cityKey)) {
            const collections = ["balcao-cidadao", "denuncias-procon"];
            for (const collName of collections) {
              const collPath = `${cityKey}/${collName}`;
              const collRef = rootRef.child(collPath);
              const expiredSnapshot = await collRef
                  .orderByChild("deletionTimestamp")
                  .endAt(now).once("value");

              expiredSnapshot.forEach((child) => {
                processDeletion(child, deletionPromises);
              });

              if (collName === "balcao-cidadao") {
                const allItemsSnap = await collRef.once("value");
                const allItems = allItemsSnap.val() || {};
                Object.keys(allItems).forEach((itemId) => {
                  const req = allItems[itemId];
                  const appDate = req.appointmentDate ||
                                 req.dadosSolicitacao?.appointmentDate;
                  if (req.status === "Agendado" && appDate &&
                      appDate < todayStr) {
                    processDeletionById(
                        itemId, req, collPath, deletionPromises,
                    );
                  }
                });
              }
            }
          }
        }
        await Promise.all(deletionPromises);
        console.log(`Limpeza concluída. Operações: ${deletionPromises.length}`);
        return null;
      } catch (error) {
        console.error("Erro na cleanupExpiredRequests:", error);
        return null;
      }
    });
