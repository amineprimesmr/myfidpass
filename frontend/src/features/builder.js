/**
 * Page créateur de carte (templates, brouillon, panier). Dérogation temporaire : > 400 lignes, à découper. REFONTE-REGLES.md.
 */
import { CARD_TEMPLATES, BUILDER_DRAFT_KEY } from "../constants/builder.js";
import { API_BASE } from "../config.js";
import { setBuilderHeaderStep, initRouting, navigateToLanding } from "../router/index.js";
import { slugify } from "../utils/slugify.js";

async function geocodeAddress(address) {
  const q = String(address).trim();
  if (!q) return null;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "MyFidpass/1.0 (https://myfidpass.fr)" },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const first = data?.[0];
  if (!first || first.lat == null || first.lon == null) return null;
  const lat = parseFloat(first.lat);
  const lng = parseFloat(first.lon);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

const BUILD_CATEGORY_LABELS = {
  fastfood: "Fast food",
  cafe: "Café",
  boulangerie: "Boulangerie",
  boucherie: "Boucherie",
  coiffure: "Coiffure",
  beauty: "Beauté",
  classic: "Autre",
};

function templateIdToCategoryFormat(templateId) {
  if (!templateId) return { category: "fastfood", format: "tampons" };
  if (["classic", "bold", "elegant"].includes(templateId)) return { category: "classic", format: "points" };
  const match = templateId.match(/^(.+)-(points|tampons)$/);
  if (match) return { category: match[1], format: match[2] };
  return { category: "fastfood", format: "tampons" };
}

function getTemplateIdFromCategoryFormat(category, format) {
  if (category === "classic") return "classic";
  return `${category}-${format}`;
}

