/**
 * PNG « logo bandeau » aligné sur generatePass (images-logo + buildBuffers).
 * Sert /api/businesses/:slug/public/logo pour la page fidélité / roue.
 */
import { getBusinessLogoFileForPublic } from "./business-logo-assets.js";
import { buildBuffers } from "../pass/build-buffers.js";
import { createLogoFromText, sanitizeLogoText, resizeLogoForPass } from "../pass/images-logo.js";

function toHexStrip(v) {
  const t = v && String(v).trim();
  if (!t) return null;
  return String(t).startsWith("#") ? t : `#${t}`;
}

/**
 * @param {Record<string, unknown> | null | undefined} business
 * @returns {Promise<{ buffer: Buffer, contentType: string } | null>}
 */
export async function resolvePublicWalletLogoPng(business) {
  if (!business) return null;

  const stripDisplayMode = (business.strip_display_mode ?? "logo").toString().toLowerCase();
  const useTextInStrip = stripDisplayMode === "text";
  const organizationName =
    sanitizeLogoText(business.organization_name || business.name) || "Carte fidélité";
  const stripText = sanitizeLogoText(
    (business.strip_text != null && String(business.strip_text).trim()) || organizationName,
  );
  const stripColorHex =
    toHexStrip(business.strip_color) ??
    toHexStrip(business.background_color) ??
    "#0a7c42";

  if (useTextInStrip) {
    const textLogo = await createLogoFromText(stripColorHex, stripText);
    if (textLogo?.logoPng2x?.length) {
      return { buffer: textLogo.logoPng2x, contentType: "image/png" };
    }
  }

  if (business.logo_base64) {
    const base64Data = String(business.logo_base64).replace(/^data:image\/\w+;base64,/, "").trim();
    const logoBuf = Buffer.from(base64Data, "base64");
    if (logoBuf.length > 0) {
      const resized = await resizeLogoForPass(logoBuf);
      if (resized?.logoPng2x?.length) {
        return { buffer: resized.logoPng2x, contentType: "image/png" };
      }
      const textFallback = await createLogoFromText(stripColorHex, organizationName);
      if (textFallback?.logoPng2x?.length) {
        return { buffer: textFallback.logoPng2x, contentType: "image/png" };
      }
    }
  }

  const fileLogo = getBusinessLogoFileForPublic(business.id);
  if (fileLogo?.buffer?.length) {
    const resized = await resizeLogoForPass(fileLogo.buffer);
    if (resized?.logoPng2x?.length) {
      return { buffer: resized.logoPng2x, contentType: "image/png" };
    }
    return { buffer: fileLogo.buffer, contentType: fileLogo.contentType };
  }

  const buffers = buildBuffers(business.id, {});
  const prebuilt = buffers["logo.png"];
  if (prebuilt?.length) {
    return { buffer: prebuilt, contentType: "image/png" };
  }

  if (!useTextInStrip) {
    const textLogo = await createLogoFromText(stripColorHex, organizationName);
    if (textLogo?.logoPng2x?.length) {
      return { buffer: textLogo.logoPng2x, contentType: "image/png" };
    }
  }

  return null;
}
