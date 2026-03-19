/**
 * Onboarding de personnalisation pour le builder (questions progressives).
 * Le module reste UI-only et délègue la persistance au parent.
 */

const TOTAL_STEPS = 6;

function isValidEmailForAccount(email) {
  if (!email || typeof email !== "string") return false;
  const s = email.trim();
  return s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

const STEP_QUESTIONS = [
  "Avez-vous un logo ?",
  "Choisissez votre carte",
  "Quels objectifs pour vos clients ?",
  "Configurez vos liens",
  "Quel type de récompense ?",
  "Votre carte est prête",
];
const STYLE_OPTIONS = [
  { id: "points", label: "Système de points", hint: "Montant cumulé converti en points" },
  { id: "stamps", label: "Système de tampons", hint: "X achats = 1 offert" },
];
const REWARD_OPTIONS_POINTS = [
  { id: "points", label: "Paliers de points", hint: "Ex. 100 pts = 5€ de réduction" },
  { id: "discount", label: "Remise fixe", hint: "Ex. -10% après X passages" },
  { id: "later", label: "Je configurerai plus tard", hint: "Vous pourrez modifier ensuite" },
];
const REWARD_OPTIONS_STAMPS = [
  { id: "stamps", label: "10 achats = 1 offert", hint: "Le plus courant" },
  { id: "stamps_5", label: "5 achats = 1 offert", hint: "Récompense plus rapide" },
  { id: "later", label: "Je configurerai plus tard", hint: "Vous pourrez modifier ensuite" },
];
function getRewardOptions(stylePreset) {
  return stylePreset === "stamps" ? REWARD_OPTIONS_STAMPS : REWARD_OPTIONS_POINTS;
}
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
function renderStyleMockup(opt) {
  if (opt.id === "points") {
    return `<div class="builder-onboarding-style-mockup builder-wallet-card builder-wallet-card-bold" aria-hidden="true">
      <div class="builder-wallet-card-header"><span class="builder-onboarding-mockup-logo">Logo</span></div>
      <div class="builder-wallet-card-body">
        <div class="builder-wallet-card-pts-wrap"><span class="builder-wallet-card-pts-value">0</span><span class="builder-wallet-card-label">points</span></div>
        <div class="builder-onboarding-mockup-reward">Récompense</div>
      </div>
    </div>`;
  }
  const stampsRow = (filled) => Array(5).fill(0).map((_, i) => `<span class="stamp stamp-emoji ${i < filled ? "filled" : ""}" aria-hidden="true">☕</span>`).join("");
  return `<div class="builder-onboarding-style-mockup builder-wallet-card builder-wallet-card-fastfood-tampons" aria-hidden="true">
    <div class="builder-wallet-card-header"><span class="builder-onboarding-mockup-logo">Logo</span></div>
    <div class="builder-wallet-card-body">
      <div class="builder-wallet-card-stamps-wrap">
        <div class="builder-wallet-card-stamps-grid">
          <div class="builder-wallet-card-stamps-row">${stampsRow(3)}</div>
          <div class="builder-wallet-card-stamps-row">${stampsRow(1)}</div>
        </div>
      </div>
      <div class="builder-onboarding-mockup-restants">= 10</div>
    </div>
  </div>`;
}
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
  const stylePreset = typeof input.stylePreset === "string" ? input.stylePreset : "points";
  const rewardOpts = getRewardOptions(stylePreset);
  const rawReward = typeof input.rewardModel === "string" ? input.rewardModel : "later";
  const rewardModel = rewardOpts.some((o) => o.id === rawReward) ? rawReward : "later";
  return {
    currentStep: Number.isFinite(input.currentStep) ? Math.max(0, Math.min(TOTAL_STEPS - 1, input.currentStep)) : 0,
    completed: input.completed === true,
    logoDataUrl: typeof input.logoDataUrl === "string" ? input.logoDataUrl : "",
    stylePreset,
    rewardModel,
    engagementGoals: goals,
    goalsFreeText: typeof input.goalsFreeText === "string" ? input.goalsFreeText : "",
    goalConfigs,
    goalConfigErrors: typeof input.goalConfigErrors === "object" && input.goalConfigErrors ? input.goalConfigErrors : {},
  };
}

