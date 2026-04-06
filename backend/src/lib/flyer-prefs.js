/**
 * Validation des préférences flyer QR (sync SaaS ↔ API ↔ app).
 */
const MAX_JSON_CHARS = 7 * 1024 * 1024;

/**
 * @param {unknown} body
 * @param {string | null | undefined} existingFlyerPrefsJson — fusion si logo/bg absents du body
 * @returns {{ ok: true, value: { state: Record<string, unknown>, custom_logo_data_url: string | null, custom_bg_data_url: string | null } } | { ok: false, error: string }}
 */
export function normalizeFlyerPrefsPut(body, existingFlyerPrefsJson) {
  let existing = null;
  if (existingFlyerPrefsJson && String(existingFlyerPrefsJson).trim()) {
    try {
      existing = JSON.parse(existingFlyerPrefsJson);
    } catch (_) {
      existing = null;
    }
  }
  const ex = existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {};

  const b = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  /** @type {Record<string, unknown>} */
  const inner =
    b.flyer_prefs && typeof b.flyer_prefs === "object" && !Array.isArray(b.flyer_prefs)
      ? /** @type {Record<string, unknown>} */ (b.flyer_prefs)
      : b;

  const hasStateKey = Object.prototype.hasOwnProperty.call(inner, "state");
  const stateRaw = inner.state;
  if (hasStateKey && stateRaw !== undefined && stateRaw !== null && (typeof stateRaw !== "object" || Array.isArray(stateRaw))) {
    return { ok: false, error: "Le champ state doit être un objet JSON." };
  }
  const prevState =
    ex.state && typeof ex.state === "object" && !Array.isArray(ex.state) ? /** @type {Record<string, unknown>} */ (ex.state) : {};
  /** @type {Record<string, unknown>} */
  const state = hasStateKey
    ? stateRaw && typeof stateRaw === "object" && !Array.isArray(stateRaw)
      ? /** @type {Record<string, unknown>} */ (stateRaw)
      : {}
    : prevState;

  /** Bandeau réseaux sociaux retiré du produit — ne plus persister ces clés. */
  for (const k of ["social1", "socialUrl1", "social2", "socialUrl2", "social3", "socialUrl3"]) {
    delete state[k];
  }

  const hasLogoKey =
    Object.prototype.hasOwnProperty.call(inner, "custom_logo_data_url") ||
    Object.prototype.hasOwnProperty.call(inner, "customLogoDataUrl");
  const hasBgKey =
    Object.prototype.hasOwnProperty.call(inner, "custom_bg_data_url") ||
    Object.prototype.hasOwnProperty.call(inner, "customBgDataUrl");

  const logoRaw = inner.custom_logo_data_url ?? inner.customLogoDataUrl;
  const bgRaw = inner.custom_bg_data_url ?? inner.customBgDataUrl;

  const prevLogo = typeof ex.custom_logo_data_url === "string" ? ex.custom_logo_data_url : null;
  const prevBg = typeof ex.custom_bg_data_url === "string" ? ex.custom_bg_data_url : null;

  let custom_logo_data_url = prevLogo;
  if (hasLogoKey) {
    custom_logo_data_url =
      typeof logoRaw === "string" && logoRaw.startsWith("data:image/") && logoRaw.length < 5 * 1024 * 1024 ? logoRaw : null;
  }

  let custom_bg_data_url = prevBg;
  if (hasBgKey) {
    custom_bg_data_url =
      typeof bgRaw === "string" && bgRaw.startsWith("data:image/") && bgRaw.length < 6 * 1024 * 1024 ? bgRaw : null;
  }

  const value = { state, custom_logo_data_url, custom_bg_data_url };
  try {
    const s = JSON.stringify(value);
    if (s.length > MAX_JSON_CHARS) {
      return { ok: false, error: "Flyer trop volumineux (réduisez les images importées)." };
    }
  } catch (_) {
    return { ok: false, error: "Données flyer invalides." };
  }
  return { ok: true, value };
}

/**
 * Après génération flyer IA : aligne les teintes de parts roue sur la couleur principale / secondaire du formulaire.
 * Préserve logo, fond et le reste de `state`.
 *
 * @param {string | null | undefined} existingFlyerPrefsJson
 * @param {string} accentHex — #RRGGBB
 * @param {string | undefined} secondaryHex — #RRGGBB ou vide
 * @returns {string}
 */
export function mergeFlyerPrefsWheelColorsFromGeneration(existingFlyerPrefsJson, accentHex, secondaryHex) {
  let root = {};
  try {
    if (existingFlyerPrefsJson && String(existingFlyerPrefsJson).trim()) {
      root = JSON.parse(existingFlyerPrefsJson);
    }
  } catch (_) {
    root = {};
  }
  if (!root || typeof root !== "object" || Array.isArray(root)) root = {};
  const prevState =
    root.state && typeof root.state === "object" && !Array.isArray(root.state)
      ? /** @type {Record<string, unknown>} */ ({ ...root.state })
      : {};
  const odd =
    accentHex && /^#[0-9A-Fa-f]{6}$/.test(String(accentHex).trim())
      ? String(accentHex).trim()
      : String(prevState.wheelColorOdd || "#fbbf24");
  const even =
    secondaryHex && /^#[0-9A-Fa-f]{6}$/.test(String(secondaryHex).trim())
      ? String(secondaryHex).trim()
      : "#fef3c7";
  prevState.wheelColorOdd = odd;
  prevState.wheelColorEven = even;
  return JSON.stringify({
    state: prevState,
    custom_logo_data_url: typeof root.custom_logo_data_url === "string" ? root.custom_logo_data_url : null,
    custom_bg_data_url: typeof root.custom_bg_data_url === "string" ? root.custom_bg_data_url : null,
  });
}
