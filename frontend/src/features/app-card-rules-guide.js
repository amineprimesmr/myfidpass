/**
 * Page « Règles de la carte » : checklist de parcours commerçant (sans logique métier serveur).
 */

/**
 * @param {{
 *   isStamps: boolean;
 *   rewardLabelTrim: string;
 *   pointsPerEuro: number;
 *   pointsPerVisit: number;
 *   isGameMode: boolean;
 *   pointsPerTicket: number;
 *   gameRewardsJsonTrim: string;
 * }} s
 * @returns {{ id: string; ok: boolean; optional?: boolean }[]}
 */
export function deriveCardRulesChecklistSteps(s) {
  const steps = [];
  steps.push({ id: "type", ok: true });
  const earnOk = s.isStamps
    ? s.rewardLabelTrim.length > 0
    : s.pointsPerEuro > 0 || s.pointsPerVisit > 0;
  steps.push({ id: "earn", ok: earnOk });
  if (!s.isStamps) {
    steps.push({ id: "mode", ok: true, optional: true });
    if (s.isGameMode) {
      const ticketOk = Number.isFinite(s.pointsPerTicket) && s.pointsPerTicket >= 1;
      let jsonOk = true;
      if (s.gameRewardsJsonTrim) {
        try {
          JSON.parse(s.gameRewardsJsonTrim);
        } catch {
          jsonOk = false;
        }
      }
      steps.push({ id: "game", ok: ticketOk && jsonOk });
    } else {
      steps.push({ id: "tiers", ok: true, optional: true });
    }
  }
  steps.push({ id: "run", ok: true, optional: true });
  return steps;
}

function readInputsFromRoot(root) {
  const isStamps = !!root.querySelector("#app-program-type-stamps:checked");
  const rewardLabelTrim = root.querySelector("#app-stamp-reward-label")?.value?.trim() ?? "";
  const pointsPerEuro = parseInt(root.querySelector("#app-points-per-euro")?.value, 10) || 0;
  const pointsPerVisit = parseInt(root.querySelector("#app-points-per-visit")?.value, 10) || 0;
  const isGameMode = !!root.querySelector("#app-loyalty-mode-game:checked");
  const pointsPerTicket = parseInt(root.querySelector("#app-points-per-ticket")?.value, 10) || 0;
  const gameRewardsJsonTrim = root.querySelector("#app-game-rewards-json")?.value?.trim() ?? "";
  return deriveCardRulesChecklistSteps({
    isStamps,
    rewardLabelTrim,
    pointsPerEuro,
    pointsPerVisit,
    isGameMode,
    pointsPerTicket,
    gameRewardsJsonTrim,
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
