/**
 * Logo importé dans l’éditeur flyer (`flyer_prefs_json.custom_logo_data_url`) — même visuel que sur le flyer,
 * distinct du bandeau Wallet servi par `/public/logo`.
 */

const MAX_DATA_URL_CHARS = 5 * 1024 * 1024;

/**
 * @param {unknown} root
 * @returns {string | null}
 */
function pickCustomLogoDataUrlFromPrefsRoot(root) {
  if (!root || typeof root !== "object" || Array.isArray(root)) return null;
  const o = /** @type {Record<string, unknown>} */ (root);
  const direct = o.custom_logo_data_url ?? o.customLogoDataUrl;
  if (typeof direct === "string" && direct.startsWith("data:image/")) return direct;
  const st = o.state;
  if (st && typeof st === "object" && !Array.isArray(st)) {
    const s = /** @type {Record<string, unknown>} */ (st);
    const nested = s.custom_logo_data_url ?? s.customLogoDataUrl;
    if (typeof nested === "string" && nested.startsWith("data:image/")) return nested;
  }
  const fp = o.flyer_prefs;
  if (fp && typeof fp === "object" && !Array.isArray(fp)) {
    const f = /** @type {Record<string, unknown>} */ (fp);
    const w = f.custom_logo_data_url ?? f.customLogoDataUrl;
    if (typeof w === "string" && w.startsWith("data:image/")) return w;
  }
  return null;
}

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
  const raw = pickCustomLogoDataUrlFromPrefsRoot(root);
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

/**
 * @param {unknown} root
 * @returns {string | null}
 */
function pickCustomBgDataUrlFromPrefsRoot(root) {
  if (!root || typeof root !== "object" || Array.isArray(root)) return null;
  const o = /** @type {Record<string, unknown>} */ (root);
  const direct = o.custom_bg_data_url ?? o.customBgDataUrl;
  if (typeof direct === "string" && direct.startsWith("data:image/")) return direct;
  const fp = o.flyer_prefs;
  if (fp && typeof fp === "object" && !Array.isArray(fp)) {
    const f = /** @type {Record<string, unknown>} */ (fp);
    const w = f.custom_bg_data_url ?? f.customBgDataUrl;
    if (typeof w === "string" && w.startsWith("data:image/")) return w;
  }
  return null;
}

/**
 * Fond flyer enregistré (`flyer_prefs_json.custom_bg_data_url`) — même visuel que l’aperçu Flyer IA.
 */
export function parseFlyerPrefsCustomBgDataUrl(flyerPrefsJson) {
  if (!flyerPrefsJson || !String(flyerPrefsJson).trim()) return null;
  let root;
  try {
    root = JSON.parse(flyerPrefsJson);
  } catch {
    return null;
  }
  const raw = pickCustomBgDataUrlFromPrefsRoot(root);
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_DATA_URL_CHARS) return null;
  if (!raw.startsWith("data:image/")) return null;
  const semi = raw.indexOf(";");
  const comma = raw.indexOf(",", semi + 1);
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
