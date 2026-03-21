/**
 * Indicateurs « fait / à faire » sur les blocs accordéon de Ma carte (style onboarding).
 */
import { readPointTierInputs } from "./app-card-rules-point-tiers.js";

const DEFAULT_BG = "#1e3a8a";
const DEFAULT_FG = "#ffffff";
const DEFAULT_LBL = "#dbeafe";

function normHex(v) {
  const s = String(v || "").trim().toLowerCase();
  if (!s) return "";
  return s.startsWith("#") ? s : `#${s}`;
}

function isValidHex6(h) {
  return /^#[0-9a-f]{6}$/.test(h);
}

function isColorsGroupComplete(doc) {
  const bg = normHex(doc.getElementById("app-personnaliser-bg-hex")?.value || doc.getElementById("app-personnaliser-bg")?.value);
  const fg = normHex(doc.getElementById("app-personnaliser-fg-hex")?.value || doc.getElementById("app-personnaliser-fg")?.value);
  const lbl = normHex(doc.getElementById("app-personnaliser-label-hex")?.value || doc.getElementById("app-personnaliser-label")?.value);
  if (!isValidHex6(bg) || !isValidHex6(fg) || !isValidHex6(lbl)) return false;
  const acc = doc.getElementById("app-personnaliser-accordion");
  const serverBg = acc?.dataset?.serverCardBg === "1";
  const preview = doc.getElementById("app-personnaliser-card-bg-preview");
  const src = (preview?.getAttribute("src") || "").trim();
  const hasLocalBg = preview && !preview.classList.contains("hidden") && src.length > 1;
  const customized = bg !== DEFAULT_BG || fg !== DEFAULT_FG || lbl !== DEFAULT_LBL;
  return customized || serverBg || hasLocalBg;
}

function isLogoGroupComplete(doc) {
  const textMode = doc.getElementById("app-strip-display-text")?.checked;
  if (textMode) {
    const t = doc.getElementById("app-strip-text")?.value?.trim() ?? "";
    return t.length > 0;
  }
  const prev = doc.getElementById("app-personnaliser-logo-preview");
  const src = (prev?.getAttribute("src") || "").trim();
  return !!(prev && !prev.classList.contains("hidden") && src.length > 1);
}

function isLabelsGroupComplete(doc) {
  const root = doc.getElementById("regles-carte");
  const checked = root?.querySelector('input[name="app-program-type"]:checked');
  const isStamps = checked?.value === "stamps";
  const restants = doc.getElementById("app-personnaliser-label-restants")?.value?.trim() ?? "";
  if (isStamps) return restants.length > 0;
  return true;
}

function isCardRulesProgramConfigured(doc) {
  const root = doc.getElementById("regles-carte");
  if (!root) return false;
  const checked = root.querySelector('input[name="app-program-type"]:checked');
  if (!checked) return false;
  const isStamps = checked.value === "stamps";
  const rewardFinal = root.querySelector("#app-stamp-reward-label")?.value?.trim() ?? "";
  if (isStamps) return rewardFinal.length > 0;
  return readPointTierInputs(doc).length >= 1;
}

function isShareGroupComplete(doc) {
  const slug = doc.getElementById("app-share-slug-input")?.value?.trim() ?? "";
  return slug.length >= 2;
}

function applyStatus(toggle, complete) {
  const st = toggle.querySelector(".app-personnaliser-group-status");
  if (!st) return;
  st.classList.toggle("is-status-complete", complete);
  st.classList.toggle("is-status-pending", !complete);
  st.setAttribute("aria-label", complete ? "Étape complétée" : "À compléter");
}

/**
 * Met à jour les pastilles sur chaque en-tête d’accordéon Ma carte.
 * @param {Document} [doc]
 */
export function updatePersonnaliserGroupStatusIndicators(doc = document) {
  const accordion = doc.getElementById("app-personnaliser-accordion");
  if (!accordion) return;
  const map = {
    colors: isColorsGroupComplete(doc),
    logo: isLogoGroupComplete(doc),
    labels: isLabelsGroupComplete(doc),
    rules: isCardRulesProgramConfigured(doc),
    share: isShareGroupComplete(doc),
  };
  accordion.querySelectorAll("[data-personnaliser-step]").forEach((group) => {
    const key = group.getAttribute("data-personnaliser-step");
    if (!key || !(key in map)) return;
    const toggle = group.querySelector(".app-personnaliser-group-toggle");
    if (toggle) applyStatus(toggle, map[key]);
  });
}
