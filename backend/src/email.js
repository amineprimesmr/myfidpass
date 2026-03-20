/**
 * Envoi d’emails (réinitialisation mot de passe, etc.).
 *
 * Option 1 — Resend (recommandé sur Railway) : RESEND_API_KEY + MAIL_FROM (domaine vérifié chez Resend).
 * Option 2 — SMTP : SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_PORT (587 en général), MAIL_FROM optionnel.
 * Sans l’un ou l’autre, aucun mail n’est envoyé (le client reçoit quand même le message générique).
 */
import nodemailer from "nodemailer";

const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const MAIL_FROM_DEFAULT = "noreply@myfidpass.fr";
/** Expéditeur Resend si aucune variable : domaine de test (domaine perso = vérifier myfidpass.fr sur Resend + MAIL_FROM). */
const RESEND_FROM_FALLBACK = "Myfidpass <onboarding@resend.dev>";

function mailFrom() {
  return (process.env.MAIL_FROM || process.env.SMTP_USER || MAIL_FROM_DEFAULT).trim();
}

/** Expéditeur pour l’API Resend uniquement (ne pas réutiliser le défaut SMTP si non vérifié chez Resend). */
function fromForResend() {
  const rf = (process.env.RESEND_FROM || "").trim();
  if (rf) return rf;
  const mf = (process.env.MAIL_FROM || "").trim();
  if (mf) return mf;
  return RESEND_FROM_FALLBACK;
}

function getResendKey() {
  return (process.env.RESEND_API_KEY || "").trim();
}

function smtpConfigured() {
  const host = (process.env.SMTP_HOST || "").trim();
  const user = (process.env.SMTP_USER || "").trim();
  const pass = (process.env.SMTP_PASS || "").trim();
  return !!(host && user && pass);
}

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!smtpConfigured()) return null;
  transporter = nodemailer.createTransport({
    host: (process.env.SMTP_HOST || "").trim(),
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: (process.env.SMTP_USER || "").trim(),
      pass: (process.env.SMTP_PASS || "").trim(),
    },
  });
  return transporter;
}

async function sendViaResend({ to, subject, text, html }) {
  const key = getResendKey();
  if (!key) return { sent: false };
  const destinations = Array.isArray(to) ? to : [to];
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromForResend(),
      to: destinations,
      subject,
      text: text || (html && html.replace(/<[^>]+>/g, "").trim()) || "",
      html: html || undefined,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[Email] Resend HTTP", res.status, errText.slice(0, 500));
    return { sent: false, error: errText || `HTTP ${res.status}` };
  }
  return { sent: true };
}

/**
 * Envoie un email. Si aucun transport n’est configuré, retourne { sent: false }.
 */
export async function sendMail({ to, subject, text, html }) {
  if (getResendKey()) {
    try {
      return await sendViaResend({ to, subject, text, html });
    } catch (err) {
      console.error("[Email] Resend error:", err.message);
      return { sent: false, error: err.message };
    }
  }

  const transport = getTransporter();
  if (!transport) return { sent: false };
  try {
    await transport.sendMail({
      from: mailFrom(),
      to: Array.isArray(to) ? to.join(", ") : to,
      subject,
      text: text || (html && html.replace(/<[^>]+>/g, "").trim()) || "",
      html: html || undefined,
    });
    return { sent: true };
  } catch (err) {
    console.error("[Email] SMTP error:", err.message);
    return { sent: false, error: err.message };
  }
}

export function isEmailConfigured() {
  return !!(getResendKey() || smtpConfigured());
}

/** Pour diagnostic ops : "resend" | "smtp" | "none" */
export function getEmailTransportLabel() {
  if (getResendKey()) return "resend";
  if (smtpConfigured()) return "smtp";
  return "none";
}
