/**
 * Empêche de quitter une section /app ou le site avec des formulaires non enregistrés.
 */

const dirtyFlags = new Map();
const externalDirty = new Map();
const discardHandlers = new Map();

let committedSection = "dashboard";
let pendingNavigateSection = null;
/** @type {null | (() => void)} */
let pendingLeaveFn = null;

let modalEl = null;
let showSectionCoreRef = null;
let sectionIdsRef = [];

function openUnsavedModal() {
  if (!modalEl) return;
  modalEl.classList.remove("hidden");
  modalEl.setAttribute("aria-hidden", "false");
  document.getElementById("app-unsaved-save")?.focus();
}

function closeUnsavedModal() {
  if (!modalEl) return;
  modalEl.classList.add("hidden");
  modalEl.setAttribute("aria-hidden", "true");
  pendingNavigateSection = null;
  pendingLeaveFn = null;
}

/** Boutons Enregistrer par section (pastille bleue = non enregistré) — Ma carte a 2 CTA. */
const SAVE_BUTTON_IDS_BY_SECTION = {
  personnaliser: ["app-personnaliser-save"],
  "regles-carte": ["app-regles-save", "app-game-save"],
  engagement: ["app-engagement-save"],
  notifications: ["app-notification-texts-save"],
  "carte-perimetre": ["app-perimetre-save"],
  profil: ["app-profil-save"],
};

function updateSaveCtaDirtyVisual(sectionId) {
  const ids = SAVE_BUTTON_IDS_BY_SECTION[sectionId];
  if (!ids) return;
  const dirty = isAppSectionDirty(sectionId);
  for (const btnId of ids) {
    const btn = document.getElementById(btnId);
    const wrap = btn?.closest(".app-save-cta-wrap");
    if (wrap) wrap.classList.toggle("app-save-cta-wrap--dirty", dirty);
  }
}

export function markAppSectionDirty(sectionId) {
  if (sectionId) dirtyFlags.set(sectionId, true);
  if (sectionId) updateSaveCtaDirtyVisual(sectionId);
}

export function clearAppSectionDirty(sectionId) {
  if (sectionId) dirtyFlags.delete(sectionId);
  if (sectionId) updateSaveCtaDirtyVisual(sectionId);
}

/** À appeler quand le « sale » vient uniquement du getter externe (ex. périmètre). */
export function refreshAppSaveCtaDirtyVisual(sectionId) {
  if (sectionId) updateSaveCtaDirtyVisual(sectionId);
  else Object.keys(SAVE_BUTTON_IDS_BY_SECTION).forEach((sid) => updateSaveCtaDirtyVisual(sid));
}

export function registerAppExternalDirty(sectionId, fn) {
  if (sectionId && typeof fn === "function") externalDirty.set(sectionId, fn);
}

export function registerAppDiscardHandler(sectionId, fn) {
  if (sectionId && typeof fn === "function") discardHandlers.set(sectionId, fn);
}

export function isAppSectionDirty(sectionId) {
  if (!sectionId) return false;
  if (dirtyFlags.get(sectionId)) return true;
  const ext = externalDirty.get(sectionId);
  return typeof ext === "function" && !!ext();
}

export function getAppCommittedSection() {
  return committedSection;
}

function normalizeSectionId(raw, sectionIds) {
  const normalized = raw === "partager" ? "personnaliser" : raw;
  if (normalized === "scanner" || normalized === "vue-ensemble") return "dashboard";
  return sectionIds.includes(normalized) ? normalized : "dashboard";
}

function parseHashSection(sectionIds) {
  const h = (typeof window !== "undefined" && window.location.hash ? window.location.hash : "#dashboard").slice(1);
  return normalizeSectionId(h, sectionIds);
}

function forceNavigateToSection(sectionId) {
  if (!showSectionCoreRef) return;
  const id = normalizeSectionId(sectionId, sectionIdsRef);
  showSectionCoreRef(id);
  committedSection = id;
}

/** Cible du clic « Enregistrer » dans la modale (un seul bouton par section). */
const MODAL_SAVE_BUTTON_BY_SECTION = {
  personnaliser: "app-personnaliser-save",
  "regles-carte": "app-regles-save",
  engagement: "app-engagement-save",
  notifications: "app-notification-texts-save",
  "carte-perimetre": "app-perimetre-save",
  profil: "app-profil-save",
};

