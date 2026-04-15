/**
 * Topbar bureau (style Shopify) : recherche ⌘K / Ctrl+K, menus, sync commerce / compte.
 */

const SEARCH_INDEX = [
  { id: "dashboard", label: "Dashboard", hint: "Vue d’ensemble", chips: ["accueil", "tous"] },
  { id: "membres", label: "Membres", hint: "Clients & recherche", chips: ["clients", "tous"] },
  { id: "notifications", label: "Notifs", hint: "Campagnes & automatique", chips: ["notifs", "tous"] },
  { id: "personnaliser", label: "Ma carte", hint: "Design de la carte", chips: ["carte", "tous"] },
  { id: "carte-perimetre", label: "Emplacement", hint: "Carte & périmètre", chips: ["emplacement", "tous"] },
  { id: "flyer-qr", label: "Flyer QR", hint: "QR à imprimer", chips: ["marketing", "tous"] },
  { id: "fidelity-client", label: "Page fidélité", hint: "Page publique clients", chips: ["web", "tous"] },
  { id: "integration", label: "Intégration", hint: "API & outils", chips: ["tech", "tous"] },
  { id: "engagement", label: "Avis & Réseaux", hint: "Réseaux sociaux", chips: ["social", "tous"] },
  { id: "profil", label: "Profil", hint: "Établissement & compte", chips: ["compte", "tous"] },
];

const CHIP_DEFS = [
  { id: "tous", label: "Tout" },
  { id: "accueil", label: "Accueil" },
  { id: "clients", label: "Clients" },
  { id: "notifs", label: "Notifs" },
  { id: "carte", label: "Carte" },
  { id: "emplacement", label: "Emplacement" },
  { id: "marketing", label: "Marketing" },
  { id: "web", label: "Web client" },
  { id: "tech", label: "Tech" },
  { id: "social", label: "Social" },
  { id: "compte", label: "Compte" },
];

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function initialsFromName(name) {
  const t = String(name || "").trim();
  if (!t) return "MF";
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return t.slice(0, 2).toUpperCase();
}

function initialsFromEmail(email) {
  const e = String(email || "").trim();
  if (!e) return "?";
  const local = e.split("@")[0] || e;
  if (local.length >= 2) return local.slice(0, 2).toUpperCase();
  return local.toUpperCase() || "?";
}

