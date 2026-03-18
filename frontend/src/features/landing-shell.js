/**
 * Shell landing : formulaire hero, Google Places, menus drawer.
 * Appelé au chargement pour attacher les listeners (formulaire, menus, script Places).
 */
import { navigateToBuilder } from "../router/index.js";

function updateLandingCtaState() {
  const input = document.getElementById("landing-etablissement");
  const btn = document.getElementById("landing-hero-submit");
  if (input && btn) btn.disabled = !input.value?.trim();
}

function initPlacesAutocomplete() {
  if (typeof google === "undefined" || !google.maps?.places) return;
  const input = document.getElementById("landing-etablissement");
  if (!input || input.dataset.placesInit) return;
  try {
    const frBounds = new google.maps.LatLngBounds(
      new google.maps.LatLng(41.0, -5.5),
      new google.maps.LatLng(51.2, 9.6)
    );
    const autocomplete = new google.maps.places.Autocomplete(input, {
      types: ["establishment"],
      fields: ["name", "formatted_address", "place_id"],
      bounds: frBounds,
      strictBounds: false,
    });
    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (place.name) input.value = place.name;
      const hidden = document.getElementById("landing-place-id");
      if (hidden) hidden.value = place.place_id || "";
      const helper = document.getElementById("landing-hero-helper");
      if (helper) helper.classList.remove("is-visible");
    });
    input.dataset.placesInit = "1";
  } catch (_) {}
}

function initUnifiedMenu(toggleId, overlayId, closeId) {
  const toggle = document.getElementById(toggleId);
  const overlay = document.getElementById(overlayId);
  const closeBtn = document.getElementById(closeId);
  if (!toggle || !overlay) return;
  function close() {
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    toggle.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }
  function open() {
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    toggle.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  }
  toggle.addEventListener("click", () => {
    if (overlay.classList.contains("is-open")) close();
    else open();
  });
  closeBtn?.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelectorAll(".landing-menu-drawer-nav a").forEach((a) => {
    a.addEventListener("click", close);
  });
}

export function initLandingShell() {
  document.querySelectorAll(".landing-cta-try").forEach((link) => {
    link.addEventListener("click", (e) => {
      const form = document.getElementById("landing-hero-form");
      const input = document.getElementById("landing-etablissement");
      if (!form) return;
      e.preventDefault();
      form.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => input?.focus(), 300);
    });
  });

  const landingHeroForm = document.getElementById("landing-hero-form");
  if (landingHeroForm) {
    const landingEtablissementInput = document.getElementById("landing-etablissement");
    const landingPlaceIdInput = document.getElementById("landing-place-id");
    const landingHelperEl = document.getElementById("landing-hero-helper");
    function hideLandingHelper() {
      if (landingHelperEl) landingHelperEl.classList.remove("is-visible");
    }
    function showLandingHelper() {
      if (landingHelperEl) landingHelperEl.classList.add("is-visible");
    }
    if (landingEtablissementInput) {
      try {
        const params = new URLSearchParams(window.location.search);
        const presetName = params.get("etablissement");
        const presetPlaceId = params.get("place_id");
        if (presetName && !landingEtablissementInput.value) landingEtablissementInput.value = presetName;
        if (presetPlaceId && landingPlaceIdInput && !landingPlaceIdInput.value) landingPlaceIdInput.value = presetPlaceId;
      } catch (_) {}
      let helperDebounce = null;
      landingEtablissementInput.addEventListener("input", () => {
        updateLandingCtaState();
        const text = (landingEtablissementInput.value?.trim() || "");
        if (text.length === 0) {
          hideLandingHelper();
          if (helperDebounce) clearTimeout(helperDebounce);
          return;
        }
        if (helperDebounce) clearTimeout(helperDebounce);
        helperDebounce = setTimeout(() => {
          helperDebounce = null;
          const noPlaceSelected = !landingPlaceIdInput?.value?.trim();
          if (text.length >= 2 && noPlaceSelected) showLandingHelper();
        }, 700);
      });
      landingEtablissementInput.addEventListener("change", updateLandingCtaState);
      landingEtablissementInput.addEventListener("focus", hideLandingHelper);
      landingEtablissementInput.addEventListener("blur", () => {
        const hasText = (landingEtablissementInput.value?.trim() || "").length >= 2;
        const noPlaceSelected = !landingPlaceIdInput?.value?.trim();
        if (hasText && noPlaceSelected) showLandingHelper();
      });
    }
    updateLandingCtaState();
    landingHeroForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("landing-etablissement");
      const placeIdInput = document.getElementById("landing-place-id");
      const name = input?.value?.trim();
      const placeId = placeIdInput?.value?.trim();
      if (!name) return;
      let qs = "";
      if (name) qs += `?etablissement=${encodeURIComponent(name)}`;
      if (placeId) qs += (qs ? "&" : "?") + `place_id=${encodeURIComponent(placeId)}`;
      navigateToBuilder(qs);
    });
  }

  const landingMenuToggle = document.getElementById("landing-menu-toggle");
  const landingMenuOverlay = document.getElementById("landing-menu-overlay");
  const landingMenuClose = document.getElementById("landing-menu-close");
  if (landingMenuToggle && landingMenuOverlay) {
    function closeLandingMenu() {
      landingMenuOverlay.classList.remove("is-open");
      landingMenuOverlay.setAttribute("aria-hidden", "true");
      landingMenuToggle.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
    }
    function openLandingMenu() {
      landingMenuOverlay.classList.add("is-open");
      landingMenuOverlay.setAttribute("aria-hidden", "false");
      landingMenuToggle.setAttribute("aria-expanded", "true");
      document.body.style.overflow = "hidden";
    }
    landingMenuToggle.addEventListener("click", () => {
      if (landingMenuOverlay.classList.contains("is-open")) closeLandingMenu();
      else openLandingMenu();
    });
    landingMenuClose?.addEventListener("click", closeLandingMenu);
    landingMenuOverlay.addEventListener("click", (e) => {
      if (e.target === landingMenuOverlay) closeLandingMenu();
    });
    landingMenuOverlay.querySelectorAll(".landing-menu-drawer-nav a").forEach((a) => {
      a.addEventListener("click", closeLandingMenu);
    });
  }
  initUnifiedMenu("auth-menu-toggle", "auth-menu-overlay", "auth-menu-close");
  initUnifiedMenu("offers-menu-toggle", "offers-menu-overlay", "offers-menu-close");

  const googlePlacesApiKey = typeof import.meta.env !== "undefined" ? import.meta.env.VITE_GOOGLE_PLACES_API_KEY : "";
  if (googlePlacesApiKey) {
    window.__fidpassPlacesReady = () => initPlacesAutocomplete();
    window.__fidpassPlacesError = (err) => {
      console.warn("[Myfidpass] Google Places: chargement refusé. Vérifiez la clé, les APIs activées (Maps JavaScript API + Places API) et les restrictions.", err);
    };
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${googlePlacesApiKey}&libraries=places&callback=__fidpassPlacesReady`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      console.warn("[Myfidpass] Google Places: script non chargé. Vérifiez VITE_GOOGLE_PLACES_API_KEY et les restrictions de la clé.");
    };
    document.head.appendChild(script);
  }
}
