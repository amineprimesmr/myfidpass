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

/**
 * Crée le défi OTP en base et envoie l'e-mail avec le code.
 * @returns {{ sent: boolean, code?: string, error?: string }}
 */
export async function issueAndSendEmailOtp({ to, subject, introText, introHtml }) {
  const emailNorm = String(to || "")
    .trim()
    .toLowerCase();
  const code = generateEmailOtpCode();
  const codeHash = hashEmailOtp(emailNorm, code);
  const expires = new Date(Date.now() + OTP_TTL_MS).toISOString();
  const now = new Date().toISOString();

  const text = `${introText}\n\nMyFidpass : votre code de connexion est ${code}. Il expire dans 5 minutes.\n\n— MyFidpass`;
  const html = `${introHtml}<p>MyFidpass : votre code de connexion est <strong style="font-size:20px;letter-spacing:2px">${code}</strong>.</p><p>Il expire dans 5 minutes.</p><p>— MyFidpass</p>`;

  const mailResult = await sendMail({ to: emailNorm, subject, text, html });
  if (!mailResult.sent) {
    return { sent: false, error: mailResult.error || "send_failed" };
  }

  upsertEmailOtpChallenge(emailNorm, codeHash, expires, now);
  return { sent: true, code: process.env.NODE_ENV === "production" ? undefined : code };
}
