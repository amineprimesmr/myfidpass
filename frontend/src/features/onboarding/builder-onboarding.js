/**
 * Onboarding de personnalisation pour le builder (questions progressives).
 * Le module reste UI-only et délègue la persistance au parent.
 */

const TOTAL_STEPS = 5;

const STYLE_OPTIONS = [
  { id: "classic", label: "Classique", hint: "Sobre et lisible" },
  { id: "modern", label: "Moderne", hint: "Impact visuel fort" },
  { id: "premium", label: "Premium", hint: "Élégant et haut de gamme" },
  { id: "colorful", label: "Coloré", hint: "Dynamique et chaleureux" },
];

const REWARD_OPTIONS = [
  { id: "stamps", label: "10 achats = 1 offert", hint: "Simple à expliquer en caisse" },
  { id: "points", label: "Montant cumulé en points", hint: "Flexible et progressif" },
  { id: "discount", label: "Remise fixe", hint: "Ex. -10% après X passages" },
  { id: "later", label: "Je configurerai plus tard", hint: "Vous pourrez modifier ensuite" },
];

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value == null ? "" : String(value);
  return div.innerHTML;
}

function normalizeState(input = {}) {
  const publicInfo = input.publicInfo && typeof input.publicInfo === "object" ? input.publicInfo : {};
  return {
    currentStep: Number.isFinite(input.currentStep) ? Math.max(0, Math.min(TOTAL_STEPS - 1, input.currentStep)) : 0,
    completed: input.completed === true,
    logoDataUrl: typeof input.logoDataUrl === "string" ? input.logoDataUrl : "",
    stylePreset: typeof input.stylePreset === "string" ? input.stylePreset : "modern",
    rewardModel: typeof input.rewardModel === "string" ? input.rewardModel : "later",
    tagline: typeof input.tagline === "string" ? input.tagline : "",
    publicInfo: {
      phone: publicInfo.phone !== false,
      address: publicInfo.address !== false,
      social: publicInfo.social !== false,
    },
  };
}

function fileToResizedDataUrl(file, maxWidth = 512) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const rawDataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!rawDataUrl.startsWith("data:image/")) {
        resolve("");
        return;
      }
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h) {
          resolve(rawDataUrl);
          return;
        }
        const ratio = w > maxWidth ? maxWidth / w : 1;
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(w * ratio));
        canvas.height = Math.max(1, Math.round(h * ratio));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(rawDataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        try {
          resolve(canvas.toDataURL("image/jpeg", 0.88));
        } catch (_) {
          resolve(rawDataUrl);
        }
      };
      img.onerror = () => resolve(rawDataUrl);
      img.src = rawDataUrl;
    };
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

