/**
 * Génération / envoi OTP e-mail (partagé auth + invitations équipe).
 */
import { createHmac, randomInt } from "crypto";
import { upsertEmailOtpChallenge } from "../db/email-otp.js";
import { sendMail } from "../email.js";

const OTP_TTL_MS = 5 * 60 * 1000;

export function hashEmailOtp(emailNorm, code) {
  const secret = process.env.EMAIL_OTP_HMAC_SECRET || process.env.JWT_SECRET || "local-dev-only";
  return createHmac("sha256", secret).update(`${emailNorm}:${code}`).digest("hex");
}

export function generateEmailOtpCode() {
  return process.env.NODE_ENV === "test" ? "123456" : String(randomInt(100000, 999999));
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Message lisible côté app quand Resend/SMTP refuse l'envoi. */
export function humanizeEmailSendError(rawError) {
  const detail = String(rawError || "").trim();
  const lower = detail.toLowerCase();
  if (!detail) return "Impossible d'envoyer l'e-mail. Réessayez ou utilisez « Renvoyer le code ».";
  if (
    lower.includes("verify a domain") ||
    lower.includes("testing emails") ||
    lower.includes("own email address") ||
    lower.includes("not authorized to send")
  ) {
    return "Envoi bloqué par Resend : vérifiez que le domaine myfidpass.fr est « Verified » et que RESEND_FROM utilise @myfidpass.fr sur Railway.";
  }
  if (lower.includes("invalid") && lower.includes("from")) {
    return "Expéditeur e-mail invalide (RESEND_FROM / MAIL_FROM sur Railway). Format attendu : Myfidpass <noreply@myfidpass.fr>";
  }
  return detail.slice(0, 280);
}

function buildOtpBodies(code, introText, introHtml) {
  const otpLineText = `MyFidpass : votre code de connexion est ${code}. Il expire dans 5 minutes.`;
  const otpLineHtml = `<p>MyFidpass : votre code de connexion est <strong style="font-size:20px;letter-spacing:2px">${code}</strong>.</p><p>Il expire dans 5 minutes.</p>`;
  return {
    rich: {
      text: `${introText}\n\n${otpLineText}\n\n— MyFidpass`,
      html: `${introHtml}${otpLineHtml}<p>— MyFidpass</p>`,
    },
    simple: {
      text: `${introText}\n\n${otpLineText}`,
      html: `<p>${escapeHtml(introText).replace(/\n/g, "<br/>")}</p>${otpLineHtml}`,
    },
    minimal: {
      text: otpLineText,
      html: otpLineHtml,
    },
  };
}

/**
 * Crée le défi OTP en base et envoie l'e-mail avec le code (plusieurs gabarits en secours).
 * @returns {{ sent: boolean, code?: string, error?: string, humanError?: string }}
 */
export async function issueAndSendEmailOtp({ to, subject, introText, introHtml }) {
  const emailNorm = String(to || "")
    .trim()
    .toLowerCase();
  if (!emailNorm || !emailNorm.includes("@")) {
    return { sent: false, error: "invalid_recipient", humanError: "Adresse e-mail invalide." };
  }

  const code = generateEmailOtpCode();
  const codeHash = hashEmailOtp(emailNorm, code);
  const expires = new Date(Date.now() + OTP_TTL_MS).toISOString();
  const now = new Date().toISOString();

  const safeSubject = String(subject || "Votre code MyFidpass")
    .replace(/[^\x20-\x7E\u00A0-\u024F\u1E00-\u1EFF-]/g, "-")
    .slice(0, 180);

  const bodies = buildOtpBodies(code, introText, introHtml);
  const attempts = [
    { label: "rich", ...bodies.rich },
    { label: "simple", ...bodies.simple },
    { label: "minimal", subject: "Votre code MyFidpass", ...bodies.minimal },
  ];

  let lastError = null;
  for (const attempt of attempts) {
    const mailResult = await sendMail({
      to: emailNorm,
      subject: attempt.subject || safeSubject,
      text: attempt.text,
      html: attempt.html,
    });
    if (mailResult.sent) {
      upsertEmailOtpChallenge(emailNorm, codeHash, expires, now);
      console.log("[Email-OTP] envoyé à", emailNorm, "via", attempt.label, mailResult.provider || "resend");
      return { sent: true, code: process.env.NODE_ENV === "production" ? undefined : code };
    }
    lastError = mailResult.error || "send_failed";
    console.warn("[Email-OTP] échec", attempt.label, "→", emailNorm, lastError);
  }

  const humanError = humanizeEmailSendError(lastError);
  return { sent: false, error: lastError, humanError };
}
