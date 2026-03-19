/**
 * Onboarding de personnalisation pour le builder (questions progressives).
 * Le module reste UI-only et délègue la persistance au parent.
 */

const TOTAL_STEPS = 6;
const STEP_QUESTIONS = [
  "Avez-vous un logo ?",
  "Quel style de carte vous ressemble le plus ?",
  "Quels objectifs pour vos clients ?",
  "Configurez vos liens",
  "Quel type de récompense ?",
  "Votre carte est prête",
];
const STYLE_OPTIONS = [
  { id: "classic", label: "Classique", hint: "Sobre et lisible" },
  { id: "modern", label: "Moderne", hint: "Impact visuel fort" },
  { id: "premium", label: "Premium", hint: "Elegant et haut de gamme" },
  { id: "colorful", label: "Colore", hint: "Dynamique et chaleureux" },
];
const REWARD_OPTIONS = [
  { id: "stamps", label: "10 achats = 1 offert", hint: "Simple a expliquer en caisse" },
  { id: "points", label: "Montant cumule en points", hint: "Flexible et progressif" },
  { id: "discount", label: "Remise fixe", hint: "Ex. -10% apres X passages" },
  { id: "later", label: "Je configurerai plus tard", hint: "Vous pourrez modifier ensuite" },
];
const GOAL_OPTIONS = [
  { id: "google_review", label: "Obtenir plus d'avis Google", hint: "Visibilite locale et confiance", icon: "/assets/logos/google.png", kind: "place_id", inputLabel: "Place ID Google", placeholder: "Ex. ChIJ..." },
  { id: "instagram_follow", label: "Avoir plus de followers Instagram", hint: "Communaute et UGC", icon: "/assets/logos/instagram.png", kind: "url", inputLabel: "Lien Instagram", placeholder: "https://instagram.com/votrecompte" },
  { id: "tiktok_follow", label: "Avoir plus de followers TikTok", hint: "Portee et viralite", icon: "/assets/logos/tiktok.png", kind: "url", inputLabel: "Lien TikTok", placeholder: "https://www.tiktok.com/@" },
  { id: "facebook_follow", label: "Avoir plus de followers Facebook", hint: "Audience locale mature", icon: "/assets/logos/facebook.png", kind: "url", inputLabel: "Lien Facebook", placeholder: "https://facebook.com/votrepage" },
  { id: "twitter_follow", label: "Avoir plus de followers X (Twitter)", hint: "Audience en temps reel", iconText: "X", kind: "url", inputLabel: "Lien X (Twitter)", placeholder: "https://x.com/votrecompte" },
  { id: "trustpilot_review", label: "Collecter des avis Trustpilot", hint: "Confiance et preuve sociale", icon: "/assets/logos/trustpilot.png", kind: "url", inputLabel: "Lien Trustpilot", placeholder: "https://www.trustpilot.com/review/..." },
  { id: "tripadvisor_review", label: "Collecter des avis TripAdvisor", hint: "Visibilite tourisme et local", icon: "/assets/logos/tripadvisor.png", kind: "url", inputLabel: "Lien TripAdvisor", placeholder: "https://www.tripadvisor.fr/..." },
];

const SOCIAL_AUTOFILL_MAP = { instagram_follow: "instagram_url", tiktok_follow: "tiktok_url", facebook_follow: "facebook_url" };

