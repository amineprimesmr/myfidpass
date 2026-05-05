/** Paliers points : exemples fixes + lecture / écriture des champs du formulaire. */

export const POINT_TIER_COUNT = 5;

const KNOWN_SECTORS = ["fastfood", "beauty", "coiffure", "boulangerie", "boucherie", "cafe"];

let lastKnownBusinessSector = "";

export function setLastKnownBusinessSector(raw) {
  lastKnownBusinessSector = String(raw ?? "").trim().toLowerCase();
}

export function getLastKnownBusinessSector() {
  return lastKnownBusinessSector;
}

/**
 * @param {string} raw
 * @returns {string} clé connue ou ""
 */
export function normalizeBusinessSector(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (KNOWN_SECTORS.includes(s)) return s;
  const aliases = {
    "fast-food": "fastfood",
    "restaurant rapide": "fastfood",
    restaurant: "fastfood",
    burger: "fastfood",
    coiffeur: "coiffure",
    salon: "coiffure",
    patisserie: "boulangerie",
    boulanger: "boulangerie",
  };
  const mapped = aliases[s];
  return mapped && KNOWN_SECTORS.includes(mapped) ? mapped : "";
}

/** Exemples visibles dans l’espace pro (points + tampons) — indépendant du secteur. */
export const DEFAULT_REWARD_EXAMPLE_TIERS = [
  { points: 10, label: "Boisson offerte" },
  { points: 50, label: "Dessert offert" },
  { points: 100, label: "Cheese offert" },
  { points: 150, label: "Menu offert" },
  { points: 200, label: "Formule premium" },
];

const DEFAULT_STAMP_MID_LABEL = "Dessert offert";
const DEFAULT_STAMP_FINAL_LABEL = "Menu offert";

/**
 * @param {string} [_sector] conservé pour compatibilité d’appel ; ignoré.
 * @returns {{ points: number; label: string }[]}
 */
export function getDefaultPointTiersBySector(_sector) {
  return DEFAULT_REWARD_EXAMPLE_TIERS.map((t) => ({ points: t.points, label: t.label }));
}

/**
 * @param {string} [_sector] conservé pour compatibilité d’appel ; ignoré.
 * @returns {string}
 */
export function getDefaultStampMidLabelBySector(_sector) {
  return DEFAULT_STAMP_MID_LABEL;
}

/**
 * @param {string} [_sector] conservé pour compatibilité d’appel ; ignoré.
 * @returns {string}
 */
export function getDefaultStampFinalLabelBySector(_sector) {
  return DEFAULT_STAMP_FINAL_LABEL;
}

/**
 * Remplit les champs tampons (5e / 10e) avec les exemples fixes et réactive la récompense intermédiaire.
 * @param {Document} [doc]
 */
export function applyDefaultStampRewardFields(doc = document) {
  const skip = doc.getElementById("app-stamp-skip-mid");
  const mid = doc.getElementById("app-stamp-reward-mid-label");
  const fin = doc.getElementById("app-stamp-reward-label");
  if (skip) skip.checked = false;
  if (mid) mid.value = DEFAULT_STAMP_MID_LABEL;
  if (fin) fin.value = DEFAULT_STAMP_FINAL_LABEL;
}

/**
 * @param {unknown} tiers
 * @returns {{ points: number; label: string }[]}
 */
export function tiersFromApiPayload(tiers) {
  if (!tiers) return [];
  if (Array.isArray(tiers)) {
    const out = [];
    for (const t of tiers) {
      if (t && typeof t === "object" && "points" in t) {
        let pts = parseInt(String(t.points), 10);
        const label = String(t.label ?? "").trim();
        if (out.length === 0 && !Number.isNaN(pts) && pts < 10) pts = 10;
        if (!Number.isNaN(pts) && pts >= 0 && label) out.push({ points: pts, label });
      }
    }
    return out.sort((a, b) => a.points - b.points);
  }
  if (typeof tiers === "string" && tiers.trim()) {
    const lines = tiers.split("\n").map((s) => s.trim()).filter(Boolean);
    const out = [];
    for (const line of lines) {
      const colon = line.indexOf(":");
      if (colon < 0) continue;
      const pts = parseInt(line.slice(0, colon).trim(), 10);
      const label = line.slice(colon + 1).trim();
      if (!Number.isNaN(pts) && pts >= 0 && label) out.push({ points: pts, label });
    }
    return out.sort((a, b) => a.points - b.points);
  }
  return [];
}

/**
 * @param {Document} doc
 * @param {{ points?: number | string; label?: string }[]} tiers
 */
export function writePointTierInputs(doc, tiers) {
  const arr = Array.isArray(tiers) ? tiers.slice(0, POINT_TIER_COUNT) : [];
  while (arr.length < POINT_TIER_COUNT) arr.push({ points: "", label: "" });
  for (let i = 0; i < POINT_TIER_COUNT; i++) {
    const base = arr[i] || {};
    const t =
      i === 0
        ? { points: 10, label: base.label || DEFAULT_REWARD_EXAMPLE_TIERS[0].label }
        : base;
    const pi = doc.getElementById(`app-points-tier-${i}-points`);
    const li = doc.getElementById(`app-points-tier-${i}-label`);
    const p = t.points;
    if (pi) pi.value = p != null && p !== "" && !Number.isNaN(Number(p)) ? String(p) : "";
    if (li) li.value = t.label != null ? String(t.label) : "";
  }
}

/**
 * @param {Document} doc
 * @returns {{ points: number; label: string }[]}
 */
export function readPointTierInputs(doc = document) {
  const out = [];
  for (let i = 0; i < POINT_TIER_COUNT; i++) {
    const pi = doc.getElementById(`app-points-tier-${i}-points`);
    const li = doc.getElementById(`app-points-tier-${i}-label`);
    const rawPts = parseInt(pi?.value, 10);
    const pts = i === 0 ? 10 : rawPts;
    const label = li?.value?.trim() ?? "";
    if (!Number.isNaN(pts) && pts >= 0 && label) out.push({ points: pts, label });
  }
  return out.sort((a, b) => a.points - b.points);
}

/**
 * @param {Document} doc
 * @returns {boolean}
 */
export function arePointTierInputsEmpty(doc = document) {
  for (let i = 0; i < POINT_TIER_COUNT; i++) {
    if (doc.getElementById(`app-points-tier-${i}-label`)?.value?.trim()) return false;
  }
  return true;
}
