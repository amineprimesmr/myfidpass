/**
 * E-mail d'invitation équipe (sans code OTP) — l'employé se connecte via l'app + code envoyé à la demande.
 */
import { sendMail } from "../email.js";
import { escapeHtml, humanizeEmailSendError } from "./email-otp-send.js";

const DEFAULT_IOS = "https://apps.apple.com/fr/app/myfidpass/id6759921605";
const DEFAULT_ANDROID = "https://play.google.com/store/apps/details?id=fr.myfidpass";
const DEFAULT_SITE = "https://myfidpass.fr";

function appDownloadLinks() {
  const base = String(process.env.FRONTEND_URL || DEFAULT_SITE).replace(/\/$/, "");
  const ios = String(process.env.APP_STORE_IOS_URL || process.env.APP_IOS_URL || `${base}/ios`).trim();
  const android = String(
    process.env.APP_STORE_ANDROID_URL || process.env.APP_ANDROID_URL || DEFAULT_ANDROID,
  ).trim();
  return { ios, android, site: base };
}

/**
 * Invitation employé / gérant : pas de mot de passe, pas de code dans cet e-mail.
 * @returns {{ sent: boolean, error?: string, humanError?: string }}
 */
export async function sendTeamInvitationEmail({ to, shopName, inviterLabel, role }) {
  const emailNorm = String(to || "")
    .trim()
    .toLowerCase();
  if (!emailNorm || !emailNorm.includes("@")) {
    return { sent: false, error: "invalid_recipient", humanError: "Adresse e-mail invalide." };
  }

  const roleLabel = role === "manager" ? "gérant" : "employé";
  const shop = String(shopName || "Votre commerce").trim();
  const inviter = String(inviterLabel || "Le responsable").trim();
  const links = appDownloadLinks();

  const subject = `Invitation MyFidpass — ${shop}`.slice(0, 180);

  const text = [
    "Bonjour,",
    "",
    `${inviter} vous a invité en tant ${roleLabel === "employé" ? "qu'employé" : "que gérant"} pour le commerce « ${shop} » sur MyFidpass.`,
    "",
    "─── Étape 1 : télécharger l'app ───",
    `iPhone (App Store) : ${links.ios}`,
    `Android (Google Play) : ${links.android}`,
    "",
    "─── Étape 2 : se connecter ───",
    "1. Ouvrez MyFidpass",
    "2. Appuyez sur « Se connecter »",
    `3. Saisissez votre identifiant (e-mail) : ${emailNorm}`,
    "4. Appuyez sur Continuer — un code à 6 chiffres vous sera envoyé par e-mail (valable quelques minutes)",
    "",
    "Pas de mot de passe : votre e-mail est votre identifiant. Le code de connexion est demandé à chaque ouverture de session.",
    "",
    "— MyFidpass",
  ].join("\n");

  const html = [
    `<p>Bonjour,</p>`,
    `<p><strong>${escapeHtml(inviter)}</strong> vous a invité en tant qu'<strong>${escapeHtml(roleLabel)}</strong> pour le commerce « <strong>${escapeHtml(shop)}</strong> » sur MyFidpass.</p>`,
    `<h3 style="margin:20px 0 8px;font-size:16px">1. Téléchargez l'app</h3>`,
    `<p style="margin:0 0 12px">`,
    `<a href="${escapeHtml(links.ios)}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 18px;background:#111;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">iPhone — App Store</a>`,
    `<a href="${escapeHtml(links.android)}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 18px;background:#111;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Android — Google Play</a>`,
    `</p>`,
    `<h3 style="margin:20px 0 8px;font-size:16px">2. Connectez-vous</h3>`,
    `<ol style="padding-left:20px;line-height:1.6">`,
    `<li>Ouvrez <strong>MyFidpass</strong></li>`,
    `<li>Appuyez sur <strong>Se connecter</strong></li>`,
    `<li>Identifiant (e-mail) : <strong>${escapeHtml(emailNorm)}</strong></li>`,
    `<li>Appuyez sur <strong>Continuer</strong> — un code à 6 chiffres vous sera envoyé par e-mail</li>`,
    `</ol>`,
    `<p style="color:#444;font-size:14px"><strong>Pas de mot de passe.</strong> Votre e-mail est votre identifiant. Le code de connexion est envoyé à la demande lors de chaque connexion.</p>`,
    `<p>— MyFidpass</p>`,
  ].join("");

  const mailResult = await sendMail({ to: emailNorm, subject, text, html });
  if (mailResult.sent) {
    console.log("[Team-Invite] e-mail invitation envoyé à", emailNorm);
    return { sent: true };
  }
  const err = mailResult.error || "send_failed";
  return { sent: false, error: err, humanError: humanizeEmailSendError(err) };
}

export { humanizeEmailSendError };
