/**
 * Parcours « configuration complète » dans la page Compte : commerce, carte, flyer, impression.
 * Les offres d’abonnement (1 €) restent masquées tant que les 4 étapes ne sont pas cochées.
 */

/** @param {string} slug */
export function merchantSetupFlyerDisplayedStorageKey(slug) {
  return `fidpass_merchant_setup_flyer_ok:${String(slug || "").trim()}`;
}

/**
 * @param {Record<string, unknown> | null | undefined} settings
 * @param {string} slug
 */
export function computeMerchantSetupState(settings, slug) {
  const s = settings && typeof settings === "object" ? settings : {};
  const org = String(s.organization_name ?? s.organizationName ?? "").trim();
  const addr = String(s.location_address ?? s.locationAddress ?? "").trim();
  const lat = s.location_lat ?? s.locationLat;
  const lng = s.location_lng ?? s.locationLng;
  const hasCoords = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
  const commerceDone = org.length >= 2 && (addr.length >= 5 || hasCoords);

  const cardDone = Boolean(
    s.logo_url ||
      s.logoUrl ||
      s.has_card_background ||
      s.hasCardBackground ||
      s.has_stamp_icon ||
      s.hasStampIcon,
  );

  const flyerDone = Boolean(
    s.flyer_prefs_updated_at ||
      s.flyerPrefsUpdatedAt ||
      s.flyer_custom_bg_url ||
      s.flyerCustomBgUrl ||
      s.has_flyer_prefs ||
      s.hasFlyerPrefs,
  );

  let printDone = false;
  try {
    printDone = localStorage.getItem(merchantSetupFlyerDisplayedStorageKey(slug)) === "1";
  } catch (_) {
    printDone = false;
  }

  const doneCount = [commerceDone, cardDone, flyerDone, printDone].filter(Boolean).length;
  return {
    commerceDone,
    cardDone,
    flyerDone,
    printDone,
    allDone: commerceDone && cardDone && flyerDone && printDone,
    doneCount,
    total: 4,
  };
}

/**
 * @param {{ allDone: boolean; commerceDone: boolean; cardDone: boolean; flyerDone: boolean; printDone: boolean }} prev
 * @param {{ commerceDone: boolean; cardDone: boolean; flyerDone: boolean; printDone: boolean; allDone: boolean }} state
 */
function animateStepIfNew(prev, state) {
  const root = document.getElementById("app-merchant-setup-checklist");
  if (state.allDone && !prev.allDone && root) {
    root.classList.remove("app-merchant-setup-checklist--celebrate");
    void root.offsetWidth;
    root.classList.add("app-merchant-setup-checklist--celebrate");
    root.addEventListener(
      "animationend",
      () => {
        root.classList.remove("app-merchant-setup-checklist--celebrate");
      },
      { once: true },
    );
  }
  const pairs = [
    ["commerce", state.commerceDone, prev.commerceDone],
    ["card", state.cardDone, prev.cardDone],
    ["flyer", state.flyerDone, prev.flyerDone],
    ["print", state.printDone, prev.printDone],
  ];
  for (const [id, done, wasDone] of pairs) {
    if (done && !wasDone) {
      const el = document.querySelector(`.app-merchant-setup-step[data-step="${id}"]`);
      el?.classList.remove("app-merchant-setup-step--pop");
      void el?.offsetWidth;
      el?.classList.add("app-merchant-setup-step--pop");
    }
  }
}

/** @type {{ allDone: boolean; commerceDone: boolean; cardDone: boolean; flyerDone: boolean; printDone: boolean } | null} */
let _prevMerchantSetup = null;

function syncSubscribePromoCard(state) {
  const card = document.getElementById("app-settings-subscribe-promo");
  if (!card) return;
  const d = typeof window !== "undefined" ? window.__fidpassLastAuthMeDetail : null;
  if (!d || typeof d !== "object") {
    card.classList.add("hidden");
    return;
  }
  const hasSub = !!(d.has_active_subscription ?? d.hasActiveSubscription);
  const user = d.user || {};
  const isAdmin = !!(user.is_admin ?? user.isAdmin);
  const show = state.allDone && !hasSub && !isAdmin;
  card.classList.toggle("hidden", !show);
  card.setAttribute("aria-hidden", show ? "false" : "true");
}

/**
 * @param {Record<string, unknown> | null | undefined} settings
 * @param {string} slug
 */
export function syncMerchantSetupChecklistFromSettings(settings, slug) {
  const root = document.getElementById("app-merchant-setup-checklist");
  if (!root) return;
  const state = computeMerchantSetupState(settings, slug);
  if (typeof window !== "undefined") {
    window.__fidpassMerchantSetupComplete = state.allDone;
  }

  const prev = _prevMerchantSetup || {
    allDone: false,
    commerceDone: false,
    cardDone: false,
    flyerDone: false,
    printDone: false,
  };
  animateStepIfNew(prev, state);
  _prevMerchantSetup = {
    allDone: state.allDone,
    commerceDone: state.commerceDone,
    cardDone: state.cardDone,
    flyerDone: state.flyerDone,
    printDone: state.printDone,
  };

  root.classList.toggle("app-merchant-setup-checklist--complete", state.allDone);
  const prog = document.getElementById("app-merchant-setup-progress-fill");
  if (prog) {
    prog.style.width = `${(state.doneCount / state.total) * 100}%`;
  }
  const counter = document.getElementById("app-merchant-setup-counter");
  if (counter) {
    counter.textContent = `${state.doneCount} / ${state.total} étapes`;
  }

  const steps = [
    ["commerce", state.commerceDone],
    ["card", state.cardDone],
    ["flyer", state.flyerDone],
    ["print", state.printDone],
  ];
  for (const [id, done] of steps) {
    const row = document.querySelector(`.app-merchant-setup-step[data-step="${id}"]`);
    if (!row) continue;
    row.classList.toggle("app-merchant-setup-step--done", !!done);
    row.setAttribute("aria-pressed", done ? "true" : "false");
  }

  syncSubscribePromoCard(state);

  try {
    window.dispatchEvent(new CustomEvent("fidpass-merchant-setup-updated", { detail: state }));
  } catch (_) {}
}

/**
 * @param {object} opts
 * @param {string} opts.slug
 */
export function initMerchantSetupChecklist({ slug }) {
  const ack = document.getElementById("app-merchant-setup-ack-print");
  if (ack && ack.dataset.fidpassBound !== "1") {
    ack.dataset.fidpassBound = "1";
    ack.addEventListener("click", () => {
      try {
        localStorage.setItem(merchantSetupFlyerDisplayedStorageKey(slug), "1");
      } catch (_) {}
      const settings = typeof window !== "undefined" ? window.__fidpassLastDashboardSettings : null;
      syncMerchantSetupChecklistFromSettings(settings, slug);
    });
  }

  function goToSection(hash, scrollSel) {
    window.location.hash = hash;
    requestAnimationFrame(() => {
      const el = scrollSel ? document.querySelector(scrollSel) : null;
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  document.querySelectorAll("[data-merchant-setup-go]").forEach((btn) => {
    if (btn.dataset.fidpassBound === "1") return;
    btn.dataset.fidpassBound = "1";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const target = btn.getAttribute("data-merchant-setup-go");
      const scroll = btn.getAttribute("data-merchant-setup-scroll");
      if (target === "personnaliser") goToSection("personnaliser", null);
      else if (target === "flyer-qr") goToSection("flyer-qr", null);
      else if (target === "profil-commerce") goToSection("profil", scroll || "#app-settings-establishment-card");
    });
  });
}
