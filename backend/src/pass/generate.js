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
import { createHash } from "node:crypto";
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
import { parsePointRewardTiersFromBusiness, formatBackRewardsFieldValue } from "./point-tiers.js";
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
 * Bandeau par défaut mode points sans image perso (aligné ressource iOS `banner`).
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
 * Génère un fichier .pkpass (buffer) pour un membre.
 * @param {Object} member - { id, name, points }
 * @param {Object} business - optionnel
 * @param {Object} options - { template, format, organizationName, ... }
 */
export async function generatePass(member, business = null, options = {}, collector = null) {
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

  /*
   * Diagnostic : exposer au caller le sha256 de icon.png RÉELLEMENT embedded dans ce pkpass.
   * Permet de prouver en prod que le backend a bien intégré la nouvelle image (ou pas) via
   * /api/debug/notif-icon/:slug → recentPassGets[].icon_sha256_12. Si deux générations consécutives
   * retournent le même sha alors que l'icône source a changé → bug backend (cache sharp, asset non
   * mis à jour, etc.). Sinon → bug côté cache iOS `passd` (miniature bannière figée).
   */
  if (collector && typeof collector === "object") {
    try {
      const iconBuf = buffers["icon.png"];
      const icon2xBuf = buffers["icon@2x.png"];
      const icon3xBuf = buffers["icon@3x.png"];
      collector.iconSha256_12 = iconBuf ? createHash("sha256").update(iconBuf).digest("hex").slice(0, 12) : null;
      collector.icon2xSha256_12 = icon2xBuf ? createHash("sha256").update(icon2xBuf).digest("hex").slice(0, 12) : null;
      collector.icon3xSha256_12 = icon3xBuf ? createHash("sha256").update(icon3xBuf).digest("hex").slice(0, 12) : null;
      collector.iconBytes = iconBuf ? iconBuf.length : 0;
      collector.icon2xBytes = icon2xBuf ? icon2xBuf.length : 0;
      collector.icon3xBytes = icon3xBuf ? icon3xBuf.length : 0;
    } catch { /* diagnostics best-effort */ }
  }
  // passé à passOptions plus bas → on remplit collector.topLevel juste avant `pass.getAsBuffer`
  // pour confirmer que notre userInfo + backgroundColor bumped sont bien dans le pass signé.
  const collectorForTop = collector && typeof collector === "object" ? collector : null;

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
      buffers["strip.png"] = cardBgStripBuf;
      buffers["strip@2x.png"] = await sharp(cardBgStripBuf).resize(STRIP_W * 2, STRIP_H * 2).png().toBuffer();
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
      buffers["strip.png"] = stripWithStamps;
      buffers["strip@2x.png"] = await sharp(stripWithStamps).resize(STRIP_W * 2, STRIP_H * 2).png().toBuffer();
    }
  } else {
    if (cardBgStripBuf) {
      buffers["strip.png"] = cardBgStripBuf;
      buffers["strip@2x.png"] = await sharp(cardBgStripBuf).resize(STRIP_W * 2, STRIP_H * 2).png().toBuffer();
    } else {
      const defaultStripBuf = await loadDefaultPointsStripBuffer(sharp);
      if (defaultStripBuf) {
        buffers["strip.png"] = defaultStripBuf;
        buffers["strip@2x.png"] = await sharp(defaultStripBuf).resize(STRIP_W * 2, STRIP_H * 2).png().toBuffer();
      } else {
        /* Fallback : strip couleur (fichier assets manquant ou erreur). */
        const stripBuf = createStripBuffer(stripTemplateKey, stripColorHex);
        buffers["strip.png"] = stripBuf;
        buffers["strip@2x.png"] = stripBuf;
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
   * Fix #8 — invalidation nucléaire (mais invisible) du snapshot miniature `passd`.
   *
   * Historique des tentatives :
   *   Fix #6 : backField `walletCacheBust` avec clé variable        → inefficace
   *   Fix #7 : ZWSP dans organizationName + description              → inefficace
   * Cause probable : Apple passkit-generator ou la pipeline signature normalise/strip les
   * caractères zero-width, donc `pass.json` signé est identique à l'ancien.
   *
   * Fix #8 = changement TOP-LEVEL matériel mais visuellement invisible :
   *   1) `backgroundColor` : variation de 0 à 1 unité RGB (ΔE < 0.5 → œil humain ne distingue
   *      pas, mais octets pass.json différents) dérivée du hash de notification_icon_updated_at.
   *   2) `userInfo` : objet JSON custom top-level qui passd doit préserver. Contient le hash
   *      complet → zéro ambiguïté, pass.json matériellement distinct pour chaque version.
   *
   * passd doit re-render la miniature bannière car le HASH ENTIER de pass.json change.
   */
  const iconVerSource = String(business?.notification_icon_updated_at ?? "none");
  const iconVerFull = createHash("sha256").update(iconVerSource).digest("hex");
  const iconVerBits = iconVerFull.slice(0, 10);
  /**
   * Perturbation RGB sub-perceptuelle du fond : on dérive 3 valeurs de 0..1 (un bit chacune)
   * depuis le hash, et on les ajoute/retire à (R, G, B). Variation max = ±1 LSB par canal.
   * Imperceptible visuellement, mais change le hash pass.json de manière garantie.
   */
  const bumpChannel = (hex2, bit) => {
    const v = parseInt(hex2, 16);
    if (!Number.isFinite(v)) return hex2;
    const delta = bit ? 1 : 0;
    const next = v >= 255 ? v - delta : v + delta;
    return next.toString(16).padStart(2, "0");
  };
  const normalizeBgHex = (hex) => {
    if (typeof hex !== "string") return null;
    const s = hex.startsWith("#") ? hex.slice(1) : hex;
    if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
    return s;
  };
  const bgOrig = normalizeBgHex(customColors.backgroundColor);
  if (bgOrig) {
    const b0 = (parseInt(iconVerFull.charAt(0), 16) & 1) === 1;
    const b1 = (parseInt(iconVerFull.charAt(1), 16) & 1) === 1;
    const b2 = (parseInt(iconVerFull.charAt(2), 16) & 1) === 1;
    const nr = bumpChannel(bgOrig.slice(0, 2), b0);
    const ng = bumpChannel(bgOrig.slice(2, 4), b1);
    const nb = bumpChannel(bgOrig.slice(4, 6), b2);
    customColors.backgroundColor = `#${nr}${ng}${nb}`;
  }
  const passOptions = {
    passTypeIdentifier: passTypeId,
    teamIdentifier: teamId,
    organizationName: notifTitle,
    /* Éviter « Carte de fidélité » dans description : iOS peut associer au libellé système de notif. */
    description: format === "tampons"
      ? `Tampons · ${stamps}/${stampMax}`
      : `Fidélité · ${member.points} pts`,
    serialNumber: member.id,
    /**
     * userInfo : champ top-level JSON libre (Apple PassKit le sérialise tel quel dans pass.json).
     * En y stockant le hash complet de notification_icon_updated_at, on garantit qu'à chaque
     * nouvelle icône, pass.json change matériellement au niveau top-level → passd invalide son
     * snapshot de miniature bannière et re-render à partir du nouveau icon.png.
     */
    userInfo: {
      iconVersion: iconVerFull,
      iconUpdatedAt: business?.notification_icon_updated_at ?? null,
      passLastModifiedMs: Number(business?.pass_last_modified_ms) || null,
    },
    ...customColors,
  };
  if (collectorForTop) {
    try {
      collectorForTop.topLevel = {
        organizationName: passOptions.organizationName,
        description: passOptions.description,
        backgroundColor: passOptions.backgroundColor,
        foregroundColor: passOptions.foregroundColor,
        userInfoIconVersion: passOptions.userInfo?.iconVersion
          ? String(passOptions.userInfo.iconVersion).slice(0, 16)
          : null,
        userInfoIconUpdatedAt: passOptions.userInfo?.iconUpdatedAt ?? null,
      };
    } catch { /* best-effort */ }
  }
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

  const backTerms = business?.back_terms || "1 point = 1 € de réduction. Valable en magasin.";
  const frontendUrl = (process.env.FRONTEND_URL || process.env.API_URL || "https://myfidpass.fr").replace(/\/$/, "");
  /** Page web fidélité client : /fidelity/:slug + m= pour rouvrir le compte (localStorage + hydrate). */
  const memberIdForWeb = member?.id != null ? String(member.id).trim() : "";
  const backUrl = business?.slug
    ? memberIdForWeb
      ? `${frontendUrl}/fidelity/${encodeURIComponent(business.slug)}?m=${encodeURIComponent(memberIdForWeb)}&ref=pass`
      : `${frontendUrl}/fidelity/${encodeURIComponent(business.slug)}?ref=pass`
    : `${frontendUrl}/`;

  const lastMessageBackField = { key: "lastMessage", label: "Message", value: lastBroadcast };
  if (rawBroadcast) {
    lastMessageBackField.changeMessage = normalizeChangeMessage(changeMsg, rawBroadcast);
  }

  /*
   * Fix #6 — invalidation forcée de la miniature de bannière Wallet (`passd`).
   *
   * PROBLÈME observé : après un changement de `notification_icon` (image A → image B), même si
   *   1) `icon.png` embedded dans le nouveau .pkpass change bien byte-par-byte (resize sharp
   *      déterministe → nouveau hash à chaque image source différente),
   *   2) Wallet refetch bien le pass (vu dans recentPassGets),
   *   3) `Last-Modified` et `pass_last_modified_ms` avancent,
   * la bannière de la notification suivante affiche encore l'icône A.
   *
   * CAUSE : iOS `passd` conserve un snapshot pré-rendu de la miniature de bannière, keyed par
   * empreinte structurelle du pass.json. Il ne régénère ce snapshot QUE si le pass.json lui-même
   * change matériellement — pas uniquement quand icon.png change.
   *
   * FIX : ajouter un `backField` invisible (label+value vides pour ne pas s'afficher, mais dont la
   * CLÉ varie avec `notification_icon_updated_at`). Résultat : chaque nouvelle version d'icône
   * produit une entrée backFields différente → pass.json matériellement modifié → `passd` invalide
   * son snapshot et régénère la miniature à partir du nouveau `icon.png`.
   *
   * La clé doit être STABLE pour une même version d'icône (sinon refetch inutile à chaque render)
   * et DIFFÉRENTE entre deux versions (sinon pas d'invalidation). On dérive donc la clé d'un hash
   * court de `notification_icon_updated_at`.
   */
  const iconVerHash = iconVerBits;
  const walletCacheBustField = {
    key: `iconVer_${iconVerHash}`,
    label: "",
    /** U+2060 WORD JOINER : caractère invisible zero-width, ne s'affiche pas au verso mais
     * rend le champ "présent" structurellement → passd doit régénérer son snapshot si la CLÉ
     * change (ce qui arrive dès que notification_icon_updated_at change). */
    value: "\u2060",
  };

  if (format === "tampons") {
    const rewardValue = stampMidRewardLabel
      ? `5 tampons = ${stampMidRewardLabel} — ${stampMax} tampons = ${stampRewardLabel}`
      : `${stampMax} tampons = ${stampRewardLabel}`;
    pass.backFields.push(
      lastMessageBackField,
      { key: "reward", label: "Récompense", value: rewardValue },
      { key: "terms", label: "Conditions", value: backTerms },
      { key: "website", label: "Voir en ligne", value: backUrl, dataDetectorTypes: ["PKDataDetectorTypeLink"] },
      walletCacheBustField
    );
  } else {
    const pts = Math.max(0, Math.floor(Number(member.points) || 0));
    const tierList = parsePointRewardTiersFromBusiness(business);
    const rewardsBackValue = formatBackRewardsFieldValue(tierList, pts);
    const nextTier = tierList.find((t) => Number(t.points) > pts);
    const toUnlockText = nextTier
      ? `Encore ${Number(nextTier.points) - pts} points pour : ${(nextTier.label && String(nextTier.label).trim()) || "récompense"}.`
      : tierList.length > 0
        ? "Vous avez assez de points pour une récompense. Présentez cette carte en magasin."
        : "Consultez le commerce pour les paliers de récompenses.";

    pass.backFields.push(
      lastMessageBackField,
      { key: "progress", label: "Votre progression", value: `${pts} points` },
      {
        key: "rewards",
        label: "Paliers & avantages",
        value: rewardsBackValue,
      },
      { key: "toUnlock", label: "Pour l'obtenir", value: toUnlockText },
      { key: "terms", label: "Conditions", value: backTerms },
      { key: "website", label: "Voir en ligne", value: backUrl, dataDetectorTypes: ["PKDataDetectorTypeLink"] },
      walletCacheBustField
    );
  }

  return pass.getAsBuffer();
}
