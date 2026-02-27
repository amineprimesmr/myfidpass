/**
 * Google Wallet — génération du lien "Add to Google Wallet" pour les cartes de fidélité.
 * Même logique que le pass Apple : barcode PDF_417 avec member.id pour le scan en caisse.
 */

import jwt from "jsonwebtoken";

const GOOGLE_SAVE_BASE = "https://pay.google.com/gp/v/save";

function getConfig() {
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID?.trim();
  const raw = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON?.trim();
  if (!issuerId || !raw) return null;
  let key;
  try {
    key = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!key.client_email || !key.private_key) return null;
  return { issuerId, clientEmail: key.client_email, privateKey: key.private_key };
}

/**
 * Construit un identifiant sûr pour Google (alphanumeric, ., _, -).
 */
function safeSuffix(s) {
  return String(s).replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * Génère l'URL "Add to Google Wallet" pour un membre.
 * @param {Object} member - { id, name, email, points }
 * @param {Object} business - { id, organization_name }
 * @param {string} frontendOrigin - origine autorisée (ex. https://myfidpass.fr)
 * @returns {{ url: string } | null }
 */
export function getGoogleWalletSaveUrl(member, business, frontendOrigin) {
  const config = getConfig();
  if (!config) return null;

  const { issuerId, clientEmail, privateKey } = config;
  const classSuffix = "fidpass_" + safeSuffix(business?.id || "default");
  const classId = `${issuerId}.${classSuffix}`;
  const objectId = `${issuerId}.${safeSuffix(member.id)}`;

  const programName = business?.organization_name || "Carte fidélité";
  const accountName = (member.name || member.email || "Client").slice(0, 20);
  const accountId = (member.email || member.id).slice(0, 20);

  const loyaltyClass = {
    id: classId,
    issuerName: "Fidpass",
    programName,
    reviewStatus: "UNDER_REVIEW",
    programLogo: {
      sourceUri: {
        uri: "https://storage.googleapis.com/wallet-lab-tools-codelab-artifacts-public/pass_google_logo.jpg",
      },
      contentDescription: { defaultValue: { language: "fr-FR", value: "Logo" } },
    },
  };

  const loyaltyObject = {
    id: objectId,
    classId,
    state: "ACTIVE",
    accountName,
    accountId,
    loyaltyPoints: {
      label: "Points",
      balance: { int: Math.max(0, Math.floor(Number(member.points) || 0)) },
    },
    barcode: {
      type: "QR_CODE",
      value: member.id,
      alternateText: member.id,
    },
  };

  const origins = [];
  if (frontendOrigin) origins.push(frontendOrigin.replace(/\/$/, ""));
  if (!origins.length) origins.push("https://myfidpass.fr");

  const payload = {
    iss: clientEmail,
    aud: "google",
    typ: "savetowallet",
    iat: Math.floor(Date.now() / 1000),
    origins,
    payload: {
      loyaltyClasses: [loyaltyClass],
      loyaltyObjects: [loyaltyObject],
    },
  };

  try {
    const token = jwt.sign(payload, privateKey, { algorithm: "RS256" });
    return { url: `${GOOGLE_SAVE_BASE}/${token}` };
  } catch (err) {
    console.error("Google Wallet JWT sign error:", err?.message);
    return null;
  }
}

export function isGoogleWalletConfigured() {
  return getConfig() !== null;
}
