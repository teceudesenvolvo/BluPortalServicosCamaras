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
 * @param {string} cityKey Chave da cidade
 * @param {string} collName Nome da coleção
 */
function processDeletion(snapshot, promises, cityKey, collName) {
  const data = snapshot.val();
  cleanupFiles(data, promises);

  // Limpeza do slot específico no calendário se for Balcão do Cidadão
  if (collName === "balcao-cidadao" && data) {
    const appDate = data.appointmentDate ||
                   data.dadosSolicitacao?.appointmentDate;
    const appTime = data.appointmentTime ||
                   data.dadosSolicitacao?.appointmentTime;
    if (appDate && appTime) {
      const slotPath = `${cityKey}/balcao-config/bookedSlots/` +
                      `${appDate}/${appTime}`;
      promises.push(snapshot.ref.root.child(slotPath).remove());
    }
  }

  promises.push(snapshot.ref.remove());
}

// Função agendada para apagar solicitações expiradas
exports.cleanupExpiredRequests = onSchedule(
    "every 1 hours",
    async (event) => {
      const now = Date.now();
      try {
        const rootRef = admin.database().ref();
        // Em vez de baixar o banco todo, buscamos apenas as chaves (nomes das cidades)
        // Nota: O ideal é ter um nó 'metadata/cities' para evitar o scan no root.
        const citiesSnapshot = await rootRef.once("value");
        const citiesData = citiesSnapshot.val();
        if (!citiesData) return null;

        const deletionPromises = [];
        const now = Date.now();

        for (const cityKey in citiesData) {
          // Ignoramos nós que não são cidades (ex: logs, metadata)
          if (cityKey === "mail" || cityKey === "notifications") continue;
          
          if (Object.prototype.hasOwnProperty.call(citiesData, cityKey)) {
            const collections = [
              "balcao-cidadao",
              "denuncias-procon",
              "atendimento-juridico",
              "procuradoria-mulher",
              "ouvidoria",
            ];
            for (const collName of collections) {
              const collPath = `${cityKey}/${collName}`;
              const collRef = rootRef.child(collPath);
              const expiredSnapshot = await collRef
                  .orderByChild("deletionTimestamp")
                  .startAt(1)
                  .endAt(now).once("value");

              expiredSnapshot.forEach((child) => {
                const val = child.val();
                if (!val) return;

                // Status finais que permitem a exclusão após o prazo
                const finalStatuses = [
                  "Concluído", "Concluída", "Cancelado", "Cancelada",
                  "Finalizada", "Respondida",
                ];

                const isFinalStatus = finalStatuses.includes(val.status);

                // Proteção: só apaga se o deletionTimestamp venceu (5 dias)
                // e o status for um dos estados finais autorizados.
                if (val.deletionTimestamp && val.deletionTimestamp <= now &&
                    isFinalStatus) {
                  console.log(`DELETANDO: Solicitação ${child.key} ` +
                      `(Status: ${val.status}) expirou.`);
                  processDeletion(child, deletionPromises, cityKey, collName);
                } else if (val.deletionTimestamp) {
                  const diffMs = val.deletionTimestamp - now;
                  const waitTime = Math.round(diffMs / (1000 * 60 * 60));
                  console.log(`MANTENDO: ${child.key} ainda tem ` +
                      `${waitTime} horas de carência.`);
                } else {
                  // Registros sem deletionTimestamp (como "Aguardando
                  // Atendimento") nem entram aqui
                }
              });
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
