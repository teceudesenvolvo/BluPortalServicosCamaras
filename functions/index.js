const {onValueCreated} = require("firebase-functions/v2/database");
const {onSchedule} = require("firebase-functions/v2/scheduler"); // Import onSchedule
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

      const mailOptions = {
        from: `"Portal de Serviços" <${gmailEmail.value()}>`,
        to: mailData.to,
        subject: mailData.message.subject,
        html: mailData.message.html,
      };

      await mailTransport.sendMail(mailOptions);

      return snapshot.ref.remove();
    },
);

// New scheduled function to delete cancelled requests
exports.deleteCancelledBalcaoRequests = onSchedule('every 24 hours', async (event) => {
    const now = Date.now();
    const rootRef = admin.database().ref();

    try {
        const snapshot = await rootRef.once('value');
        const citiesData = snapshot.val();

        if (!citiesData) {
            console.log("No data found at root. Exiting scheduled deletion.");
            return null;
        }

        const deletionPromises = [];

        // Iterate through each city (top-level key)
        // Assuming top-level keys are city collections
        for (const cityKey in citiesData) {
            if (citiesData.hasOwnProperty(cityKey)) {
                const balcaoCidadaoRef = rootRef.child(`${cityKey}/balcao-cidadao`);
                
                // Query for requests that are cancelled and past their deletion timestamp
                const cancelledRequestsSnapshot = await balcaoCidadaoRef
                    .orderByChild('deletionTimestamp')
                    .endAt(now)
                    .once('value');

                cancelledRequestsSnapshot.forEach(childSnapshot => {
                    const request = childSnapshot.val();
                    // Double-check status and deletionTimestamp to ensure only truly cancelled ones are deleted
                    if (request.status === 'Cancelado' && request.deletionTimestamp && request.deletionTimestamp <= now) {
                        console.log(`[${cityKey}] Deleting cancelled request: ${childSnapshot.key}`);
                        deletionPromises.push(childSnapshot.ref.remove());
                    }
                });
            }
        }

        await Promise.all(deletionPromises);
        console.log(`Scheduled deletion run completed. ${deletionPromises.length} requests deleted.`);
        return null;
    } catch (error) {
        console.error("Error in deleteCancelledBalcaoRequests scheduled function:", error);
        return null;
    }
});
