const {onValueCreated} = require("firebase-functions/v2/database");
const {defineString} = require("firebase-functions/params");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

const gmailEmail = defineString("GMAIL_EMAIL");
const gmailPassword = defineString("GMAIL_PASSWORD");

let mailTransport;

exports.sendMailOnNewRequest = onValueCreated(
    "/{city}/mail/{pushId}",
    async (event) => {
      if (!mailTransport) {
        mailTransport = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: gmailEmail.value(),
            pass: gmailPassword.value(),
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