function initBuilderPage() {

  const btnSubmit = document.getElementById("builder-submit");
  const cartBadge = document.getElementById("builder-header-cart-badge");
  if (cartBadge) cartBadge.textContent = "1";

  const state = { selectedTemplateId: "fastfood-tampons", organizationName: "", logoDataUrl: "", brandColors: null };
  const headerSteps = document.querySelectorAll(".builder-header-step");

  setBuilderHeaderStep(2);

  const urlParams = new URLSearchParams(window.location.search);
  const etablissementFromUrl = urlParams.get("etablissement");

  headerSteps.forEach((btn) => {
    btn.addEventListener("click", () => {
      const n = parseInt(btn.getAttribute("data-step"), 10);
      if (n === 1) {
        history.pushState({}, "", "/");
        initRouting();
      } else if (n === 3) {
        history.pushState({}, "", "/checkout");
        initRouting();
      }
    });
  });

  function loadDraft() {
    try {
      const raw = localStorage.getItem(BUILDER_DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d.selectedTemplateId && CARD_TEMPLATES.some((t) => t.id === d.selectedTemplateId)) state.selectedTemplateId = d.selectedTemplateId;
        if (typeof d.organizationName === "string") state.organizationName = d.organizationName.trim();
        if (typeof d.logoDataUrl === "string" && d.logoDataUrl.startsWith("data:image/")) state.logoDataUrl = d.logoDataUrl;
        if (d.brandColors && typeof d.brandColors.header === "string" && d.brandColors.body && d.brandColors.label) state.brandColors = d.brandColors;
      }
    } catch (_) {}
  }

  function saveDraft(extra = {}) {
    try {
      let existing = {};
      const raw = localStorage.getItem(BUILDER_DRAFT_KEY);
      if (raw) try { existing = JSON.parse(raw); } catch (_) {}
      const payload = {
        selectedTemplateId: state.selectedTemplateId,
        organizationName: state.organizationName || ""
      };
      if (extra.logoDataUrl != null) payload.logoDataUrl = extra.logoDataUrl;
      else if (existing.logoDataUrl) payload.logoDataUrl = existing.logoDataUrl;
      if (extra.placeId != null) payload.placeId = extra.placeId;
      else if (existing.placeId) payload.placeId = existing.placeId;
      if (extra.brandColors != null) payload.brandColors = extra.brandColors;
      else if (existing.brandColors) payload.brandColors = existing.brandColors;
      localStorage.setItem(BUILDER_DRAFT_KEY, JSON.stringify(payload));
    } catch (_) {}
  }

  function updateBuilderPreviewOrgName(name) {
    const display = name && name.trim() ? name.trim() : "Votre commerce";
    document.querySelectorAll("#builder-wallet-slider .builder-wallet-card-header span").forEach((el) => { el.textContent = display; });
  }

  function ensureBuilderCardLogoWraps() {
    const headers = document.querySelectorAll("#builder-wallet-slider .builder-wallet-card-header");
    headers.forEach((header) => {
      if (header.querySelector(".builder-wallet-card-logo-wrap")) return;
      const wrap = document.createElement("div");
      wrap.className = "builder-wallet-card-logo-wrap";
      wrap.setAttribute("aria-hidden", "true");
      const img = document.createElement("img");
      img.className = "builder-wallet-card-logo";
      img.alt = "";
      wrap.appendChild(img);
      header.insertBefore(wrap, header.firstChild);
    });
  }

  function updateBuilderPreviewLogo(dataUrl) {
    ensureBuilderCardLogoWraps();
    const wraps = document.querySelectorAll("#builder-wallet-slider .builder-wallet-card-logo-wrap");
    const hasLogo = typeof dataUrl === "string" && dataUrl.startsWith("data:image/");
    wraps.forEach((wrap) => {
      const img = wrap.querySelector(".builder-wallet-card-logo");
      if (!img) return;
      if (hasLogo) {
        img.src = dataUrl;
        img.classList.remove("hidden");
        wrap.classList.remove("hidden");
      } else {
        img.removeAttribute("src");
        img.classList.add("hidden");
        wrap.classList.add("hidden");
      }
    });
    if (hasLogo) applyBrandColorsFromLogo(dataUrl);
    else clearBuilderBrandColors();
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        default: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return [h * 360, s, l];
  }
  function hslToRgb(h, s, l) {
    h /= 360;
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }
  function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }
  /** Rend une couleur fade/gris en couleur vive (même teinte). */
  function vividifyHex(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return hex;
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    const [h, s, l] = rgbToHsl(r, g, b);
    let newS = s, newL = l;
    if (s < 0.35) newS = Math.max(0.45, s * 1.8);
    if (l > 0.78) newL = 0.42;
    else if (l > 0.65) newL = 0.5;
    else if (l < 0.15) newL = 0.28;
    const [rr, gg, bb] = hslToRgb(h, Math.min(1, newS), newL);
    return "#" + [rr, gg, bb].map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0")).join("");
  }

  /** Extrait une couleur principale du logo (couleur la plus présente), pas un mélange. Évite gris et fades. */
  function extractDominantColors(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const size = 64;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          if (!ctx) { resolve(null); return; }
          ctx.drawImage(img, 0, 0, size, size);
          const data = ctx.getImageData(0, 0, size, size).data;
          const shift = 4;
          const bins = 1 << shift;
          const hist = {};
          for (let i = 0; i < data.length; i += 4) {
            const a = data[i + 3];
            if (a < 140) continue;
            const r = data[i] >> shift;
            const g = data[i + 1] >> shift;
            const b = data[i + 2] >> shift;
            const key = `${r},${g},${b}`;
            hist[key] = (hist[key] || 0) + 1;
          }
          const toHex = (rr, gg, bb) => "#" + [rr, gg, bb].map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0")).join("");
          const lum = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          const sat = (r, g, b) => {
            const R = r / 255, G = g / 255, B = b / 255;
            const max = Math.max(R, G, B), min = Math.min(R, G, B);
            return max === 0 ? 0 : (max - min) / max;
          };
          const entries = Object.entries(hist)
            .map(([key, count]) => {
              const [rq, gq, bq] = key.split(",").map(Number);
              const r = (rq + 0.5) * (256 / bins);
              const g = (gq + 0.5) * (256 / bins);
              const b = (bq + 0.5) * (256 / bins);
              return { key, count, r, g, b, L: lum(r, g, b), S: sat(r, g, b) };
            })
            .filter((e) => e.L <= 0.92 && e.L >= 0.06);
          entries.sort((a, b) => {
            const wantA = a.S >= 0.14 ? 1 : 0;
            const wantB = b.S >= 0.14 ? 1 : 0;
            if (wantB !== wantA) return wantB - wantA;
            if (a.S >= 0.14 && b.S >= 0.14) return b.count - a.count;
            return b.S - a.S || b.count - a.count;
          });
          const best = entries[0];
          if (!best) { resolve(null); return; }
          let header = toHex(Math.round(best.r), Math.round(best.g), Math.round(best.b));
          header = vividifyHex(header);
          const darken = (v, f) => Math.round(v * (1 - f));
          const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(header);
          const r = m ? parseInt(m[1], 16) : 0;
          const g = m ? parseInt(m[2], 16) : 0;
          const b = m ? parseInt(m[3], 16) : 0;
          const body = toHex(darken(r, 0.12), darken(g, 0.12), darken(b, 0.12));
          resolve({ header, body, label: header });
        } catch (_) {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  function luminanceFromHex(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return 0.5;
    const r = parseInt(m[1], 16) / 255;
    const g = parseInt(m[2], 16) / 255;
    const b = parseInt(m[3], 16) / 255;
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  function applyBuilderBrandColors(colors) {
    const el = document.getElementById("builder-wallet-slider");
    if (!colors || !el) return;
    el.classList.add("builder-wallet-slider-branded");
    const primary = colors.header;
    const cardBg = colors.body || primary;
    el.style.setProperty("--brand-header", cardBg);
    el.style.setProperty("--brand-body", cardBg);
    const isLight = luminanceFromHex(cardBg) > 0.5;
    el.style.setProperty("--brand-fg", isLight ? "#1a1a1a" : "#fff");
    el.style.setProperty("--brand-label", isLight ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.95)");
  }

  function clearBuilderBrandColors() {
    const el = document.getElementById("builder-wallet-slider");
    if (el) {
      el.classList.remove("builder-wallet-slider-branded");
      el.style.removeProperty("--brand-header");
      el.style.removeProperty("--brand-body");
      el.style.removeProperty("--brand-label");
      el.style.removeProperty("--brand-fg");
    }
  }

  function applyBrandColorsFromLogo(dataUrl) {
    extractDominantColors(dataUrl).then((colors) => {
      if (colors) {
        state.brandColors = colors;
        applyBuilderBrandColors(colors);
        saveDraft({ brandColors: colors });
      }
    });
  }

  const sliderEl = document.getElementById("builder-wallet-slider");
  const dotsContainer = document.getElementById("builder-phone-dots");
  const templateIds = CARD_TEMPLATES.map((t) => t.id);
  const categorySelect = document.getElementById("builder-category-select");
  const categoryDisplay = document.getElementById("builder-category-display");
  const formatPoints = document.getElementById("builder-format-points");
  const formatTampons = document.getElementById("builder-format-tampons");
  const formatHint = document.getElementById("builder-format-hint");

  function getTemplateIndex(templateId) {
    const i = templateIds.indexOf(templateId);
    return i >= 0 ? i : 0;
  }

  function setSliderPosition(index) {
    const idx = Math.max(0, Math.min(index, templateIds.length - 1));
    if (sliderEl) sliderEl.style.transform = `translateX(-${idx * 100}%)`;
    if (dotsContainer) {
      dotsContainer.querySelectorAll(".builder-phone-dot").forEach((dot, i) => {
        dot.classList.toggle("active", i === idx);
        dot.setAttribute("aria-current", i === idx ? "true" : null);
      });
    }
  }

  function applySelection() {
    const { category, format } = templateIdToCategoryFormat(state.selectedTemplateId);
    if (categorySelect) {
      categorySelect.value = category;
    }
    if (categoryDisplay) {
      categoryDisplay.textContent = BUILD_CATEGORY_LABELS[category] || category;
    }
    if (formatPoints) {
      formatPoints.setAttribute("aria-pressed", format === "points" ? "true" : "false");
      formatPoints.classList.toggle("builder-format-btn-active", format === "points");
    }
    if (formatTampons) {
      formatTampons.setAttribute("aria-pressed", format === "tampons" ? "true" : "false");
      formatTampons.classList.toggle("builder-format-btn-active", format === "tampons");
      formatTampons.disabled = category === "classic";
    }
    if (formatHint) {
      formatHint.classList.toggle("hidden", category !== "classic");
    }
    setSliderPosition(getTemplateIndex(state.selectedTemplateId));
    updateDemoQR(state.selectedTemplateId);
    saveDraft();
  }

  function setTemplateSelection(templateId) {
    state.selectedTemplateId = templateId;
    applySelection();
  }

  function initWalletCardQRCodes() {
    const base = API_BASE.replace(/\/$/, "");
    document.querySelectorAll("#builder-wallet-slider .builder-wallet-card").forEach((card) => {
      const templateId = card.getAttribute("data-template");
      const img = card.querySelector(".builder-wallet-card-qr-img");
      if (templateId && img) {
        const url = `${base}/api/passes/demo?template=${encodeURIComponent(templateId)}`;
        img.src = `https://api.qrserver.com/v1/create-qr-code/?size=128&data=${encodeURIComponent(url)}`;
      }
    });
  }
  initWalletCardQRCodes();

  function updateDemoQR(templateId) {
    const qrEl = document.getElementById("builder-demo-qr");
    const nameEl = document.getElementById("builder-demo-template-name");
    const tpl = CARD_TEMPLATES.find((t) => t.id === templateId);

    if (tpl && nameEl) nameEl.textContent = tpl.name;

    const base = API_BASE.replace(/\/$/, "");
    const url = `${base}/api/passes/demo?template=${encodeURIComponent(templateId)}`;
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`;
    if (qrEl) {
      qrEl.src = qrSrc;
      qrEl.alt = `QR code pour ajouter la carte ${tpl?.name ?? templateId} à Apple Wallet`;
    }
  }

  document.querySelector(".builder-back")?.addEventListener("click", (e) => {
    e.preventDefault();
    navigateToLanding();
  });

  loadDraft();
  const placeIdFromUrl = urlParams.get("place_id")?.trim();
  const hasLandingParams = (etablissementFromUrl && typeof etablissementFromUrl === "string") || placeIdFromUrl;

  function applyInitialState() {
    if (etablissementFromUrl && typeof etablissementFromUrl === "string") {
      state.organizationName = etablissementFromUrl.trim();
    }
    saveDraft();
    updateBuilderPreviewOrgName(state.organizationName || "Votre commerce");
    setTemplateSelection(state.selectedTemplateId);
    if (hasLandingParams) {
      updateBuilderPreviewLogo("");
      clearBuilderBrandColors();
    } else {
      updateBuilderPreviewLogo(state.logoDataUrl);
      if (state.brandColors) applyBuilderBrandColors(state.brandColors);
      else if (!state.logoDataUrl) clearBuilderBrandColors();
    }
  }

  applyInitialState();
  const builderStep1 = document.getElementById("builder-step-1-block");
  if (builderStep1) {
    builderStep1.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (hasLandingParams) {
    (async () => {
      let placeId = placeIdFromUrl;
      const name = (state.organizationName || etablissementFromUrl || "").trim();

      if (!placeId && name) {
        try {
          const findRes = await fetch(`${API_BASE.replace(/\/$/, "")}/api/find-place?name=${encodeURIComponent(name)}`, { cache: "no-store" });
          if (findRes.ok) {
            const findData = await findRes.json().catch(() => ({}));
            if (findData.place_id) {
              placeId = findData.place_id;
              if (findData.name) state.organizationName = findData.name;
              const newUrl = new URL(window.location.href);
              newUrl.searchParams.set("place_id", placeId);
              if (!newUrl.searchParams.has("etablissement") && name) newUrl.searchParams.set("etablissement", name);
              history.replaceState(null, "", newUrl.pathname + newUrl.search);
              saveDraft({ placeId });
              updateBuilderPreviewOrgName(state.organizationName || name);
            }
          }
        } catch (_) {}
      }

      try {
        const qs = new URLSearchParams();
        if (placeId) qs.set("place_id", placeId);
        qs.set("name", name);
        const res = await fetch(`${API_BASE.replace(/\/$/, "")}/api/place-category?${qs}`);
        const data = await res.json().catch(() => ({}));
        if (data.suggestedTemplateId && CARD_TEMPLATES.some((t) => t.id === data.suggestedTemplateId)) {
          state.selectedTemplateId = data.suggestedTemplateId;
          applyInitialState();
        }
      } catch (_) {}

      if (placeId) {
        try {
          const photoRes = await fetch(`${API_BASE.replace(/\/$/, "")}/api/place-photo?place_id=${encodeURIComponent(placeId)}`, { cache: "no-store" });
          if (photoRes.ok && photoRes.headers.get("content-type")?.startsWith("image/")) {
            const blob = await photoRes.blob();
            const dataUrl = await blobToResizedLogoDataUrl(blob, 512);
            if (dataUrl) {
              state.logoDataUrl = dataUrl;
              saveDraft({ logoDataUrl: dataUrl, placeId });
              updateBuilderPreviewLogo(dataUrl);
            }
          }
        } catch (_) {}
      }
    })();
  }

  function blobToResizedLogoDataUrl(blob, maxWidth) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h) { resolve(null); return; }
        const scale = maxWidth && w > maxWidth ? maxWidth / w : 1;
        const cw = Math.round(w * scale);
        const ch = Math.round(h * scale);
        const canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0, cw, ch);
        try {
          resolve(canvas.toDataURL("image/jpeg", 0.88));
        } catch (_) {
          resolve(null);
        }
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  if (categorySelect) {
    categorySelect.addEventListener("change", () => {
      const category = categorySelect.value;
      const format = category === "classic" ? "points" : templateIdToCategoryFormat(state.selectedTemplateId).format;
      state.selectedTemplateId = getTemplateIdFromCategoryFormat(category, format);
      setTemplateSelection(state.selectedTemplateId);
    });
  }

  [formatPoints, formatTampons].filter(Boolean).forEach((btn) => {
    btn.addEventListener("click", () => {
      const format = btn.dataset.format;
      const category = categorySelect?.value || templateIdToCategoryFormat(state.selectedTemplateId).category;
      if (category === "classic") return;
      state.selectedTemplateId = getTemplateIdFromCategoryFormat(category, format);
      setTemplateSelection(state.selectedTemplateId);
    });
  });

  /* Swipe / glissement sur le mockup iPhone (touch + souris) */
  const phoneMockup = document.getElementById("builder-phone-mockup");
  if (phoneMockup && sliderEl) {
    let startX = 0;
    let dragStarted = false;
    function handleStart(clientX) {
      startX = clientX;
      dragStarted = true;
    }
    function handleEnd(clientX) {
      if (!dragStarted) return;
      const diff = startX - clientX;
      const threshold = 40;
      const idx = getTemplateIndex(state.selectedTemplateId);
      if (diff > threshold && idx < CARD_TEMPLATES.length - 1) setTemplateSelection(CARD_TEMPLATES[idx + 1].id);
      else if (diff < -threshold && idx > 0) setTemplateSelection(CARD_TEMPLATES[idx - 1].id);
      dragStarted = false;
      startX = 0;
    }
    phoneMockup.addEventListener("touchstart", (e) => { handleStart(e.changedTouches?.[0]?.clientX ?? 0); }, { passive: true });
    phoneMockup.addEventListener("touchend", (e) => { handleEnd(e.changedTouches?.[0]?.clientX ?? 0); }, { passive: true });
    phoneMockup.addEventListener("mousedown", (e) => { handleStart(e.clientX); });
    window.addEventListener("mouseup", (e) => { handleEnd(e.clientX); });
  }

  const cartOverlay = document.getElementById("cart-overlay");
  const cartClose = document.getElementById("cart-close");
  const cartBackdrop = document.getElementById("cart-backdrop");
  const cartEditOffer = document.getElementById("cart-edit-offer");
  const cartContinue = document.getElementById("cart-continue");

  function closeCart() {
    if (cartOverlay) {
      cartOverlay.classList.remove("is-open");
      cartOverlay.classList.add("hidden");
      document.body.style.overflow = "";
    }
  }

  function goToCheckout() {
    history.pushState({}, "", "/checkout");
    initRouting();
  }

  btnSubmit?.addEventListener("click", goToCheckout);

  const stickyCta = document.getElementById("builder-sticky-cta");
  const stickyChange = document.getElementById("builder-sticky-change");
  const optionsWrap = document.getElementById("builder-options-wrap");

  stickyCta?.addEventListener("click", goToCheckout);
  stickyChange?.addEventListener("click", () => {
    optionsWrap?.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  cartClose?.addEventListener("click", closeCart);
  cartBackdrop?.addEventListener("click", closeCart);
  cartEditOffer?.addEventListener("click", (e) => {
    e.preventDefault();
    closeCart();
  });
  cartContinue?.addEventListener("click", () => {
    closeCart();
    window.location.replace("/checkout");
  });
}

export { initBuilderPage };
