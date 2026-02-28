/**
 * Envoi de notifications APNs pour mise à jour des passes Apple Wallet.
 * Utilise le même certificat que la signature des passes (signer cert + key).
 * Payload vide : Apple exige un payload vide pour signaler "pass mis à jour".
 */
import apn from "apn";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const certsDir = join(__dirname, "..", "certs");

function loadSignerCertAndKey() {
  const signerKeyPassphrase = process.env.SIGNER_KEY_PASSPHRASE || undefined;
  const signerCertPem = process.env.SIGNER_CERT_PEM?.trim();
  const signerKeyPem = process.env.SIGNER_KEY_PEM?.trim();
  if (signerCertPem && signerKeyPem && signerCertPem.includes("BEGIN")) {
    return {
      cert: Buffer.from(signerCertPem, "utf8"),
      key: Buffer.from(signerKeyPem, "utf8"),
      ...(signerKeyPassphrase && { passphrase: signerKeyPassphrase }),
    };
  }
  const signerCertB64 = process.env.SIGNER_CERT_PEM_BASE64?.trim();
  const signerKeyB64 = process.env.SIGNER_KEY_PEM_BASE64?.trim();
  if (signerCertB64 && signerKeyB64) {
    return {
      cert: Buffer.from(signerCertB64, "base64"),
      key: Buffer.from(signerKeyB64, "base64"),
      ...(signerKeyPassphrase && { passphrase: signerKeyPassphrase }),
    };
  }
  const signerCertPath = join(certsDir, "signerCert.pem");
  const signerKeyPath = join(certsDir, "signerKey.pem");
  if (existsSync(signerCertPath) && existsSync(signerKeyPath)) {
    return {
      cert: readFileSync(signerCertPath),
      key: readFileSync(signerKeyPath),
      ...(signerKeyPassphrase && { passphrase: signerKeyPassphrase }),
    };
  }
  return null;
}

let providerInstance = null;
let providerError = null; // raison si getProvider() a échoué

/**
 * Retourne la raison pour laquelle APNs n'est pas disponible (pour message d'erreur utilisateur).
 */
export function getApnsUnavailableReason() {
  if (providerInstance) return null;
  if (providerError) return providerError;
  if (!process.env.PASS_TYPE_ID?.trim()) {
    return "PASS_TYPE_ID manquant. Ajoute-le dans les variables d'environnement Railway (ex. pass.com.tonentreprise.fidelity).";
  }
  const creds = loadSignerCertAndKey();
  if (!creds) {
    return "Certificat signataire Apple manquant. Les notifications Wallet utilisent le même certificat que la signature des passes. Sur Railway, définis SIGNER_CERT_PEM_BASE64 et SIGNER_KEY_PEM_BASE64 (contenu base64 de signerCert.pem et signerKey.pem). Voir docs/APPLE-WALLET-SETUP.md.";
  }
  return "APNs non configuré (erreur à l'initialisation).";
}

function getProvider() {
  if (providerInstance !== undefined) return providerInstance;
  providerError = null;
  const passTypeId = process.env.PASS_TYPE_ID;
  if (!passTypeId) {
    providerError =
      "PASS_TYPE_ID manquant. Ajoute-le dans les variables d'environnement Railway (ex. pass.com.tonentreprise.fidelity).";
    providerInstance = null;
    return null;
  }
  const creds = loadSignerCertAndKey();
  if (!creds) {
    providerError =
      "Certificat signataire Apple manquant. Les notifications Wallet utilisent le même certificat que la signature des passes. Sur Railway, définis SIGNER_CERT_PEM_BASE64 et SIGNER_KEY_PEM_BASE64 (contenu base64 de signerCert.pem et signerKey.pem). Voir docs/APPLE-WALLET-SETUP.md.";
    providerInstance = null;
    return null;
  }
  try {
    console.log("[apns] Chargement certificat (cert=%d octets, key=%d octets)...", creds.cert?.length || 0, creds.key?.length || 0);
    providerInstance = new apn.Provider({
      cert: creds.cert,
      key: creds.key,
      passphrase: creds.passphrase,
      production: process.env.NODE_ENV === "production",
    });
    if (!providerInstance) {
      providerError =
        "Le fournisseur APNs a retourné null. Vérifie que SIGNER_CERT_PEM_BASE64 / SIGNER_KEY_PEM_BASE64 contiennent bien le certificat Pass Type ID (Portail Apple > Identifiers > Pass Type ID > Certificate).";
      providerInstance = null;
    }
  } catch (err) {
    const msg = err?.message || String(err);
    console.warn("[apns] Impossible de créer le provider APNs:", msg);
    if (err?.stack) console.warn("[apns] Stack:", err.stack);
    providerError = `APNs : ${msg}. Utilise le certificat Pass Type ID (même que pour signer les passes), pas un certificat APNs app.`;
    providerInstance = null;
  }
  return providerInstance;
}

/**
 * Envoie une notification "pass mis à jour" à un device (Apple Wallet).
 * Payload vide comme requis par Apple pour PassKit.
 * @param {string} deviceToken - Token push du device (hex)
 * @returns {Promise<{ sent: boolean, error?: string }>}
 */
export function sendPassKitUpdate(deviceToken) {
  const prov = getProvider();
  if (!prov) {
    const reason = getApnsUnavailableReason();
    return Promise.resolve({ sent: false, error: reason || "APNs non configuré" });
  }
  const passTypeId = process.env.PASS_TYPE_ID;
  if (!passTypeId) return Promise.resolve({ sent: false, error: "PASS_TYPE_ID manquant" });
  const note = new apn.Notification();
  note.payload = {};
  note.topic = passTypeId;
  note.expiry = Math.floor(Date.now() / 1000) + 3600;
  return prov.send(note, deviceToken).then(
    (result) => {
      if (result.failed && result.failed.length > 0) {
        const err = result.failed[0].response?.reason || result.failed[0].status || "unknown";
        return { sent: false, error: err };
      }
      return { sent: true };
    },
    (err) => ({ sent: false, error: err?.message || String(err) })
  );
}

/**
 * À appeler au démarrage pour vérifier si APNs est utilisable. Log le résultat.
 */
export function logApnsStatus() {
  const prov = getProvider();
  if (prov) {
    console.log("[apns] Au démarrage: APNs prêt (certificat + PASS_TYPE_ID OK).");
    return;
  }
  const reason = getApnsUnavailableReason();
  console.warn("[apns] Au démarrage: APNs non disponible —", reason || "inconnu");
}

/** Ferme la connexion APNs (à appeler au shutdown si besoin). */
export function shutdownApns() {
  if (providerInstance) {
    providerInstance.shutdown();
    providerInstance = null;
  }
}
