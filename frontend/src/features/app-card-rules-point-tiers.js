/** Paliers points simplifiés (5 lignes) + suggestions selon le secteur du commerce. */

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

/**
 * @param {string} sector
 * @returns {{ points: number; label: string }[]}
 */
export function getDefaultPointTiersBySector(sector) {
  const key = normalizeBusinessSector(sector) || "default";
  const presets = {
    fastfood: [
      { points: 20, label: "Boisson offerte" },
      { points: 50, label: "Menu enfant ou dessert offert" },
      { points: 100, label: "Burger / sandwich offert" },
      { points: 200, label: "Menu complet offert" },
      { points: 400, label: "Menu famille ou formule premium" },
    ],
    cafe: [
      { points: 30, label: "Café ou thé offert" },
      { points: 60, label: "Viennoiserie offerte" },
      { points: 120, label: "Petit-déjeuner offert" },
      { points: 200, label: "Boisson + pâtisserie offertes" },
      { points: 350, label: "Carte cadeau 10 €" },
    ],
    beauty: [
      { points: 40, label: "Soin express offert" },
      { points: 100, label: "Soin visage découverte" },
      { points: 180, label: "Modelage ou soin corps" },
      { points: 300, label: "Forfait beauté du mois" },
      { points: 500, label: "Journée bien-être" },
    ],
    coiffure: [
      { points: 50, label: "Shampoing soin offert" },
      { points: 120, label: "Brushing ou barbe offert" },
      { points: 200, label: "Coupe enfant offerte" },
      { points: 350, label: "Coupe + soin" },
      { points: 600, label: "Mise en beauté complète" },
    ],
    boulangerie: [
      { points: 25, label: "Viennoiserie au choix" },
      { points: 60, label: "Baguette + pâtisserie" },
      { points: 120, label: "Gâteau individuel offert" },
      { points: 200, label: "Plateau brunch" },
      { points: 400, label: "Commande sur mesure offerte" },
    ],
    boucherie: [
      { points: 40, label: "Saucisse ou chipolata offerte" },
      { points: 100, label: "Viande hachée ou panés offerts" },
      { points: 180, label: "Colis découverte" },
      { points: 300, label: "Grillade pour 2" },
      { points: 500, label: "Panier viande premium" },
    ],
    default: [
      { points: 50, label: "5 € de réduction" },
      { points: 100, label: "10 € de réduction" },
      { points: 200, label: "20 € de réduction" },
      { points: 350, label: "35 € de réduction" },
      { points: 500, label: "50 € de réduction" },
    ],
  };
  const list = presets[key] || presets.default;
  return list.map((t) => ({ points: t.points, label: t.label }));
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
        const pts = parseInt(String(t.points), 10);
        const label = String(t.label ?? "").trim();
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
    const t = arr[i] || {};
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
    const pts = parseInt(pi?.value, 10);
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

/** Tampons (5ᵉ / 10ᵉ) : libellés d’exemple selon secteur. */

export function getDefaultStampMidLabelBySector(sector) {
  const key = normalizeBusinessSector(sector) || "default";
  const m = {
    fastfood: "Boisson offerte",
    cafe: "Viennoiserie ou café offert",
    beauty: "Soin découverte offert",
    coiffure: "Shampoing offert",
    boulangerie: "Viennoiserie au choix",
    boucherie: "Saucisse ou chipolata offerte",
    default: "Petite récompense offerte",
  };
  return m[key] || m.default;
}

export function getDefaultStampFinalLabelBySector(sector) {
  const key = normalizeBusinessSector(sector) || "default";
  const m = {
    fastfood: "Menu ou burger offert",
    cafe: "Petit-déjeuner complet offert",
    beauty: "Soin visage offert",
    coiffure: "Coupe ou barbe offerte",
    boulangerie: "Gâteau ou tarte offert(e)",
    boucherie: "Colis viande offert",
    default: "Récompense principale offerte",
  };
  return m[key] || m.default;
}
