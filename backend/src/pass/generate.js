/**
 * Génération du fichier .pkpass (point d'entrée principal).
 * Référence : REFONTE-REGLES.md — pass.js découpé.
 * sharp est chargé à la demande (évite ERR_INVALID_PACKAGE_CONFIG au démarrage avec Node 24).
 * Mis en cache après le premier import pour ne pas ré-importer à chaque génération.
 */
import { PKPass } from "passkit-generator";
import { getPassAuthenticationToken } from "./auth.js";
import {
  sanitizeLogoText,
  createLogoFromText,
  createPassLogoPlaceholder,
  resizeLogoForPass,
  resizeLogoForPassIcon,
  resizeLogoForPassIconUnified,
  stripDataImageBase64Payload,
} from "./images-logo.js";
import { getBusinessAssetData } from "../db/business-assets.js";
import { createStripBuffer, buildPassLocations, createDefaultIconBuffer } from "./images-strip.js";
import { drawStampsOnStrip } from "./images-stamps.js";
import { buildBuffers } from "./build-buffers.js";
import { loadCertificates } from "./certs.js";
import {
  PASS_TEMPLATES,
  STRIP_W,
  STRIP_H,
  PASS_HEADER_RIGHT_LABEL,
  PASS_LABEL_MEMBER,
  ICON_SIZE_2X,
  ICON_SIZE_3X,
} from "./constants.js";
import { radiusMetersForPass } from "../locationRadiusLimits.js";
import { normalizeChangeMessage, buildLastBroadcastFieldValue } from "./broadcast-field.js";
import { stampNextRewardFaceLabelAndValue } from "./stamp-next-reward-face.js";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __passDir = dirname(fileURLToPath(import.meta.url));

/** Icône app par défaut pour `icon.png` du pass (logonotif) — chargée une fois en mémoire. */
let _logonotifBuf = null;
function getLogonotifBuf() {
  if (_logonotifBuf) return _logonotifBuf;
  try {
    const p = join(__passDir, "../assets/logonotif.png");
    if (existsSync(p)) {
      _logonotifBuf = readFileSync(p);
    }
  } catch (_) {}
  return _logonotifBuf;
}

/** Masque le nom par défaut du parcours invité (QR) sur la face du pass. */
function walletPassMemberDisplayName(name) {
  const t = name != null ? String(name).trim() : "";
  if (!t || /^invité$/i.test(t)) return "—";
  return t;
}