export function initBuilderOnboarding({
  mountEl,
  initialState,
  organizationName,
  onStateChange,
  onLogoChange,
  onStyleChange,
  onRewardChange,
  onComplete,
}) {
  if (!mountEl) return null;

  let state = normalizeState(initialState);

  function emitState() {
    if (typeof onStateChange === "function") onStateChange({ ...state });
  }

  function updateState(patch) {
    state = normalizeState({ ...state, ...patch });
    emitState();
    render();
  }

  function goToStep(nextStep) {
    updateState({ currentStep: Math.max(0, Math.min(TOTAL_STEPS - 1, nextStep)) });
  }

  function nextStep() {
    if (state.currentStep >= TOTAL_STEPS - 1) return;
    goToStep(state.currentStep + 1);
  }

  function previousStep() {
    if (state.currentStep <= 0) return;
    goToStep(state.currentStep - 1);
  }

  function renderStepContent() {
    if (state.currentStep === 0) {
      return `
        <h3 class="builder-onboarding-question">Votre établissement a-t-il un logo à importer maintenant ?</h3>
        <p class="builder-onboarding-help">Format conseillé : PNG ou JPG. Vous pourrez le changer à tout moment.</p>
        <div class="builder-onboarding-actions">
          <button type="button" class="builder-onboarding-btn" data-action="upload-logo">Importer mon logo</button>
          <button type="button" class="builder-onboarding-btn builder-onboarding-btn-ghost" data-action="skip-logo">Passer pour l’instant</button>
        </div>
        ${state.logoDataUrl ? `<div class="builder-onboarding-logo-preview"><img src="${escapeHtml(state.logoDataUrl)}" alt="Aperçu logo"></div>` : ""}
        <input type="file" id="builder-onboarding-logo-input" accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml" class="hidden" />
      `;
    }

    if (state.currentStep === 1) {
      const cards = STYLE_OPTIONS.map((opt) => `
        <button type="button" class="builder-onboarding-choice ${state.stylePreset === opt.id ? "is-selected" : ""}" data-style="${opt.id}">
          <span class="builder-onboarding-choice-title">${opt.label}</span>
          <span class="builder-onboarding-choice-hint">${opt.hint}</span>
        </button>
      `).join("");
      return `
        <h3 class="builder-onboarding-question">Quel style de carte vous ressemble le plus ?</h3>
        <p class="builder-onboarding-help">On applique un thème, ajustable ensuite automatiquement ou manuellement.</p>
        <div class="builder-onboarding-grid">${cards}</div>
      `;
    }

    if (state.currentStep === 2) {
      return `
        <h3 class="builder-onboarding-question">Quelles informations voulez-vous afficher publiquement ?</h3>
        <div class="builder-onboarding-toggles">
          <label><input type="checkbox" data-public="phone" ${state.publicInfo.phone ? "checked" : ""}> Téléphone</label>
          <label><input type="checkbox" data-public="address" ${state.publicInfo.address ? "checked" : ""}> Adresse</label>
          <label><input type="checkbox" data-public="social" ${state.publicInfo.social ? "checked" : ""}> Réseaux sociaux</label>
        </div>
        <label class="builder-onboarding-input-label" for="builder-onboarding-tagline">Slogan (optionnel)</label>
        <input id="builder-onboarding-tagline" class="builder-onboarding-input" type="text" maxlength="90" value="${escapeHtml(state.tagline)}" placeholder="Ex. La pause café qui récompense votre fidélité" />
      `;
    }

    if (state.currentStep === 3) {
      const cards = REWARD_OPTIONS.map((opt) => `
        <button type="button" class="builder-onboarding-choice ${state.rewardModel === opt.id ? "is-selected" : ""}" data-reward="${opt.id}">
          <span class="builder-onboarding-choice-title">${opt.label}</span>
          <span class="builder-onboarding-choice-hint">${opt.hint}</span>
        </button>
      `).join("");
      return `
        <h3 class="builder-onboarding-question">Quel type de récompense est le plus simple pour vous ?</h3>
        <div class="builder-onboarding-grid">${cards}</div>
      `;
    }

    const publicInfoSelected = [
      state.publicInfo.phone ? "Téléphone" : "",
      state.publicInfo.address ? "Adresse" : "",
      state.publicInfo.social ? "Réseaux sociaux" : "",
    ].filter(Boolean);
    return `
      <h3 class="builder-onboarding-question">Votre carte est prête pour ${escapeHtml(organizationName || "votre établissement")}</h3>
      <div class="builder-onboarding-recap">
        <p><strong>Logo :</strong> ${state.logoDataUrl ? "importé" : "non défini"}</p>
        <p><strong>Style :</strong> ${(STYLE_OPTIONS.find((x) => x.id === state.stylePreset) || STYLE_OPTIONS[0]).label}</p>
        <p><strong>Informations :</strong> ${publicInfoSelected.length ? publicInfoSelected.join(", ") : "Aucune info publique"}</p>
        <p><strong>Récompense :</strong> ${(REWARD_OPTIONS.find((x) => x.id === state.rewardModel) || REWARD_OPTIONS[3]).label}</p>
      </div>
      <p class="builder-onboarding-help">Vous pourrez ajuster ces choix juste après cette étape.</p>
    `;
  }

  function render() {
    mountEl.innerHTML = `
      <section class="builder-onboarding-card" aria-label="Personnalisation de la carte">
        <div class="builder-onboarding-progress">
          <span class="builder-onboarding-progress-label">Étape ${state.currentStep + 1}/${TOTAL_STEPS}</span>
          <div class="builder-onboarding-progress-bar"><span style="width:${((state.currentStep + 1) / TOTAL_STEPS) * 100}%"></span></div>
        </div>
        ${renderStepContent()}
        <div class="builder-onboarding-nav">
          <button type="button" class="builder-onboarding-btn builder-onboarding-btn-ghost" data-action="prev" ${state.currentStep === 0 ? "disabled" : ""}>Retour</button>
          <button type="button" class="builder-onboarding-btn" data-action="next">${state.currentStep === TOTAL_STEPS - 1 ? "Terminer la personnalisation" : "Continuer"}</button>
        </div>
      </section>
    `;

    mountEl.querySelector("[data-action='prev']")?.addEventListener("click", previousStep);
    mountEl.querySelector("[data-action='next']")?.addEventListener("click", () => {
      if (state.currentStep === TOTAL_STEPS - 1) {
        updateState({ completed: true });
        if (typeof onComplete === "function") onComplete({ ...state, completed: true });
        return;
      }
      nextStep();
    });

    mountEl.querySelector("[data-action='upload-logo']")?.addEventListener("click", () => {
      mountEl.querySelector("#builder-onboarding-logo-input")?.click();
    });
    mountEl.querySelector("[data-action='skip-logo']")?.addEventListener("click", nextStep);

    mountEl.querySelector("#builder-onboarding-logo-input")?.addEventListener("change", async (event) => {
      const file = event.target?.files?.[0];
      if (!file) return;
      const dataUrl = await fileToResizedDataUrl(file);
      if (!dataUrl) return;
      updateState({ logoDataUrl: dataUrl });
      if (typeof onLogoChange === "function") onLogoChange(dataUrl);
      nextStep();
    });

    mountEl.querySelectorAll("[data-style]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const stylePreset = btn.getAttribute("data-style") || "modern";
        updateState({ stylePreset });
        if (typeof onStyleChange === "function") onStyleChange(stylePreset);
      });
    });

    mountEl.querySelectorAll("input[data-public]").forEach((input) => {
      input.addEventListener("change", () => {
        const key = input.getAttribute("data-public");
        if (!key) return;
        updateState({
          publicInfo: {
            ...state.publicInfo,
            [key]: input.checked,
          },
        });
      });
    });

    mountEl.querySelector("#builder-onboarding-tagline")?.addEventListener("input", (event) => {
      updateState({ tagline: event.target?.value || "" });
    });

    mountEl.querySelectorAll("[data-reward]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const rewardModel = btn.getAttribute("data-reward") || "later";
        updateState({ rewardModel });
        if (typeof onRewardChange === "function") onRewardChange(rewardModel);
      });
    });
  }

  render();
  emitState();

  return {
    getState: () => ({ ...state }),
    setLogoDataUrl(nextLogoDataUrl) {
      if (!nextLogoDataUrl || nextLogoDataUrl === state.logoDataUrl) return;
      state = normalizeState({ ...state, logoDataUrl: nextLogoDataUrl });
      emitState();
      render();
    },
  };
}
