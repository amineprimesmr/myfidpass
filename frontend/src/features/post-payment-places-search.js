/**
 * Autocomplete commerce (Google Places via proxy backend) pour /merci.
 */
import { API_BASE, checkGooglePlaceAvailable } from "../config.js";

/**
 * @param {{ inputId: string, placeIdInputId: string, wrapId?: string, onSelected?: () => void, onConflict?: (msg: string) => void }} opts
 */
export function initPostPaymentPlacesSearch(opts) {
  const input = document.getElementById(opts.inputId);
  const hiddenPlaceId = document.getElementById(opts.placeIdInputId);
  const wrap = document.getElementById(opts.wrapId || "post-pay-commerce-wrap");
  const conflictEl = document.getElementById("post-pay-commerce-conflict");
  if (!input || !hiddenPlaceId || input.dataset.placesInit) return;
  input.dataset.placesInit = "1";

  const dropdown = document.createElement("div");
  dropdown.className = "post-pay-places-dropdown";
  dropdown.setAttribute("role", "listbox");
  wrap?.appendChild(dropdown);

  const spinner = document.createElement("span");
  spinner.className = "post-pay-places-spinner";
  spinner.setAttribute("aria-hidden", "true");
  wrap?.appendChild(spinner);

  let debounce = null;
  let lastPredictions = [];

  function hideDropdown() {
    dropdown.innerHTML = "";
    dropdown.classList.remove("is-open");
  }

  function setSpinner(on) {
    spinner.classList.toggle("is-visible", on);
  }

  function hideConflict() {
    if (conflictEl) {
      conflictEl.textContent = "";
      conflictEl.classList.add("hidden");
    }
  }

  function showConflict(message) {
    if (conflictEl) {
      conflictEl.textContent =
        message || "Ce commerce est déjà utilisé. Choisissez un autre établissement.";
      conflictEl.classList.remove("hidden");
    }
    opts.onConflict?.(message);
  }

  function positionDropdown() {
    if (!wrap) return;
    dropdown.style.width = `${wrap.clientWidth}px`;
  }

  async function selectPrediction(pred) {
    const name = String(pred.main_text || pred.description || "").trim();
    const placeId = String(pred.place_id || "").trim();
    if (!name || !placeId) return;
    hideConflict();
    setSpinner(true);
    try {
      const probe = await checkGooglePlaceAvailable(placeId);
      if (!probe.ok) {
        showConflict(probe.message);
        hiddenPlaceId.value = "";
        return;
      }
      input.value = name;
      hiddenPlaceId.value = placeId;
      hideDropdown();
      opts.onSelected?.();
    } finally {
      setSpinner(false);
    }
  }

  async function fetchPredictions(query) {
    const q = String(query || "").trim();
    if (q.length < 2) {
      hideDropdown();
      return;
    }
    setSpinner(true);
    try {
      const res = await fetch(`${API_BASE}/api/places/autocomplete?input=${encodeURIComponent(q)}`);
      const data = await res.json().catch(() => ({}));
      lastPredictions = Array.isArray(data.predictions) ? data.predictions : [];
      dropdown.innerHTML = "";
      if (!lastPredictions.length) {
        hideDropdown();
        return;
      }
      for (const pred of lastPredictions) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "post-pay-places-item";
        btn.setAttribute("role", "option");
        btn.innerHTML = `<span class="post-pay-places-item__main">${escapeHtml(pred.main_text || pred.description || "")}</span>${
          pred.secondary_text
            ? `<span class="post-pay-places-item__sub">${escapeHtml(pred.secondary_text)}</span>`
            : ""
        }`;
        btn.addEventListener("click", () => selectPrediction(pred));
        dropdown.appendChild(btn);
      }
      dropdown.classList.add("is-open");
      positionDropdown();
    } catch {
      hideDropdown();
    } finally {
      setSpinner(false);
    }
  }

  input.addEventListener("input", () => {
    hiddenPlaceId.value = "";
    hideConflict();
    clearTimeout(debounce);
    debounce = setTimeout(() => fetchPredictions(input.value), 300);
  });

  input.addEventListener("focus", () => {
    if (lastPredictions.length && input.value.trim().length >= 2) {
      dropdown.classList.add("is-open");
    }
  });

  document.addEventListener("click", (e) => {
    if (!wrap?.contains(e.target)) hideDropdown();
  });

  window.addEventListener("resize", positionDropdown);

  return {
    hasSelection() {
      return !!String(hiddenPlaceId.value || "").trim();
    },
    getSelection() {
      return {
        establishmentName: String(input.value || "").trim(),
        placeId: String(hiddenPlaceId.value || "").trim(),
      };
    },
    clear() {
      input.value = "";
      hiddenPlaceId.value = "";
      hideConflict();
      hideDropdown();
    },
  };
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
