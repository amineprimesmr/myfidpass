/**
 * Vue Commerce mobile alignée sur l’app iOS : accueil « Préparez-vous à lancer » + écran Réglages.
 */

function isFlyerStepDone(data) {
  if (!data || typeof data !== "object") return false;
  return Boolean(
    data.flyer_prefs_updated_at ||
      data.flyerPrefsUpdatedAt ||
      data.flyer_custom_bg_url ||
      data.logo_url ||
      data.logoUrl,
  );
}

function isEngagementStepDone(er) {
  if (!er || typeof er !== "object") return false;
  const gr = er.google_review;
  if (gr && gr.enabled && String(gr.place_id || "").trim()) return true;
  for (const k of ["instagram_follow", "tiktok_follow", "facebook_follow"]) {
    const x = er[k];
    if (x && x.enabled && String(x.url || "").trim()) return true;
  }
  return false;
}

/**
 * @param {Record<string, unknown>} settingsData — réponse GET /dashboard/settings
 */
export function applyCommerceIosHomeState(settingsData) {
  const pill = document.getElementById("app-commerce-ios-progress-pill");
  const stepFlyer = document.getElementById("app-commerce-ios-step-flyer");
  const stepEng = document.getElementById("app-commerce-ios-step-engagement");
  const rowGoogle = document.getElementById("app-commerce-ios-social-google");
  const googleLabel = rowGoogle?.querySelector(".app-commerce-ios-social-cta");

  const flyerOk = isFlyerStepDone(settingsData);
  const er = settingsData?.engagement_rewards ?? settingsData?.engagementRewards ?? {};
  const engOk = isEngagementStepDone(er);
  const done = (flyerOk ? 1 : 0) + (engOk ? 1 : 0);

  if (pill) pill.textContent = `${done} sur 2 étapes terminées`;

  if (stepFlyer) {
    stepFlyer.classList.toggle("app-commerce-ios-step--done", flyerOk);
    stepFlyer.classList.toggle("app-commerce-ios-step--pending", !flyerOk);
    const t = stepFlyer.querySelector(".app-commerce-ios-step-title");
    const d = stepFlyer.querySelector(".app-commerce-ios-step-desc");
    if (t) t.textContent = flyerOk ? "Flyer enregistré" : "Flyer QR";
    if (d) {
      d.textContent = flyerOk
        ? "Appuyez pour voir ou modifier votre flyer."
        : "Créez votre flyer et téléchargez le QR pour votre vitrine.";
    }
  }

  if (stepEng) {
    stepEng.classList.toggle("app-commerce-ios-step--done", engOk);
    stepEng.classList.toggle("app-commerce-ios-step--pending", !engOk);
    const t = stepEng.querySelector(".app-commerce-ios-step-title");
    const d = stepEng.querySelector(".app-commerce-ios-step-desc");
    if (t) t.textContent = engOk ? "Avis & réseaux" : "Avis & réseaux";
    if (d) {
      d.textContent = engOk
        ? "Google, Instagram, TikTok… configurés."
        : "Fiche Google Maps, Instagram, TikTok, Facebook.";
    }
  }

  const gr = er.google_review;
  const googleConfigured = Boolean(gr && gr.enabled && String(gr.place_id || "").trim());
  if (googleLabel) googleLabel.textContent = googleConfigured ? "Modif." : "Configurer";
}

/**
 * @param {"home" | "reglages"} view
 */
export function setCommerceView(view) {
  const profil = document.getElementById("profil");
  if (!profil) return;
  const v = view === "reglages" ? "reglages" : "home";
  profil.setAttribute("data-commerce-view", v);
  const main = document.getElementById("app-commerce-topbar-main");
  const reg = document.getElementById("app-commerce-topbar-reglages");
  if (main && reg) {
    const isReg = v === "reglages";
    main.classList.toggle("hidden", isReg);
    reg.classList.toggle("hidden", !isReg);
    main.setAttribute("aria-hidden", isReg ? "true" : "false");
    reg.setAttribute("aria-hidden", isReg ? "false" : "true");
  }
  window.scrollTo(0, 0);
}

/** @type {boolean} */
let commerceIosShellWired = false;

/**
 * @param {{ showAppSection: (id: string) => void }} ctx
 */
export function wireCommerceIosShell(ctx) {
  if (commerceIosShellWired) return;
  commerceIosShellWired = true;
  const { showAppSection } = ctx;
  document.getElementById("app-commerce-reglages-back")?.addEventListener("click", () => {
    setCommerceView("home");
  });

  document.getElementById("app-commerce-ios-open-reglages")?.addEventListener("click", () => {
    setCommerceView("reglages");
  });

  window.addEventListener("app-section-change", (e) => {
    if (e.detail?.sectionId === "profil") setCommerceView("home");
  });

  document.getElementById("app-commerce-ios-step-flyer")?.addEventListener("click", () => {
    showAppSection("flyer-qr");
  });
  document.getElementById("app-commerce-ios-step-engagement")?.addEventListener("click", () => {
    showAppSection("engagement");
  });

  ["google", "instagram", "tiktok", "facebook"].forEach((id) => {
    document.getElementById(`app-commerce-ios-social-${id}`)?.addEventListener("click", () => {
      showAppSection("engagement");
    });
  });

  document.getElementById("app-commerce-ios-logout")?.addEventListener("click", () => {
    document.getElementById("app-mobile-logout")?.click();
  });
}