export function initBuilderOnboarding({ mountEl, progressEl, initialState, organizationName, apiBase, placeIdHint, onStateChange, onLogoChange, onStyleChange, onRewardChange, onComplete, getAuthToken, setAuthToken, onAccountCreated }) {
  if (!mountEl) return null;
  let currentPlaceIdHint = String(placeIdHint || "");
  let state = normalizeState(initialState, currentPlaceIdHint);
  let suggestUi = { loading: false, message: "", kind: "" };
  const emitState = () => {
    const currentQuestion = STEP_QUESTIONS[state.currentStep] || "";
    if (typeof onStateChange === "function") onStateChange({ ...state, placeIdHint: currentPlaceIdHint, currentQuestion });
  };
  let lastDirection = "next";
  function updateState(patch, opts = {}) {
    state = normalizeState({ ...state, ...patch }, currentPlaceIdHint);
    emitState();
    if (opts.skipRender) {
      updateChoiceSelectionOnly();
      return;
    }
    render();
  }
  function updateChoiceSelectionOnly() {
    if (state.currentStep === 1) {
      mountEl.querySelectorAll("[data-style]").forEach((btn) => btn.classList.toggle("is-selected", btn.getAttribute("data-style") === state.stylePreset));
    } else if (state.currentStep === 2) {
      mountEl.querySelectorAll("[data-goal]").forEach((btn) => btn.classList.toggle("is-selected", state.engagementGoals.includes(btn.getAttribute("data-goal"))));
    } else if (state.currentStep === 4) {
      mountEl.querySelectorAll("[data-reward]").forEach((btn) => btn.classList.toggle("is-selected", btn.getAttribute("data-reward") === state.rewardModel));
    }
  }
  const goToStep = (n) => updateState({ currentStep: Math.max(0, Math.min(TOTAL_STEPS - 1, n)), goalConfigErrors: {} });
  const nextStep = () => { lastDirection = "next"; if (state.currentStep < TOTAL_STEPS - 1) goToStep(state.currentStep + 1); };
  const previousStep = () => { lastDirection = "prev"; if (state.currentStep > 0) goToStep(state.currentStep - 1); };

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
    const rows = state.engagementGoals.map((goalId, i) => {
      const opt = getGoalOption(goalId); if (!opt) return "";
      const value = String(state.goalConfigs[goalId]?.value || "");
      const error = state.goalConfigErrors[goalId] ? `<p class="builder-onboarding-field-error">${state.goalConfigErrors[goalId]}</p>` : "";
      return `<div class="builder-onboarding-config-card" style="--stagger: ${i}"><div class="builder-onboarding-goal-main">${renderGoalIcon(opt)}<span class="builder-onboarding-choice-title">${opt.label}</span></div><label class="builder-onboarding-input-label" for="builder-goal-config-${goalId}">${opt.inputLabel}</label><input id="builder-goal-config-${goalId}" class="builder-onboarding-input" data-goal-config="${goalId}" type="text" value="${escapeHtml(value)}" placeholder="${escapeHtml(opt.placeholder || "")}" />${error}</div>`;
    }).join("");
    return `<p class="builder-onboarding-help">Pré-rempli si possible.</p><div class="builder-onboarding-actions"><button type="button" class="builder-onboarding-btn builder-onboarding-btn-ghost" data-action="autosuggest-goals" ${suggestUi.loading ? "disabled" : ""}>${suggestUi.loading ? "..." : "Détecter"}</button></div>${suggestUi.message ? `<p class="builder-onboarding-autosuggest-feedback ${suggestUi.kind || ""}">${escapeHtml(suggestUi.message)}</p>` : ""}<div class="builder-onboarding-grid builder-onboarding-config-grid builder-onboarding-grid-animate">${rows}</div>`;
  }

  function renderStepContent() {
    if (state.currentStep === 0) {
      const placeholderCls = state.logoDataUrl ? "hidden" : "";
      const previewCls = state.logoDataUrl ? "" : "hidden";
      const previewSrc = state.logoDataUrl ? escapeHtml(state.logoDataUrl) : "";
      return `<p class="builder-onboarding-help">PNG ou JPG. Modifiable à tout moment.</p>
<div class="builder-onboarding-logo-drop-zone" id="builder-onboarding-logo-drop-zone" role="button" tabindex="0" aria-label="Glisser-déposer une image, cliquer ou coller (Ctrl+V)">
  <input type="file" id="builder-onboarding-logo-input" accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml" class="builder-onboarding-file-hidden" aria-hidden="true" />
  <label for="builder-onboarding-logo-input" class="builder-onboarding-logo-label">
    <span class="builder-onboarding-logo-placeholder ${placeholderCls}">+ Glisser une image ou cliquer (PNG, JPG)</span>
    <img id="builder-onboarding-logo-preview" class="builder-onboarding-logo-preview-img ${previewCls}" src="${previewSrc}" alt="Aperçu logo" />
  </label>
</div>`;
    }
    if (state.currentStep === 1) return `<p class="builder-onboarding-help">Modifiable dans votre espace pro.</p><div class="builder-onboarding-style-grid builder-onboarding-grid-animate">${STYLE_OPTIONS.map((opt, i) => `<button type="button" class="builder-onboarding-choice builder-onboarding-style-choice ${state.stylePreset === opt.id ? "is-selected" : ""}" style="--stagger: ${i}" data-style="${opt.id}"><span class="builder-onboarding-style-mockup-wrap">${renderStyleMockup(opt)}</span><span class="builder-onboarding-choice-title">${opt.label}</span><span class="builder-onboarding-choice-hint">${opt.hint}</span></button>`).join("")}</div>`;
    if (state.currentStep === 2) return `<div class="builder-onboarding-grid builder-onboarding-grid-animate">${GOAL_OPTIONS.map((opt, i) => `<button type="button" class="builder-onboarding-choice builder-onboarding-goal-choice ${state.engagementGoals.includes(opt.id) ? "is-selected" : ""}" style="--stagger: ${i}" data-goal="${opt.id}"><span class="builder-onboarding-goal-main">${renderGoalIcon(opt)}<span class="builder-onboarding-choice-title">${opt.label}</span></span></button>`).join("")}</div>`;
    if (state.currentStep === 3) return renderGoalConfigStep();
    if (state.currentStep === 4) {
      const rewardOpts = getRewardOptions(state.stylePreset);
      return `<div class="builder-onboarding-grid builder-onboarding-grid-animate">${rewardOpts.map((opt, i) => `<button type="button" class="builder-onboarding-choice ${state.rewardModel === opt.id ? "is-selected" : ""}" style="--stagger: ${i}" data-reward="${opt.id}"><span class="builder-onboarding-choice-title">${opt.label}</span><span class="builder-onboarding-choice-hint">${opt.hint}</span></button>`).join("")}</div>`;
    }
    const selectedGoals = state.engagementGoals.map((id) => getGoalOption(id)?.label || "").filter(Boolean);
    const configuredGoals = state.engagementGoals.filter((goalId) => String(state.goalConfigs?.[goalId]?.value || "").trim()).length;
    const rewardOpts = getRewardOptions(state.stylePreset);
    const rewardLabel = (rewardOpts.find((x) => x.id === state.rewardModel) || rewardOpts[rewardOpts.length - 1]).label;
    const recapHtml = `<div class="builder-onboarding-recap"><p><strong>Logo :</strong> ${state.logoDataUrl ? "Oui" : "Non"}</p><p><strong>Style :</strong> ${(STYLE_OPTIONS.find((x) => x.id === state.stylePreset) || STYLE_OPTIONS[0]).label}</p><p><strong>Objectifs :</strong> ${selectedGoals.length ? selectedGoals.join(", ") : "Aucun"}</p><p><strong>Liens :</strong> ${configuredGoals}/${state.engagementGoals.length || 0}</p><p><strong>Récompense :</strong> ${rewardLabel}</p></div><p class="builder-onboarding-help">Modifiable dans votre espace pro.</p>`;
    const hasAccountForm = typeof onAccountCreated === "function" || (apiBase != null && typeof apiBase === "string");
    if (hasAccountForm) {
      const googleClientId = typeof import.meta.env?.VITE_GOOGLE_CLIENT_ID === "string" ? import.meta.env.VITE_GOOGLE_CLIENT_ID : "";
      const appleClientId = typeof import.meta.env?.VITE_APPLE_CLIENT_ID === "string" ? import.meta.env.VITE_APPLE_CLIENT_ID : "";
      const socialBlock = (googleClientId || appleClientId) ? `<p class="landing-onboarding-account-divider">Ou avec</p><div class="landing-onboarding-account-social builder-onboarding-account-social-inline">${googleClientId ? `<div id="builder-onboarding-google-btn" class="landing-onboarding-google-wrap"></div>` : ""}${appleClientId ? `<button type="button" id="builder-onboarding-apple-btn" class="landing-onboarding-btn-apple builder-onboarding-btn-apple-inline" aria-label="Continuer avec Apple"><span class="landing-onboarding-apple-icon" aria-hidden="true"></span>Apple</button>` : ""}</div>` : "";
      const alreadyLoggedIn = typeof getAuthToken === "function" && getAuthToken();
      const skipLink = alreadyLoggedIn ? `<p class="builder-onboarding-help" style="margin-top:0.75rem"><button type="button" class="builder-onboarding-link" data-action="account-continue">Déjà connecté ? Voir ma carte</button></p>` : "";
      const accountForm = `<div class="landing-onboarding-account-form builder-onboarding-account-inline"><p class="landing-onboarding-account-title">Créez votre compte</p><p id="builder-onboarding-account-error" class="landing-onboarding-account-error hidden" role="alert"></p>${socialBlock}<label for="builder-onboarding-email" class="landing-onboarding-account-label">Email</label><input type="email" id="builder-onboarding-email" class="landing-onboarding-account-input" placeholder="vous@exemple.fr" autocomplete="email" /><label for="builder-onboarding-password" class="landing-onboarding-account-label">Mot de passe (8 caractères min.)</label><input type="password" id="builder-onboarding-password" class="landing-onboarding-account-input" placeholder="••••••••" autocomplete="new-password" minlength="8" /><button type="button" id="builder-onboarding-register-btn" class="builder-onboarding-btn builder-onboarding-btn-ghost">Créer mon compte</button>${skipLink}</div>`;
      return recapHtml + accountForm;
    }
    return recapHtml;
  }

  function getNavButtonLabel() {
    if (state.currentStep === TOTAL_STEPS - 1) return "Terminer";
    if (state.currentStep === 0 && !state.logoDataUrl) return "Passer";
    return "Continuer";
  }
  function render() {
    const pct = ((state.currentStep + 1) / TOTAL_STEPS) * 100;
    const progressHtml = `<div class="builder-onboarding-progress" role="progressbar" aria-valuenow="${state.currentStep + 1}" aria-valuemin="1" aria-valuemax="${TOTAL_STEPS}" aria-label="Étape ${state.currentStep + 1} sur ${TOTAL_STEPS}"><div class="builder-onboarding-progress-bar"><span class="builder-onboarding-progress-fill" style="width:${pct}%"></span></div></div>`;
    if (progressEl) {
      progressEl.innerHTML = progressHtml;
    }
    const content = renderStepContent();
    const nextBtn = `<button type="button" class="builder-onboarding-btn" data-action="next">${getNavButtonLabel()}</button>`;
    const nav = `<div class="builder-onboarding-nav">${nextBtn}</div>`;
    const dir = lastDirection;
    mountEl.innerHTML = `<section class="builder-onboarding-card" aria-label="Personnalisation de la carte"><div class="builder-onboarding-content" data-direction="${dir}"><div class="builder-onboarding-content-inner">${progressEl ? "" : progressHtml}${content}</div></div>${nav}</section>`;
    const contentEl = mountEl.querySelector(".builder-onboarding-content");
    if (contentEl) contentEl.scrollTop = 0;
    mountEl.querySelector("[data-action='next']")?.addEventListener("click", () => {
      if (state.currentStep === 3) {
        const errors = validateGoalConfigs(state.engagementGoals, state.goalConfigs);
        if (Object.keys(errors).length > 0) { updateState({ goalConfigErrors: errors }); return; }
      }
      if (state.currentStep === TOTAL_STEPS - 1) { updateState({ completed: true }); if (typeof onComplete === "function") onComplete({ ...state, completed: true, placeIdHint: currentPlaceIdHint }); return; }
      nextStep();
    });
    const processLogoFile = async (file) => { if (!file || !file.type.startsWith("image/")) return; const dataUrl = await fileToResizedDataUrl(file); if (!dataUrl) return; updateState({ logoDataUrl: dataUrl }); if (typeof onLogoChange === "function") onLogoChange(dataUrl); nextStep(); };
    mountEl.querySelector("#builder-onboarding-logo-input")?.addEventListener("change", (e) => { const file = e.target?.files?.[0]; if (file) processLogoFile(file); });
    const logoDropZone = mountEl.querySelector("#builder-onboarding-logo-drop-zone");
    if (logoDropZone) {
      logoDropZone.addEventListener("dragover", (e) => { e.preventDefault(); e.stopPropagation(); logoDropZone.classList.add("builder-onboarding-logo-drop-active"); });
      logoDropZone.addEventListener("dragleave", (e) => { if (!logoDropZone.contains(e.relatedTarget)) logoDropZone.classList.remove("builder-onboarding-logo-drop-active"); });
      logoDropZone.addEventListener("drop", (e) => { e.preventDefault(); e.stopPropagation(); logoDropZone.classList.remove("builder-onboarding-logo-drop-active"); const file = e.dataTransfer?.files?.[0]; if (file) processLogoFile(file); });
      logoDropZone.addEventListener("paste", (e) => { const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith("image/")); const file = item?.getAsFile?.(); if (file) { e.preventDefault(); processLogoFile(file); } });
    }
    mountEl.querySelectorAll("[data-style]").forEach((btn) => btn.addEventListener("click", () => { const stylePreset = btn.getAttribute("data-style") || "points"; updateState({ stylePreset }, { skipRender: true }); if (typeof onStyleChange === "function") onStyleChange(stylePreset); }));
    mountEl.querySelectorAll("[data-goal]").forEach((btn) => btn.addEventListener("click", () => { const goalId = btn.getAttribute("data-goal"); if (!goalId) return; const already = state.engagementGoals.includes(goalId); const goals = already ? state.engagementGoals.filter((id) => id !== goalId) : [...state.engagementGoals, goalId]; updateState({ engagementGoals: goals, goalConfigs: normalizeGoalConfigs(goals, state.goalConfigs, currentPlaceIdHint), goalConfigErrors: {} }, { skipRender: true }); }));
    mountEl.querySelector("[data-action='autosuggest-goals']")?.addEventListener("click", runGoalAutoSuggest);
    mountEl.querySelectorAll("[data-goal-config]").forEach((input) => input.addEventListener("input", () => { const goalId = input.getAttribute("data-goal-config"); if (!goalId) return; updateState({ goalConfigs: { ...state.goalConfigs, [goalId]: { value: input.value || "" } }, goalConfigErrors: { ...state.goalConfigErrors, [goalId]: "" } }, { skipRender: true }); }));
    mountEl.querySelectorAll("[data-reward]").forEach((btn) => btn.addEventListener("click", () => { const rewardModel = btn.getAttribute("data-reward") || "later"; updateState({ rewardModel }, { skipRender: true }); if (typeof onRewardChange === "function") onRewardChange(rewardModel); }));

    if (state.currentStep === TOTAL_STEPS - 1 && (typeof onAccountCreated === "function" || (apiBase != null && typeof apiBase === "string"))) {
      bindAccountFormHandlers();
    }
  }

  function bindAccountFormHandlers() {
    mountEl.querySelector("[data-action='account-continue']")?.addEventListener("click", () => {
      if (typeof onComplete === "function") onComplete({ ...state, completed: true, placeIdHint: currentPlaceIdHint });
      if (typeof onAccountCreated === "function") onAccountCreated({ ...state, placeIdHint: currentPlaceIdHint });
    });
    const base = String(apiBase || "").replace(/\/$/, "");
    const errorEl = document.getElementById("builder-onboarding-account-error");
    const emailInput = document.getElementById("builder-onboarding-email");
    const passwordInput = document.getElementById("builder-onboarding-password");
    const registerBtn = document.getElementById("builder-onboarding-register-btn");
    const googleClientId = typeof import.meta.env?.VITE_GOOGLE_CLIENT_ID === "string" ? import.meta.env.VITE_GOOGLE_CLIENT_ID : "";
    const appleClientId = typeof import.meta.env?.VITE_APPLE_CLIENT_ID === "string" ? import.meta.env.VITE_APPLE_CLIENT_ID : "";

    function showError(msg) {
      if (errorEl) { errorEl.textContent = msg || ""; errorEl.classList.toggle("hidden", !msg); }
    }

    function onSuccess() {
      if (typeof onComplete === "function") onComplete({ ...state, completed: true, placeIdHint: currentPlaceIdHint });
      if (typeof onAccountCreated === "function") onAccountCreated({ ...state, placeIdHint: currentPlaceIdHint });
    }

    registerBtn?.addEventListener("click", async () => {
      const email = emailInput?.value?.trim() || "";
      const password = passwordInput?.value || "";
      if (!email) { showError("Saisissez votre adresse e-mail."); emailInput?.focus(); return; }
      if (!isValidEmailForAccount(email)) { showError("Adresse e-mail invalide."); emailInput?.focus(); return; }
      if (!password || password.length < 8) { showError("Le mot de passe doit faire au moins 8 caractères."); passwordInput?.focus(); return; }
      showError("");
      registerBtn.disabled = true;
      try {
        const res = await fetch(`${base}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { showError(data.error || "Erreur lors de la création du compte."); registerBtn.disabled = false; return; }
        if (data.token && typeof setAuthToken === "function") { setAuthToken(data.token); onSuccess(); } else { showError("Erreur inattendue."); registerBtn.disabled = false; }
      } catch (_) { showError("Erreur réseau. Réessayez."); registerBtn.disabled = false; }
    });

    if (googleClientId) {
      const googleWrap = document.getElementById("builder-onboarding-google-btn");
      if (googleWrap && !window.__fidpassBuilderGoogleInited) {
        window.__fidpassBuilderGoogleInited = true;
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.onload = () => {
          if (typeof google !== "undefined" && google.accounts?.id) {
            google.accounts.id.initialize({
              client_id: googleClientId,
              callback: (res) => {
                if (!res?.credential) return;
                showError("");
                fetch(`${base}/api/auth/google`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential: res.credential }) })
                  .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
                  .then(({ ok, data }) => {
                    if (ok && data?.token && typeof setAuthToken === "function") { setAuthToken(data.token); onSuccess(); } else { showError(data?.error || "Erreur lors de la connexion Google."); }
                  })
                  .catch(() => showError("Erreur réseau. Réessayez."));
              },
            });
            google.accounts.id.renderButton(googleWrap, { type: "standard", theme: "outline", size: "large", text: "continue_with", width: 260, locale: "fr" });
          }
        };
        document.head.appendChild(script);
      }
    }

    const appleBtn = document.getElementById("builder-onboarding-apple-btn");
    if (appleClientId && appleBtn) {
      appleBtn.addEventListener("click", () => {
        showError("");
        const redirectBase = base || (typeof window !== "undefined" && /myfidpass\.fr$/i.test(window.location.hostname) ? "https://api.myfidpass.fr" : window.location.origin);
        const redirectUri = redirectBase + (redirectBase.endsWith("/") ? "" : "/") + "api/auth/apple-redirect";
        window.location.href = "https://appleid.apple.com/auth/authorize?" + new URLSearchParams({
          client_id: appleClientId,
          redirect_uri: redirectUri,
          response_type: "id_token code",
          scope: "name email",
          response_mode: "form_post",
          state: "checkout",
          nonce: Math.random().toString(36).slice(2) + Date.now().toString(36),
        }).toString();
      });
    }
  }

  render(); emitState();
  return {
    getState: () => ({ ...state, placeIdHint: currentPlaceIdHint }),
    previousStep,
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