function escapeHtml(value) { const div = document.createElement("div"); div.textContent = value == null ? "" : String(value); return div.innerHTML; }
function getGoalOption(goalId) { return GOAL_OPTIONS.find((x) => x.id === goalId) || null; }
function isValidUrl(value) { try { const u = new URL(String(value || "").trim()); return u.protocol === "http:" || u.protocol === "https:"; } catch (_) { return false; } }
function renderGoalIcon(goal) {
  if (goal.icon) return `<span class="builder-onboarding-goal-icon" aria-hidden="true"><img src="${goal.icon}" alt="" loading="lazy" width="24" height="24" /></span>`;
  return `<span class="builder-onboarding-goal-icon builder-onboarding-goal-icon-fallback" aria-hidden="true">${escapeHtml(goal.iconText || "?")}</span>`;
}
function normalizeGoalConfigs(selectedGoals, rawConfigs, placeIdHint) {
  const configs = {};
  selectedGoals.forEach((goalId) => {
    const raw = rawConfigs && rawConfigs[goalId] ? rawConfigs[goalId] : {};
    const defaultValue = goalId === "google_review" ? String(placeIdHint || "") : "";
    configs[goalId] = { value: typeof raw.value === "string" ? raw.value : defaultValue };
  });
  return configs;
}
function validateGoalConfigs(selectedGoals, goalConfigs) {
  const errors = {};
  selectedGoals.forEach((goalId) => {
    const opt = getGoalOption(goalId);
    if (!opt) return;
    const value = String(goalConfigs?.[goalId]?.value || "").trim();
    if (!value) { errors[goalId] = "Champ requis"; return; }
    if (opt.kind === "url" && !isValidUrl(value)) errors[goalId] = "Lien invalide (http/https)";
  });
  return errors;
}
function fileToResizedDataUrl(file, maxWidth = 512) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = typeof reader.result === "string" ? reader.result : "";
      if (!raw.startsWith("data:image/")) return resolve("");
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || img.width; const h = img.naturalHeight || img.height;
        if (!w || !h) return resolve(raw);
        const ratio = w > maxWidth ? maxWidth / w : 1;
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(w * ratio)); canvas.height = Math.max(1, Math.round(h * ratio));
        const ctx = canvas.getContext("2d"); if (!ctx) return resolve(raw);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        try { resolve(canvas.toDataURL("image/jpeg", 0.88)); } catch (_) { resolve(raw); }
      };
      img.onerror = () => resolve(raw); img.src = raw;
    };
    reader.onerror = () => resolve(""); reader.readAsDataURL(file);
  });
}
function normalizeState(input = {}, placeIdHint = "") {
  const goals = Array.isArray(input.engagementGoals) ? input.engagementGoals.filter(Boolean) : [];
  const goalConfigs = normalizeGoalConfigs(goals, input.goalConfigs, placeIdHint || input.placeIdHint || "");
  return {
    currentStep: Number.isFinite(input.currentStep) ? Math.max(0, Math.min(TOTAL_STEPS - 1, input.currentStep)) : 0,
    completed: input.completed === true,
    logoDataUrl: typeof input.logoDataUrl === "string" ? input.logoDataUrl : "",
    stylePreset: typeof input.stylePreset === "string" ? input.stylePreset : "modern",
    rewardModel: typeof input.rewardModel === "string" ? input.rewardModel : "later",
    engagementGoals: goals,
    goalsFreeText: typeof input.goalsFreeText === "string" ? input.goalsFreeText : "",
    goalConfigs,
    goalConfigErrors: typeof input.goalConfigErrors === "object" && input.goalConfigErrors ? input.goalConfigErrors : {},
  };
}

