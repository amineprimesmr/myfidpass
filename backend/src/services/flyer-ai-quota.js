/**
 * Quota générations flyer IA : 3 / mois / commerce (UTC), avec mode illimité (équipe / env).
 */

export const FLYER_AI_FREE_PER_MONTH = 3;

/** @returns {string} ex. "2026-03" (UTC) */
export function currentMonthKeyUTC() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Slugs listés dans FLYER_AI_UNLIMITED_SLUGS (séparés par virgule ou espace) : générations illimitées.
 * @param {unknown} business
 */
export function isFlyerAiUnlimitedByEnvSlug(business) {
  const raw = process.env.FLYER_AI_UNLIMITED_SLUGS || "";
  const slug = String(business?.slug || "")
    .trim()
    .toLowerCase();
  if (!slug) return false;
  const set = new Set(
    raw
      .split(/[,\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  return set.has(slug);
}

/** @param {Record<string, unknown> | null | undefined} business */
export function isFlyerAiUnlimited(business) {
  if (!business) return false;
  if (Number(business.flyer_ai_unlimited) === 1) return true;
  return isFlyerAiUnlimitedByEnvSlug(business);
}
