const {onValueCreated} = require("firebase-functions/v2/database");
const {defineString, defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin");
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
