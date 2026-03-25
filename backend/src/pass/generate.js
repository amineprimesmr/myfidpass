/**
 * Génération du fichier .pkpass (point d'entrée principal).
 * Référence : REFONTE-REGLES.md — pass.js découpé.
 * sharp est chargé à la demande (évite ERR_INVALID_PACKAGE_CONFIG au démarrage avec Node 24).
 * Mis en cache après le premier import pour ne pas ré-importer à chaque génération.
 */
import { PKPass } from "passkit-generator";
import { getPassAuthenticationToken } from "./auth.js";
import { sanitizeLogoText, createLogoFromText, resizeLogoForPass, resizeLogoForPassIcon } from "./images-logo.js";
import { createStripBuffer, buildPassLocations } from "./images-strip.js";
import { drawStampsOnStrip } from "./images-stamps.js";
import { buildBuffers } from "./build-buffers.js";
import { loadCertificates } from "./certs.js";
import {
  PASS_TEMPLATES,
  STRIP_W,
  STRIP_H,
  PASS_HEADER_RIGHT_LABEL,
  PASS_LABEL_MEMBER,
  PASS_LOGO_PLACEHOLDER_TEXT,
} from "./constants.js";
import { radiusMetersForPass } from "../locationRadiusLimits.js";
import {
  parsePointRewardTiersFromBusiness,
  frontRewardLabelFromSortedTiers,
  backRewardLinesFromSortedTiers,
} from "./point-tiers.js";

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
    const base64Data = String(business.logo_base64).replace(/^data:image\/\w+;base64,/, "").trim();
    const logoBuf = Buffer.from(base64Data, "base64");
    if (logoBuf.length > 0) {
      const resized = await resizeLogoForPass(logoBuf);
      if (resized) {
        buffers["logo.png"] = resized.logoPng;
        buffers["logo@2x.png"] = resized.logoPng2x;
        if (process.env.NODE_ENV === "production") {
          console.log("[PassKit] Logo commerce injecté dans le pass (dimensions constants.js)");
        }
      } else {
        const textFallback = await createLogoFromText(stripColorHex, PASS_LOGO_PLACEHOLDER_TEXT);
        if (textFallback) {
          buffers["logo.png"] = textFallback.logoPng;
          buffers["logo@2x.png"] = textFallback.logoPng2x;
          console.warn("[PassKit] Logo image invalide — placeholder texte utilisé à la place");
        }
      }
    }
  } else if (!useTextInStrip && !buffers["logo.png"]) {
    const textLogo = await createLogoFromText(stripColorHex, PASS_LOGO_PLACEHOLDER_TEXT);
    if (textLogo) {
      buffers["logo.png"] = textLogo.logoPng;
      buffers["logo@2x.png"] = textLogo.logoPng2x;
    }
  }

  let passIconSourceBuf = null;
  if (business?.notification_icon_base64) {
    const d = String(business.notification_icon_base64).replace(/^data:image\/\w+;base64,/, "").trim();
    const b = Buffer.from(d, "base64");
    if (b.length > 0) passIconSourceBuf = b;
  }
  if (!passIconSourceBuf && business?.logo_icon_base64) {
    const d = String(business.logo_icon_base64).replace(/^data:image\/\w+;base64,/, "").trim();
    const b = Buffer.from(d, "base64");
    if (b.length > 0) passIconSourceBuf = b;
  }
  if (!passIconSourceBuf && business?.logo_base64) {
    const d = String(business.logo_base64).replace(/^data:image\/\w+;base64,/, "").trim();
    const b = Buffer.from(d, "base64");
    if (b.length > 0) passIconSourceBuf = b;
  }
  if (passIconSourceBuf) {
    const iconResized = await resizeLogoForPassIcon(passIconSourceBuf);
    if (iconResized) {
      buffers["icon.png"] = iconResized.iconPng;
      buffers["icon@2x.png"] = iconResized.iconPng2x;
      buffers["icon@3x.png"] = iconResized.iconPng3x;
      if (process.env.NODE_ENV === "production") {
        console.log("[PassKit] Icônes Wallet (29/58/87px) depuis logo carré ou bandeau");
      }
    }
  } else if (buffers["logo.png"] && buffers["logo.png"].length > 0) {
    // Même rendu que le bandeau logo (y compris [ Votre logo ] généré plus haut).
    const iconResized = await resizeLogoForPassIcon(buffers["logo.png"]);
    if (iconResized) {
      buffers["icon.png"] = iconResized.iconPng;
      buffers["icon@2x.png"] = iconResized.iconPng2x;
      buffers["icon@3x.png"] = iconResized.iconPng3x;
    }
  } else {
    const textLogo = await createLogoFromText(stripColorHex, PASS_LOGO_PLACEHOLDER_TEXT);
    if (textLogo) {
      const iconResized = await resizeLogoForPassIcon(textLogo.logoPng2x);
      if (iconResized) {
        buffers["icon.png"] = iconResized.iconPng;
        buffers["icon@2x.png"] = iconResized.iconPng2x;
        buffers["icon@3x.png"] = iconResized.iconPng3x;
      }
    }
  }

  const stampMax = 10;
  const useTampons = options.required_stamps != null || options.stampMax != null || (business?.required_stamps != null && business?.required_stamps > 0);
  const programType = (options.program_type ?? business?.program_type)?.toLowerCase();
  const explicitFormat = programType === "points" ? "points" : programType === "stamps" ? "tampons" : null;
  const format = options.format || explicitFormat || (useTampons ? "tampons" : "points");
  const stamps = format === "tampons" ? Math.min(Math.max(0, Math.floor(Number(member.points) || 0)), stampMax) : null;

  const stripStampEmoji = (options.stamp_emoji ?? business?.stamp_emoji)?.trim() || "☕";

  const cardBgB64 = options.card_background_base64 ?? business?.card_background_base64 ?? null;
  const cardBgStripBuf = await resizeCardBackgroundToStrip(cardBgB64, sharp);
  const hasCardBackgroundStrip = cardBgStripBuf != null;

  if (format === "tampons") {
    /* Même avec image promo sur le strip : dessiner la grille de tampons par-dessus (comme l’aperçu Ma Carte). Sans image, fond couleur + tampons. */
    const stampIconBase64 = options.stamp_icon_base64 ?? business?.stamp_icon_base64;
    const baseStrip = cardBgStripBuf ?? createStripBuffer(stripTemplateKey, stripColorHex);
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
  } else {
    if (cardBgStripBuf) {
      buffers["strip.png"] = cardBgStripBuf;
      buffers["strip@2x.png"] = await sharp(cardBgStripBuf).resize(STRIP_W * 2, STRIP_H * 2).png().toBuffer();
    } else {
      const stripBuf = createStripBuffer(stripTemplateKey, stripColorHex);
      buffers["strip.png"] = stripBuf;
      buffers["strip@2x.png"] = stripBuf;
    }
  }

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

  const webServiceURL = process.env.PASSKIT_WEB_SERVICE_URL || process.env.API_URL;
  const authToken = getPassAuthenticationToken(member.id);
  const notifTitle = (options.notification_title_override ?? business?.notification_title_override)?.trim() || organizationName;
  const changeMsg = (options.notification_change_message ?? business?.notification_change_message)?.trim() || "%@";
  const passOptions = {
    passTypeIdentifier: passTypeId,
    teamIdentifier: teamId,
    organizationName: notifTitle,
    description: format === "tampons"
      ? `Carte fidélité — ${stamps}/${stampMax} tampons`
      : `Carte de fidélité — ${member.points} pts`,
    serialNumber: member.id,
    ...customColors,
  };
  if (webServiceURL && business) {
    const base = webServiceURL.replace(/\/$/, "");
    passOptions.webServiceURL = `${base}/api`;
    passOptions.authenticationToken = authToken;
    if (process.env.NODE_ENV === "production") {
      console.log("[PassKit] Pass généré avec webServiceURL:", passOptions.webServiceURL, "→ l'iPhone pourra s'enregistrer.");
    }
  } else {
    if (process.env.NODE_ENV === "production") {
      console.warn("[PassKit] Pass généré SANS webServiceURL → aucun appareil ne pourra s'enregistrer. Définir PASSKIT_WEB_SERVICE_URL sur Railway (ex. https://api.myfidpass.fr).");
    }
  }
  const pass = new PKPass(buffers, certificates, passOptions);

  pass.type = "storeCard";

  if (isSectorTemplate) {
    pass.headerFields.push({
      key: "memberName",
      label: "",
      value: member.name,
      textAlignment: "PKTextAlignmentRight",
    });
  }

  pass.headerFields.push({
    key: "headerRight",
    label: "",
    value: PASS_HEADER_RIGHT_LABEL,
    textAlignment: "PKTextAlignmentRight",
  });

  const labelRestants = (options.label_restants ?? business?.label_restants)?.trim() || "Restants";
  const labelMember = (options.label_member ?? business?.label_member)?.trim() || PASS_LABEL_MEMBER;
  const stampRewardLabel = (options.stamp_reward_label ?? business?.stamp_reward_label)?.trim() || "1 offert";
  const stampMidRewardLabel = (options.stamp_mid_reward_label ?? business?.stamp_mid_reward_label)?.trim() || "";
  /**
   * Carte avec image de fond mais sans programme tampons ni points (pas de type ni paliers côté commerce).
   * Dans ce cas seul le champ « Restants » a lieu d’être sur la face ; pas sur les cartes tampons/points classiques.
   */
  const rawProgramType = String(options.program_type ?? business?.program_type ?? "")
    .trim()
    .toLowerCase();
  const effectiveRequiredStamps =
    options.required_stamps != null ? Number(options.required_stamps) : business?.required_stamps != null
      ? Number(business.required_stamps)
      : 0;
  const isDecorativeImageOnlyStrip =
    hasCardBackgroundStrip &&
    rawProgramType !== "stamps" &&
    rawProgramType !== "points" &&
    rawProgramType !== "tampons" &&
    rawProgramType !== "stamp" &&
    rawProgramType !== "point" &&
    !(Number.isFinite(effectiveRequiredStamps) && effectiveRequiredStamps > 0);
  if (format === "tampons") {
    const rewardFrontValue = stampMidRewardLabel
      ? `5 tampons = ${stampMidRewardLabel} — ${stampMax} tampons = ${stampRewardLabel}`
      : "Paliers en magasin";
    pass.secondaryFields.push({
      key: "rewardsFront",
      label: "Récompense",
      value: rewardFrontValue,
      textAlignment: "PKTextAlignmentLeft",
    });
    if (!isSectorTemplate) {
      pass.auxiliaryFields.push({
        key: "member",
        label: labelMember,
        value: member.name,
        textAlignment: "PKTextAlignmentRight",
      });
    }
  } else {
    const ptsInt = Math.max(0, Math.floor(Number(member.points) || 0));
    const pointsValue = String(ptsInt);
    const pointsField = {
      key: "points",
      label: "Points",
      value: pointsValue,
      textAlignment: "PKTextAlignmentCenter",
      changeMessage: "Tu as maintenant %@ points !",
    };
    const sortedPointTiers = parsePointRewardTiersFromBusiness(business);
    if (isDecorativeImageOnlyStrip) {
      const balance = Math.floor(Number(member.points) || 0);
      const restants = Math.max(0, stampMax - Math.min(stampMax, balance));
      pass.secondaryFields.push({
        key: "restantsDecoratif",
        label: "",
        value: `${labelRestants} = ${restants}`,
        textAlignment: "PKTextAlignmentLeft",
        changeMessage: "Fidélité : %@",
      });
    } else {
      /* Wallet réserve toujours une zone « primary » sur une storeCard : si on ne remplit que secondary,
       * la face avant affiche une case vide. Toujours pousser le solde en primary pour le programme points. */
      pass.primaryFields.push(pointsField);
    }
    pass.secondaryFields.push({
      key: "rewardsFront",
      label: "Récompense",
      value: frontRewardLabelFromSortedTiers(sortedPointTiers),
      textAlignment: "PKTextAlignmentLeft",
    });
    if (!isSectorTemplate) {
      pass.auxiliaryFields.push({
        key: "member",
        label: labelMember,
        value: member.name,
        textAlignment: "PKTextAlignmentRight",
      });
    }
  }

  const barcodePayload = {
    message: member.id,
    format: "PKBarcodeFormatQR",
    messageEncoding: "iso-8859-1",
  };
  pass.setBarcodes(barcodePayload);
  if (process.env.NODE_ENV === "production") {
    console.log("[PassKit] Barcode format:", barcodePayload.format);
  }

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
    if (process.env.NODE_ENV === "production") {
      console.log("[PassKit] Pass généré avec", locations.length, "emplacements (rayon", radiusM, "m).");
    }
  }

  const lastBroadcast = (business?.last_broadcast_message != null && String(business.last_broadcast_message).trim() !== "")
    ? String(business.last_broadcast_message).trim().slice(0, 200) : "—";
  const backTerms = business?.back_terms || "1 point = 1 € de réduction. Valable en magasin.";
  const backContact = business?.back_contact || "contact@example.com";
  const frontendUrl = (process.env.FRONTEND_URL || process.env.API_URL || "https://myfidpass.fr").replace(/\/$/, "");
  const backUrl = business?.slug
    ? `${frontendUrl}/?ref=pass&b=${encodeURIComponent(business.slug)}`
    : `${frontendUrl}/?ref=pass`;

  if (format === "tampons") {
    const rewardValue = stampMidRewardLabel
      ? `5 tampons = ${stampMidRewardLabel} — ${stampMax} tampons = ${stampRewardLabel}`
      : `${stampMax} tampons = ${stampRewardLabel}`;
    pass.backFields.push(
      { key: "lastMessage", label: "Message", value: lastBroadcast, changeMessage: changeMsg },
      { key: "reward", label: "Récompense", value: rewardValue },
      { key: "terms", label: "Conditions", value: backTerms },
      { key: "contact", label: "Contact", value: backContact },
      { key: "website", label: "Voir en ligne", value: backUrl, dataDetectorTypes: ["PKDataDetectorTypeLink"] }
    );
  } else {
    const pts = Math.max(0, Math.floor(Number(member.points) || 0));
    const tierList = parsePointRewardTiersFromBusiness(business);
    const rewardLines = backRewardLinesFromSortedTiers(tierList);
    const nextTier = tierList.find((t) => Number(t.points) > pts);
    const toUnlockText = nextTier
      ? `Encore ${Number(nextTier.points) - pts} points pour : ${(nextTier.label && String(nextTier.label).trim()) || "récompense"}.`
      : tierList.length > 0
        ? "Vous avez assez de points pour une récompense. Présentez cette carte en magasin."
        : "Consultez le commerce pour les paliers de récompenses.";

    pass.backFields.push(
      { key: "lastMessage", label: "Message", value: lastBroadcast, changeMessage: changeMsg },
      { key: "progress", label: "Votre progression", value: `${pts} points` },
      {
        key: "rewards",
        label: "Récompenses",
        value: rewardLines.length > 0 ? rewardLines.join("\n") : "Paliers définis par le commerce. Demandez en magasin.",
      },
      { key: "toUnlock", label: "Pour l'obtenir", value: toUnlockText },
      { key: "terms", label: "Conditions", value: backTerms },
      { key: "contact", label: "Contact", value: backContact },
      { key: "website", label: "Voir en ligne", value: backUrl, dataDetectorTypes: ["PKDataDetectorTypeLink"] }
    );
  }

  return pass.getAsBuffer();
}
