/**
 * Shell landing : formulaire hero, recherche d'établissement via notre backend, menus drawer.
 * Appelé au chargement pour attacher les listeners (formulaire, menus, recherche).
 */
import { setPendingEstablishment, API_BASE } from "../config.js";

function updateLandingCtaState() {
  const input = document.getElementById("landing-etablissement");
  const btn = document.getElementById("landing-hero-submit");
  if (input && btn) btn.disabled = !input.value?.trim();
}

function initBackendPlacesSearch() {
  const input = document.getElementById("landing-etablissement");
  const hiddenPlaceId = document.getElementById("landing-place-id");
  const helperEl = document.getElementById("landing-hero-helper");
  if (!input || input.dataset.placesInit) return;
  input.dataset.placesInit = "1";

  // Dropdown container
  const dropdown = document.createElement("div");
  dropdown.style.cssText = [
    "position:absolute",
    "z-index:9999",
    "background:#fff",
    "border:1px solid #e0e0e0",
    "border-radius:8px",
    "box-shadow:0 4px 24px rgba(0,0,0,.13)",
    "overflow:hidden",
    "display:none",
    "min-width:100%",
    "box-sizing:border-box",
  ].join(";");

  const wrap = input.closest(".landing-hero-input-wrap") || input.parentElement;
  wrap.style.position = "relative";
  wrap.appendChild(dropdown);

  let debounce = null;
  let currentQuery = "";

  function hideDropdown() {
    dropdown.style.display = "none";
    dropdown.innerHTML = "";
  }

  function selectPrediction(pred) {
    input.value = pred.main_text || pred.description;
    if (hiddenPlaceId) hiddenPlaceId.value = pred.place_id || "";
    if (helperEl) helperEl.classList.remove("is-visible");
    hideDropdown();
    updateLandingCtaState();
  }

  function renderPredictions(predictions) {
    dropdown.innerHTML = "";
    if (!predictions.length) {
      dropdown.style.display = "none";
      return;
    }
    predictions.forEach((pred, i) => {
      const item = document.createElement("div");
      item.style.cssText = "display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;border-bottom:1px solid #f2f2f2;";
      if (i === predictions.length - 1) item.style.borderBottom = "none";
      item.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9e9e9e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        <div style="min-width:0">
          <div style="font-size:14px;font-weight:600;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(pred.main_text || pred.description)}</div>
          ${pred.secondary_text ? `<div style="font-size:12px;color:#777;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(pred.secondary_text)}</div>` : ""}
        </div>`;
      item.addEventListener("mousedown", (e) => { e.preventDefault(); selectPrediction(pred); });
      item.addEventListener("mouseenter", () => { item.style.background = "#f7f7f7"; });
      item.addEventListener("mouseleave", () => { item.style.background = ""; });
      dropdown.appendChild(item);
    });
    // Attribution Google obligatoire
    const attr = document.createElement("div");
    attr.style.cssText = "padding:6px 14px;text-align:right;font-size:11px;color:#999;border-top:1px solid #f2f2f2;background:#fafafa;";
    attr.innerHTML = `powered by <img src="https://maps.gstatic.com/mapfiles/api-3/images/google_gray.png" alt="Google" height="10" style="vertical-align:middle;margin-left:2px">`;
    dropdown.appendChild(attr);
    dropdown.style.display = "block";
  }

  function escapeHtml(str) {
    return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  async function fetchPredictions(query) {
    try {
      const url = `${API_BASE}/api/places/autocomplete?input=${encodeURIComponent(query)}`;
      const r = await fetch(url);
      if (!r.ok) return [];
      const data = await r.json();
      return data.predictions || [];
    } catch (_) {
      return [];
    }
  }

  input.addEventListener("input", () => {
    const query = input.value.trim();
    if (hiddenPlaceId && hiddenPlaceId.value) hiddenPlaceId.value = "";
    updateLandingCtaState();
    if (debounce) clearTimeout(debounce);
    if (query.length < 2) { hideDropdown(); return; }
    currentQuery = query;
    debounce = setTimeout(async () => {
      if (input.value.trim() !== currentQuery) return;
      const predictions = await fetchPredictions(currentQuery);
      if (input.value.trim() === currentQuery) renderPredictions(predictions);
    }, 300);
  });

  input.addEventListener("focus", () => {
    if (dropdown.innerHTML && input.value.trim().length >= 2) dropdown.style.display = "block";
  });

  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) hideDropdown();
  });

  // Keyboard navigation
  input.addEventListener("keydown", (e) => {
    const items = [...dropdown.querySelectorAll("div[style*='cursor:pointer']")];
    if (!items.length) return;
    const active = dropdown.querySelector("[data-active]");
    const idx = active ? items.indexOf(active) : -1;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (active) active.removeAttribute("data-active"), active.style.background = "";
      const next = items[(idx + 1) % items.length];
      next.setAttribute("data-active", "1"); next.style.background = "#f7f7f7";
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (active) active.removeAttribute("data-active"), active.style.background = "";
      const prev = items[(idx - 1 + items.length) % items.length];
      prev.setAttribute("data-active", "1"); prev.style.background = "#f7f7f7";
    } else if (e.key === "Enter" && active) {
      e.preventDefault();
      active.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    } else if (e.key === "Escape") {
      hideDropdown();
    }
  });
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
      const establishmentName = landingEtablissementInput?.value?.trim() || "";
      const placeId = landingPlaceIdInput?.value?.trim() || "";
      if (!establishmentName) {
        landingEtablissementInput?.focus();
        showLandingHelper();
        return;
      }
      if (!placeId) {
        showLandingHelper();
        landingEtablissementInput?.focus();
        return;
      }
      setPendingEstablishment({
        establishment_name: establishmentName,
        google_place_id: placeId,
      });
      window.location.href = "/creer-ma-carte?redirect=/app";
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
    landingMenuOverlay.querySelectorAll(".landing-menu-drawer-nav a, .landing-menu-drawer-cta").forEach((a) => {
      a.addEventListener("click", closeLandingMenu);
    });
  }
  initUnifiedMenu("auth-menu-toggle", "auth-menu-overlay", "auth-menu-close");
  initUnifiedMenu("offers-menu-toggle", "offers-menu-overlay", "offers-menu-close");

  initBackendPlacesSearch();

}
