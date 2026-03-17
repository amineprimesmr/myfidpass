/**
 * Chargement des certificats et images depuis le disque.
 * Référence : REFONTE-REGLES.md — pass.js découpé.
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { certsDir, assetsDir } from "./constants.js";

export function loadCertificates() {
  const signerKeyPassphrase = process.env.SIGNER_KEY_PASSPHRASE || undefined;

  const wwdrPem = process.env.WWDR_PEM?.trim();
  const signerCertPem = process.env.SIGNER_CERT_PEM?.trim();
  const signerKeyPem = process.env.SIGNER_KEY_PEM?.trim();
  if (wwdrPem && signerCertPem && signerKeyPem && wwdrPem.includes("BEGIN")) {
    return {
      wwdr: Buffer.from(wwdrPem, "utf8"),
      signerCert: Buffer.from(signerCertPem, "utf8"),
      signerKey: Buffer.from(signerKeyPem, "utf8"),
      ...(signerKeyPassphrase && { signerKeyPassphrase }),
    };
  }

  const wwdrB64 = process.env.WWDR_PEM_BASE64?.trim();
  const signerCertB64 = process.env.SIGNER_CERT_PEM_BASE64?.trim();
  const signerKeyB64 = process.env.SIGNER_KEY_PEM_BASE64?.trim();
  if (wwdrB64 && signerCertB64 && signerKeyB64) {
    return {
      wwdr: Buffer.from(wwdrB64, "base64"),
      signerCert: Buffer.from(signerCertB64, "base64"),
      signerKey: Buffer.from(signerKeyB64, "base64"),
      ...(signerKeyPassphrase && { signerKeyPassphrase }),
    };
  }

  const wwdrPath = join(certsDir, "wwdr.pem");
  const signerCertPath = join(certsDir, "signerCert.pem");
  const signerKeyPath = join(certsDir, "signerKey.pem");

  if (!existsSync(wwdrPath) || !existsSync(signerCertPath) || !existsSync(signerKeyPath)) {
    throw new Error(
      "Certificats manquants. Railway → Variables : ajoute WWDR_PEM_BASE64, SIGNER_CERT_PEM_BASE64, SIGNER_KEY_PEM_BASE64 (voir scripts/print-cert-base64.sh). Puis redéploie."
    );
  }

  return {
    wwdr: readFileSync(wwdrPath),
    signerCert: readFileSync(signerCertPath),
    signerKey: readFileSync(signerKeyPath),
    ...(signerKeyPassphrase && { signerKeyPassphrase }),
  };
}

export function loadImageFromDir(dir, name) {
  const path = join(dir, name);
  if (existsSync(path)) return readFileSync(path);
  return null;
}
