/**
 * Dormant email adapter retained for the later Resend/email phase.
 * This module is deliberately not imported by index.js, so it creates no
 * deployed function, secret requirement, SMTP dependency, or runtime cost.
 */
import nodemailer from "nodemailer";

export function createSmtpEmailAdapter({ user, password }) {
  const transport = nodemailer.createTransport({ service: "gmail", auth: { user, pass: password } });
  return {
    async send({ to, title, body, url = "/" }) {
      await transport.sendMail({
        from: `Prono L1 <${user}>`,
        to,
        subject: title,
        text: `${body}\n\nhttps://play.docfoot.fr${url}`,
      });
    },
  };
}
