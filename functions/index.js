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
          "camara@camaraparaipaba.ce.gov.br</i></p>" +
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

// New scheduled function to delete cancelled requests
exports.deleteCancelledBalcaoRequests = onSchedule(
    "every 24 hours",
    async (event) => {
      const now = Date.now();
      const rootRef = admin.database().ref();

      try {
        const snapshot = await rootRef.once("value");
        const citiesData = snapshot.val();

        if (!citiesData) {
          console.log("No data found at root. Exiting scheduled deletion.");
          return null;
        }

        const deletionPromises = [];

        // Iterate through each city (top-level key)
        // Assuming top-level keys are city collections
        for (const cityKey in citiesData) {
          if (Object.prototype.hasOwnProperty.call(citiesData, cityKey)) {
            const balRef = rootRef.child(`${cityKey}/balcao-cidadao`);

            // Query cancelled and past deletion timestamp
            const cancelledRequestsSnapshot = await balRef
                .orderByChild("deletionTimestamp")
                .endAt(now)
                .once("value");

            cancelledRequestsSnapshot.forEach((childSnapshot) => {
              const request = childSnapshot.val();
              // Double-check status and deletionTimestamp
              if (request.status === "Cancelado" &&
                  request.deletionTimestamp &&
                  request.deletionTimestamp <= now) {
                console.log(`[${cityKey}] Deleting: ${childSnapshot.key}`);
                deletionPromises.push(childSnapshot.ref.remove());
              }
            });
          }
        }

        await Promise.all(deletionPromises);
        console.log("Scheduled deletion run completed. " +
            `${deletionPromises.length} requests deleted.`);
        return null;
      } catch (error) {
        console.error("Error in deleteCancelledBalcaoRequests function:",
            error);
        return null;
      }
    });
