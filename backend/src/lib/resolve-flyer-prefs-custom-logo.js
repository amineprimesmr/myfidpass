/**
 * Logo importé dans l’éditeur flyer (`flyer_prefs_json.custom_logo_data_url`) — même visuel que sur le flyer,
 * distinct du bandeau Wallet servi par `/public/logo`.
 */

const MAX_DATA_URL_CHARS = 5 * 1024 * 1024;

/**
 * @param {string | null | undefined} flyerPrefsJson
 * @returns {{ buffer: Buffer, contentType: string } | null}
 */
export function parseFlyerPrefsCustomLogoDataUrl(flyerPrefsJson) {
  if (!flyerPrefsJson || !String(flyerPrefsJson).trim()) return null;
  let root;
  try {
    root = JSON.parse(flyerPrefsJson);
  } catch {
    return null;
  }
  if (!root || typeof root !== "object" || Array.isArray(root)) return null;
  const raw = root.custom_logo_data_url;
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_DATA_URL_CHARS) return null;
  if (!raw.startsWith("data:image/")) return null;
  const semi = raw.indexOf(";");
  const comma = raw.indexOf(",", semi + 1);
  /** `;base64,` → virgule au plus tôt à `semi + 7` (b…4 puis ,). */
  if (semi < 10 || comma < semi + 7) return null;
  const mime = raw.slice(5, semi).trim().toLowerCase();
  if (!["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(mime)) return null;
  if (!raw.slice(semi + 1, comma).toLowerCase().startsWith("base64")) return null;
  const b64 = raw.slice(comma + 1).replace(/\s/g, "");
  let buf;
  try {
    buf = Buffer.from(b64, "base64");
  } catch {
    return null;
  }
  if (!buf?.length || buf.length > MAX_DATA_URL_CHARS) return null;
  const contentType = mime === "image/jpg" ? "image/jpeg" : mime;
  return { buffer: buf, contentType };
}