export function initBuilderOnboarding({ mountEl, progressEl, initialState, organizationName, apiBase, placeIdHint, onStateChange, onLogoChange, onStyleChange, onRewardChange, onComplete }) {
  if (!mountEl) return null;
  let currentPlaceIdHint = String(placeIdHint || "");
  let state = normalizeState(initialState, currentPlaceIdHint);
  let suggestUi = { loading: false, message: "", kind: "" };
  const emitState = () => {
    const currentQuestion = STEP_QUESTIONS[state.currentStep] || "";
    if (typeof onStateChange === "function") onStateChange({ ...state, placeIdHint: currentPlaceIdHint, currentQuestion });
  };
  function updateState(patch) { state = normalizeState({ ...state, ...patch }, currentPlaceIdHint); emitState(); render(); }
  const goToStep = (n) => updateState({ currentStep: Math.max(0, Math.min(TOTAL_STEPS - 1, n)), goalConfigErrors: {} });
  const nextStep = () => { if (state.currentStep < TOTAL_STEPS - 1) goToStep(state.currentStep + 1); };
  const previousStep = () => { if (state.currentStep > 0) goToStep(state.currentStep - 1); };

  async function runGoalAutoSuggest() {
    if (!apiBase || suggestUi.loading) return;
    const base = String(apiBase).replace(/\/$/, "");
    const name = String(organizationName || "").trim();
    const currentGooglePlaceId = String(state.goalConfigs.google_review?.value || currentPlaceIdHint || "").trim();
    if (!name && !currentGooglePlaceId) { suggestUi = { loading: false, message: "Ajoutez au moins un nom d'etablissement ou un Place ID.", kind: "error" }; render(); return; }
    suggestUi = { loading: true, message: "Recherche des liens en cours...", kind: "info" }; render();
    try {
      const qs = new URLSearchParams();
      if (currentGooglePlaceId) qs.set("place_id", currentGooglePlaceId);
      if (name) qs.set("name", name);
      const res = await fetch(`${base}/api/place-enrichment?${qs.toString()}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Auto-detection indisponible");
      const nextConfigs = { ...state.goalConfigs };
      let applied = 0;
      if (state.engagementGoals.includes("google_review") && data.place_id && !String(nextConfigs.google_review?.value || "").trim()) {
        nextConfigs.google_review = { value: String(data.place_id) }; currentPlaceIdHint = String(data.place_id); applied += 1;
      }
      Object.entries(SOCIAL_AUTOFILL_MAP).forEach(([goalId, key]) => {
        const suggested = data.socials?.[key];
        if (state.engagementGoals.includes(goalId) && suggested && !String(nextConfigs[goalId]?.value || "").trim()) {
          nextConfigs[goalId] = { value: String(suggested) }; applied += 1;
        }
      });
      updateState({ goalConfigs: nextConfigs });
      suggestUi = { loading: false, message: applied > 0 ? `${applied} champ${applied > 1 ? "s" : ""} pre-rempli${applied > 1 ? "s" : ""}. Verifiez puis continuez.` : "Aucune donnee detectee automatiquement. Renseignez manuellement.", kind: applied > 0 ? "success" : "info" };
      render();
    } catch (err) {
      suggestUi = { loading: false, message: err.message || "Detection impossible pour le moment.", kind: "error" };
      render();
    }
  }

  function renderGoalConfigStep() {
    if (!state.engagementGoals.length) return `<p class="builder-onboarding-help">Aucun objectif sélectionné. Continuez.</p>`;
    const rows = state.engagementGoals.map((goalId) => {
      const opt = getGoalOption(goalId); if (!opt) return "";
      const value = String(state.goalConfigs[goalId]?.value || "");
      const error = state.goalConfigErrors[goalId] ? `<p class="builder-onboarding-field-error">${state.goalConfigErrors[goalId]}</p>` : "";
      return `<div class="builder-onboarding-config-card"><div class="builder-onboarding-goal-main">${renderGoalIcon(opt)}<span class="builder-onboarding-choice-title">${opt.label}</span></div><label class="builder-onboarding-input-label" for="builder-goal-config-${goalId}">${opt.inputLabel}</label><input id="builder-goal-config-${goalId}" class="builder-onboarding-input" data-goal-config="${goalId}" type="text" value="${escapeHtml(value)}" placeholder="${escapeHtml(opt.placeholder || "")}" />${error}</div>`;
    }).join("");
    return `<p class="builder-onboarding-help">Pré-rempli si possible.</p><div class="builder-onboarding-actions"><button type="button" class="builder-onboarding-btn builder-onboarding-btn-ghost" data-action="autosuggest-goals" ${suggestUi.loading ? "disabled" : ""}>${suggestUi.loading ? "..." : "Détecter"}</button></div>${suggestUi.message ? `<p class="builder-onboarding-autosuggest-feedback ${suggestUi.kind || ""}">${escapeHtml(suggestUi.message)}</p>` : ""}<div class="builder-onboarding-grid builder-onboarding-config-grid">${rows}</div>`;
  }

  function renderStepContent() {
    if (state.currentStep === 0) {
      const logoBlock = state.logoDataUrl ? `<div class="builder-onboarding-logo-preview"><img src="${escapeHtml(state.logoDataUrl)}" alt="Apercu logo"></div>` : "";
      const actions = state.logoDataUrl
        ? ""
        : `<p class="builder-onboarding-upload-link"><button type="button" class="builder-onboarding-link" data-action="upload-logo">Importer un logo</button></p>`;
      return `<p class="builder-onboarding-help">PNG ou JPG. Modifiable à tout moment.</p>${actions}${logoBlock}<input type="file" id="builder-onboarding-logo-input" accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml" class="hidden" />`;
    }
    if (state.currentStep === 1) return `<p class="builder-onboarding-help">Thème ajustable ensuite.</p><div class="builder-onboarding-grid">${STYLE_OPTIONS.map((opt) => `<button type="button" class="builder-onboarding-choice ${state.stylePreset === opt.id ? "is-selected" : ""}" data-style="${opt.id}"><span class="builder-onboarding-choice-title">${opt.label}</span><span class="builder-onboarding-choice-hint">${opt.hint}</span></button>`).join("")}</div>`;
    if (state.currentStep === 2) return `<p class="builder-onboarding-help">Sélection multiple.</p><div class="builder-onboarding-selected-count">${state.engagementGoals.length > 0 ? `${state.engagementGoals.length} sélectionné${state.engagementGoals.length > 1 ? "s" : ""}` : "Aucun"}</div><div class="builder-onboarding-grid">${GOAL_OPTIONS.map((opt) => `<button type="button" class="builder-onboarding-choice builder-onboarding-goal-choice ${state.engagementGoals.includes(opt.id) ? "is-selected" : ""}" data-goal="${opt.id}"><span class="builder-onboarding-goal-main">${renderGoalIcon(opt)}<span class="builder-onboarding-choice-title">${opt.label}</span></span><span class="builder-onboarding-choice-hint">${opt.hint}</span></button>`).join("")}</div><label class="builder-onboarding-input-label" for="builder-onboarding-goals-free-text">Autre (optionnel)</label><input id="builder-onboarding-goals-free-text" class="builder-onboarding-input" type="text" maxlength="120" value="${escapeHtml(state.goalsFreeText)}" placeholder="Ex. Plus d'avis" />`;
    if (state.currentStep === 3) return renderGoalConfigStep();
    if (state.currentStep === 4) return `<div class="builder-onboarding-grid">${REWARD_OPTIONS.map((opt) => `<button type="button" class="builder-onboarding-choice ${state.rewardModel === opt.id ? "is-selected" : ""}" data-reward="${opt.id}"><span class="builder-onboarding-choice-title">${opt.label}</span><span class="builder-onboarding-choice-hint">${opt.hint}</span></button>`).join("")}</div>`;
    const selectedGoals = state.engagementGoals.map((id) => getGoalOption(id)?.label || "").filter(Boolean); if (state.goalsFreeText.trim()) selectedGoals.push(state.goalsFreeText.trim());
    const configuredGoals = state.engagementGoals.filter((goalId) => String(state.goalConfigs?.[goalId]?.value || "").trim()).length;
    return `<div class="builder-onboarding-recap"><p><strong>Logo :</strong> ${state.logoDataUrl ? "Oui" : "Non"}</p><p><strong>Style :</strong> ${(STYLE_OPTIONS.find((x) => x.id === state.stylePreset) || STYLE_OPTIONS[0]).label}</p><p><strong>Objectifs :</strong> ${selectedGoals.length ? selectedGoals.join(", ") : "Aucun"}</p><p><strong>Liens :</strong> ${configuredGoals}/${state.engagementGoals.length || 0}</p><p><strong>Récompense :</strong> ${(REWARD_OPTIONS.find((x) => x.id === state.rewardModel) || REWARD_OPTIONS[3]).label}</p></div><p class="builder-onboarding-help">Modifiable dans votre espace pro.</p>`;
  }

  function getNavButtonLabel() {
    if (state.currentStep === TOTAL_STEPS - 1) return "Terminer";
    if (state.currentStep === 0 && !state.logoDataUrl) return "Passer";
    return "Continuer";
  }
  function showPrevButton() {
    return state.currentStep > 0;
  }
  function render() {
    const progressHtml = `<div class="builder-onboarding-progress"><div class="builder-onboarding-progress-bar"><span style="width:${((state.currentStep + 1) / TOTAL_STEPS) * 100}%"></span></div></div>`;
    if (progressEl) {
      progressEl.innerHTML = progressHtml;
    }
    const content = renderStepContent();
    const prevBtn = showPrevButton() ? `<button type="button" class="builder-onboarding-btn builder-onboarding-btn-ghost" data-action="prev">Retour</button>` : "";
    const nextBtn = `<button type="button" class="builder-onboarding-btn" data-action="next">${getNavButtonLabel()}</button>`;
    const nav = `<div class="builder-onboarding-nav">${prevBtn}${nextBtn}</div>`;
    mountEl.innerHTML = `<section class="builder-onboarding-card" aria-label="Personnalisation de la carte">${progressEl ? "" : progressHtml}${content}${nav}</section>`;
    mountEl.querySelector("[data-action='prev']")?.addEventListener("click", previousStep);
    mountEl.querySelector("[data-action='next']")?.addEventListener("click", () => {
      if (state.currentStep === 3) {
        const errors = validateGoalConfigs(state.engagementGoals, state.goalConfigs);
        if (Object.keys(errors).length > 0) { updateState({ goalConfigErrors: errors }); return; }
      }
      if (state.currentStep === TOTAL_STEPS - 1) { updateState({ completed: true }); if (typeof onComplete === "function") onComplete({ ...state, completed: true, placeIdHint: currentPlaceIdHint }); return; }
      nextStep();
    });
    mountEl.querySelector("[data-action='upload-logo']")?.addEventListener("click", () => mountEl.querySelector("#builder-onboarding-logo-input")?.click());
    mountEl.querySelector("#builder-onboarding-logo-input")?.addEventListener("change", async (event) => { const file = event.target?.files?.[0]; if (!file) return; const dataUrl = await fileToResizedDataUrl(file); if (!dataUrl) return; updateState({ logoDataUrl: dataUrl }); if (typeof onLogoChange === "function") onLogoChange(dataUrl); nextStep(); });
    mountEl.querySelectorAll("[data-style]").forEach((btn) => btn.addEventListener("click", () => { const stylePreset = btn.getAttribute("data-style") || "modern"; updateState({ stylePreset }); if (typeof onStyleChange === "function") onStyleChange(stylePreset); }));
    mountEl.querySelectorAll("[data-goal]").forEach((btn) => btn.addEventListener("click", () => { const goalId = btn.getAttribute("data-goal"); if (!goalId) return; const already = state.engagementGoals.includes(goalId); const goals = already ? state.engagementGoals.filter((id) => id !== goalId) : [...state.engagementGoals, goalId]; updateState({ engagementGoals: goals, goalConfigs: normalizeGoalConfigs(goals, state.goalConfigs, currentPlaceIdHint), goalConfigErrors: {} }); }));
    mountEl.querySelector("#builder-onboarding-goals-free-text")?.addEventListener("input", (event) => updateState({ goalsFreeText: event.target?.value || "" }));
    mountEl.querySelector("[data-action='autosuggest-goals']")?.addEventListener("click", runGoalAutoSuggest);
    mountEl.querySelectorAll("[data-goal-config]").forEach((input) => input.addEventListener("input", () => { const goalId = input.getAttribute("data-goal-config"); if (!goalId) return; updateState({ goalConfigs: { ...state.goalConfigs, [goalId]: { value: input.value || "" } }, goalConfigErrors: { ...state.goalConfigErrors, [goalId]: "" } }); }));
    mountEl.querySelectorAll("[data-reward]").forEach((btn) => btn.addEventListener("click", () => { const rewardModel = btn.getAttribute("data-reward") || "later"; updateState({ rewardModel }); if (typeof onRewardChange === "function") onRewardChange(rewardModel); }));
  }

  render(); emitState();
  return {
    getState: () => ({ ...state, placeIdHint: currentPlaceIdHint }),
    setLogoDataUrl(nextLogoDataUrl) { if (!nextLogoDataUrl || nextLogoDataUrl === state.logoDataUrl) return; state = normalizeState({ ...state, logoDataUrl: nextLogoDataUrl }, currentPlaceIdHint); emitState(); render(); },
    setPlaceIdHint(nextPlaceIdHint) {
      const next = String(nextPlaceIdHint || "").trim();
      if (!next || next === currentPlaceIdHint) return;
      currentPlaceIdHint = next;
      if (state.engagementGoals.includes("google_review") && !String(state.goalConfigs.google_review?.value || "").trim()) {
        updateState({ goalConfigs: { ...state.goalConfigs, google_review: { value: next } } });
      } else {
        emitState();
      }
    },
  };
}
