/**
 * Bottom sheet onboarding — overlay sur la landing, drawer depuis le bas.
 * Utilise le nom d'établissement du hero. Onboarding builder (logo, style, objectifs, etc.).
 */
import { API_BASE } from "../config.js";
import { initRouting } from "../router/index.js";
import { initBuilderOnboarding } from "./onboarding/builder-onboarding.js";
import { BUILDER_DRAFT_KEY, CARD_TEMPLATES } from "../constants/builder.js";

function templateIdFromOnboardingStyle(stylePreset) {
  if (stylePreset === "classic") return "classic";
  if (stylePreset === "premium") return "elegant";
  if (stylePreset === "colorful") return "fastfood-points";
  return "bold";
}

function templateIdToCategoryFormat(templateId) {
  if (!templateId) return { category: "fastfood", format: "tampons" };
  if (["classic", "bold", "elegant"].includes(templateId)) return { category: "classic", format: "points" };
  const match = String(templateId).match(/^(.+)-(points|tampons)$/);
  if (match) return { category: match[1], format: match[2] };
  return { category: "fastfood", format: "tampons" };
}

function getTemplateIdFromCategoryFormat(category, format) {
  if (category === "classic") return "classic";
  return `${category}-${format}`;
}

function computeSelectedTemplateId(stylePreset, rewardModel) {
  const preferredTemplateId = templateIdFromOnboardingStyle(stylePreset);
  if (CARD_TEMPLATES.some((t) => t.id === preferredTemplateId)) {
    const prefersStamps = rewardModel === "stamps";
    const current = templateIdToCategoryFormat(preferredTemplateId);
    if (prefersStamps && current.category !== "classic") {
      return getTemplateIdFromCategoryFormat(current.category, "tampons");
    }
    if (!prefersStamps && current.category !== "classic") {
      return getTemplateIdFromCategoryFormat(current.category, "points");
    }
    return preferredTemplateId;
  }
  return "fastfood-tampons";
}

let onboardingController = null;

export function openOnboardingSheet() {
  const sheet = document.getElementById("landing-onboarding-sheet");
  const onboardingMount = document.getElementById("landing-onboarding-sheet-onboarding");
  if (!sheet || !onboardingMount) return;

  const menuOverlay = document.getElementById("landing-menu-overlay");
  if (menuOverlay?.classList.contains("is-open")) {
    menuOverlay.classList.remove("is-open");
    menuOverlay.setAttribute("aria-hidden", "true");
    document.getElementById("landing-menu-toggle")?.setAttribute("aria-expanded", "false");
  }

  sheet.classList.add("is-open");
  sheet.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  const heroInput = document.getElementById("landing-etablissement");
  const heroPlaceId = document.getElementById("landing-place-id");
  const organizationName = heroInput?.value?.trim() || "votre établissement";
  const placeId = heroPlaceId?.value?.trim() || "";

  showOnboardingInSheet(organizationName, placeId);
}

export function closeOnboardingSheet() {
  const sheet = document.getElementById("landing-onboarding-sheet");
  if (!sheet) return;
  sheet.classList.remove("is-open");
  sheet.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  onboardingController = null;
}

function showOnboardingInSheet(organizationName, placeId) {
  const onboardingMount = document.getElementById("landing-onboarding-sheet-onboarding");
  if (!onboardingMount) return;

  onboardingMount.innerHTML = "";

  const titleEl = document.getElementById("landing-onboarding-sheet-title");
  const progressEl = document.getElementById("landing-onboarding-sheet-progress");
  const updateTitle = (q) => {
    if (!titleEl || !q) return;
    titleEl.style.opacity = "0";
    setTimeout(() => {
      titleEl.textContent = q;
      requestAnimationFrame(() => {
        titleEl.style.opacity = "1";
      });
    }, 150);
  };

  onboardingController = initBuilderOnboarding({
    mountEl: onboardingMount,
    progressEl: progressEl || undefined,
    initialState: { placeIdHint: placeId },
    organizationName: organizationName || "votre établissement",
    apiBase: API_BASE,
    placeIdHint: placeId,
    onStateChange: (s) => { if (s.currentQuestion) updateTitle(s.currentQuestion); },
    onLogoChange: () => {},
    onStyleChange: () => {},
    onRewardChange: () => {},
    onComplete(nextState) {
      const selectedTemplateId = computeSelectedTemplateId(
        nextState.stylePreset,
        nextState.rewardModel
      );
      try {
        let existing = {};
        const raw = localStorage.getItem(BUILDER_DRAFT_KEY);
        if (raw) try { existing = JSON.parse(raw); } catch (_) {}
        const payload = {
          selectedTemplateId,
          organizationName: organizationName || "",
          placeId: placeId || existing.placeId,
          onboarding: { ...nextState, completed: true },
          logoDataUrl: nextState.logoDataUrl || existing.logoDataUrl,
        };
        localStorage.setItem(BUILDER_DRAFT_KEY, JSON.stringify(payload));
      } catch (_) {}
      closeOnboardingSheet();
      history.pushState({}, "", "/checkout");
      initRouting();
    },
  });
}

export function initOnboardingSheet() {
  const sheet = document.getElementById("landing-onboarding-sheet");
  const backdrop = document.getElementById("landing-onboarding-sheet-backdrop");

  if (!sheet) return;

  function close() {
    closeOnboardingSheet();
  }

  backdrop?.addEventListener("click", close);

  const backBtn = document.getElementById("landing-onboarding-sheet-back");
  backBtn?.addEventListener("click", () => {
    const onboardingMount = document.getElementById("landing-onboarding-sheet-onboarding");
    if (onboardingController && onboardingMount) {
      const state = onboardingController.getState();
      if (state.currentStep > 0) {
        onboardingController.previousStep();
      } else {
        close();
      }
    } else {
      close();
    }
  });
}