function displayNameFromEmail(email) {
  const e = String(email || "").trim();
  if (!e) return "Compte";
  const local = e.split("@")[0] || "";
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return "Compte";
  return cleaned
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function initAppDesktopTopbar({ showAppSection }) {
  const root = document.getElementById("app-app");
  const topbar = document.getElementById("app-desktop-topbar");
  if (!root || !topbar || typeof showAppSection !== "function") return;

  const kbdMod = document.getElementById("app-topbar-kbd-mod");
  if (kbdMod) {
    const isMac = /Mac|iPhone|iPod|iPad/i.test(navigator.platform || navigator.userAgent || "");
    kbdMod.textContent = isMac ? "⌘" : "Ctrl";
  }

  function recalcAdminStrip() {
    const strip = document.getElementById("app-platform-admin-strip");
    const h = strip?.offsetHeight ?? 0;
    root.style.setProperty("--app-admin-strip-h", `${h}px`);
  }

  recalcAdminStrip();
  window.addEventListener("resize", () => window.requestAnimationFrame(recalcAdminStrip));
  new MutationObserver(() => window.requestAnimationFrame(recalcAdminStrip)).observe(root, { childList: true });

  const storeBtn = document.getElementById("app-topbar-store-btn");
  const storePanel = document.getElementById("app-topbar-store-panel");
  const alertsBtn = document.getElementById("app-topbar-alerts-btn");
  const alertsPanel = document.getElementById("app-topbar-alerts-panel");
  const searchOpen = document.getElementById("app-topbar-search-open");
  const searchRoot = document.getElementById("app-topbar-search-root");
  const searchBackdrop = document.getElementById("app-topbar-search-backdrop");
  const searchInput = document.getElementById("app-topbar-search-input");
  const searchChips = document.getElementById("app-topbar-search-chips");
  const searchResults = document.getElementById("app-topbar-search-results");
  const searchEmpty = document.getElementById("app-topbar-search-empty");
  const searchEmptyText = document.getElementById("app-topbar-search-empty-text");
  const logoutTop = document.getElementById("app-topbar-logout-btn");
  const storeAddLink = document.getElementById("app-topbar-store-add-link");

  let activeChip = "tous";
  let highlightIdx = 0;
  let filteredItems = [];

  function closeAllDropdowns() {
    [storeBtn, alertsBtn].forEach((b) => b?.setAttribute("aria-expanded", "false"));
    [storePanel, alertsPanel].forEach((p) => {
      if (p) {
        p.hidden = true;
        p.classList.remove("is-open");
      }
    });
  }

  function toggleDropdown(btn, panel) {
    if (!btn || !panel) return;
    const open = btn.getAttribute("aria-expanded") === "true";
    closeAllDropdowns();
    if (!open) {
      btn.setAttribute("aria-expanded", "true");
      panel.hidden = false;
      window.requestAnimationFrame(() => panel.classList.add("is-open"));
    }
  }

  storeBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = storeBtn.getAttribute("aria-expanded") === "true";
    if (open) closeAllDropdowns();
    else toggleDropdown(storeBtn, storePanel);
  });

  alertsBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = alertsBtn.getAttribute("aria-expanded") === "true";
    if (open) closeAllDropdowns();
    else toggleDropdown(alertsBtn, alertsPanel);
  });

  document.addEventListener("click", (e) => {
    if (e.target.closest(".app-desktop-topbar__dropdown-wrap")) return;
    closeAllDropdowns();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeAllDropdowns();
      closeSearch();
    }
  });

  storeAddLink?.addEventListener("click", () => {
    closeAllDropdowns();
    showAppSection("profil");
  });

  logoutTop?.addEventListener("click", () => {
    closeAllDropdowns();
    document.getElementById("app-logout")?.click();
  });

  function syncStoreAndUser() {
    const biz = (document.getElementById("app-business-name")?.textContent ?? "").trim() || "Mon commerce";
    const email = (document.getElementById("app-user-email")?.textContent ?? "").trim();

    const ini = initialsFromName(biz);
    const si = document.getElementById("app-topbar-store-initials");
    const sm = document.getElementById("app-topbar-menu-store-initials");
    if (si) si.textContent = ini;
    if (sm) sm.textContent = ini;
    const sn = document.getElementById("app-topbar-store-name");
    const mn = document.getElementById("app-topbar-menu-store-name");
    if (sn) sn.textContent = biz;
    if (mn) mn.textContent = biz;

    const av = document.getElementById("app-topbar-user-avatar");
    if (av) av.textContent = initialsFromEmail(email);
    const emEl = document.getElementById("app-topbar-user-email-display");
    if (emEl) emEl.textContent = email;
    const nm = document.getElementById("app-topbar-user-name");
    if (nm) nm.textContent = displayNameFromEmail(email);
  }

  syncStoreAndUser();
  window.addEventListener("app-section-change", () => window.requestAnimationFrame(syncStoreAndUser));
  const bizNameEl = document.getElementById("app-business-name");
  const userEmailElObs = document.getElementById("app-user-email");
  if (bizNameEl) {
    new MutationObserver(() => window.requestAnimationFrame(syncStoreAndUser)).observe(bizNameEl, {
      characterData: true,
      subtree: true,
      childList: true,
    });
  }
  if (userEmailElObs) {
    new MutationObserver(() => window.requestAnimationFrame(syncStoreAndUser)).observe(userEmailElObs, {
      characterData: true,
      subtree: true,
      childList: true,
    });
  }

  /* ——— Recherche ——— */
  function buildChips() {
    if (!searchChips) return;
    searchChips.textContent = "";
    CHIP_DEFS.forEach((c) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "app-topbar-search-chip" + (c.id === activeChip ? " is-active" : "");
      b.textContent = c.label;
      b.dataset.chip = c.id;
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", c.id === activeChip ? "true" : "false");
      b.addEventListener("click", () => {
        activeChip = c.id;
        searchChips.querySelectorAll(".app-topbar-search-chip").forEach((el) => {
          const on = el.dataset.chip === activeChip;
          el.classList.toggle("is-active", on);
          el.setAttribute("aria-selected", on ? "true" : "false");
        });
        renderResults();
      });
      searchChips.appendChild(b);
    });
  }

  function filterIndex() {
    const q = norm(searchInput?.value || "");
    return SEARCH_INDEX.filter((item) => {
      const chipOk = activeChip === "tous" || item.chips.includes(activeChip);
      if (!chipOk) return false;
      if (!q) return true;
      const hay = norm(`${item.label} ${item.hint} ${item.id}`);
      return hay.includes(q);
    });
  }

  function renderResults() {
    if (!searchResults || !searchEmpty) return;
    filteredItems = filterIndex();
    searchResults.textContent = "";
    const biz = (document.getElementById("app-business-name")?.textContent ?? "").trim() || "votre espace";
    if (searchEmptyText) {
      searchEmptyText.textContent = searchInput?.value?.trim()
        ? "Aucun résultat"
        : `Chercher dans ${biz}`;
    }

    if (filteredItems.length === 0) {
      searchEmpty.classList.remove("hidden");
      searchResults.classList.add("hidden");
      return;
    }
    searchEmpty.classList.add("hidden");
    searchResults.classList.remove("hidden");

    filteredItems.forEach((item, i) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "app-topbar-search-result" + (i === highlightIdx ? " is-highlighted" : "");
      btn.setAttribute("role", "option");
      const lab = document.createElement("span");
      lab.className = "app-topbar-search-result-label";
      lab.textContent = item.label;
      const meta = document.createElement("span");
      meta.className = "app-topbar-search-result-meta";
      meta.textContent = item.hint;
      btn.appendChild(lab);
      btn.appendChild(meta);
      btn.addEventListener("click", () => goSection(item.id));
      btn.addEventListener("mouseenter", () => {
        highlightIdx = i;
        renderResults();
      });
      li.appendChild(btn);
      searchResults.appendChild(li);
    });
  }

  function goSection(id) {
    closeSearch();
    showAppSection(id);
  }

  let searchTriggerEl = null;

  function openSearch() {
    if (window.matchMedia("(max-width: 900px)").matches) return;
    searchTriggerEl = document.activeElement;
    searchRoot?.classList.add("is-visible");
    searchRoot?.setAttribute("aria-hidden", "false");
    buildChips();
    highlightIdx = 0;
    if (searchInput) searchInput.value = "";
    renderResults();
    window.requestAnimationFrame(() => searchInput?.focus());
  }

  function closeSearch() {
    searchRoot?.classList.remove("is-visible");
    searchRoot?.setAttribute("aria-hidden", "true");
    if (searchTriggerEl && typeof searchTriggerEl.focus === "function") {
      try {
        searchTriggerEl.focus();
      } catch (_) {
        /* ignore */
      }
    }
    searchTriggerEl = null;
  }

  searchOpen?.addEventListener("click", openSearch);
  searchBackdrop?.addEventListener("click", closeSearch);

  searchInput?.addEventListener("input", () => {
    highlightIdx = 0;
    renderResults();
  });

  searchInput?.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlightIdx = Math.min(highlightIdx + 1, Math.max(0, filteredItems.length - 1));
      renderResults();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlightIdx = Math.max(highlightIdx - 1, 0);
      renderResults();
    } else if (e.key === "Enter" && filteredItems[highlightIdx]) {
      e.preventDefault();
      goSection(filteredItems[highlightIdx].id);
    }
  });

  document.addEventListener("keydown", (e) => {
    const isK = e.key === "k" || e.key === "K";
    if (!isK) return;
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    e.preventDefault();
    if (searchRoot?.classList.contains("is-visible")) closeSearch();
    else openSearch();
  });
}
