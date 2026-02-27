import { PKPass } from "passkit-generator";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { PNG } from "pngjs";
import { getLevel } from "./db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(__dirname, "..", "assets");
const certsDir = join(__dirname, "..", "certs");

/** Génère une icône PNG 29x29 grise (requise par Apple pour que le pass soit valide sur iPhone). */
function createDefaultIconBuffer() {
  const size = 29;
  const png = new PNG({ width: size, height: size });
  png.data = Buffer.alloc(size * size * 4);
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 0x6b;     // R
    png.data[i + 1] = 0x6b; // G
    png.data[i + 2] = 0x6b; // B
    png.data[i + 3] = 255;  // A
  }
  return PNG.sync.write(png);
}

function loadCertificates() {
  const signerKeyPassphrase = process.env.SIGNER_KEY_PASSPHRASE || undefined;

  // Option 1a : certificats en PEM (variables d'environnement)
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

  // Option 1b : certificats en base64 (une ligne, évite les soucis de retours à la ligne sur Railway)
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

  // Option 2 : fichiers dans backend/certs/
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

function loadImageFromDir(dir, name) {
  const path = join(dir, name);
  if (existsSync(path)) return readFileSync(path);
  return null;
}

/**
 * Construit les buffers d'images pour un pass.
 * Priorité : dossier de l'entreprise (assets/businesses/:id/) puis dossier global (assets/).
 * Si aucune icône n'est trouvée, on en génère une (obligatoire pour qu'Apple accepte le pass sur iPhone).
 */
function buildBuffers(businessId) {
  const buffers = {};
  const businessDir = businessId ? join(assetsDir, "businesses", businessId) : null;
  const dirs = businessDir && existsSync(businessDir) ? [businessDir, assetsDir] : [assetsDir];

  for (const dir of dirs) {
    const logo = loadImageFromDir(dir, "logo@2x.png") || loadImageFromDir(dir, "logo.png");
    const icon = loadImageFromDir(dir, "icon@2x.png") || loadImageFromDir(dir, "icon.png");
    const strip = loadImageFromDir(dir, "strip@2x.png") || loadImageFromDir(dir, "strip.png");
    if (logo) buffers["logo.png"] = logo;
    if (icon) buffers["icon.png"] = icon;
    if (strip) buffers["strip.png"] = strip;
    if (Object.keys(buffers).length > 0) break;
  }

  if (!buffers["icon.png"]) {
    buffers["icon.png"] = createDefaultIconBuffer();
  }
  return buffers;
}

/** Templates de design (couleurs du pass). Doivent correspondre aux id du frontend. */
const PASS_TEMPLATES = {
  classic: { backgroundColor: "#0a7c42", foregroundColor: "#ffffff", labelColor: "#e8f5e9" },
  modern: { backgroundColor: "#1a237e", foregroundColor: "#ffffff", labelColor: "#c5cae9" },
  dark: { backgroundColor: "#212121", foregroundColor: "#ffffff", labelColor: "#b0b0b0" },
  warm: { backgroundColor: "#bf360c", foregroundColor: "#ffffff", labelColor: "#ffccbc" },
  fastfood: { backgroundColor: "#c41e3a", foregroundColor: "#ffffff", labelColor: "#ffd54f" },
  beauty: { backgroundColor: "#b76e79", foregroundColor: "#ffffff", labelColor: "#fce4ec" },
  coiffure: { backgroundColor: "#5c4a6a", foregroundColor: "#ffffff", labelColor: "#d1c4e0" },
  boulangerie: { backgroundColor: "#b8860b", foregroundColor: "#ffffff", labelColor: "#fff8e1" },
  boucherie: { backgroundColor: "#6d2c3e", foregroundColor: "#ffffff", labelColor: "#ffcdd2" },
  cafe: { backgroundColor: "#5d4e37", foregroundColor: "#ffffff", labelColor: "#d7ccc8" },
};

/**
 * Génère un fichier .pkpass (buffer) pour un membre d'une entreprise.
 * @param {Object} member - { id, name, points }
 * @param {Object} business - { id, organization_name, back_terms, back_contact } (optionnel pour rétrocompat)
 * @param {Object} options - { template, format } template = classic|fastfood|..., format = points|tampons
 * @returns {Promise<Buffer>}
 */
export async function generatePass(member, business = null, options = {}) {
  const passTypeId = process.env.PASS_TYPE_ID;
  const teamId = process.env.TEAM_ID;

  if (!passTypeId || !teamId) {
    throw new Error("PASS_TYPE_ID et TEAM_ID doivent être définis dans .env");
  }

  const organizationName = business?.organization_name || process.env.ORGANIZATION_NAME || "Carte fidélité";
  const certificates = loadCertificates();
  const buffers = buildBuffers(business?.id);

  const level = getLevel(member.points);
  const format = options.format || "points";
  const stampMax = options.stampMax ?? 10;
  const stamps = format === "tampons" ? Math.min(Math.max(0, Math.floor(Number(member.points) || 0)), stampMax) : null;

  // Couleurs : priorité aux couleurs enregistrées sur la business, sinon template
  const templateKey = ["fastfood", "beauty", "coiffure", "boulangerie", "boucherie", "cafe"].includes(options.template)
  ? options.template
  : options.template;
  const customColors =
    business?.background_color || business?.foreground_color || business?.label_color
      ? {
          backgroundColor: business.background_color || PASS_TEMPLATES.classic.backgroundColor,
          foregroundColor: business.foreground_color || PASS_TEMPLATES.classic.foregroundColor,
          labelColor: business.label_color || PASS_TEMPLATES.classic.labelColor,
        }
      : PASS_TEMPLATES[templateKey] || PASS_TEMPLATES.classic;

  const pass = new PKPass(
    buffers,
    certificates,
    {
      passTypeIdentifier: passTypeId,
      teamIdentifier: teamId,
      organizationName,
      description: format === "tampons"
        ? `Carte fidélité ${organizationName} — ${stamps}/${stampMax} tampons`
        : `Carte de fidélité ${organizationName} — ${member.points} pts`,
      serialNumber: member.id,
      ...customColors,
    }
  );

  pass.type = "storeCard";

  if (format === "tampons") {
    pass.primaryFields.push({
      key: "stamps",
      label: "Tampons",
      value: `${stamps} / ${stampMax}`,
      textAlignment: "PKTextAlignmentCenter",
    });
    pass.secondaryFields.push({
      key: "member",
      label: "Membre",
      value: member.name,
    });
  } else {
    pass.primaryFields.push({
      key: "points",
      label: "Points",
      value: member.points,
      textAlignment: "PKTextAlignmentCenter",
    });
    pass.secondaryFields.push({
      key: "level",
      label: "Niveau",
      value: level,
    });
    pass.auxiliaryFields.push({
      key: "member",
      label: "Membre",
      value: member.name,
    });
  }

  pass.setBarcodes({
    message: member.id,
    format: "PKBarcodeFormatPDF417",
    messageEncoding: "iso-8859-1",
    altText: member.id,
  });

  const backTerms = business?.back_terms || "1 point = 1 € de réduction. Valable en magasin.";
  const backContact = business?.back_contact || "contact@example.com";
  pass.backFields.push(
    { key: "terms", label: "Conditions", value: backTerms },
    { key: "contact", label: "Contact", value: backContact }
  );

  return pass.getAsBuffer();
}