export function notifyAppSectionSaveSuccess(sectionId) {
  clearAppSectionDirty(sectionId);
  if (!modalEl || modalEl.classList.contains("hidden")) return;
  if (sectionId !== committedSection) return;

  const goNav = pendingNavigateSection;
  const goLeave = pendingLeaveFn;
  pendingNavigateSection = null;
  pendingLeaveFn = null;
  closeUnsavedModal();

  if (goNav) forceNavigateToSection(goNav);
  else if (typeof goLeave === "function") goLeave();
}

let _dirtyGuardModalWired = false;

/** @param {{ sectionIds: string[]; showSectionCore: (id: string) => void }} opts */
export function initAppDirtyGuard(opts) {
  sectionIdsRef = opts.sectionIds || [];
  showSectionCoreRef = opts.showSectionCore;
  modalEl = document.getElementById("app-unsaved-changes-modal");
  const backdrop = document.getElementById("app-unsaved-backdrop");
  const btnSave = document.getElementById("app-unsaved-save");
  const btnDiscard = document.getElementById("app-unsaved-discard");

  function requestNavigate(targetId) {
    const norm = normalizeSectionId(targetId, sectionIdsRef);
    if (norm === committedSection) return true;
    if (isAppSectionDirty(committedSection)) {
      pendingNavigateSection = norm;
      pendingLeaveFn = null;
      openUnsavedModal();
      return false;
    }
    forceNavigateToSection(norm);
    return true;
  }

  function onHashChange() {
    const norm = parseHashSection(sectionIdsRef);
    if (norm === committedSection) return;
    if (isAppSectionDirty(committedSection)) {
      if (window.history?.replaceState) {
        window.history.replaceState(null, "", window.location.pathname + "#" + committedSection);
      }
      pendingNavigateSection = norm;
      pendingLeaveFn = null;
      openUnsavedModal();
      return;
    }
    forceNavigateToSection(norm);
  }

  if (!_dirtyGuardModalWired && modalEl) {
    _dirtyGuardModalWired = true;

    btnSave?.addEventListener("click", () => {
      const sid = committedSection;
      const btnId = MODAL_SAVE_BUTTON_BY_SECTION[sid];
      if (btnId) document.getElementById(btnId)?.click();
      else closeUnsavedModal();
    });

    btnDiscard?.addEventListener("click", async () => {
      const from = committedSection;
      const nav = pendingNavigateSection;
      const leave = pendingLeaveFn;
      pendingNavigateSection = null;
      pendingLeaveFn = null;
      try {
        await discardHandlers.get(from)?.();
      } catch {
        /* ignore */
      }
      clearAppSectionDirty(from);
      closeUnsavedModal();
      if (nav) forceNavigateToSection(nav);
      else if (typeof leave === "function") leave();
    });

    backdrop?.addEventListener("click", () => {
      closeUnsavedModal();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || !modalEl || modalEl.classList.contains("hidden")) return;
      closeUnsavedModal();
    });

    window.addEventListener("beforeunload", (e) => {
      if (isAppSectionDirty(committedSection)) {
        e.preventDefault();
        e.returnValue = "";
      }
    });

    const appRoot = document.getElementById("app-app");
    appRoot?.addEventListener(
      "click",
      (e) => {
        const a = e.target.closest?.("a[href]");
        if (!a) return;
        if (a.closest(".app-sidebar-link[data-section]")) return;
        const href = a.getAttribute("href") || "";
        if (href.startsWith("#")) return;
        try {
          const url = new URL(a.href, window.location.origin);
          if (url.pathname === "/app" && url.origin === window.location.origin) return;
        } catch {
          return;
        }
        if (!isAppSectionDirty(committedSection)) return;
        e.preventDefault();
        e.stopPropagation();
        pendingNavigateSection = null;
        pendingLeaveFn = () => {
          window.location.href = a.href;
        };
        openUnsavedModal();
      },
      true
    );
  }

  return {
    navigateAppSection: requestNavigate,
    onAppHashChange: onHashChange,
    forceNavigateToSection,
  };
}

/**
 * Déconnexion : en capture, bloque si la section courante est « sale ».
 */
export function wrapAppLogoutButtonsWithDirtyGuard(clearAuthToken) {
  ["app-logout", "app-mobile-logout"].forEach((id) => {
    const btn = document.getElementById(id);
    if (!btn || btn.dataset.fidpassDirtyLogout) return;
    btn.dataset.fidpassDirtyLogout = "1";
    btn.addEventListener(
      "click",
      (e) => {
        if (!isAppSectionDirty(committedSection)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        pendingNavigateSection = null;
        pendingLeaveFn = () => {
          clearAuthToken();
          window.location.replace("/");
        };
        openUnsavedModal();
      },
      true
    );
  });
}