/** Pour `attributedValue` des champs verso (lien HTML Wallet iOS 15+). */
function walletPassEscapeHtmlAttribute(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

let _sharp = null;
async function getSharp() {
  if (!_sharp) _sharp = (await import("sharp")).default;
  return _sharp;
}

/**
 * Image de fond carte → strip Wallet 750×246 (même logique SaaS : exclusif avec tampons / points sur le strip).
 * @returns {Promise<Buffer|null>}
 */
async function resizeCardBackgroundToStrip(cardBgB64, sharp) {
  if (cardBgB64 == null || !String(cardBgB64).trim()) return null;
  const base64Data = String(cardBgB64).replace(/^data:image\/\w+;base64,/, "").trim();
  if (!base64Data) return null;
  const buf = Buffer.from(base64Data, "base64");
  if (buf.length === 0) return null;
  try {
    return await sharp(buf).resize(STRIP_W, STRIP_H).png().toBuffer();
  } catch (e) {
    console.warn("[PassKit] card_background resize failed:", e?.message);
    return null;
  }
}

/**
 * Bandeau par défaut mode points sans image perso — fichier dérivé de l’asset iOS `banner`
 * (maintenu via `npm run sync:wallet-strip` dans ce dépôt backend).
 * @returns {Promise<Buffer|null>}
 */
async function loadDefaultPointsStripBuffer(sharp) {
  const p = join(__passDir, "assets", "default-points-strip.png");
  if (!existsSync(p)) return null;
  try {
    const buf = readFileSync(p);
    if (!buf.length) return null;
    return await sharp(buf).resize(STRIP_W, STRIP_H).png().toBuffer();
  } catch (e) {
    console.warn("[PassKit] default points strip:", e?.message);
    return null;
  }
}

/**
 * PassKit : strip 750×246 @1x + @2x + @3x (iPhone Pro). Toujours dériver @2x/@3x depuis le PNG @1x pour cohérence.
 */
async function assignPassStripBuffers(buffers, sharp, strip1xPng) {
  buffers["strip.png"] = strip1xPng;
  buffers["strip@2x.png"] = await sharp(strip1xPng).resize(STRIP_W * 2, STRIP_H * 2).png().toBuffer();
  buffers["strip@3x.png"] = await sharp(strip1xPng).resize(STRIP_W * 3, STRIP_H * 3).png().toBuffer();
}

/**
 * Génère un fichier .pkpass (buffer) pour un membre.
 * @param {Object} member - { id, name, points }
 * @param {Object} business - optionnel
 * @param {Object} options - { template, format, organizationName, ... }
 */
export async function generatePass(member, business = null, options = {}) {
  const sharp = await getSharp();
  const passTypeId = process.env.PASS_TYPE_ID;
  const teamId = process.env.TEAM_ID;

  if (!passTypeId || !teamId) {
    throw new Error("PASS_TYPE_ID et TEAM_ID doivent être définis dans .env");
  }

  const organizationName =
    sanitizeLogoText(options.organizationName || business?.organization_name || process.env.ORGANIZATION_NAME) || "Carte fidélité";
  const certificates = loadCertificates();
  const buffers = buildBuffers(business?.id, options);

  const stripTemplateKey = options.template || "cafe";
  const toHexStrip = (v) => (v && String(v).trim()) ? (String(v).startsWith("#") ? v : `#${v}`) : null;
  const stripColorHex =
    toHexStrip(options.strip_color ?? options.stripColor) ??
    toHexStrip(options.backgroundColor ?? options.background_color) ??
    toHexStrip(business?.strip_color) ??
    toHexStrip(business?.background_color) ??
    (PASS_TEMPLATES[stripTemplateKey] || PASS_TEMPLATES.classic).backgroundColor;

  const stripDisplayMode = (options.strip_display_mode ?? business?.strip_display_mode ?? "logo").toString().toLowerCase();
  const useTextInStrip = stripDisplayMode === "text";
  const stripText = sanitizeLogoText((options.strip_text ?? business?.strip_text ?? organizationName).trim() || organizationName);

  if (useTextInStrip) {
    const textLogo = await createLogoFromText(stripColorHex, stripText);
    if (textLogo) {
      buffers["logo.png"] = textLogo.logoPng;
      buffers["logo@2x.png"] = textLogo.logoPng2x;
    }
  } else if (business?.logo_base64) {
    const base64Data = stripDataImageBase64Payload(business.logo_base64);
    const logoBuf = base64Data ? Buffer.from(base64Data, "base64") : Buffer.alloc(0);
    if (logoBuf.length > 0) {
      const resized = await resizeLogoForPass(logoBuf);
      if (resized) {
        buffers["logo.png"] = resized.logoPng;
        buffers["logo@2x.png"] = resized.logoPng2x;
      } else {
        const textFallback = await createPassLogoPlaceholder();
        if (textFallback) {
          buffers["logo.png"] = textFallback.logoPng;
          buffers["logo@2x.png"] = textFallback.logoPng2x;
          console.warn("[PassKit] Logo image invalide — placeholder texte utilisé à la place");
        }
      }
    }
  } else if (!useTextInStrip && !buffers["logo.png"]) {
    const textLogo = await createPassLogoPlaceholder();
    if (textLogo) {
      buffers["logo.png"] = textLogo.logoPng;
      buffers["logo@2x.png"] = textLogo.logoPng2x;
    }
  }

  /**
   * Icône Wallet : `icon.png` du .pkpass — **même binaire source** que GET …/notification-icon (`business_assets.notification_icon`).
   * Lecture directe de l’asset SQLite en priorité (évite tout écart avec l’objet `business` en mémoire).
   */
  delete buffers["icon.png"];
  delete buffers["icon@2x.png"];
  delete buffers["icon@3x.png"];

  let notificationIconRaw =
    business?.id != null ? getBusinessAssetData(String(business.id), "notification_icon") : null;
  if (!notificationIconRaw || !String(notificationIconRaw).trim()) {
    notificationIconRaw = business?.notification_icon_base64 && String(business.notification_icon_base64).trim()
      ? String(business.notification_icon_base64).trim()
      : null;
  }
  const notifB64Payload = notificationIconRaw ? stripDataImageBase64Payload(notificationIconRaw) : null;
  let passIconSourceBuf =
    notifB64Payload && Buffer.from(notifB64Payload, "base64").length > 0
      ? Buffer.from(notifB64Payload, "base64")
      : null;

  let notificationIconResized = null;
  if (passIconSourceBuf) {
    notificationIconResized = await resizeLogoForPassIconUnified(passIconSourceBuf);
    if (notificationIconResized) {
      if (process.env.NODE_ENV === "production") {
        console.log("[PassKit] Icônes Wallet (29/58/87px) depuis notification_icon (asset DB)");
      }
    } else {
      console.warn("[PassKit] resizeLogoForPassIconUnified a échoué sur notification_icon — repli logonotif");
    }
  }

  if (notificationIconResized) {
    buffers["icon.png"] = notificationIconResized.iconPng;
    buffers["icon@2x.png"] = notificationIconResized.iconPng2x;
    buffers["icon@3x.png"] = notificationIconResized.iconPng3x;
  } else {
    /**
     * Repli : logonotif (icône app myfidpass) — icône cohérente avec les push notifications.
     * Ne pas utiliser le logo carte : cela confondrait l’icône de notification avec le visuel de la carte.
     * Dernier recours : placeholder générique.
     */
    const logonotifBuf = getLogonotifBuf();
    const logonotifResized = logonotifBuf
      ? await resizeLogoForPassIcon(logonotifBuf).catch(() => null)
      : null;

    if (logonotifResized) {
      buffers["icon.png"] = logonotifResized.iconPng;
      buffers["icon@2x.png"] = logonotifResized.iconPng2x;
      buffers["icon@3x.png"] = logonotifResized.iconPng3x;
      if (process.env.NODE_ENV === "production") {
        console.log("[PassKit] Icônes Wallet (29/58/87px) depuis logonotif (repli notification_icon absent)");
      }
    } else {
      /** Dernier recours : placeholder générique bleu/blanc. */
      const textLogo = await createPassLogoPlaceholder();
      if (textLogo) {
        const iconResized = await resizeLogoForPassIcon(textLogo.logoPng2x);
        if (iconResized) {
          buffers["icon.png"] = iconResized.iconPng;
          buffers["icon@2x.png"] = iconResized.iconPng2x;
          buffers["icon@3x.png"] = iconResized.iconPng3x;
        }
      }
    }
  }

  if (!buffers["icon.png"]) {
    const sharpIcon = await getSharp();
    const fallback1x = createDefaultIconBuffer(stripTemplateKey);
    buffers["icon.png"] = fallback1x;
    buffers["icon@2x.png"] = await sharpIcon(fallback1x).resize(ICON_SIZE_2X, ICON_SIZE_2X).png().toBuffer();
    buffers["icon@3x.png"] = await sharpIcon(fallback1x).resize(ICON_SIZE_3X, ICON_SIZE_3X).png().toBuffer();
    console.warn("[PassKit] Repli ultime : icône template cercle (évite pass sans icon.png)");
  }

  const businessReqRaw = business?.required_stamps != null ? Number(business.required_stamps) : NaN;
  const optionReqRaw = options.required_stamps != null ? Number(options.required_stamps) : NaN;
  const stampMax = Math.max(
    1,
    Math.min(
      50,
      Number.isFinite(optionReqRaw) && optionReqRaw > 0
        ? optionReqRaw
        : Number.isFinite(businessReqRaw) && businessReqRaw > 0
          ? businessReqRaw
          : 10
    )
  );
  const rawProgramForFormat = String(options.program_type ?? business?.program_type ?? "")
    .trim()
    .toLowerCase();
  const normProgram =
    rawProgramForFormat === "tampons" || rawProgramForFormat === "tampon" || rawProgramForFormat === "stamp"
      ? "stamps"
      : rawProgramForFormat === "point"
        ? "points"
        : rawProgramForFormat === "points" || rawProgramForFormat === "stamps"
          ? rawProgramForFormat
          : "";
  const explicitFormat = normProgram === "points" ? "points" : normProgram === "stamps" ? "tampons" : null;
  /** Source de vérité : `program_type` en base ; sans valeur explicite → points (tampons uniquement si program_type = stamps). */
  const format = options.format || explicitFormat || "points";
  const stamps = format === "tampons" ? Math.min(Math.max(0, Math.floor(Number(member.points) || 0)), stampMax) : null;

  const stripStampEmoji = (options.stamp_emoji ?? business?.stamp_emoji)?.trim() || "☕";

  const cardBgB64 = options.card_background_base64 ?? business?.card_background_base64 ?? null;
  const cardBgStripBuf = await resizeCardBackgroundToStrip(cardBgB64, sharp);
  const hasCardBackgroundStrip = cardBgStripBuf != null;

  const isSectorTemplate = ["fastfood", "beauty", "coiffure", "boulangerie", "boucherie", "cafe"].includes(options.template);
  const toHex = (v) => (v && String(v).trim()) ? (String(v).startsWith("#") ? v : `#${v}`) : null;
  const bgHex = toHex(options.backgroundColor ?? options.background_color) ?? toHex(business?.background_color);
  const fgHex = toHex(options.foregroundColor ?? options.foreground_color) ?? toHex(business?.foreground_color);
  const labelHex = toHex(options.label_color) ?? toHex(business?.label_color);
  const templateKey = isSectorTemplate ? options.template : options.template;
  const classic = PASS_TEMPLATES[templateKey] || PASS_TEMPLATES.classic;
  const customColors = {
    backgroundColor: bgHex || classic.backgroundColor,
    foregroundColor: fgHex || classic.foregroundColor,
    labelColor: labelHex || classic.labelColor,
  };

  if (format === "tampons") {
    /* Avec image de fond : strip = image seule (comme le mode points). Sinon : fond couleur + grille tampons dessinée sur le strip. */
    if (cardBgStripBuf) {
      await assignPassStripBuffers(buffers, sharp, cardBgStripBuf);
    } else {
      const stampIconBase64 = options.stamp_icon_base64 ?? business?.stamp_icon_base64;
      const baseStrip = createStripBuffer(stripTemplateKey, stripColorHex);
      const stripWithStamps = await drawStampsOnStrip(
        baseStrip,
        stripTemplateKey,
        stamps,
        stampMax,
        stripStampEmoji,
        stampIconBase64,
        stripColorHex
      );
      await assignPassStripBuffers(buffers, sharp, stripWithStamps);
    }
  } else {
    if (cardBgStripBuf) {
      /* Image de fond commerce (base64) : elle prime sur l’asset Xcode / default-points-strip — la modifier côté app ou SaaS. */
      await assignPassStripBuffers(buffers, sharp, cardBgStripBuf);
    } else {
      const defaultStripBuf = await loadDefaultPointsStripBuffer(sharp);
      if (defaultStripBuf) {
        await assignPassStripBuffers(buffers, sharp, defaultStripBuf);
      } else {
        /* Fallback : strip couleur (fichier default-points-strip.png manquant ou erreur). */
        const stripBuf = createStripBuffer(stripTemplateKey, stripColorHex);
        await assignPassStripBuffers(buffers, sharp, stripBuf);
      }
    }
  }

  const webServiceURL = process.env.PASSKIT_WEB_SERVICE_URL || process.env.API_URL;
  const authToken = getPassAuthenticationToken(member.id);
  const notifTitle = (options.notification_title_override ?? business?.notification_title_override)?.trim() || organizationName;
  const changeMsg = (options.notification_change_message ?? business?.notification_change_message)?.trim() || "%@";
  const rawBroadcast =
    business?.last_broadcast_message != null && String(business.last_broadcast_message).trim() !== ""
      ? String(business.last_broadcast_message).trim().slice(0, 170)
      : "";
  /** Pas de date/heure visible dans le champ (sinon push Wallet + fuseau serveur UTC ≠ heure du téléphone). Unicité : suffixes invisibles. */
  let lastBroadcast;
  if (!rawBroadcast) {
    lastBroadcast = "—";
  } else {
    lastBroadcast = buildLastBroadcastFieldValue(
      rawBroadcast,
      business?.last_broadcast_at,
      business?.broadcast_send_seq
    );
  }
  /*
   * LIMITATION iOS : la miniature d'icône de bannière Wallet est cachée par passd au niveau
   * passTypeIdentifier et n'est jamais invalidée par l'OS. Changer l'icône ici n'affecte que
   * les iPhones qui installent la carte APRÈS le changement. Voir avertissement UX côté app iOS.
   */
  const passOptions = {
    passTypeIdentifier: passTypeId,
    teamIdentifier: teamId,
    organizationName: notifTitle,
    /* Éviter « Carte de fidélité » dans description : iOS peut associer au libellé système de notif. */
    description: format === "tampons"
      ? `Tampons · ${stamps}/${stampMax}`
      : `Fidélité · ${member.points} pts`,
    serialNumber: member.id,
    ...customColors,
  };
  if (webServiceURL && business) {
    const base = webServiceURL.replace(/\/$/, "");
    passOptions.webServiceURL = `${base}/api`;
    passOptions.authenticationToken = authToken;
  } else {
    console.warn("[PassKit] Pass généré SANS webServiceURL → aucun appareil ne pourra s'enregistrer. Définir PASSKIT_WEB_SERVICE_URL sur Railway (ex. https://api.myfidpass.fr).");
  }
  const pass = new PKPass(buffers, certificates, passOptions);

  pass.type = "storeCard";

  /*
   * Ne pas mettre le nom du membre en headerFields : sur iOS il s’affiche sur la même ligne que
   * « Récompenses ↗ » (coin haut droit). Le libellé membre reste en auxiliaryFields (bas de carte),
   * aligné sur l’aperçu Ma carte / CafeDesArts.
   */

  pass.headerFields.push({
    key: "headerRight",
    label: "",
    value: PASS_HEADER_RIGHT_LABEL,
    textAlignment: "PKTextAlignmentRight",
  });

  const labelMember = (options.label_member ?? business?.label_member)?.trim() || PASS_LABEL_MEMBER;
  const stampRewardLabel = (options.stamp_reward_label ?? business?.stamp_reward_label)?.trim() || "1 offert";
  const stampMidRewardLabel = (options.stamp_mid_reward_label ?? business?.stamp_mid_reward_label)?.trim() || "";
  if (format === "tampons") {
    /*
     * Toujours un champ secondaire avec changeMessage (comme « Points » en mode points).
     * Sans ça, si le strip = grille seule (pas d’image de fond), aucun champ ne portait le solde
     * avec %@ → Wallet ne déclenchait pas l’alerte « Tu as maintenant X tampons » après un scan.
     * La grille sur le strip reste la lecture principale ; le chiffre sous le bandeau assure la notif PassKit.
     */
    pass.secondaryFields.push({
      key: "tamponSolde",
      label: "Tampons",
      value: String(stamps),
      textAlignment: "PKTextAlignmentLeft",
      changeMessage: "Tu as maintenant %@ tampons !",
    });
    /* Prochaine récompense : label « Dans x passages », valeur = texte marchand (aligné app Ma carte). */
    const nrFace = stampNextRewardFaceLabelAndValue({
      stampsCollected: stamps,
      totalStamps: stampMax,
      midReward: stampMidRewardLabel,
      finalReward: stampRewardLabel,
    });
    pass.auxiliaryFields.push({
      key: "nextReward",
      label: nrFace.label,
      value: nrFace.value,
      textAlignment: "PKTextAlignmentLeft",
      /** Pas de changeMessage ici : évite une 2ᵉ alerte Wallet en plus de « Tu as maintenant X tampons ». */
    });
    pass.auxiliaryFields.push({
      key: "member",
      label: labelMember,
      value: walletPassMemberDisplayName(member.name),
      textAlignment: "PKTextAlignmentRight",
    });
  } else {
    const ptsInt = Math.max(0, Math.floor(Number(member.points) || 0));
    const pointsValue = String(ptsInt);
    /* changeMessage obligatoire pour que Wallet affiche une alerte à chaque changement de solde. */
    /*
     * Toujours secondary (avec ou sans image perso sur le strip) : le solde reste sur la ligne champs
     * sous le bandeau — aligné app Ma carte + Wallet attendu.
     */
    pass.secondaryFields.push({
      key: "points",
      label: "Points",
      value: pointsValue,
      textAlignment: "PKTextAlignmentLeft",
      changeMessage: "Tu as maintenant %@ points !",
    });
    /* Pas de champ « Récompense » sur la face (paliers : verso « Paliers & avantages »). */
    pass.auxiliaryFields.push({
      key: "member",
      label: labelMember,
      value: walletPassMemberDisplayName(member.name),
      textAlignment: "PKTextAlignmentRight",
    });
  }

  /* Message de campagne : uniquement au **verso** (`lastMessage`), pas sur la face (demande produit). */

  const barcodePayload = {
    message: member.id,
    format: "PKBarcodeFormatQR",
    messageEncoding: "iso-8859-1",
  };
  pass.setBarcodes(barcodePayload);

  const embedWalletLocations =
    business?.wallet_pass_include_locations != null && Number(business.wallet_pass_include_locations) === 1;
  const locLat = business?.location_lat != null ? Number(business.location_lat) : null;
  const locLng = business?.location_lng != null ? Number(business.location_lng) : null;
  if (embedWalletLocations && Number.isFinite(locLat) && Number.isFinite(locLng)) {
    const radiusM = radiusMetersForPass(business.location_radius_meters);
    const relevantText =
      (business?.location_relevant_text && String(business.location_relevant_text).trim()) ||
      `Vous êtes près de ${organizationName}`;
    const locations = buildPassLocations(locLat, locLng, radiusM, relevantText);
    pass.setLocations(...locations);
  }

  const frontendUrl = (process.env.FRONTEND_URL || process.env.API_URL || "https://myfidpass.fr").replace(/\/$/, "");
  /** Page web fidélité client : /fidelity/:slug + m= pour rouvrir le compte (localStorage + hydrate). */
  const memberIdForWeb = member?.id != null ? String(member.id).trim() : "";
  const backUrl = business?.slug
    ? memberIdForWeb
      ? `${frontendUrl}/fidelity/${encodeURIComponent(business.slug)}?m=${encodeURIComponent(memberIdForWeb)}&ref=pass`
      : `${frontendUrl}/fidelity/${encodeURIComponent(business.slug)}?ref=pass`
    : `${frontendUrl}/`;

  /** Verso : libellé court (plus d’URL brute) ; le lien reste cliquable via `attributedValue`. */
  const webAccountBackField = {
    key: "website",
    label: "Mes récompenses",
    value: "Mes récompenses",
    attributedValue: `<a href="${walletPassEscapeHtmlAttribute(backUrl)}">Mes récompenses</a>`,
  };

  const lastMessageBackField = { key: "lastMessage", label: "Message", value: lastBroadcast };
  if (rawBroadcast) {
    lastMessageBackField.changeMessage = normalizeChangeMessage(changeMsg, rawBroadcast);
  }

  const backAddress =
    business?.location_address != null ? String(business.location_address).trim() : "";
  const addressBackFields = backAddress.length > 0 ? [{ key: "address", label: "Adresse", value: backAddress }] : [];

  if (format === "tampons") {
    pass.backFields.push(lastMessageBackField, ...addressBackFields, webAccountBackField);
  } else {
    const pts = Math.max(0, Math.floor(Number(member.points) || 0));

    pass.backFields.push(
      lastMessageBackField,
      ...addressBackFields,
      { key: "progress", label: "Votre progression", value: `${pts} points` },
      webAccountBackField,
    );
  }

  return pass.getAsBuffer();
}
