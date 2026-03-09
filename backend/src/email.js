/**
 * Envoi d’emails (réinitialisation mot de passe, etc.).
 * Configure SMTP via .env : SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM.
 * Si non configuré, le lien est loggé en console (dev).
 */
import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const MAIL_FROM = process.env.MAIL_FROM || process.env.SMTP_USER || "noreply@myfidpass.fr";

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

/**
 * Envoie un email. Si SMTP non configuré, retourne false et le lien peut être loggé côté appelant.
 */
export async function sendMail({ to, subject, text, html }) {
  const transport = getTransporter();
  if (!transport) return { sent: false };
  try {
    await transport.sendMail({
      from: MAIL_FROM,
      to: Array.isArray(to) ? to.join(", ") : to,
      subject,
      text: text || (html && html.replace(/<[^>]+>/g, "").trim()) || "",
      html: html || undefined,
    });
    return { sent: true };
  } catch (err) {
    console.error("[Email] send error:", err.message);
    return { sent: false, error: err.message };
  }
}

export function isEmailConfigured() {
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
}
