/**
 * Page « Règles de la carte » : checklist de parcours commerçant (sans logique métier serveur).
 */

import { readPointTierInputs } from "./app-card-rules-point-tiers.js";

/**
 * @param {{
 *   isStamps: boolean;
 *   rewardLabelTrim: string;
 *   pointTierFilledCount: number;
 * }} s
 * @returns {{ id: string; ok: boolean; optional?: boolean }[]}
 */
export function deriveCardRulesChecklistSteps(s) {
  const steps = [];
  steps.push({ id: "type", ok: true });
  const earnOk = s.isStamps ? s.rewardLabelTrim.length > 0 : true;
  steps.push({ id: "earn", ok: earnOk });
  if (!s.isStamps) {
    const tierOk = s.pointTierFilledCount >= 1;
    steps.push({ id: "tiers", ok: tierOk, optional: true });
  }
  steps.push({ id: "run", ok: true, optional: true });
  return steps;
}

function readInputsFromRoot(root) {
  const isStamps = !!root.querySelector("#app-program-type-stamps:checked");
  const rewardLabelTrim = root.querySelector("#app-stamp-reward-label")?.value?.trim() ?? "";
  const pointTierFilledCount = readPointTierInputs(root.ownerDocument || document).length;
  return deriveCardRulesChecklistSteps({
    isStamps,
    rewardLabelTrim,
    pointTierFilledCount: isStamps ? 0 : pointTierFilledCount,
  });
}

function applyStepsToDom(root, steps) {
  const list = root.querySelector("#app-card-rules-checklist");
  if (!list) return;
  const known = new Set(steps.map((s) => s.id));
  list.querySelectorAll("[data-check-step]").forEach((li) => {
    const id = li.getAttribute("data-check-step");
    if (!id || !known.has(id)) {
      li.classList.add("hidden");
      return;
    }
    li.classList.remove("hidden");
    const step = steps.find((s) => s.id === id);
    if (!step) return;
    li.classList.toggle("is-step-ok", !!step.ok);
    li.classList.toggle("is-step-warn", !step.ok && !step.optional);
    li.classList.toggle("is-step-info", !!step.optional);
    const badge = li.querySelector(".app-card-rules-step-badge");
    if (badge) {
      if (step.optional) badge.textContent = "info";
      else badge.textContent = step.ok ? "ok" : "à faire";
    }
  });
  steps.forEach((step, i) => {
    const li = list.querySelector(`[data-check-step="${step.id}"]`);
    if (li) li.style.order = String(i);
  });
}

export function refreshCardRulesChecklist(root = document.getElementById("regles-carte")) {
  if (!root) return;
  applyStepsToDom(root, readInputsFromRoot(root));
}

export function initAppCardRulesGuide() {
  const root = document.getElementById("regles-carte");
  if (!root) return;
  const run = () => refreshCardRulesChecklist(root);
  root.addEventListener("input", run, true);
  root.addEventListener("change", run, true);
  window.addEventListener("app-section-change", (e) => {
    if (e.detail?.sectionId === "regles-carte") run();
  });
  run();
}
