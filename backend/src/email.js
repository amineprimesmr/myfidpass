/**
 * Envoi d’emails (réinitialisation mot de passe, etc.).
 *
 * Option 1 — Resend (recommandé sur Railway) : RESEND_API_KEY + MAIL_FROM (domaine vérifié chez Resend).
 * Option 2 — SMTP : SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_PORT (587 en général), MAIL_FROM optionnel.
 * Sans l’un ou l’autre, aucun mail n’est envoyé (le client reçoit quand même le message générique).
 *
 * Résilience : si Resend échoue (domaine / from invalide), nouvel essai avec onboarding@resend.dev ;
 * si ça échoue encore et que SMTP est configuré, envoi via SMTP.
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
  // Copier-coller Railway peut injecter un retour ligne invisible → clé rejetée par l’API.
  return (process.env.RESEND_API_KEY || "")
    .replace(/\r?\n/g, "")
    .replace(/^\uFEFF/, "")
    .trim();
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

/**
 * @param {{ to: string | string[], subject: string, text?: string, html?: string, from?: string }} p
 */
async function sendViaResend(p) {
  const key = getResendKey();
  if (!key) return { sent: false };
  const { to, subject, text, html, from } = p;
  const fromHeader = (from || fromForResend()).trim();
  const destinations = Array.isArray(to) ? to : [to];
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromHeader,
      to: destinations,
      subject,
      text: text || (html && html.replace(/<[^>]+>/g, "").trim()) || "",
      html: html || undefined,
    }),
  });
  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    let errMsg = raw.slice(0, 800);
    try {
      const j = JSON.parse(raw);
      if (j && typeof j.message === "string") errMsg = j.message;
      else if (j && Array.isArray(j.errors) && j.errors[0]?.message) errMsg = j.errors[0].message;
    } catch (_) {}
    console.error("[Email] Resend HTTP", res.status, errMsg);
    return { sent: false, error: errMsg || `HTTP ${res.status}` };
  }
  let resendId = null;
  try {
    const j = await res.json();
    if (j && typeof j.id === "string") resendId = j.id;
  } catch (_) {}
  if (resendId) {
    console.log("[Email] Resend accepté, id =", resendId, "→ vérifier livraison dans Resend → Logs + boîte spam.");
  } else {
    console.log("[Email] Resend accepté (réponse sans id) — vérifier Resend → Logs.");
  }
  return { sent: true, resendId };
}

async function sendViaSmtp({ to, subject, text, html }) {
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

/**
 * Envoie un email. Si aucun transport n’est configuré, retourne { sent: false }.
 */
export async function sendMail({ to, subject, text, html }) {
  const opts = { to, subject, text, html };

  if (getResendKey()) {
    try {
      const primaryFrom = fromForResend();
      let r = await sendViaResend({ ...opts, from: primaryFrom });
      if (r.sent) return { sent: true, resendId: r.resendId, provider: "resend" };

      if (primaryFrom !== RESEND_FROM_FALLBACK) {
        console.warn(
          "[Email] Resend a échoué avec l’expéditeur configuré ; nouvel essai avec",
          RESEND_FROM_FALLBACK,
          "(voir docs/EMAIL-TRANSACTIONNEL.md — domaine vérifié ?)",
        );
        r = await sendViaResend({ ...opts, from: RESEND_FROM_FALLBACK });
        if (r.sent) return { sent: true, resendId: r.resendId, provider: "resend" };
      }

      if (smtpConfigured()) {
        console.warn("[Email] Resend indisponible ou refusé ; tentative SMTP de secours.");
        const sm = await sendViaSmtp(opts);
        if (sm.sent) return { sent: true, provider: "smtp" };
      }

      return { sent: false, error: r.error, provider: "resend" };
    } catch (err) {
      console.error("[Email] Resend error:", err.message);
      if (smtpConfigured()) {
        const sm = await sendViaSmtp(opts);
        if (sm.sent) return { sent: true, provider: "smtp" };
      }
      return { sent: false, error: err.message };
    }
  }

  if (smtpConfigured()) {
    const sm = await sendViaSmtp(opts);
    return sm.sent ? { ...sm, provider: "smtp" } : sm;
  }
  return { sent: false };
}

export function isEmailConfigured() {
  return !!(getResendKey() || smtpConfigured());
}

/** Diagnostic /health : SMTP utilisable (y compris comme secours si Resend échoue). */
export function isSmtpConfigured() {
  return smtpConfigured();
}

/** Pour diagnostic ops : "resend" | "smtp" | "none" */
export function getEmailTransportLabel() {
  if (getResendKey()) return "resend";
  if (smtpConfigured()) return "smtp";
  return "none";
}

/**
 * GET /api/health/email — booleans seulement (aucune valeur secrète).
 * Permet de vérifier que Railway a bien les variables attendues.
 */
export function getEmailEnvPresence() {
  const key = getResendKey();
  return {
    RESEND_API_KEY: !!key,
    /** false si la clé ressemble à une erreur de collage (mauvais préfixe / trop courte). */
    resendKeyFormatOk: key.startsWith("re_") && key.length >= 10,
    MAIL_FROM: !!(process.env.MAIL_FROM || "").trim(),
    RESEND_FROM: !!(process.env.RESEND_FROM || "").trim(),
    SMTP_HOST: !!(process.env.SMTP_HOST || "").trim(),
    FRONTEND_URL: !!(process.env.FRONTEND_URL || "").trim(),
  };
}
