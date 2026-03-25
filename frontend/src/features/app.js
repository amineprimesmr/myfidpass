/**
 * Page app (/app) : espace pro, sidebar, dashboard, caisse, notifications, profil, personnaliser, engagement.
 * Dérogation : fichier > 400 lignes, à découper en sous-modules (app/notifications.js, app/caisse.js, etc.). REFONTE-REGLES.md.
 */
import { API_BASE, getAuthHeaders, clearAuthToken, isDevBypassPayment, IS_LOCAL_DEV } from "../config.js";
import { runDevDataReset } from "../utils/dev-reset.js";
import { escapeHtmlForServer, getApiErrorMessage, showApiError } from "../utils/apiError.js";
import { slugify } from "../utils/slugify.js";
import { CARD_TEMPLATES, BUILDER_DRAFT_KEY } from "../constants/builder.js";
import {
  LOCATION_RADIUS_DEFAULT_M,
  clampLocationRadiusMetersClient,
} from "../constants/locationRadius.js";
import { initIntegrationHub } from "./integration-hub.js";
import { maybeShowPostPurchaseAppModal } from "./post-purchase-app-modal.js";
import {
  initAppDirtyGuard,
  markAppSectionDirty,
  clearAppSectionDirty,
  registerAppExternalDirty,
  registerAppDiscardHandler,
  notifyAppSectionSaveSuccess,
  wrapAppLogoutButtonsWithDirtyGuard,
  refreshAppSaveCtaDirtyVisual,
} from "./app-dirty-guard.js";
import { initAppCardRulesGuide, refreshCardRulesChecklist } from "./app-card-rules-guide.js";
import { updatePersonnaliserGroupStatusIndicators } from "./app-personnaliser-groups-status.js";
import {
  setLastKnownBusinessSector,
  getLastKnownBusinessSector,
  getDefaultPointTiersBySector,
  tiersFromApiPayload,
  writePointTierInputs,
  readPointTierInputs,
  arePointTierInputsEmpty,
  normalizeBusinessSector,
  POINT_TIER_COUNT,
  getDefaultStampMidLabelBySector,
  getDefaultStampFinalLabelBySector,
} from "./app-card-rules-point-tiers.js";
import { geocodeAddress, formatPhotonAddress, photonGeocodeFeatures } from "../utils/geocoding.js";
import { initAppFlyerQr } from "./app-flyer-qr.js";

/** En dev : front sur localhost et API_BASE vide → requêtes /api/* via proxy Vite vers le backend. */
const IS_LOCAL_VITE_PROXY = IS_LOCAL_DEV && !API_BASE;

/** @typedef {"network"|"server500"|"client"|"parse"|"unknown"|"unexpected"} AppLoadFailKind */

/**
 * Message principal affiché au commerçant (sans jargon dev).
 * @param {AppLoadFailKind} kind
 */
function userFacingFatalMessage(kind) {
  if (IS_LOCAL_DEV && IS_LOCAL_VITE_PROXY) {
    return [
      "Vous êtes en local : cette page appelle l’API via Vite (proxy → port 3001). Sans processus Node sur 3001, rien ne fonctionne.",
      "",
      "Erreur classique : lancer seulement « npm run dev » dans le dossier frontend. Dans ce cas, l’API n’est jamais démarrée.",
      "",
      "À faire — terminal ouvert à la racine du dépôt (pas dans frontend/) :",
      "  • npm run backend   → démarre uniquement l’API",
      "  • ou npm start      → démarre API + Vite en même temps (recommandé)",
      "",
      "Quand le backend tourne, touchez « Réessayer ».",
    ].join("\n");
  }
  if (IS_LOCAL_DEV) {
    return "Mode développement : vérifiez VITE_API_URL dans frontend/.env et que l’API répond.";
  }
  if (kind === "network") {
    return "Aucune réponse du serveur. Vérifiez votre connexion internet, puis réessayez.";
  }
  if (kind === "server500") {
    return "Le service rencontre un problème temporaire. Réessayez dans quelques minutes.";
  }
  if (kind === "client") {
    return "La connexion a été refusée. Déconnectez-vous, reconnectez-vous, puis réessayez.";
  }
  if (kind === "parse") {
    return "Réponse inattendue du serveur. Réessayez plus tard ou reconnectez-vous.";
  }
  return "Nous n’avons pas pu charger votre espace. Réessayez ou revenez plus tard.";
}

function initAppPage() {
  wrapAppLogoutButtonsWithDirtyGuard(clearAuthToken);
  const emptyEl = document.getElementById("app-empty");
  const contentEl = document.getElementById("app-dashboard-content");
  const loadingEl = document.getElementById("app-main-loading");
  const loadErrorEl = document.getElementById("app-empty-load-error");
  const businessNameEl = document.getElementById("app-business-name");
  const userEmailEl = document.getElementById("app-user-email");
  const logoutBtn = document.getElementById("app-logout");
  const resetAllBtn = document.getElementById("app-reset-all");

  const loadErrorDetailEl = document.getElementById("app-empty-load-error-detail");
  const emptyWelcomeEl = document.getElementById("app-empty-welcome");
  const emptyFatalEl = document.getElementById("app-empty-fatal");
  const emptyFatalDescEl = document.getElementById("app-empty-fatal-desc");
  const emptyFatalLocalHintEl = document.getElementById("app-empty-fatal-local-hint");
  const emptyFatalTechEl = document.getElementById("app-empty-fatal-tech");
  const emptyFatalTechPreEl = document.getElementById("app-empty-fatal-tech-pre");

  /**
   * @param {string | { technical?: string; kind?: AppLoadFailKind }} options
   */
  function showLoadError(options = "") {
    let technical = "";
    let kind = /** @type {AppLoadFailKind} */ ("unknown");
    if (typeof options === "string") {
      technical = options;
    } else if (options && typeof options === "object") {
      technical = options.technical ?? "";
      kind = options.kind ?? "unknown";
    }
    if (loadingEl) loadingEl.classList.add("hidden");
    if (emptyEl) emptyEl.classList.remove("hidden");
    if (contentEl) contentEl.classList.add("hidden");
    emptyWelcomeEl?.classList.add("hidden");
    emptyFatalEl?.classList.remove("hidden");
    if (loadErrorEl) {
      loadErrorEl.textContent = "";
      loadErrorEl.classList.add("hidden");
    }
    if (loadErrorDetailEl) {
      loadErrorDetailEl.textContent = "";
      loadErrorDetailEl.classList.add("hidden");
    }
    if (emptyFatalDescEl) {
      emptyFatalDescEl.textContent = userFacingFatalMessage(kind);
    }
    const originHint =
      typeof window !== "undefined" && window.location.origin ? window.location.origin.replace(/\/$/, "") : "";
    if (emptyFatalLocalHintEl) {
      const showLocal = IS_LOCAL_DEV && IS_LOCAL_VITE_PROXY && !!originHint;
      emptyFatalLocalHintEl.classList.toggle("hidden", !showLocal);
      if (showLocal) {
        let t = `Test rapide : ${originHint}/api/health doit afficher un JSON avec « ok ».`;
        if (kind === "server500") {
          t +=
            " Si « ok » mais cette page échoue encore : l’API plante sur /auth/me (souvent base SQLite) — regardez le terminal du backend.";
        } else if (kind === "network") {
          t += " Si la page ne charge pas : rien n’écoute sur 3001, lancez npm run backend à la racine.";
        }
        emptyFatalLocalHintEl.textContent = t;
      }
    }
    const showTech = IS_LOCAL_DEV && !!technical.trim();
    if (emptyFatalTechEl) {
      emptyFatalTechEl.classList.toggle("hidden", !showTech);
      emptyFatalTechEl.open = false;
    }
    if (emptyFatalTechPreEl) {
      emptyFatalTechPreEl.textContent = showTech ? technical.trim() : "";
    }
    if (technical.trim() && typeof console !== "undefined" && console.error) {
      console.error("[fidpass] Chargement /app :", technical.trim());
    }
  }

  document.getElementById("app-empty-retry-btn")?.addEventListener("click", () => {
    window.location.reload();
  });

  logoutBtn?.addEventListener("click", () => {
    clearAuthToken();
    window.location.replace("/");
  });

  resetAllBtn?.addEventListener("click", () => runDevDataReset());

  async function fetchAuthMe(retries = 3) {
    let lastStatus = null;
    let networkFail = false;
    /** Dernière erreur JSON du backend (ex. détail SQLite en dev sur /api/auth/me). */
    let serverErrorLine = "";
    for (let i = 0; i <= retries; i++) {
      try {
        const res = await fetch(`${API_BASE}/api/auth/me`, { headers: getAuthHeaders() });
        lastStatus = res.status;
        if (res.status >= 500) {
          try {
            const j = await res.clone().json();
            if (j.detail) serverErrorLine = String(j.detail);
            else if (j.error) serverErrorLine = String(j.error);
          } catch (_) {
            /* corps non-JSON */
          }
        }
        if (res.ok || res.status === 401) return res;
        if (i < retries) await new Promise((r) => setTimeout(r, 600 * (i + 1)));
      } catch (_) {
        networkFail = true;
        lastStatus = null;
        if (i < retries) await new Promise((r) => setTimeout(r, 600 * (i + 1)));
      }
    }
    const originHint =
      typeof window !== "undefined" ? window.location.origin : "";
    /** @type {AppLoadFailKind} */
    let failKind = "unknown";
    if (networkFail && !lastStatus) failKind = "network";
    else if (lastStatus != null && lastStatus >= 500) failKind = "server500";
    else if (lastStatus != null && lastStatus >= 400) failKind = "client";

    const devExtra = IS_LOCAL_DEV
      ? IS_LOCAL_VITE_PROXY
        ? ` (proxy Vite → API locale, pas api.myfidpass.fr ; origin ${originHint})`
        : " Vérifiez VITE_API_URL et que l’API répond."
      : "";
    const serverBit =
      serverErrorLine && lastStatus === 500 ? ` — réponse serveur : ${serverErrorLine}` : "";
    let technical = "";
    if (networkFail && !lastStatus) {
      technical = `Aucune réponse HTTP après ${retries + 1} tentative(s).${devExtra}`;
    } else if (lastStatus != null) {
      technical = `HTTP ${lastStatus} après ${retries + 1} tentative(s).${serverBit}${devExtra}`;
    } else {
      technical = `Échec après ${retries + 1} tentative(s).${devExtra}`;
    }
    window.__fidpassAuthMeFailDetail = technical;
    window.__fidpassAuthMeFailKind = failKind;
    return null;
  }

  (async () => {
    try {
      const res = await fetchAuthMe();
      if (!res) {
        showLoadError({
          technical: typeof window !== "undefined" ? window.__fidpassAuthMeFailDetail || "" : "",
          kind: typeof window !== "undefined" ? window.__fidpassAuthMeFailKind || "unknown" : "unknown",
        });
        return;
      }
      if (res.status === 401) {
        loadingEl?.classList.add("hidden");
        const body = await res.json().catch(() => ({}));
        clearAuthToken();
        const code = body.code || "invalid";
        window.location.replace("/login?redirect=/app&session=" + code);
        return;
      }
      if (!res.ok) {
        showLoadError({
          technical: typeof window !== "undefined" ? window.__fidpassAuthMeFailDetail || "" : "",
          kind: typeof window !== "undefined" ? window.__fidpassAuthMeFailKind || "unknown" : "unknown",
        });
        return;
      }
      const rawMe = await res.text();
      let data;
      try {
        data = rawMe ? JSON.parse(rawMe) : {};
      } catch (parseErr) {
        const snippet = (rawMe || "").slice(0, 120).replace(/\s+/g, " ");
        const tech = `Réponse /api/auth/me non JSON.${snippet ? ` Début : ${snippet}…` : ""}${
          IS_LOCAL_DEV && API_BASE
            ? " En local : VITE_API_URL peut pointer vers une page HTML (404) au lieu de l’API."
            : ""
        }`;
        showLoadError({ technical: tech, kind: "parse" });
        if (typeof console !== "undefined" && console.error) console.error("[fidpass] /api/auth/me parse:", parseErr, rawMe?.slice?.(0, 500));
        return;
      }
      if (!data || typeof data !== "object") {
        showLoadError({ technical: "Réponse /api/auth/me : corps vide ou non objet.", kind: "parse" });
        return;
      }
      const hasSubscription =
        !!(data.has_active_subscription ?? data.hasActiveSubscription) || isDevBypassPayment();
      if (!hasSubscription) {
        loadingEl?.classList.add("hidden");
        window.location.replace("/choisir-offre");
        return;
      }
      const user = data.user;
      const businesses = data.businesses || [];
      if (userEmailEl) userEmailEl.textContent = user?.email || "";
      const mobileProfilEmail = document.getElementById("app-mobile-profil-email");
      if (mobileProfilEmail) mobileProfilEmail.textContent = user?.email || "";
      /* fidpass-auth-me : émis seulement après initAppDashboard (l’écouteur Profil y est enregistré). */

      if (businesses.length === 0) {
        loadingEl?.classList.add("hidden");
        if (loadErrorEl) {
          loadErrorEl.textContent = "";
          loadErrorEl.classList.add("hidden");
        }
        loadErrorDetailEl?.classList.add("hidden");
        emptyWelcomeEl?.classList.remove("hidden");
        emptyFatalEl?.classList.add("hidden");
        if (emptyEl) emptyEl.classList.remove("hidden");
        if (contentEl) contentEl.classList.add("hidden");
        if (businessNameEl) businessNameEl.textContent = "Mon espace";
        initAppSidebar();
        window.dispatchEvent(
          new CustomEvent("fidpass-auth-me", {
            detail: {
              user,
              subscription: data.subscription || null,
              hasActiveSubscription: data.has_active_subscription ?? hasSubscription,
              awaitingFirstBusiness: true,
            },
          })
        );
        requestAnimationFrame(() => maybeShowPostPurchaseAppModal());
        return;
      }
      document.getElementById("app-app")?.classList.remove("app-awaiting-first-business");
      loadingEl?.classList.add("hidden");
      if (loadErrorEl) {
        loadErrorEl.textContent = "";
        loadErrorEl.classList.add("hidden");
      }
      loadErrorDetailEl?.classList.add("hidden");
      emptyWelcomeEl?.classList.remove("hidden");
      emptyFatalEl?.classList.add("hidden");
      if (emptyEl) emptyEl.classList.add("hidden");
      if (contentEl) contentEl.classList.remove("hidden");
      const business = businesses[0];
      if (businessNameEl) businessNameEl.textContent = business.organization_name || business.name || business.slug;
      initAppSidebar();
      initAppDashboard(business.slug);
      window.dispatchEvent(
        new CustomEvent("fidpass-auth-me", {
          detail: {
            user,
            subscription: data.subscription || null,
            hasActiveSubscription: data.has_active_subscription ?? hasSubscription,
          },
        })
      );
      requestAnimationFrame(() => maybeShowPostPurchaseAppModal());
    } catch (err) {
      if (typeof console !== "undefined" && console.error) console.error("[fidpass] init /app:", err);
      const tech = err instanceof Error ? err.message : String(err);
      showLoadError({
        technical: `Exception pendant l’init /app : ${tech}`,
        kind: "unexpected",
      });
    }
  })();

  const emptyForm = document.getElementById("app-empty-create-form");
  const emptyName = document.getElementById("app-empty-name");
  const emptySlug = document.getElementById("app-empty-slug");
  const emptySlugPreview = document.getElementById("app-empty-slug-preview");
  const emptyCreateError = document.getElementById("app-empty-create-error");

  function updateEmptySlugPreview() {
    const s = slugify(emptySlug?.value || emptyName?.value || "");
    if (emptySlugPreview) emptySlugPreview.textContent = s || "votre-lien";
  }
  emptyName?.addEventListener("input", () => {
    if (!emptySlug?.dataset.manual) {
      const s = slugify(emptyName?.value || "");
      if (emptySlug) emptySlug.value = s;
      updateEmptySlugPreview();
    }
  });
  emptySlug?.addEventListener("input", () => {
    if (emptySlug) emptySlug.dataset.manual = "1";
    updateEmptySlugPreview();
  });

  (function prefillEmptyFromDraft() {
    try {
      const raw = localStorage.getItem(BUILDER_DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.organizationName && emptyName && !emptyName.value?.trim()) {
        emptyName.value = d.organizationName.trim();
        if (emptySlug && !emptySlug.dataset.manual) {
          emptySlug.value = slugify(d.organizationName.trim());
          updateEmptySlugPreview();
        }
      }
    } catch (_) {}
  })();

  function buildEngagementRewardsFromOnboarding(onboarding) {
    if (!onboarding || typeof onboarding !== "object") return null;
    const selected = Array.isArray(onboarding.engagementGoals) ? onboarding.engagementGoals : [];
    const configs = onboarding.goalConfigs && typeof onboarding.goalConfigs === "object" ? onboarding.goalConfigs : {};
    const isSelected = (id) => selected.includes(id);
    const val = (id) => String(configs[id]?.value || "").trim();
    return {
      google_review: {
        enabled: isSelected("google_review") && !!val("google_review"),
        points: 2,
        place_id: val("google_review"),
        require_approval: false,
        auto_verify_enabled: true,
      },
      instagram_follow: { enabled: isSelected("instagram_follow") && !!val("instagram_follow"), points: 1, url: val("instagram_follow") },
      tiktok_follow: { enabled: isSelected("tiktok_follow") && !!val("tiktok_follow"), points: 1, url: val("tiktok_follow") },
      facebook_follow: { enabled: isSelected("facebook_follow") && !!val("facebook_follow"), points: 1, url: val("facebook_follow") },
      twitter_follow: { enabled: isSelected("twitter_follow") && !!val("twitter_follow"), points: 1, url: val("twitter_follow") },
      trustpilot_review: { enabled: isSelected("trustpilot_review") && !!val("trustpilot_review"), points: 1, url: val("trustpilot_review") },
      tripadvisor_review: { enabled: isSelected("tripadvisor_review") && !!val("tripadvisor_review"), points: 1, url: val("tripadvisor_review") },
    };
  }

  async function applyDraftEngagementRewards(slug) {
    if (!slug) return;
    try {
      const raw = localStorage.getItem(BUILDER_DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      const engagementRewards = buildEngagementRewardsFromOnboarding(draft.onboarding);
      if (!engagementRewards) return;
      await fetch(`${API_BASE}/api/businesses/${encodeURIComponent(slug)}/dashboard/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ engagement_rewards: engagementRewards }),
      });
    } catch (_) {}
  }

  emptyForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = emptyName?.value?.trim();
    const slugRaw = emptySlug?.value?.trim() || slugify(name || "");
    const slug = slugify(slugRaw) || slugify(name || "") || "ma-carte";
    if (!name) {
      if (emptyCreateError) {
        emptyCreateError.textContent = "Saisissez le nom de l'établissement.";
        emptyCreateError.classList.remove("hidden");
      }
      return;
    }
    if (emptyCreateError) emptyCreateError.classList.add("hidden");
    let tpl = CARD_TEMPLATES.find((t) => t.id === "classic") || CARD_TEMPLATES[0];
    let logoBase64 = null;
    try {
      const draftRaw = localStorage.getItem(BUILDER_DRAFT_KEY);
      if (draftRaw) {
        const draft = JSON.parse(draftRaw);
        if (draft.selectedTemplateId && CARD_TEMPLATES.some((t) => t.id === draft.selectedTemplateId)) {
          const draftTpl = CARD_TEMPLATES.find((t) => t.id === draft.selectedTemplateId);
          if (draftTpl) tpl = draftTpl;
        }
        if (draft.logoDataUrl && typeof draft.logoDataUrl === "string" && draft.logoDataUrl.startsWith("data:image/")) {
          logoBase64 = draft.logoDataUrl;
        }
      }
    } catch (_) {}
    const body = {
          name,
          slug,
          organizationName: name,
          backgroundColor: tpl.bg,
          foregroundColor: tpl.fg,
          labelColor: tpl.label,
    };
    if (logoBase64) body.logoBase64 = logoBase64;
    try {
      const res = await fetch(`${API_BASE}/api/businesses`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) {
          if (emptyCreateError) {
            emptyCreateError.textContent = "Ce lien est déjà pris. Choisissez un autre lien.";
            emptyCreateError.classList.remove("hidden");
          }
          return;
        }
        if (res.status === 403 && (data.code === "subscription_required")) {
          if (isDevBypassPayment()) {
            if (emptyCreateError) {
              emptyCreateError.innerHTML = IS_LOCAL_DEV
                ? "Mode dev actif ici. En <strong>localhost</strong>, ajoute <code>DEV_BYPASS_PAYMENT=true</code> dans <code>backend/.env</code>, puis redémarre le backend (<code>npm run backend</code>)."
                : "Mode dev actif ici. Pour autoriser la création sans paiement : <strong>Railway</strong> → service backend → <strong>Variables</strong> → <code>DEV_BYPASS_PAYMENT</code> = <code>true</code> → enregistre puis <strong>Redeploy</strong>. Pense à cliquer « Mode dev : passer le paiement » sur la page Choisir une offre avant d’arriver ici.";
              emptyCreateError.classList.remove("hidden");
            }
            return;
          }
          window.location.replace("/choisir-offre");
          return;
        }
        if (emptyCreateError) {
          emptyCreateError.textContent = data.error || "Erreur lors de la création.";
          emptyCreateError.classList.remove("hidden");
        }
        return;
      }
      await applyDraftEngagementRewards(data.slug || slug);
      if (emptyEl) emptyEl.classList.add("hidden");
      if (contentEl) contentEl.classList.remove("hidden");
      document.getElementById("app-app")?.classList.remove("app-awaiting-first-business");
      if (businessNameEl) businessNameEl.textContent = data.organization_name || data.name || data.slug;
      initAppSidebar();
      initAppDashboard(data.slug);
    } catch (err) {
      if (emptyCreateError) {
        emptyCreateError.textContent = "Erreur réseau. Réessayez.";
        emptyCreateError.classList.remove("hidden");
      }
    }
  });
}

const APP_SECTION_IDS = ["dashboard", "membres", "flyer-qr", "personnaliser", "carte-perimetre", "integration", "engagement", "notifications", "profil"];

const APP_MOBILE_TITLES = {
  "dashboard": "Dashboard",
  "personnaliser": "Ma Carte",
  "notifications": "Campagnes",
  "carte-perimetre": "Emplacement",
  "flyer-qr": "Flyer QR",
  "engagement": "Avis & Réseaux",
  "profil": "Profil",
};

function showAppSectionCore(sectionId) {
  const normalized = sectionId === "partager" ? "personnaliser" : sectionId;
  let id = APP_SECTION_IDS.includes(normalized) ? normalized : "dashboard";
  const awaiting = document.getElementById("app-app")?.classList.contains("app-awaiting-first-business");
  if (awaiting && id !== "personnaliser" && id !== "profil") id = "personnaliser";
  APP_SECTION_IDS.forEach((sid) => {
    const el = document.getElementById(sid);
    if (el) {
      const show = el.id === id;
      el.classList.toggle("app-section-visible", show);
      el.style.setProperty("display", show ? "block" : "none", "important");
    }
  });
  const links = document.querySelectorAll("#app-app .app-sidebar-link[data-section]");
  links.forEach((l) => {
    l.classList.toggle("app-sidebar-link-active", l.getAttribute("data-section") === id);
  });
  document.querySelectorAll("#app-mobile-tab-bar .app-mobile-tab").forEach((t) => {
    t.classList.toggle("active", t.getAttribute("data-mobile-tab") === id);
  });
  const headerTitle = document.getElementById("app-mobile-header-title");
  if (headerTitle) headerTitle.textContent = APP_MOBILE_TITLES[id] || "Myfidpass";
  const newHash = "#" + id;
  if (window.location.hash !== newHash) {
    window.history.replaceState(null, "", window.location.pathname + newHash);
  }
  window.dispatchEvent(new CustomEvent("app-section-change", { detail: { sectionId: id } }));
}

const appDirtyNav = initAppDirtyGuard({
  sectionIds: APP_SECTION_IDS,
  showSectionCore: showAppSectionCore,
});

function showAppSection(sectionId) {
  appDirtyNav.navigateAppSection(sectionId);
}

let _appSidebarInitialized = false;
function initAppSidebar() {
  const appRoot = document.getElementById("app-app");
  if (!appRoot) return;
  if (!_appSidebarInitialized) {
    _appSidebarInitialized = true;
    appRoot.addEventListener("click", (e) => {
      const link = e.target?.closest?.(".app-sidebar-link[data-section]");
      if (!link) return;
      e.preventDefault();
      const id = link.getAttribute("data-section");
      if (APP_SECTION_IDS.includes(id)) {
        showAppSection(id);
        requestAnimationFrame(() => showAppSection(id));
      }
    });
    window.addEventListener("hashchange", () => {
      appDirtyNav.onAppHashChange();
    });
  }
  let hashSection = (window.location.hash || "#dashboard").slice(1);
  if (hashSection === "scanner") hashSection = "dashboard";
  if (hashSection === "vue-ensemble") {
    hashSection = "dashboard";
    if (window.history?.replaceState) window.history.replaceState(null, "", "#dashboard");
  }
  let sectionToShow = hashSection === "partager" ? "personnaliser" : (APP_SECTION_IDS.includes(hashSection) ? hashSection : "dashboard");
  const awaitingBiz = document.getElementById("app-app")?.classList.contains("app-awaiting-first-business");
  if (awaitingBiz && sectionToShow !== "profil") sectionToShow = "personnaliser";
  showAppSection(sectionToShow);
  requestAnimationFrame(() => showAppSection(sectionToShow));
  initAppMobile();
}

function initAppMobile() {
  const appEl = document.getElementById("app-app");
  const tabBar = document.getElementById("app-mobile-tab-bar");
  const headerScanBtn = document.getElementById("app-mobile-scan-btn");
  const mobileLogout = document.getElementById("app-mobile-logout");
  const mobileMessageInput = document.getElementById("app-mobile-message-input");
  const mobileMessageSend = document.getElementById("app-mobile-message-send");

  function setMobileMode(isMobile) {
    appEl?.classList.toggle("app-mobile", isMobile);
  }
  const mq = window.matchMedia("(max-width: 768px)");
  setMobileMode(mq.matches);
  mq.addEventListener("change", (e) => setMobileMode(e.matches));

  tabBar?.querySelectorAll(".app-mobile-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const id = tab.getAttribute("data-mobile-tab");
      if (id && APP_SECTION_IDS.includes(id)) showAppSection(id);
    });
  });
  window.addEventListener("fidpass-mobile-tab", (e) => {
    const id = e.detail?.tab;
    if (id && APP_SECTION_IDS.includes(id)) showAppSection(id);
  });
  headerScanBtn?.addEventListener("click", () => { showAppSection("dashboard"); document.getElementById("app-dashboard-scanner-wrap")?.scrollIntoView({ behavior: "smooth" }); });

  document.querySelectorAll(".app-mobile-profil-item[data-section]").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const id = item.getAttribute("data-section");
      if (id) showAppSection(id);
    });
  });
  mobileLogout?.addEventListener("click", () => {
    clearAuthToken();
    window.location.replace("/");
  });

  if (mobileMessageSend && mobileMessageInput) {
    mobileMessageSend.addEventListener("click", () => {
      const text = (mobileMessageInput.value || "").trim();
      if (text) {
        showAppSection("notifications");
        const bannerMsg = document.getElementById("app-notification-banner-message");
        if (bannerMsg) bannerMsg.value = text;
      }
    });
  }

  const profileEmailEl = document.getElementById("app-mobile-profil-email");
  const userEmailEl = document.getElementById("app-user-email");
  if (profileEmailEl && userEmailEl) profileEmailEl.textContent = userEmailEl.textContent || "";
}

const DASHBOARD_TOKEN_STORAGE_KEY = "fidpass_dashboard_token";

function initAppDashboard(slug) {
  const urlParams = new URLSearchParams(window.location.search);
  let dashboardToken = urlParams.get("token");
  if (dashboardToken) {
    try {
      sessionStorage.setItem(`${DASHBOARD_TOKEN_STORAGE_KEY}_${slug}`, dashboardToken);
    } catch (_) {}
  } else {
    try {
      dashboardToken = sessionStorage.getItem(`${DASHBOARD_TOKEN_STORAGE_KEY}_${slug}`);
    } catch (_) {}
  }
  const api = (path, opts = {}) => {
    const sep = path.includes("?") ? "&" : "?";
    const url = `${API_BASE}/api/businesses/${encodeURIComponent(slug)}${path}${dashboardToken ? `${sep}token=${encodeURIComponent(dashboardToken)}` : ""}`;
    const headers = { ...opts.headers, ...getAuthHeaders() };
    if (dashboardToken) headers["X-Dashboard-Token"] = dashboardToken;
    return fetch(url, { ...opts, headers });
  };

  let sidebarLogoObjectUrl = null;
  function refreshSidebarBusinessLogo() {
    const img = document.getElementById("app-sidebar-business-logo");
    const fallback = document.getElementById("app-sidebar-logo-fallback");
    if (!img || !fallback) return;
    const businessLabel = () => {
      const raw = (document.getElementById("app-business-name")?.textContent || "").trim();
      const name = raw || "Mon commerce";
      return name.length > 26 ? `${name.slice(0, 24)}…` : name;
    };
    api("/logo?v=" + Date.now())
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (sidebarLogoObjectUrl) {
          try {
            URL.revokeObjectURL(sidebarLogoObjectUrl);
          } catch (_) {
            /* ignore */
          }
          sidebarLogoObjectUrl = null;
        }
        const label = businessLabel();
        if (blob && blob.size > 0) {
          sidebarLogoObjectUrl = URL.createObjectURL(blob);
          img.src = sidebarLogoObjectUrl;
          img.classList.remove("hidden");
          img.alt = label;
          fallback.classList.add("hidden");
        } else {
          img.removeAttribute("src");
          img.classList.add("hidden");
          fallback.textContent = label;
          fallback.classList.remove("hidden");
        }
      })
      .catch(() => {
        img.removeAttribute("src");
        img.classList.add("hidden");
        fallback.textContent = businessLabel();
        fallback.classList.remove("hidden");
      });
  }

  (function primeSidebarBrandFallback() {
    const fb = document.getElementById("app-sidebar-logo-fallback");
    if (!fb) return;
    const raw = (document.getElementById("app-business-name")?.textContent || "").trim();
    const name = raw || "Mon commerce";
    fb.textContent = name.length > 26 ? `${name.slice(0, 24)}…` : name;
  })();
  refreshSidebarBusinessLogo();

  const statMembers = document.getElementById("app-stat-members");
  const statPoints = document.getElementById("app-stat-points");
  const statTransactions = document.getElementById("app-stat-transactions");
  const statNew30 = document.getElementById("app-stat-new30");
  const statInactive30 = document.getElementById("app-stat-inactive30");
  const statAvgPoints = document.getElementById("app-stat-avg-points");
  const statRevenue = document.getElementById("app-stat-revenue");
  const statCardsActive = document.getElementById("app-stat-cards-active");
  const statRetention = document.getElementById("app-stat-retention");
  const statRecurrent = document.getElementById("app-stat-recurrent");
  const statActiveMembers = document.getElementById("app-stat-active-members");
  const statMembersSegment = document.getElementById("app-stat-members-segment");
  const statFrequency = document.getElementById("app-stat-frequency");
  const statInactive30Main = document.getElementById("app-stat-inactive30-main");
  const statAvgTicket = document.getElementById("app-stat-avg-ticket");
  const statRevenuePerActive = document.getElementById("app-stat-revenue-per-active");
  const dashboardPeriodLabelEl = document.getElementById("app-dashboard-period-label");
  const insightSummaryEl = document.getElementById("app-insight-summary");
  const insightFocusEl = document.getElementById("app-insight-focus");
  const insightActionEl = document.getElementById("app-insight-action");
  const insightConfidenceEl = document.getElementById("app-insight-confidence");
  const dashboardSimulateBtn = document.getElementById("app-dashboard-simulate");
  const dashboardSimulateState = document.getElementById("app-dashboard-simulate-state");
  const dashboardToggleDetailsBtn = document.getElementById("app-dashboard-toggle-details");
  const dashboardDetailsEl = document.getElementById("app-dashboard-details");
  const statRetentionEcho = document.getElementById("app-stat-retention-echo");
  const dashboardPeriodSelect = document.getElementById("app-dashboard-period-select");
  const dashboardPeriodPills = Array.from(document.querySelectorAll(".app-dashboard-period-pill"));
  const dashboardPeriodDisplay = document.getElementById("app-dashboard-period-display");
  let dashboardUseSimulatedData = false;
  const memberSearchInput = document.getElementById("app-member-search");
  const memberListEl = document.getElementById("app-member-list");
  const amountInput = document.getElementById("app-amount");
  const oneVisitBtn = document.getElementById("app-one-visit");
  const addPointsBtn = document.getElementById("app-add-points");
  const caisseMessage = document.getElementById("app-caisse-message");
  const membersSearchInput = document.getElementById("app-members-search");
  const membersListEl = document.getElementById("app-members-list");
  const membersEmptyEl = document.getElementById("app-members-empty");
  const dashboardScanCta = document.getElementById("app-dashboard-scan-cta");
  const dashboardSearchCta = document.getElementById("app-dashboard-search-cta");
  const dashboardNotifPill = document.getElementById("app-dashboard-notif-pill");
  const dashboardNotifCountEl = document.getElementById("app-dashboard-notif-count");
  const dashboardProfileBtn = document.getElementById("app-dashboard-profile-btn");

  const shareLinkEl = document.getElementById("app-share-link");
  const shareQrEl = document.getElementById("app-share-qr");
  const shareCopyBtn = document.getElementById("app-share-copy");
  const shareSlugInputEl = document.getElementById("app-share-slug-input");
  const shareSlugSaveBtn = document.getElementById("app-share-slug-save");
  const shareSlugMessageEl = document.getElementById("app-share-slug-message");

  const pageOrigin = (typeof window !== "undefined" && window.location.origin ? window.location.origin.replace(/\/$/, "") : "");
  function getShareLinkForSlug(value) {
    return `${pageOrigin}/fidelity/${value}`;
  }
  let currentShareSlug = slug || "";
  function renderShareCard(value) {
    if (!value) return;
    const fullShareLink = getShareLinkForSlug(value);
    if (shareLinkEl) shareLinkEl.value = fullShareLink;
    if (shareQrEl) shareQrEl.src = "https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=" + encodeURIComponent(fullShareLink);
    if (shareSlugInputEl) shareSlugInputEl.value = value;
  }
  function setShareSlugMessage(text, isError = false) {
    if (!shareSlugMessageEl) return;
    shareSlugMessageEl.textContent = text || "";
    shareSlugMessageEl.classList.toggle("hidden", !text);
    shareSlugMessageEl.classList.toggle("error", !!(text && isError));
    shareSlugMessageEl.classList.toggle("success", !!(text && !isError));
  }
  renderShareCard(currentShareSlug);
  if (shareCopyBtn) {
    shareCopyBtn.addEventListener("click", () => {
      if (!shareLinkEl) return;
      shareLinkEl.select();
      navigator.clipboard.writeText(shareLinkEl.value).then(() => {
        shareCopyBtn.textContent = "Copié !";
        setTimeout(() => { shareCopyBtn.textContent = "Copier"; }, 2000);
      });
    });
  }
  const shareDownloadQrBtn = document.getElementById("app-share-download-qr");

  // Raccourcis discrets en haut du dashboard : scroll vers scanner / recherche client
  if (dashboardScanCta) {
    dashboardScanCta.addEventListener("click", () => {
      // Ouvre directement le scanner plein écran (comme le gros bouton "Scanner le QR code")
      const launchBtn = document.getElementById("app-scanner-launch-btn");
      if (launchBtn) {
        launchBtn.click();
      } else if (typeof startFullscreenScanner === "function") {
        startFullscreenScanner();
      }
    });
  }
  if (dashboardSearchCta) {
    dashboardSearchCta.addEventListener("click", () => {
      const input = document.getElementById("app-member-search");
      if (input) {
        input.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => input.focus(), 350);
      }
    });
  }

  if (dashboardNotifPill && dashboardNotifCountEl) {
    const notifLabelEl = dashboardNotifPill.querySelector(".app-dashboard-notif-label");
    window.addEventListener("fidpass-dashboard-stats", (e) => {
      const stats = e.detail?.stats || {};
      const newMembers = stats.newMembersLast7Days ?? 0;
      if (newMembers > 0) {
        if (notifLabelEl) {
          notifLabelEl.textContent = `${newMembers} nouveaux`;
        }
        dashboardNotifCountEl.textContent = String(newMembers);
        dashboardNotifCountEl.classList.remove("hidden");
      } else {
        if (notifLabelEl) notifLabelEl.textContent = "Campagnes";
        dashboardNotifCountEl.classList.add("hidden");
      }
    });
    dashboardNotifPill.addEventListener("click", () => {
      // Ouvre la liste des membres, comme "Voir les membres / Voir les inactifs"
      showAppSection("membres");
      // Si le commerçant clique alors qu'il y a surtout des inactifs, on peut pré-filtrer
      const statsEvent = window._lastDashboardStats;
      const stats = statsEvent?.detail?.stats || {};
      if ((stats.inactiveMembers30Days ?? 0) > 0) {
        const filterEl = document.getElementById("app-members-filter");
        if (filterEl) {
          filterEl.value = "inactive30";
          window.dispatchEvent(new CustomEvent("app-members-refresh"));
        }
      }
    });
  }

  if (dashboardProfileBtn) {
    dashboardProfileBtn.addEventListener("click", () => {
      showAppSection("profil");
    });
  }

  // Bouton "Afficher plus de données" : toggle panneau avec catégories
  const dashboardMoreWrap = document.getElementById("app-dashboard-more-wrap");
  const dashboardMoreBtn = document.getElementById("app-dashboard-more-btn");
  const dashboardMorePanel = document.getElementById("app-dashboard-more-panel");
  const dashboardMoreLabel = document.getElementById("app-dashboard-more-label");
  if (dashboardMoreBtn && dashboardMoreWrap && dashboardMorePanel) {
    dashboardMoreBtn.addEventListener("click", () => {
      const isOpen = dashboardMoreWrap.classList.toggle("is-open");
      dashboardMoreBtn.setAttribute("aria-expanded", String(isOpen));
      dashboardMorePanel.setAttribute("aria-hidden", String(!isOpen));
      if (dashboardMoreLabel) dashboardMoreLabel.textContent = isOpen ? "Masquer les indicateurs" : "Afficher plus de données";
    });
  }

  // Barre de recherche en haut du Dashboard : proxy vers la recherche de membres
  const dashboardInlineSearch = document.getElementById("app-dashboard-inline-search");
  if (dashboardInlineSearch) {
    dashboardInlineSearch.addEventListener("focus", () => {
      const membersSearch = document.getElementById("app-members-search") || document.getElementById("app-member-search");
      if (membersSearch) {
        membersSearch.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
    dashboardInlineSearch.addEventListener("input", () => {
      const value = dashboardInlineSearch.value;
      const membersSearch = document.getElementById("app-members-search") || document.getElementById("app-member-search");
      if (membersSearch) {
        membersSearch.value = value;
        membersSearch.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
  }
  /** Ouvre Personnaliser → Partager et préremplit le slug (ex. depuis Profil). */
  function openPersonnaliserShareWithSuggestedSlug(suggestedRaw) {
    const suggested = slugify(suggestedRaw || currentShareSlug || "ma-carte");
    showAppSection("personnaliser");
    const acc = document.getElementById("app-personnaliser-accordion");
    if (acc) {
      const groups = acc.querySelectorAll("[data-personnaliser-group]");
      groups.forEach((group) => {
        const isShare = group.getAttribute("data-personnaliser-step") === "share";
        group.classList.toggle("is-open", !!isShare);
        const toggle = group.querySelector(".app-personnaliser-group-toggle");
        if (toggle) toggle.setAttribute("aria-expanded", isShare ? "true" : "false");
      });
    }
    requestAnimationFrame(() => {
      if (shareSlugInputEl) {
        shareSlugInputEl.value = suggested;
        shareSlugInputEl.focus();
        shareSlugInputEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      setShareSlugMessage(
        "Vérifiez le lien proposé puis cliquez sur « Mettre à jour ». Attention : les anciens QR et liens cesseront de fonctionner.",
        false
      );
      schedulePersonnaliserGroupStatusRefresh();
    });
  }

  if (shareSlugSaveBtn) {
    shareSlugSaveBtn.addEventListener("click", async () => {
      const proposed = slugify(shareSlugInputEl?.value || "");
      if (!proposed || proposed.length < 3) {
        setShareSlugMessage("Le lien doit contenir au moins 3 caractères (lettres/chiffres/tirets).", true);
        return;
      }
      if (proposed === currentShareSlug) {
        setShareSlugMessage("Ce lien est déjà actif.");
        return;
      }
      shareSlugSaveBtn.disabled = true;
      setShareSlugMessage("");
      try {
        const res = await api("", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: proposed }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = data.error || (res.status === 409 ? "Ce lien est déjà pris." : "Impossible de modifier le lien.");
          setShareSlugMessage(msg, true);
          return;
        }
        currentShareSlug = data.slug || proposed;
        renderShareCard(currentShareSlug);
        clearAppSectionDirty("personnaliser");
        setShareSlugMessage("Lien mis à jour. Rechargement de la page…");
        setTimeout(() => {
          window.location.reload();
        }, 900);
      } catch (_) {
        setShareSlugMessage("Erreur réseau. Réessayez.", true);
      } finally {
        shareSlugSaveBtn.disabled = false;
      }
    });
  }
  if (shareDownloadQrBtn && shareQrEl) {
    shareDownloadQrBtn.addEventListener("click", () => {
      const canvas = document.createElement("canvas");
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const a = document.createElement("a");
        a.download = "fidpass-qr-" + currentShareSlug + ".png";
        a.href = canvas.toDataURL("image/png");
        a.click();
      };
      img.src = shareQrEl.src;
    });
  }

  const integrationBaseUrlEl = document.getElementById("app-integration-base-url");
  const integrationSlugEl = document.getElementById("app-integration-slug");
  const integrationCurlEl = document.getElementById("app-integration-curl");
  const integrationPrestataireLinkEl = document.getElementById("app-integration-prestataire-link");
  const origin = typeof window !== "undefined" && window.location.origin ? window.location.origin.replace(/\/$/, "") : "";
  if (integrationBaseUrlEl) integrationBaseUrlEl.value = API_BASE || "https://api.myfidpass.fr";
  if (integrationSlugEl) integrationSlugEl.value = slug || "";
  const prestatairePageUrl = `${origin}/integration?slug=${encodeURIComponent(slug || "")}`;
  if (integrationPrestataireLinkEl) integrationPrestataireLinkEl.value = prestatairePageUrl;
  const integrationOpenPageEl = document.getElementById("app-integration-open-page");
  if (integrationOpenPageEl) integrationOpenPageEl.href = prestatairePageUrl;
  const walletPreviewQr = document.getElementById("app-wallet-preview-qr");
  if (walletPreviewQr && currentShareSlug) {
    const fullShareLink = getShareLinkForSlug(currentShareSlug);
    walletPreviewQr.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(fullShareLink)}`;
    walletPreviewQr.alt = "QR code — scannez pour ajouter la carte à Apple Wallet";
  }
  if (integrationCurlEl) {
    integrationCurlEl.textContent = `curl -X POST "${API_BASE || "https://api.myfidpass.fr"}/api/businesses/${slug || "VOTRE_SLUG"}/integration/scan" \\
  -H "Content-Type: application/json" \\
  -H "X-Dashboard-Token: VOTRE_TOKEN" \\
  -d '{"barcode":"UUID-DU-MEMBRE","amount_eur":12.50}'`;
  }
  document.getElementById("app-integration-copy-base")?.addEventListener("click", () => {
    if (!integrationBaseUrlEl) return;
    integrationBaseUrlEl.select();
    navigator.clipboard.writeText(integrationBaseUrlEl.value);
  });
  document.getElementById("app-integration-copy-prestataire-link")?.addEventListener("click", () => {
    if (!integrationPrestataireLinkEl) return;
    integrationPrestataireLinkEl.select();
    navigator.clipboard.writeText(integrationPrestataireLinkEl.value).then(() => {
      const btn = document.getElementById("app-integration-copy-prestataire-link");
      if (btn) { btn.textContent = "Copié !"; setTimeout(() => { btn.textContent = "Copier le lien"; }, 2000); }
    });
  });
  document.getElementById("app-integration-copy-curl")?.addEventListener("click", () => {
    if (!integrationCurlEl) return;
    navigator.clipboard.writeText(integrationCurlEl.textContent);
  });

  initIntegrationHub({
    slug: slug || "",
    apiBase: API_BASE || "https://api.myfidpass.fr",
    origin,
  });

  // ——— Carte & périmètre ———
  (function initCartePerimetre() {
    const mapEl = document.getElementById("app-perimetre-map");
    const addressInput = document.getElementById("app-perimetre-address");
    const addressHint = document.getElementById("app-perimetre-address-hint");
    const suggestionsEl = document.getElementById("app-perimetre-suggestions");
    const defaultSuggestionEl = document.getElementById("app-perimetre-default-suggestion");
    const defaultAddressTextEl = document.getElementById("app-perimetre-default-address-text");
    const useDefaultBtn = document.getElementById("app-perimetre-use-default");
    const geolocBtn = document.getElementById("app-perimetre-geoloc");
    const radiusSlider = document.getElementById("app-perimetre-radius");
    const radiusValueEl = document.getElementById("app-perimetre-radius-value");
    const saveBtn = document.getElementById("app-perimetre-save");
    const saveFeedback = document.getElementById("app-perimetre-save-feedback");
    const perimetreNotifTitleEl = document.getElementById("app-perimetre-notif-title");
    const perimetreNotifMessageEl = document.getElementById("app-perimetre-notif-message");
    const walletIncludeLocationsEl = document.getElementById("app-perimetre-wallet-include-locations");
    const mapWrap = document.querySelector(".app-carte-perimetre-map-wrap");
    const mapHintEl = document.getElementById("app-perimetre-map-hint");
    if (!mapEl || !radiusSlider || !saveBtn) return;

    const mapboxToken = (typeof import.meta.env !== "undefined" && import.meta.env.VITE_MAPBOX_ACCESS_TOKEN) ? String(import.meta.env.VITE_MAPBOX_ACCESS_TOKEN).trim() : "";
    const useMapbox = !!(mapboxToken && typeof mapboxgl !== "undefined");

    let perimetreMap = null;
    let perimetreMarker = null;
    let perimetreCircle = null;
    let perimetreMapboxCircleId = null;
    let currentLat = null;
    let currentLng = null;
    let currentAddress = "";
    let currentRadiusM = LOCATION_RADIUS_DEFAULT_M;
    let autocompleteAbort = null;
    let autocompleteDebounce = null;
    let defaultSuggestionData = null;
    let savedPerimetreState = null;

    const DEFAULT_CENTER = [48.8566, 2.3522];
    function circleGeoJSON(lat, lng, radiusMeters) {
      const km = radiusMeters / 1000;
      const points = [];
      for (let i = 0; i <= 64; i++) {
        const angle = (i / 64) * 2 * Math.PI;
        const latOffset = (km / 111.32) * Math.cos(angle);
        const lngOffset = (km / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.sin(angle);
        points.push([lng + lngOffset, lat + latOffset]);
      }
      return { type: "Feature", geometry: { type: "Polygon", coordinates: [points] } };
    }
    const PHOTON_URL = "https://photon.komoot.io/api/";
    const NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse";
    const AUTCOMPLETE_DEBOUNCE_MS = 320;
    const MIN_QUERY_LENGTH = 2;

    function normalizePerimetreText(value) {
      return String(value || "").trim();
    }

    function getPerimetreDraftState() {
      return {
        lat: currentLat != null ? Number(currentLat) : null,
        lng: currentLng != null ? Number(currentLng) : null,
        radius: clampLocationRadiusMetersClient(currentRadiusM),
        address: normalizePerimetreText((addressInput?.value ?? currentAddress) || ""),
        notifTitle: normalizePerimetreText(perimetreNotifTitleEl?.value),
        notifMessage: normalizePerimetreText(perimetreNotifMessageEl?.value),
        walletIncludeLocations: !!(walletIncludeLocationsEl && walletIncludeLocationsEl.checked),
      };
    }

    function isSamePerimetreState(a, b) {
      if (!a || !b) return false;
      const coordEquals = (x, y) => {
        if (x == null && y == null) return true;
        if (x == null || y == null) return false;
        return Math.abs(Number(x) - Number(y)) < 0.000001;
      };
      return (
        coordEquals(a.lat, b.lat) &&
        coordEquals(a.lng, b.lng) &&
        Number(a.radius) === Number(b.radius) &&
        normalizePerimetreText(a.address) === normalizePerimetreText(b.address) &&
        normalizePerimetreText(a.notifTitle) === normalizePerimetreText(b.notifTitle) &&
        normalizePerimetreText(a.notifMessage) === normalizePerimetreText(b.notifMessage) &&
        !!a.walletIncludeLocations === !!b.walletIncludeLocations
      );
    }

    function hasPerimetreChanges() {
      if (!savedPerimetreState) return false;
      return !isSamePerimetreState(savedPerimetreState, getPerimetreDraftState());
    }

    function refreshPerimetreSaveButtonState() {
      saveBtn.disabled = !hasPerimetreChanges();
      refreshAppSaveCtaDirtyVisual("carte-perimetre");
    }

    function formatPhotonAddress(props) {
      if (!props) return "";
      const name = props.name || "";
      const street = [props.street, props.housenumber].filter(Boolean).join(" ");
      const cityPart = [props.postcode, props.city].filter(Boolean).join(" ");
      const parts = [name || street, cityPart, props.country].filter(Boolean);
      return parts.join(", ");
    }

    function showSaveFeedback(msg, isError = false) {
      if (!saveFeedback) return;
      saveFeedback.textContent = msg;
      saveFeedback.classList.remove("hidden", "success", "error");
      if (isError) saveFeedback.classList.add("error"); else saveFeedback.classList.add("success");
      saveFeedback.classList.remove("hidden");
    }
    function showAddressHint(msg, isError = false) {
      if (addressHint) {
        addressHint.textContent = msg || "";
        addressHint.classList.toggle("hidden", !msg);
        addressHint.classList.toggle("error", isError);
      }
    }

    function hideSuggestions() {
      if (suggestionsEl) {
        suggestionsEl.classList.add("hidden");
        suggestionsEl.innerHTML = "";
        addressInput?.setAttribute("aria-expanded", "false");
      }
    }

    function applySuggestion(lat, lng, displayAddress) {
      currentLat = lat;
      currentLng = lng;
      if (displayAddress) currentAddress = displayAddress;
      if (addressInput) addressInput.value = displayAddress || addressInput.value;
      hideSuggestions();
      showAddressHint("");
      const section = document.getElementById("carte-perimetre");
      if (section?.classList.contains("app-section-visible")) initMap(lat, lng);
      setCenter(lat, lng, displayAddress);
      refreshPerimetreSaveButtonState();
    }

    function updateRadiusUI(m) {
      const c = clampLocationRadiusMetersClient(m);
      currentRadiusM = c;
      if (radiusValueEl) radiusValueEl.textContent = c + " m";
      if (radiusSlider) radiusSlider.value = String(c);
      if (useMapbox && perimetreMap && perimetreMap.getSource("perimetre-circle") && currentLat != null && currentLng != null) {
        perimetreMap.getSource("perimetre-circle").setData(circleGeoJSON(currentLat, currentLng, c));
      }
      if (!useMapbox && perimetreCircle && currentLat != null && currentLng != null) {
        perimetreCircle.setRadius(c);
      }
      refreshPerimetreSaveButtonState();
    }

    function setCenter(lat, lng, addressText) {
      currentLat = lat;
      currentLng = lng;
      if (addressText != null) currentAddress = addressText;
      if (addressInput && addressText != null) addressInput.value = addressText;
      if (!perimetreMap) return;
      if (useMapbox) {
        perimetreMap.flyTo({ center: [lng, lat], zoom: Math.max(15, perimetreMap.getZoom()), pitch: 55, bearing: -17 });
        if (perimetreMarker) perimetreMarker.setLngLat([lng, lat]);
        if (perimetreMap.getSource("perimetre-circle")) {
          perimetreMap.getSource("perimetre-circle").setData(circleGeoJSON(lat, lng, currentRadiusM));
        }
      } else {
        perimetreMap.setView([lat, lng], perimetreMap.getZoom() < 14 ? 14 : perimetreMap.getZoom());
        if (perimetreMarker) perimetreMarker.setLatLng([lat, lng]);
        else if (typeof L !== "undefined") {
          const mhtml = `<span class="app-perimetre-marker-pin"><svg viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 24 12 24s12-15 12-24C24 5.37 18.63 0 12 0z" fill="#1e3a8a"/><circle cx="12" cy="12" r="5" fill="#fff"/></svg></span>`;
          const micon = L.divIcon({ html: mhtml, className: "app-perimetre-marker-icon", iconSize: [32, 44], iconAnchor: [16, 44] });
          perimetreMarker = L.marker([lat, lng], { icon: micon }).addTo(perimetreMap);
        }
        if (perimetreCircle) perimetreCircle.setLatLng([lat, lng]).setRadius(currentRadiusM);
        else if (typeof L !== "undefined") {
          perimetreCircle = L.circle([lat, lng], { radius: currentRadiusM, color: "#1e3a8a", fillColor: "#1e3a8a", fillOpacity: 0.12, weight: 2.5 }).addTo(perimetreMap);
        }
      }
      if (mapWrap) mapWrap.classList.add("has-map");
      if (mapHintEl) mapHintEl.classList.add("hidden");
    }

    function initMap(centerLat, centerLng) {
      const lat = centerLat != null ? centerLat : DEFAULT_CENTER[0];
      const lng = centerLng != null ? centerLng : DEFAULT_CENTER[1];

      if (useMapbox) {
        if (perimetreMap) {
          perimetreMap.flyTo({ center: [lng, lat], zoom: 15, pitch: 55, bearing: -17 });
          if (perimetreMarker) perimetreMarker.setLngLat([lng, lat]);
          if (perimetreMap.getSource("perimetre-circle")) {
            perimetreMap.getSource("perimetre-circle").setData(circleGeoJSON(lat, lng, currentRadiusM));
          }
          if (mapWrap) mapWrap.classList.add("has-map");
          if (mapHintEl) mapHintEl.classList.add("hidden");
          return;
        }
        mapboxgl.accessToken = mapboxToken;
        perimetreMap = new mapboxgl.Map({
          container: mapEl,
          style: "mapbox://styles/mapbox/dark-v11",
          center: [lng, lat],
          zoom: 15.2,
          pitch: 52,
          bearing: -17,
          antialias: true,
        });
        perimetreMap.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
        perimetreMarker = new mapboxgl.Marker({ color: "#1e3a8a" }).setLngLat([lng, lat]).addTo(perimetreMap);
        perimetreMap.on("load", () => {
          try {
            if (!perimetreMap.getSource("mapbox-dem")) {
              perimetreMap.addSource("mapbox-dem", {
                type: "raster-dem",
                url: "mapbox://mapbox.mapbox-terrain-dem-v1",
                tileSize: 512,
                maxzoom: 14,
              });
            }
            perimetreMap.setTerrain({ source: "mapbox-dem", exaggeration: 1.1 });
          } catch (_) {}
          const layers = perimetreMap.getStyle().layers;
          const labelLayerId = layers.find((layer) => layer.type === "symbol" && layer.layout && layer.layout["text-field"])?.id;
          if (labelLayerId) {
            perimetreMap.addLayer({
              id: "add-3d-buildings",
              source: "composite",
              "source-layer": "building",
              filter: ["==", "extrude", "true"],
              type: "fill-extrusion",
              minzoom: 14,
              paint: {
                "fill-extrusion-color": "#3d3d3d",
                "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 14, 0, 14.05, ["get", "height"]],
                "fill-extrusion-base": ["interpolate", ["linear"], ["zoom"], 14, 0, 14.05, ["get", "min_height"]],
                "fill-extrusion-opacity": 0.9,
              },
            }, labelLayerId);
          }
          perimetreMap.addSource("perimetre-circle", { type: "geojson", data: circleGeoJSON(lat, lng, currentRadiusM) });
          perimetreMap.addLayer({
            id: "perimetre-circle-fill",
            type: "fill",
            source: "perimetre-circle",
            paint: { "fill-color": "#1e3a8a", "fill-opacity": 0.2 },
          });
          perimetreMap.addLayer({
            id: "perimetre-circle-line",
            type: "line",
            source: "perimetre-circle",
            paint: { "line-color": "#1e3a8a", "line-width": 3 },
          });
        });
        perimetreMap.on("click", (e) => {
          const { lng: lng_, lat: lat_ } = e.lngLat;
          currentLat = lat_;
          currentLng = lng_;
          perimetreMarker.setLngLat([lng_, lat_]);
          if (perimetreMap.getSource("perimetre-circle")) {
            perimetreMap.getSource("perimetre-circle").setData(circleGeoJSON(lat_, lng_, currentRadiusM));
          }
          fetch(`${NOMINATIM_REVERSE}?lat=${lat_}&lon=${lng_}&format=json`).then((r) => r.json()).then((data) => {
            const addr = data?.address;
            const parts = [addr?.road, addr?.suburb, addr?.city, addr?.country].filter(Boolean);
            const str = parts.length ? parts.join(", ") : `${lat_.toFixed(5)}, ${lng_.toFixed(5)}`;
            currentAddress = str;
            if (addressInput) addressInput.value = str;
          refreshPerimetreSaveButtonState();
          }).catch(() => { currentAddress = `${lat_.toFixed(5)}, ${lng_.toFixed(5)}`; if (addressInput) addressInput.value = currentAddress; });
          refreshPerimetreSaveButtonState();
        });
        if (mapWrap) mapWrap.classList.add("has-map");
        if (mapHintEl) mapHintEl.classList.add("hidden");
        return;
      }

      if (typeof L === "undefined") return;
      if (perimetreMap) {
        perimetreMap.setView([lat, lng], 14);
        const mhtml = `<span class="app-perimetre-marker-pin"><svg viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 24 12 24s12-15 12-24C24 5.37 18.63 0 12 0z" fill="#1e3a8a"/><circle cx="12" cy="12" r="5" fill="#fff"/></svg></span>`;
        const micon = L.divIcon({ html: mhtml, className: "app-perimetre-marker-icon", iconSize: [32, 44], iconAnchor: [16, 44] });
        if (perimetreMarker) perimetreMarker.setLatLng([lat, lng]);
        else perimetreMarker = L.marker([lat, lng], { icon: micon }).addTo(perimetreMap);
        if (perimetreCircle) perimetreCircle.setLatLng([lat, lng]).setRadius(currentRadiusM);
        else perimetreCircle = L.circle([lat, lng], { radius: currentRadiusM, color: "#1e3a8a", fillColor: "#1e3a8a", fillOpacity: 0.12, weight: 2.5 }).addTo(perimetreMap);
        perimetreMap.invalidateSize();
        if (mapWrap) mapWrap.classList.add("has-map");
        if (mapHintEl) mapHintEl.classList.add("hidden");
        return;
      }
      perimetreMap = L.map(mapEl, { center: [lat, lng], zoom: 14, scrollWheelZoom: true, zoomControl: false });
      L.control.zoom({ position: "topright" }).addTo(perimetreMap);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap © CARTO",
        subdomains: "abcd",
        maxZoom: 20,
        maxNativeZoom: 19,
      }).addTo(perimetreMap);
      const markerHtml = `<span class="app-perimetre-marker-pin" aria-hidden="true"><svg viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 24 12 24s12-15 12-24C24 5.37 18.63 0 12 0z" fill="#1e3a8a"/><circle cx="12" cy="12" r="5" fill="#fff"/></svg></span>`;
      const markerIcon = L.divIcon({ html: markerHtml, className: "app-perimetre-marker-icon", iconSize: [32, 44], iconAnchor: [16, 44] });
      perimetreMarker = L.marker([lat, lng], { icon: markerIcon }).addTo(perimetreMap);
      perimetreCircle = L.circle([lat, lng], { radius: currentRadiusM, color: "#1e3a8a", fillColor: "#1e3a8a", fillOpacity: 0.12, weight: 2.5 }).addTo(perimetreMap);
      perimetreMap.on("click", (e) => {
        currentLat = e.latlng.lat;
        currentLng = e.latlng.lng;
        perimetreMarker.setLatLng(e.latlng);
        perimetreCircle.setLatLng(e.latlng).setRadius(currentRadiusM);
        fetch(`${NOMINATIM_REVERSE}?lat=${e.latlng.lat}&lon=${e.latlng.lng}&format=json`).then((r) => r.json()).then((data) => {
          const addr = data?.address;
          const parts = [addr?.road, addr?.suburb, addr?.city, addr?.country].filter(Boolean);
          const str = parts.length ? parts.join(", ") : `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`;
          currentAddress = str;
          if (addressInput) addressInput.value = str;
          refreshPerimetreSaveButtonState();
        }).catch(() => { currentAddress = `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`; if (addressInput) addressInput.value = currentAddress; });
        refreshPerimetreSaveButtonState();
      });
      if (mapWrap) mapWrap.classList.add("has-map");
      if (mapHintEl) mapHintEl.classList.add("hidden");
    }

    function fetchPhotonSuggestions(query, callback) {
      if (autocompleteAbort) autocompleteAbort.abort();
      autocompleteAbort = new AbortController();
      const q = encodeURIComponent(query.trim());
      if (q.length < MIN_QUERY_LENGTH) { callback([]); return; }
      fetch(`${PHOTON_URL}?q=${q}&limit=6&lang=fr`, { signal: autocompleteAbort.signal })
        .then((r) => r.json())
        .then((data) => {
          const features = data?.features || [];
          callback(features);
        })
        .catch((err) => { if (err.name !== "AbortError") callback([]); });
    }

    function escapeHtmlPerimetre(s) {
      if (s == null) return "";
      const div = document.createElement("div");
      div.textContent = String(s);
      return div.innerHTML;
    }
    function renderSuggestions(features) {
      if (!suggestionsEl) return;
      suggestionsEl.innerHTML = "";
      if (!features.length) { hideSuggestions(); return; }
      features.forEach((f) => {
        const coords = f.geometry?.coordinates;
        if (!coords || coords.length < 2) return;
        const lng = coords[0];
        const lat = coords[1];
        const props = f.properties || {};
        const main = props.name || [props.street, props.housenumber].filter(Boolean).join(" ") || "Adresse";
        const sub = [props.postcode, props.city, props.country].filter(Boolean).join(", ");
        const li = document.createElement("li");
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", "false");
        li.setAttribute("data-lat", String(lat));
        li.setAttribute("data-lng", String(lng));
        li.setAttribute("data-address", formatPhotonAddress(props));
        li.innerHTML = sub ? `${escapeHtmlPerimetre(main)}<small>${escapeHtmlPerimetre(sub)}</small>` : escapeHtmlPerimetre(main);
        li.addEventListener("click", () => {
          applySuggestion(lat, lng, formatPhotonAddress(props));
        });
        suggestionsEl.appendChild(li);
      });
      suggestionsEl.classList.remove("hidden");
      addressInput?.setAttribute("aria-expanded", "true");
    }

    async function loadPerimetreSettings() {
      try {
        const res = await api("/dashboard/settings");
        if (!res.ok) return;
        const data = await res.json();
        const lat = data.location_lat != null ? Number(data.location_lat) : null;
        const lng = data.location_lng != null ? Number(data.location_lng) : null;
        const radius =
          data.location_radius_meters != null
            ? clampLocationRadiusMetersClient(data.location_radius_meters)
            : LOCATION_RADIUS_DEFAULT_M;
        const address = data.location_address || "";
        const notifTitleRaw = data.notification_title_override ?? data.notificationTitleOverride ?? "";
        const notifMessage = data.notification_change_message ?? data.notificationChangeMessage ?? "";
        currentAddress = address;
        const organizationName = (data.organization_name || "").trim();
        const notifTitle = String(notifTitleRaw).trim() || organizationName;
        const walletLoc =
          data.wallet_pass_include_locations != null ? Number(data.wallet_pass_include_locations) : 0;
        if (addressInput) addressInput.value = address;
        if (perimetreNotifTitleEl) perimetreNotifTitleEl.value = notifTitle;
        if (perimetreNotifMessageEl) perimetreNotifMessageEl.value = notifMessage;
        if (walletIncludeLocationsEl) walletIncludeLocationsEl.checked = walletLoc === 1;
        updateRadiusUI(radius);
        if (lat != null && lng != null) {
          currentLat = lat;
          currentLng = lng;
          const section = document.getElementById("carte-perimetre");
          if (section?.classList.contains("app-section-visible")) initMap(lat, lng);
          if (defaultSuggestionEl) defaultSuggestionEl.classList.add("hidden");
          defaultSuggestionData = null;
          savedPerimetreState = getPerimetreDraftState();
          refreshPerimetreSaveButtonState();
          return;
        }
        /** @param {string} query @param {{ showSuggestionBanner?: boolean }} opts */
        async function geocodePerimetreQuery(query, opts = {}) {
          const showSuggestionBanner = opts.showSuggestionBanner !== false;
          const q = String(query || "").trim();
          if (q.length < 2) return false;
          const url = `${PHOTON_URL}?q=${encodeURIComponent(q)}&limit=1&lang=fr`;
          try {
            const r = await fetch(url);
            const json = await r.json();
            const features = json?.features || [];
            if (features.length === 0) return false;
            const f = features[0];
            const coords = f.geometry?.coordinates;
            if (!coords || coords.length < 2) return false;
            const resolvedAddress = formatPhotonAddress(f.properties || {});
            currentLat = coords[1];
            currentLng = coords[0];
            currentAddress = resolvedAddress;
            if (addressInput) addressInput.value = currentAddress;
            const section = document.getElementById("carte-perimetre");
            if (section?.classList.contains("app-section-visible")) initMap(currentLat, currentLng);
            if (showSuggestionBanner) {
              defaultSuggestionData = { lat: currentLat, lng: currentLng, address: resolvedAddress };
              if (defaultAddressTextEl) defaultAddressTextEl.textContent = resolvedAddress;
              if (defaultSuggestionEl) defaultSuggestionEl.classList.remove("hidden");
            } else {
              defaultSuggestionData = null;
              if (defaultSuggestionEl) defaultSuggestionEl.classList.add("hidden");
            }
            return true;
          } catch (_) {
            return false;
          }
        }
        const addrTrim = (address || "").trim();
        let geocoded = await geocodePerimetreQuery(addrTrim, { showSuggestionBanner: false });
        if (!geocoded && organizationName && organizationName.length >= 2) {
          geocoded = await geocodePerimetreQuery(organizationName);
        }
        if (!geocoded && defaultSuggestionEl) defaultSuggestionEl.classList.add("hidden");
        savedPerimetreState = getPerimetreDraftState();
        refreshPerimetreSaveButtonState();
      } catch (_) {}
    }

    if (addressInput) {
      addressInput.addEventListener("input", () => {
        if (autocompleteDebounce) clearTimeout(autocompleteDebounce);
        const q = (addressInput.value || "").trim();
        refreshPerimetreSaveButtonState();
        if (q.length < MIN_QUERY_LENGTH) { hideSuggestions(); return; }
        autocompleteDebounce = setTimeout(() => {
          fetchPhotonSuggestions(q, (features) => renderSuggestions(features));
        }, AUTCOMPLETE_DEBOUNCE_MS);
      });

      addressInput.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { hideSuggestions(); return; }
        const items = suggestionsEl?.querySelectorAll("li[data-lat]") || [];
        if (e.key === "ArrowDown") {
          e.preventDefault();
          const current = suggestionsEl?.querySelector("li[aria-selected='true']");
          const next = current?.nextElementSibling || items[0];
          if (next) {
            items.forEach((el) => el.setAttribute("aria-selected", "false"));
            next.setAttribute("aria-selected", "true");
            next.scrollIntoView({ block: "nearest" });
          }
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          const current = suggestionsEl?.querySelector("li[aria-selected='true']");
          const prev = current?.previousElementSibling || items[items.length - 1];
          if (prev) {
            items.forEach((el) => el.setAttribute("aria-selected", "false"));
            prev.setAttribute("aria-selected", "true");
            prev.scrollIntoView({ block: "nearest" });
          }
          return;
        }
        if (e.key === "Enter") {
          const selected = suggestionsEl?.querySelector("li[aria-selected='true']") || items[0];
          if (selected) {
            e.preventDefault();
            selected.click();
          }
        }
      });

      addressInput.addEventListener("focus", () => {
        const q = (addressInput.value || "").trim();
        if (q.length >= MIN_QUERY_LENGTH) fetchPhotonSuggestions(q, (features) => renderSuggestions(features));
      });
    }

    document.addEventListener("click", (e) => {
      if (suggestionsEl && !suggestionsEl.classList.contains("hidden") && !addressInput?.contains(e.target) && !suggestionsEl.contains(e.target)) {
        hideSuggestions();
      }
    });

    useDefaultBtn?.addEventListener("click", () => {
      if (!defaultSuggestionData) return;
      applySuggestion(defaultSuggestionData.lat, defaultSuggestionData.lng, defaultSuggestionData.address);
      if (defaultSuggestionEl) defaultSuggestionEl.classList.add("hidden");
      defaultSuggestionData = null;
    });

    geolocBtn?.addEventListener("click", () => {
      if (!navigator.geolocation) { showAddressHint("Géolocalisation non supportée.", true); return; }
      showAddressHint("Localisation…");
      geolocBtn.disabled = true;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          showAddressHint("");
          const section = document.getElementById("carte-perimetre");
          if (section?.classList.contains("app-section-visible")) initMap(lat, lng);
          setCenter(lat, lng, null);
          fetch(`${NOMINATIM_REVERSE}?lat=${lat}&lon=${lng}&format=json`).then((r) => r.json()).then((data) => {
            const addr = data?.address;
            const parts = [addr?.road, addr?.suburb, addr?.city, addr?.country].filter(Boolean);
            if (addressInput) addressInput.value = parts.length ? parts.join(", ") : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
            refreshPerimetreSaveButtonState();
          }).catch(() => { if (addressInput) addressInput.value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`; });
          refreshPerimetreSaveButtonState();
          geolocBtn.disabled = false;
        },
        () => { showAddressHint("Impossible d’obtenir la position.", true); geolocBtn.disabled = false; },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });

    radiusSlider.addEventListener("input", () => {
      const m = clampLocationRadiusMetersClient(parseInt(radiusSlider.value, 10));
      updateRadiusUI(m);
    });

    perimetreNotifTitleEl?.addEventListener("input", refreshPerimetreSaveButtonState);
    perimetreNotifMessageEl?.addEventListener("input", refreshPerimetreSaveButtonState);
    walletIncludeLocationsEl?.addEventListener("change", refreshPerimetreSaveButtonState);

    saveBtn.addEventListener("click", async () => {
      saveBtn.disabled = true;
      if (saveFeedback) saveFeedback.classList.add("hidden");
      try {
        // Ne pas envoyer organization_name ici : le titre périmètre est notification_title_override uniquement.
        // Envoyer organization_name vide depuis ce formulaire écrasait le nom d’établissement (Profil) et pouvait faire échouer l’API.
        const payload = {
          notification_title_override: perimetreNotifTitleEl?.value?.trim() || null,
          notification_change_message: perimetreNotifMessageEl?.value?.trim() || null,
          wallet_pass_include_locations: walletIncludeLocationsEl?.checked ? 1 : 0,
        };
        if (currentLat != null && currentLng != null) {
          payload.location_lat = currentLat;
          payload.location_lng = currentLng;
          payload.location_radius_meters = currentRadiusM;
          payload.location_address = ((addressInput?.value ?? currentAddress) || "").trim() || undefined;
        }
        const res = await api("/dashboard/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok || res.status === 204) {
          const bannerTitle = document.getElementById("app-notification-banner-title");
          const bannerMessage = document.getElementById("app-notification-banner-message");
          if (bannerTitle && perimetreNotifTitleEl) bannerTitle.value = perimetreNotifTitleEl.value;
          if (bannerMessage && perimetreNotifMessageEl) bannerMessage.value = perimetreNotifMessageEl.value;
          if (typeof updateAppNotificationPreview === "function") updateAppNotificationPreview();
          savedPerimetreState = getPerimetreDraftState();
          showSaveFeedback("Enregistré. Le périmètre et le message d'entrée sont à jour.");
          notifyAppSectionSaveSuccess("carte-perimetre");
        } else {
          const data = await res.json().catch(() => ({}));
          showSaveFeedback(data.error || "Erreur lors de l’enregistrement.", true);
        }
      } catch (err) {
        if (typeof console !== "undefined" && console.error) console.error("[fidpass] périmètre save:", err);
        showSaveFeedback("Erreur réseau.", true);
      }
      refreshPerimetreSaveButtonState();
    });

    window.addEventListener("app-section-change", (e) => {
      if (e.detail?.sectionId !== "carte-perimetre") return;
      loadPerimetreSettings();
      if (currentLat != null && currentLng != null) setTimeout(() => initMap(currentLat, currentLng), 100);
    });

    if (document.getElementById("carte-perimetre")?.classList.contains("app-section-visible")) loadPerimetreSettings();
    savedPerimetreState = getPerimetreDraftState();
    refreshPerimetreSaveButtonState();
    registerAppExternalDirty("carte-perimetre", hasPerimetreChanges);
    registerAppDiscardHandler("carte-perimetre", loadPerimetreSettings);
  })();

  // ——— Personnaliser la carte ———
  let currentOrganizationName = "Votre commerce";
  const personnaliserOrg = document.getElementById("app-personnaliser-org");
  const personnaliserBg = document.getElementById("app-personnaliser-bg");
  const personnaliserBgHex = document.getElementById("app-personnaliser-bg-hex");
  const personnaliserFg = document.getElementById("app-personnaliser-fg");
  const personnaliserFgHex = document.getElementById("app-personnaliser-fg-hex");
  const personnaliserLabel = document.getElementById("app-personnaliser-label");
  const personnaliserLabelHex = document.getElementById("app-personnaliser-label-hex");
  const personnaliserStrip = document.getElementById("app-personnaliser-strip");
  const personnaliserStripHex = document.getElementById("app-personnaliser-strip-hex");
  const stripDisplayLogo = document.getElementById("app-strip-display-logo");
  const stripDisplayText = document.getElementById("app-strip-display-text");
  const stripTextWrap = document.getElementById("app-strip-text-wrap");
  const stripTextEl = document.getElementById("app-strip-text");
  const personnaliserLogoWrap = document.getElementById("app-personnaliser-logo-wrap");
  const personnaliserLogo = document.getElementById("app-personnaliser-logo");
  const personnaliserLogoPlaceholder = document.getElementById("app-personnaliser-logo-placeholder");
  const personnaliserLogoPreview = document.getElementById("app-personnaliser-logo-preview");
  const personnaliserMessage = document.getElementById("app-personnaliser-message");
  const personnaliserSave = document.getElementById("app-personnaliser-save");
  let personnaliserLogoDataUrl = "";
  const personnaliserCardBg = document.getElementById("app-personnaliser-card-bg");
  const personnaliserCardBgPlaceholder = document.getElementById("app-personnaliser-card-bg-placeholder");
  const personnaliserCardBgPreview = document.getElementById("app-personnaliser-card-bg-preview");
  const personnaliserCardBgClear = document.getElementById("app-personnaliser-card-bg-clear");
  const personnaliserLogoClear = document.getElementById("app-personnaliser-logo-clear");
  let personnaliserCardBgDataUrl = "";
  let personnaliserCardBgRemoveRequested = false;
  let hasCardBackgroundFromServer = false;
  let hasLogoOnServerPersonnaliser = false;
  let personnaliserLogoRemoveRequested = false;
  function syncPersonnaliserCardBgClearVisibility() {
    if (!personnaliserCardBgClear) return;
    if (hasCardBackgroundFromServer || (personnaliserCardBgDataUrl && String(personnaliserCardBgDataUrl).trim())) {
      personnaliserCardBgClear.classList.remove("hidden");
    } else {
      personnaliserCardBgClear.classList.add("hidden");
    }
  }
  function syncPersonnaliserLogoClearVisibility() {
    if (!personnaliserLogoClear) return;
    if (hasLogoOnServerPersonnaliser || (personnaliserLogoDataUrl && String(personnaliserLogoDataUrl).trim())) {
      personnaliserLogoClear.classList.remove("hidden");
    } else {
      personnaliserLogoClear.classList.add("hidden");
    }
  }
  function syncPersonnaliserAccordionServerCardBg() {
    const acc = document.getElementById("app-personnaliser-accordion");
    if (!acc) return;
    if (hasCardBackgroundFromServer) acc.dataset.serverCardBg = "1";
    else delete acc.dataset.serverCardBg;
  }
  const personnaliserStampIcon = document.getElementById("app-stamp-icon-input");
  const personnaliserStampIconPreview = document.getElementById("app-stamp-icon-preview");
  const personnaliserStampIconPlaceholder = document.getElementById("app-stamp-icon-placeholder");
  const personnaliserStampIconRemove = document.getElementById("app-stamp-icon-remove");
  let personnaliserStampIconDataUrl = "";
  let personnaliserStampIconRemoveRequested = false;
  let hasStampIconFromServer = false;
  const programTypePoints = document.getElementById("app-program-type-points");
  const programTypeStamps = document.getElementById("app-program-type-stamps");
  const rulesPanelPoints = document.getElementById("app-rules-points");
  const rulesPanelStamps = document.getElementById("app-rules-stamps");
  const pointsPerEuroEl = document.getElementById("app-points-per-euro");
  const pointsPerVisitEl = document.getElementById("app-points-per-visit");
  const loyaltyModeCashEl = document.getElementById("app-loyalty-mode-cash");
  const loyaltyModeGameEl = document.getElementById("app-loyalty-mode-game");
  const pointsPerTicketEl = document.getElementById("app-points-per-ticket");
  const gameTicketCostEl = document.getElementById("app-game-ticket-cost");
  const gameDailyLimitEl = document.getElementById("app-game-daily-limit");
  const gameCooldownEl = document.getElementById("app-game-cooldown");
  const gameRewardsJsonEl = document.getElementById("app-game-rewards-json");
  const pointsMinAmountEl = document.getElementById("app-points-min-amount");
  const requiredStampsEl = document.getElementById("app-required-stamps");
  const stampEmojiEl = document.getElementById("app-stamp-emoji");
  const stampRewardLabelEl = document.getElementById("app-stamp-reward-label");
  const stampSkipMidEl = document.getElementById("app-stamp-skip-mid");
  const stampMidRewardLabelEl = document.getElementById("app-stamp-reward-mid-label");
  const personnaliserAccordion = document.getElementById("app-personnaliser-accordion");

  /** Déclaré avant tout appel à schedulePersonnaliserGroupStatusRefresh (évite TDZ sur let). */
  let personnaliserStatusRaf = 0;
  function schedulePersonnaliserGroupStatusRefresh() {
    if (personnaliserStatusRaf) cancelAnimationFrame(personnaliserStatusRaf);
    personnaliserStatusRaf = requestAnimationFrame(() => {
      personnaliserStatusRaf = 0;
      updatePersonnaliserGroupStatusIndicators();
    });
  }

  function initPersonnaliserAccordion() {
    if (!personnaliserAccordion) return;
    const groups = Array.from(personnaliserAccordion.querySelectorAll("[data-personnaliser-group]"));
    if (!groups.length) return;

    function setOpen(group, shouldOpen) {
      if (!group) return;
      group.classList.toggle("is-open", shouldOpen);
      const toggle = group.querySelector(".app-personnaliser-group-toggle");
      if (toggle) toggle.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
    }

    // Par défaut: tout fermé. Si une section a explicitement "is-open", on la respecte.
    const initiallyOpen = groups.find((group) => group.classList.contains("is-open")) || null;
    groups.forEach((group) => setOpen(group, group === initiallyOpen));

    groups.forEach((group) => {
      const toggle = group.querySelector(".app-personnaliser-group-toggle");
      if (!toggle) return;
      toggle.addEventListener("click", () => {
        const isCurrentlyOpen = group.classList.contains("is-open");
        if (isCurrentlyOpen) {
          setOpen(group, false);
          return;
        }
        groups.forEach((item) => setOpen(item, item === group));
      });
    });
  }
  initPersonnaliserAccordion();
  schedulePersonnaliserGroupStatusRefresh();

  function syncStampMidUi() {
    if (!stampMidRewardLabelEl || !stampSkipMidEl) return;
    const disabled = stampSkipMidEl.checked;
    stampMidRewardLabelEl.disabled = disabled;
    stampMidRewardLabelEl.setAttribute("aria-disabled", disabled ? "true" : "false");
    stampMidRewardLabelEl.classList.toggle("app-input-disabled", disabled);
  }
  stampSkipMidEl?.addEventListener("change", () => {
    if (stampSkipMidEl.checked) stampMidRewardLabelEl.value = "";
    else if (!stampMidRewardLabelEl.value.trim()) {
      stampMidRewardLabelEl.value = getDefaultStampMidLabelBySector(getLastKnownBusinessSector());
    }
    syncStampMidUi();
    markAppSectionDirty("personnaliser");
    refreshCardRulesChecklist();
  });
  syncStampMidUi();

  function setRulesPanelVisibility() {
    const isStamps = programTypeStamps && programTypeStamps.checked;
    if (rulesPanelPoints) rulesPanelPoints.classList.toggle("hidden", !!isStamps);
    if (rulesPanelStamps) rulesPanelStamps.classList.toggle("hidden", !isStamps);
    refreshCardRulesChecklist();
  }
  if (programTypePoints) {
    programTypePoints.addEventListener("change", () => {
      setRulesPanelVisibility();
      if (programTypePoints.checked && arePointTierInputsEmpty()) {
        writePointTierInputs(document, getDefaultPointTiersBySector(getLastKnownBusinessSector()));
        markAppSectionDirty("personnaliser");
      }
      updatePersonnaliserPreview();
      refreshCardRulesChecklist();
    });
  }
  if (programTypeStamps) {
    programTypeStamps.addEventListener("change", () => {
      setRulesPanelVisibility();
      if (programTypeStamps.checked) {
        if (stampRewardLabelEl && !stampRewardLabelEl.value.trim()) {
          stampRewardLabelEl.value = getDefaultStampFinalLabelBySector(getLastKnownBusinessSector());
        }
        if (stampSkipMidEl && stampMidRewardLabelEl) {
          if (stampSkipMidEl.checked) stampMidRewardLabelEl.value = "";
          else if (!stampMidRewardLabelEl.value.trim()) {
            stampMidRewardLabelEl.value = getDefaultStampMidLabelBySector(getLastKnownBusinessSector());
          }
          syncStampMidUi();
        }
        markAppSectionDirty("personnaliser");
      }
      updatePersonnaliserPreview();
      refreshCardRulesChecklist();
    });
  }
  if (loyaltyModeCashEl) loyaltyModeCashEl.addEventListener("change", setRulesPanelVisibility);
  if (loyaltyModeGameEl) loyaltyModeGameEl.addEventListener("change", setRulesPanelVisibility);

  /**
   * Redimensionne une image et la convertit en data URL.
   * - logo: conserve PNG si le fichier source est PNG (meilleur rendu des logos)
   * - fond carte: peut rester en JPEG pour limiter la taille
   */
  function resizeLogoToDataUrl(file, maxWidth = 640, quality = 0.85, format = "auto") {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const scale = w > maxWidth ? maxWidth / w : 1;
        const cw = Math.round(w * scale);
        const ch = Math.round(h * scale);
        const canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, cw, ch);
        try {
          const isPngSource = String(file.type || "").toLowerCase().includes("png");
          const mime =
            format === "png" || (format === "auto" && isPngSource)
              ? "image/png"
              : "image/jpeg";
          const dataUrl =
            mime === "image/png"
              ? canvas.toDataURL("image/png")
              : canvas.toDataURL("image/jpeg", quality);
          resolve(dataUrl);
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Image invalide"));
      };
      img.src = objectUrl;
    });
  }

  function showPersonnaliserMessage(text, isError = false) {
    if (!personnaliserMessage) return;
    personnaliserMessage.textContent = text;
    personnaliserMessage.classList.remove("hidden", "success", "error");
    personnaliserMessage.classList.add(isError ? "error" : "success");
  }
  function bindPersonnaliserColor(colorEl, hexEl) {
    if (!colorEl || !hexEl) return;
    colorEl.addEventListener("input", () => {
      hexEl.value = colorEl.value;
    });
    hexEl.addEventListener("input", () => {
      const v = hexEl.value.trim();
      if (/^#[0-9A-Fa-f]{6}$/.test(v) || /^[0-9A-Fa-f]{6}$/.test(v)) {
        colorEl.value = v.startsWith("#") ? v : "#" + v;
      }
    });
  }
  bindPersonnaliserColor(personnaliserBg, personnaliserBgHex);
  bindPersonnaliserColor(personnaliserFg, personnaliserFgHex);
  bindPersonnaliserColor(personnaliserLabel, personnaliserLabelHex);
  function syncStripToBg() {
    const bg = personnaliserBgHex?.value?.trim() || personnaliserBg?.value || "#1e3a8a";
    const hex = bg.startsWith("#") ? bg : "#" + bg;
    if (personnaliserStrip) personnaliserStrip.value = hex;
    if (personnaliserStripHex) personnaliserStripHex.value = hex;
  }
  personnaliserBg?.addEventListener("input", syncStripToBg);
  personnaliserBg?.addEventListener("change", syncStripToBg);
  personnaliserBgHex?.addEventListener("input", syncStripToBg);
  personnaliserBgHex?.addEventListener("change", syncStripToBg);

  function hexToRgb(hex) {
    const n = parseInt(hex.replace(/^#/, ""), 16);
    return n >= 0 ? { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff } : null;
  }
  function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("");
  }
  function lightenHex(hex, factor) {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    return rgbToHex(rgb.r + (255 - rgb.r) * (1 - 1 / factor), rgb.g + (255 - rgb.g) * (1 - 1 / factor), rgb.b + (255 - rgb.b) * (1 - 1 / factor));
  }
  function darkenHex(hex, factor) {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    return rgbToHex(rgb.r / factor, rgb.g / factor, rgb.b / factor);
  }
  function setStripDisplayVisibility() {
    const isText = stripDisplayText && stripDisplayText.checked;
    if (stripTextWrap) stripTextWrap.classList.toggle("hidden", !isText);
    if (personnaliserLogoWrap) personnaliserLogoWrap.classList.toggle("hidden", !!isText);
  }
  function updatePersonnaliserPreview() {
    const card = document.getElementById("app-personnaliser-preview-card");
    const stripEl = document.getElementById("app-wallet-preview-strip");
    const stripTextPreview = document.getElementById("app-wallet-preview-strip-text");
    const orgEl = document.getElementById("app-personnaliser-preview-org");
    const valueEl = document.getElementById("app-wallet-preview-value");
    const labelEl = document.getElementById("app-wallet-preview-label");
    const logoWrap = document.getElementById("app-personnaliser-header-logo-wrap") || document.querySelector(".app-wallet-preview-logo-wrap");
    const ptsWrap = document.getElementById("app-preview-pts-wrap");
    const stampsWrap = document.getElementById("app-preview-stamps-wrap");
    const stampsGridEl = document.getElementById("app-preview-stamps-grid");
    const restantsWrap = document.getElementById("app-preview-restants-wrap");
    const restantsValueEl = document.getElementById("app-wallet-preview-restants");
    const ptsEmojiEl = document.getElementById("app-preview-pts-emoji");
    if (!card || !orgEl) return;
    const bg = personnaliserBgHex?.value?.trim() || personnaliserBg?.value || "#1e3a8a";
    const fg = personnaliserFgHex?.value?.trim() || personnaliserFg?.value || "#ffffff";
    const labelColor = personnaliserLabelHex?.value?.trim() || personnaliserLabel?.value || "#dbeafe";
    const bgHex = bg.startsWith("#") ? bg : "#" + bg;
    if (personnaliserStrip) personnaliserStrip.value = bgHex;
    if (personnaliserStripHex) personnaliserStripHex.value = bgHex;
    card.style.setProperty("--wallet-bg", bgHex);
    card.style.setProperty("--wallet-fg", fg);
    card.style.setProperty("--wallet-label", labelColor);
    if (stripEl) stripEl.style.background = bgHex;
    const bodyEl = card?.querySelector(".app-wallet-preview-body");
    const cardBgBannerEl = document.getElementById("app-wallet-preview-card-bg-banner");
    const mainBlockEl = document.getElementById("app-wallet-preview-main-block");
    const hasCardBgUrl = personnaliserCardBgDataUrl && personnaliserCardBgDataUrl.length > 0;
    const bandeauEl = document.getElementById("app-preview-bandeau");
    orgEl.textContent = personnaliserOrg?.value?.trim() || currentOrganizationName;
    const isStamps = programTypeStamps && programTypeStamps.checked;
    /**
     * Image de fond (strip) : exclusif avec points et tampons — soit l’image, soit points, soit tampons.
     */
    if (bodyEl) {
      bodyEl.style.color = fg;
      if (hasCardBgUrl) {
        bodyEl.style.background = "transparent";
        bodyEl.style.backgroundImage = "none";
        bodyEl.style.removeProperty("background-size");
        bodyEl.style.removeProperty("background-position");
        bodyEl.style.removeProperty("background-repeat");
        if (cardBgBannerEl) {
          cardBgBannerEl.classList.remove("hidden");
          cardBgBannerEl.setAttribute("aria-hidden", "false");
          cardBgBannerEl.style.backgroundImage = `url(${personnaliserCardBgDataUrl})`;
          cardBgBannerEl.style.backgroundSize = "cover";
          cardBgBannerEl.style.backgroundPosition = "center";
          cardBgBannerEl.style.backgroundRepeat = "no-repeat";
        }
        if (mainBlockEl) mainBlockEl.style.background = bgHex;
      } else {
        bodyEl.style.background = bgHex;
        bodyEl.style.backgroundImage = "none";
        bodyEl.style.removeProperty("background-size");
        bodyEl.style.removeProperty("background-position");
        bodyEl.style.removeProperty("background-repeat");
        if (cardBgBannerEl) {
          cardBgBannerEl.classList.add("hidden");
          cardBgBannerEl.setAttribute("aria-hidden", "true");
          cardBgBannerEl.style.backgroundImage = "none";
          cardBgBannerEl.style.removeProperty("background-size");
          cardBgBannerEl.style.removeProperty("background-position");
          cardBgBannerEl.style.removeProperty("background-repeat");
        }
        if (mainBlockEl) mainBlockEl.style.removeProperty("background");
      }
    }
    const stampEmoji = (stampEmojiEl && stampEmojiEl.value.trim()) || "☕";
    const requiredStamps = 10;
    const useStripImage = stripDisplayLogo && stripDisplayLogo.checked;
    const showPointsOrStamps = !hasCardBgUrl;
    if (ptsWrap) ptsWrap.classList.toggle("hidden", !!isStamps || !showPointsOrStamps);
    if (stampsWrap) stampsWrap.classList.toggle("hidden", !isStamps || !showPointsOrStamps);
    if (bandeauEl) {
      if (isStamps && showPointsOrStamps) {
        bandeauEl.classList.remove("hidden");
        bandeauEl.style.background = bgHex;
        bandeauEl.style.backgroundImage = "none";
        bandeauEl.style.removeProperty("background-size");
        bandeauEl.style.removeProperty("background-position");
      } else {
        bandeauEl.style.backgroundImage = "none";
        bandeauEl.classList.add("hidden");
      }
    }
    const rewardWrap = document.getElementById("app-preview-reward-wrap");
    if (rewardWrap) rewardWrap.classList.toggle("hidden", !!isStamps);
    if (restantsWrap) restantsWrap.classList.toggle("hidden", !isStamps || !showPointsOrStamps);
    if (restantsValueEl && isStamps) restantsValueEl.textContent = "= " + String(requiredStamps);
    const restantsLabelEl = document.getElementById("app-wallet-preview-restants-label");
    const memberLabelEl = document.getElementById("app-wallet-preview-member-label");
    const labelRestantsVal = document.getElementById("app-personnaliser-label-restants")?.value?.trim();
    if (restantsLabelEl) restantsLabelEl.textContent = labelRestantsVal || "Restants";
    if (memberLabelEl) memberLabelEl.textContent = "Membre";
    const headerRightEl = document.getElementById("app-wallet-preview-header-right");
    if (headerRightEl) headerRightEl.textContent = "Récompenses ↗";
    const rewardValueEl = document.getElementById("app-wallet-preview-reward");
    if (rewardValueEl && !isStamps) {
      const sorted = readPointTierInputs(document);
      const first = sorted[0];
      rewardValueEl.textContent = first?.label?.trim() || "Paliers en magasin";
    }
    if (valueEl) valueEl.textContent = isStamps ? "" : "0";
    if (labelEl) labelEl.textContent = isStamps ? "Tampons" : "Points";
    if (ptsEmojiEl) ptsEmojiEl.textContent = isStamps ? stampEmoji : (stampEmoji || "⭐");
    if (stampsGridEl && isStamps && showPointsOrStamps) {
      const hasCustomStampIcon = personnaliserStampIconDataUrl && personnaliserStampIconDataUrl.length > 0;
      const emojiToIcon = { "☕": "cafe", "🍔": "burger", "🍕": "pizza", "🥐": "croissant", "🥩": "steak", "🍣": "sushi", "🥗": "salade", "🍚": "riz", "🥖": "baguette", "💄": "giftsilver", "✂️": "giftsilver" };
      const iconName = emojiToIcon[stampEmoji] || "cafe";
      const iconSrc = hasCustomStampIcon ? personnaliserStampIconDataUrl : "/assets/icons/" + iconName + ".png";
      const filledCount = 0;
      const rows = stampsGridEl.querySelectorAll(".builder-wallet-card-stamps-row");
      let index = 0;
      rows.forEach((row) => {
        row.innerHTML = "";
        for (let i = 0; i < 5; i++) {
          const isFilled = index < filledCount;
          const span = document.createElement("span");
          span.className = "stamp stamp-img" + (isFilled ? " filled" : "");
          span.setAttribute("aria-hidden", "true");
          const img = document.createElement("img");
          img.src = iconSrc;
          img.alt = "";
          img.width = 48;
          img.height = 48;
          span.appendChild(img);
          row.appendChild(span);
          index++;
        }
      });
    }
    const useStripText = stripDisplayText && stripDisplayText.checked;
    const stripImg = document.getElementById("app-wallet-preview-strip-img");
    const hasLogoUrl = personnaliserLogoDataUrl && personnaliserLogoDataUrl.length > 0;
    if (stripImg) {
      stripImg.removeAttribute("src");
      stripImg.classList.add("hidden");
    }
    if (stripTextPreview) {
      if (useStripText) {
        stripTextPreview.textContent = stripTextEl?.value?.trim() || personnaliserOrg?.value?.trim() || currentOrganizationName;
        stripTextPreview.classList.remove("hidden");
      } else {
        stripTextPreview.textContent = "";
        stripTextPreview.classList.add("hidden");
      }
    }
    if (orgEl) orgEl.classList.toggle("hidden", !!useStripText);
    if (logoWrap) {
      if (useStripText) logoWrap.style.display = "none";
      else logoWrap.style.display = "";
    }
    const walletLogo = document.getElementById("app-wallet-preview-logo");
    if (walletLogo && hasLogoUrl && !useStripText) {
      walletLogo.src = personnaliserLogoDataUrl;
      walletLogo.classList.remove("hidden");
    } else if (walletLogo) {
      if (useStripText) walletLogo.classList.add("hidden");
      else if (!hasLogoUrl) {
        walletLogo.removeAttribute("src");
        walletLogo.classList.add("hidden");
      }
    }
    const logoFallback = document.getElementById("app-wallet-preview-logo-fallback");
    if (logoFallback) logoFallback.classList.toggle("hidden", !!useStripText || !!(walletLogo && walletLogo.src && !walletLogo.classList.contains("hidden")));
    schedulePersonnaliserGroupStatusRefresh();
  }
  const personnaliserLabelRestants = document.getElementById("app-personnaliser-label-restants");
  [personnaliserOrg, personnaliserBg, personnaliserBgHex, personnaliserFg, personnaliserFgHex, personnaliserLabel, personnaliserLabelHex, personnaliserStrip, personnaliserStripHex, stripTextEl, personnaliserLabelRestants].forEach((el) => el?.addEventListener("input", updatePersonnaliserPreview));
  [personnaliserOrg, personnaliserBg, personnaliserBgHex, personnaliserFg, personnaliserFgHex, personnaliserLabel, personnaliserLabelHex, personnaliserStrip, personnaliserStripHex, stripTextEl, personnaliserLabelRestants].forEach((el) => el?.addEventListener("change", updatePersonnaliserPreview));
  [stripDisplayLogo, stripDisplayText].forEach((el) => el?.addEventListener("change", () => { setStripDisplayVisibility(); updatePersonnaliserPreview(); }));
  [programTypePoints, programTypeStamps].forEach((el) => el?.addEventListener("change", updatePersonnaliserPreview));
  [programTypePoints, programTypeStamps].forEach((el) => el?.addEventListener("input", updatePersonnaliserPreview));
  for (let ti = 0; ti < POINT_TIER_COUNT; ti++) {
    document.getElementById(`app-points-tier-${ti}-points`)?.addEventListener("input", updatePersonnaliserPreview);
    document.getElementById(`app-points-tier-${ti}-label`)?.addEventListener("input", updatePersonnaliserPreview);
  }
  document.getElementById("app-points-tiers-reset-sector")?.addEventListener("click", () => {
    writePointTierInputs(document, getDefaultPointTiersBySector(getLastKnownBusinessSector()));
    markAppSectionDirty("personnaliser");
    updatePersonnaliserPreview();
    refreshCardRulesChecklist();
  });
  [
    pointsPerEuroEl,
    pointsPerVisitEl,
    pointsMinAmountEl,
    stampRewardLabelEl,
    stampMidRewardLabelEl,
    stampSkipMidEl,
    loyaltyModeCashEl,
    loyaltyModeGameEl,
    pointsPerTicketEl,
  ].forEach((el) => {
    el?.addEventListener("input", updatePersonnaliserPreview);
    el?.addEventListener("change", updatePersonnaliserPreview);
  });

  window.addEventListener("app-section-change", (e) => {
    if (e.detail?.sectionId === "personnaliser") {
      requestAnimationFrame(() => {
        updatePersonnaliserPreview();
        requestAnimationFrame(() => updatePersonnaliserPreview());
        schedulePersonnaliserGroupStatusRefresh();
      });
    }
  });

  const personnaliserAddress = document.getElementById("app-personnaliser-address");
  const personnaliserCoordsDisplay = document.getElementById("app-personnaliser-coords-display");
  const personnaliserCoordsValue = document.getElementById("app-personnaliser-coords-value");
  const personnaliserLocationText = document.getElementById("app-personnaliser-location-text");
  const personnaliserRadius = document.getElementById("app-personnaliser-radius");

  function updateCoordsDisplay(lat, lng) {
    if (!personnaliserCoordsDisplay || !personnaliserCoordsValue) return;
    if (lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
      personnaliserCoordsValue.textContent = `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
      personnaliserCoordsDisplay.classList.remove("hidden");
    } else {
      personnaliserCoordsDisplay.classList.add("hidden");
    }
  }

  const engagementGooglePlaceIdEl = document.getElementById("app-engagement-google-place-id");
  const engagementInstagramUrlEl = document.getElementById("app-engagement-instagram-url");
  const engagementTiktokUrlEl = document.getElementById("app-engagement-tiktok-url");
  const engagementFacebookUrlEl = document.getElementById("app-engagement-facebook-url");
  const engagementAutoSuggestBtn = document.getElementById("app-engagement-auto-suggest");
  const engagementAutoFeedbackEl = document.getElementById("app-engagement-auto-feedback");
  const engagementAutoFields = [
    engagementGooglePlaceIdEl,
    engagementInstagramUrlEl,
    engagementTiktokUrlEl,
    engagementFacebookUrlEl,
  ].filter(Boolean);
  let isApplyingEngagementAuto = false;
  let lastEngagementAutoRun = 0;

  function setEngagementAutoFeedback(message, isError = false) {
    if (!engagementAutoFeedbackEl) return;
    if (!message) {
      engagementAutoFeedbackEl.textContent = "";
      engagementAutoFeedbackEl.classList.add("hidden");
      engagementAutoFeedbackEl.classList.remove("error", "success");
      return;
    }
    engagementAutoFeedbackEl.textContent = message;
    engagementAutoFeedbackEl.classList.remove("hidden");
    engagementAutoFeedbackEl.classList.toggle("error", !!isError);
    engagementAutoFeedbackEl.classList.toggle("success", !isError);
  }

  function markEngagementFieldManual(el) {
    if (!el) return;
    const mark = () => {
      if (isApplyingEngagementAuto) return;
      el.dataset.manual = "1";
      delete el.dataset.autofilled;
    };
    el.addEventListener("input", mark);
    el.addEventListener("change", mark);
  }

  function canAutofillEngagementField(el) {
    if (!el) return false;
    if (el.dataset.manual === "1") return false;
    const value = (el.value || "").trim();
    if (!value) return true;
    return el.dataset.autofilled === "1";
  }

  function applyEngagementAutofill(el, value) {
    const next = (value || "").trim();
    if (!next || !canAutofillEngagementField(el)) return false;
    if ((el.value || "").trim() === next) return false;
    isApplyingEngagementAuto = true;
    el.value = next;
    el.dataset.autofilled = "1";
    isApplyingEngagementAuto = false;
    return true;
  }

  async function runEngagementAutoSuggest({ settingsData = null, forceFeedback = false } = {}) {
    const now = Date.now();
    if (!forceFeedback && now - lastEngagementAutoRun < 12000) return;
    const name = (
      settingsData?.organization_name ??
      settingsData?.organizationName ??
      personnaliserOrg?.value ??
      ""
    ).trim();
    const placeId = (engagementGooglePlaceIdEl?.value || "").trim();
    if (!name && !placeId) {
      if (forceFeedback) setEngagementAutoFeedback("Ajoutez d’abord un nom d’établissement dans Profil.");
      return;
    }
    try {
      const qs = new URLSearchParams();
      if (placeId) qs.set("place_id", placeId);
      if (name) qs.set("name", name);
      const base = (API_BASE || "").replace(/\/$/, "");
      const res = await fetch(`${base}/api/place-enrichment?${qs.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("suggestions_unavailable");
      const data = await res.json().catch(() => ({}));
      let appliedCount = 0;
      if (applyEngagementAutofill(engagementGooglePlaceIdEl, data.place_id)) appliedCount += 1;
      if (applyEngagementAutofill(engagementInstagramUrlEl, data.socials?.instagram_url)) appliedCount += 1;
      if (applyEngagementAutofill(engagementTiktokUrlEl, data.socials?.tiktok_url)) appliedCount += 1;
      if (applyEngagementAutofill(engagementFacebookUrlEl, data.socials?.facebook_url)) appliedCount += 1;
      lastEngagementAutoRun = Date.now();
      if (forceFeedback) {
        if (appliedCount > 0) setEngagementAutoFeedback(`Suggestions appliquées (${appliedCount}).`);
        else setEngagementAutoFeedback("Aucune nouvelle suggestion trouvée.");
      }
    } catch (_) {
      if (forceFeedback) setEngagementAutoFeedback("Impossible de récupérer des suggestions pour le moment.", true);
    }
  }

  engagementAutoFields.forEach(markEngagementFieldManual);
  engagementAutoSuggestBtn?.addEventListener("click", () => {
    runEngagementAutoSuggest({ forceFeedback: true });
  });

  const SECTOR_HINT_FR = {
    fastfood: "restauration rapide",
    cafe: "café / salon de thé",
    beauty: "beauté / spa",
    coiffure: "salon de coiffure",
    boulangerie: "boulangerie — pâtisserie",
    boucherie: "boucherie — charcuterie",
  };
  function updatePointsTiersSectorLine() {
    const el = document.getElementById("app-points-tiers-sector-line");
    if (!el) return;
    const raw = getLastKnownBusinessSector();
    const key = normalizeBusinessSector(raw);
    if (key) {
      el.textContent = `Exemples suggérés pour un commerce de type « ${SECTOR_HINT_FR[key] || key} ».`;
    } else if (String(raw || "").trim()) {
      el.textContent = `Secteur enregistré « ${String(raw).trim()} » : si ce n’est pas une catégorie reconnue, nous affichons des libellés génériques.`;
    } else {
      el.textContent = "Secteur d’activité inconnu pour ce commerce : exemples génériques (réductions en €).";
    }
  }

  function applyDashboardSettingsToForms(data) {
    if (!data) return;
      const orgFromApi = (data.organization_name ?? data.organizationName ?? "").trim();
      currentOrganizationName = orgFromApi || "Votre commerce";
      if (personnaliserOrg && orgFromApi) personnaliserOrg.value = orgFromApi;
      const sideBizName = document.getElementById("app-business-name");
      if (sideBizName) sideBizName.textContent = orgFromApi || slug || "Mon espace";
      const bg = data.background_color ?? data.backgroundColor ?? "#1e3a8a";
      const fg = data.foreground_color ?? data.foregroundColor ?? "#ffffff";
      const label = data.label_color ?? data.labelColor ?? "#dbeafe";
      if (personnaliserBg) personnaliserBg.value = bg;
      if (personnaliserBgHex) personnaliserBgHex.value = bg;
      if (personnaliserFg) personnaliserFg.value = fg;
      if (personnaliserFgHex) personnaliserFgHex.value = fg;
      if (personnaliserLabel) personnaliserLabel.value = label;
      if (personnaliserLabelHex) personnaliserLabelHex.value = label;
      if (personnaliserStrip) personnaliserStrip.value = bg.startsWith("#") ? bg : "#" + bg;
      if (personnaliserStripHex) personnaliserStripHex.value = bg.startsWith("#") ? bg : "#" + bg;
      // Utiliser la couleur de fond de la carte pour l'icône de prévisualisation de notification
      document.querySelectorAll(".app-notification-preview-banner-icon").forEach((notifIcon) => {
        notifIcon.style.setProperty("--app-notif-icon-bg", bg.startsWith("#") ? bg : `#${bg}`);
      });
      const stripDisplayMode = (data.strip_display_mode ?? data.stripDisplayMode ?? "logo").toLowerCase();
      if (stripDisplayMode === "text" && stripDisplayText) stripDisplayText.checked = true;
      else if (stripDisplayLogo) stripDisplayLogo.checked = true;
      if (stripTextEl) stripTextEl.value = data.strip_text ?? data.stripText ?? "";
      if (typeof setStripDisplayVisibility === "function") setStripDisplayVisibility();
      let programType = (data.program_type ?? data.programType ?? "").toLowerCase();
      if (programType !== "points" && programType !== "stamps") {
        programType = (data.required_stamps ?? data.requiredStamps) > 0 ? "stamps" : "points";
      }
      if (programType === "stamps" && programTypeStamps) programTypeStamps.checked = true;
      else if (programTypePoints) programTypePoints.checked = true;
      setRulesPanelVisibility();
      if (pointsPerEuroEl != null) pointsPerEuroEl.value = data.points_per_euro ?? data.pointsPerEuro ?? 1;
      if (pointsPerVisitEl != null) pointsPerVisitEl.value = data.points_per_visit ?? data.pointsPerVisit ?? 0;
      const loyaltyMode = String(data.loyalty_mode ?? data.loyaltyMode ?? "points_cash").toLowerCase();
      if (loyaltyMode === "points_game_tickets" && loyaltyModeGameEl) loyaltyModeGameEl.checked = true;
      else if (loyaltyModeCashEl) loyaltyModeCashEl.checked = true;
      if (pointsPerTicketEl) pointsPerTicketEl.value = data.points_per_ticket ?? data.pointsPerTicket ?? 10;
      if (pointsMinAmountEl != null) pointsMinAmountEl.value = data.points_min_amount_eur ?? data.pointsMinAmountEur ?? "";
      setLastKnownBusinessSector(data.sector ?? "");
      updatePointsTiersSectorLine();
      const tiersPayload = data.points_reward_tiers ?? data.pointsRewardTiers;
      const parsedTiers = tiersFromApiPayload(tiersPayload);
      if (programType === "points") {
        if (parsedTiers.length > 0) {
          writePointTierInputs(document, parsedTiers);
        } else {
          writePointTierInputs(document, getDefaultPointTiersBySector(getLastKnownBusinessSector()));
        }
      }
      // En mode tampons : toujours 10 (champ supprimé). En mode points on ne modifie pas requiredStamps.
      if (stampEmojiEl) stampEmojiEl.value = data.stamp_emoji ?? data.stampEmoji ?? "";
      const midSaved = data.stamp_mid_reward_label ?? data.stampMidRewardLabel;
      if (stampSkipMidEl && stampMidRewardLabelEl) {
        if (midSaved != null && String(midSaved).trim()) {
          stampSkipMidEl.checked = false;
          stampMidRewardLabelEl.value = String(midSaved).trim();
        } else {
          stampSkipMidEl.checked = true;
          stampMidRewardLabelEl.value = "";
        }
        syncStampMidUi();
      }
      if (stampRewardLabelEl) {
        const fin = (data.stamp_reward_label ?? data.stampRewardLabel ?? "").trim();
        if (fin) stampRewardLabelEl.value = fin;
        else if (programType === "stamps") {
          stampRewardLabelEl.value = getDefaultStampFinalLabelBySector(getLastKnownBusinessSector());
        }
      }
      const labelRestantsEl = document.getElementById("app-personnaliser-label-restants");
      if (labelRestantsEl && (data.label_restants ?? data.labelRestants) != null) labelRestantsEl.value = data.label_restants ?? data.labelRestants ?? "";
      const notifTitleOverrideEl = document.getElementById("app-notification-title-override");
      const notifChangeMsgEl = document.getElementById("app-notification-change-message");
      const bannerTitleEl = document.getElementById("app-notification-banner-title");
      const bannerMessageEl = document.getElementById("app-notification-banner-message");
      const orgNameForNotif = (data.organization_name ?? data.organizationName ?? "").trim();
      const titleOverrideRaw = data.notification_title_override ?? data.notificationTitleOverride ?? "";
      const titleVal = String(titleOverrideRaw).trim() || orgNameForNotif;
      const msgVal = data.notification_change_message ?? data.notificationChangeMessage ?? "";
      if (notifTitleOverrideEl != null) notifTitleOverrideEl.value = titleVal;
      if (notifChangeMsgEl != null) notifChangeMsgEl.value = msgVal;
      if (bannerTitleEl != null) bannerTitleEl.value = titleVal;
      if (bannerMessageEl != null) bannerMessageEl.value = msgVal;
      const perimetreTitleEl = document.getElementById("app-perimetre-notif-title");
      const perimetreMessageEl = document.getElementById("app-perimetre-notif-message");
      if (perimetreTitleEl != null) perimetreTitleEl.value = titleVal;
      if (perimetreMessageEl != null) perimetreMessageEl.value = msgVal;
      if (typeof updateAppNotificationPreview === "function") updateAppNotificationPreview();
      const er = data.engagement_rewards ?? data.engagementRewards ?? {};
      const g = er.google_review ?? {};
      const ig = er.instagram_follow ?? {};
      const tk = er.tiktok_follow ?? {};
      const fb = er.facebook_follow ?? {};
      const gEnable = document.getElementById("app-engagement-google-enable");
      const gPoints = document.getElementById("app-engagement-google-points");
      const gPlaceId = document.getElementById("app-engagement-google-place-id");
      if (gEnable) gEnable.checked = !!g.enabled;
      if (gPoints) gPoints.value = g.points ?? 2;
      if (gPlaceId) gPlaceId.value = g.place_id ?? "";
      const igEnable = document.getElementById("app-engagement-instagram-enable");
      const igPoints = document.getElementById("app-engagement-instagram-points");
      const igUrl = document.getElementById("app-engagement-instagram-url");
      if (igEnable) igEnable.checked = !!ig.enabled;
      if (igPoints) igPoints.value = ig.points ?? 1;
      if (igUrl) igUrl.value = ig.url ?? "";
      const tkEnable = document.getElementById("app-engagement-tiktok-enable");
      const tkPoints = document.getElementById("app-engagement-tiktok-points");
      const tkUrl = document.getElementById("app-engagement-tiktok-url");
      if (tkEnable) tkEnable.checked = !!tk.enabled;
      if (tkPoints) tkPoints.value = tk.points ?? 1;
      if (tkUrl) tkUrl.value = tk.url ?? "";
      const fbEnable = document.getElementById("app-engagement-facebook-enable");
      const fbPoints = document.getElementById("app-engagement-facebook-points");
      const fbUrl = document.getElementById("app-engagement-facebook-url");
      if (fbEnable) fbEnable.checked = !!fb.enabled;
      if (fbPoints) fbPoints.value = fb.points ?? 1;
      if (fbUrl) fbUrl.value = fb.url ?? "";
      runEngagementAutoSuggest({ settingsData: data });
      const fidelityUrlEl = document.getElementById("app-engagement-fidelity-url");
      if (fidelityUrlEl && slug) {
        const base = (typeof window !== "undefined" && window.location?.origin) ? window.location.origin : "https://myfidpass.fr";
        fidelityUrlEl.href = `${base}/fidelity/${encodeURIComponent(slug)}`;
        fidelityUrlEl.textContent = `${base}/fidelity/${slug}`;
      }
      if (personnaliserAddress && (data.location_address ?? data.locationAddress) != null) personnaliserAddress.value = data.location_address ?? data.locationAddress ?? "";
      updateCoordsDisplay(data.location_lat ?? data.locationLat, data.location_lng ?? data.locationLng);
      if (personnaliserLocationText && (data.location_relevant_text ?? data.locationRelevantText) != null) personnaliserLocationText.value = data.location_relevant_text ?? data.locationRelevantText ?? "";
      if (personnaliserRadius != null && (data.location_radius_meters ?? data.locationRadiusMeters) != null) {
        personnaliserRadius.value = String(
          clampLocationRadiusMetersClient(data.location_radius_meters ?? data.locationRadiusMeters)
        );
      }
      hasCardBackgroundFromServer = !!(data.has_card_background ?? data.hasCardBackground);
      syncPersonnaliserAccordionServerCardBg();
      hasLogoOnServerPersonnaliser = !!(data.logo_url || data.logoUrl);
      syncPersonnaliserCardBgClearVisibility();
      syncPersonnaliserLogoClearVisibility();
      if (hasCardBackgroundFromServer) {
        api("/card-background?v=" + Date.now())
          .then((r) => (r.ok ? r.blob() : null))
          .then((blob) => {
            if (blob) {
              personnaliserCardBgDataUrl = URL.createObjectURL(blob);
              if (personnaliserCardBgPreview) {
                personnaliserCardBgPreview.src = personnaliserCardBgDataUrl;
                personnaliserCardBgPreview.classList.remove("hidden");
              }
              if (personnaliserCardBgPlaceholder) personnaliserCardBgPlaceholder.classList.add("hidden");
              syncPersonnaliserCardBgClearVisibility();
              updatePersonnaliserPreview();
            }
          })
          .catch(() => {});
      }
      if (data.has_stamp_icon ?? data.hasStampIcon) {
        api("/stamp-icon?v=" + Date.now())
          .then((r) => (r.ok ? r.blob() : null))
          .then((blob) => {
            if (blob && personnaliserStampIconPreview) {
              const url = URL.createObjectURL(blob);
              personnaliserStampIconDataUrl = url;
              personnaliserStampIconPreview.src = url;
              personnaliserStampIconPreview.classList.remove("hidden");
              if (personnaliserStampIconPlaceholder) personnaliserStampIconPlaceholder.classList.add("hidden");
              if (personnaliserStampIconRemove) personnaliserStampIconRemove.classList.remove("hidden");
              updatePersonnaliserPreview();
            }
          })
          .catch(() => {});
      }
      updatePersonnaliserPreview();
      api("/dashboard/games")
        .then((r) => (r.ok ? r.json() : null))
        .then((gamesData) => {
          const roulette = Array.isArray(gamesData?.games)
            ? gamesData.games.find((g) => g.game_code === "roulette")
            : null;
          if (!roulette) return;
          if (gameTicketCostEl) gameTicketCostEl.value = roulette.ticket_cost ?? 1;
          if (gameDailyLimitEl) gameDailyLimitEl.value = roulette.daily_spin_limit ?? 20;
          if (gameCooldownEl) gameCooldownEl.value = roulette.cooldown_seconds ?? 10;
        })
        .catch(() => {});
      api("/dashboard/games/roulette/rewards")
        .then((r) => (r.ok ? r.json() : null))
        .then((rewardsData) => {
          if (!gameRewardsJsonEl) return;
          const rewards = Array.isArray(rewardsData?.rewards)
            ? rewardsData.rewards.map((r) => ({
              code: r.code,
              label: r.label,
              kind: r.kind,
              weight: r.weight,
              value: r.value || null,
              active: r.active,
            }))
            : [];
          if (rewards.length) gameRewardsJsonEl.value = JSON.stringify(rewards, null, 2);
        })
        .catch(() => {});
      personnaliserLogoRemoveRequested = false;
      api("/logo?v=" + Date.now())
        .then((r) => (r.ok ? r.blob() : null))
        .then((blob) => {
          if (blob && personnaliserLogoPreview) {
            hasLogoOnServerPersonnaliser = true;
            const url = URL.createObjectURL(blob);
            personnaliserLogoDataUrl = url;
            personnaliserLogoPreview.src = url;
            personnaliserLogoPreview.classList.remove("hidden");
            if (personnaliserLogoPlaceholder) personnaliserLogoPlaceholder.classList.add("hidden");
            const walletLogo = document.getElementById("app-wallet-preview-logo");
            if (walletLogo) {
              walletLogo.src = url;
              walletLogo.classList.remove("hidden");
            }
            personnaliserLogoPreview.onload = function onLogoLoad() {
              personnaliserLogoPreview.onload = null;
              if (typeof extractAndShowLogoColors === "function") extractAndShowLogoColors(url);
            };
            if (personnaliserLogoPreview.complete) personnaliserLogoPreview.onload();
            syncPersonnaliserLogoClearVisibility();
            updatePersonnaliserPreview();
          } else {
            hasLogoOnServerPersonnaliser = false;
            personnaliserLogoDataUrl = "";
            if (typeof extractAndShowLogoColors === "function") extractAndShowLogoColors(null);
            syncPersonnaliserLogoClearVisibility();
            schedulePersonnaliserGroupStatusRefresh();
          }
        })
        .catch(() => {});
    schedulePersonnaliserGroupStatusRefresh();
  }

  async function reloadDashboardSettingsForms() {
    const res = await api("/dashboard/settings");
    if (!res.ok) return;
    applyDashboardSettingsToForms(await res.json());
  }

  registerAppDiscardHandler("personnaliser", reloadDashboardSettingsForms);
  registerAppDiscardHandler("engagement", reloadDashboardSettingsForms);
  registerAppDiscardHandler("notifications", reloadDashboardSettingsForms);

  ["personnaliser", "engagement", "notifications", "profil"].forEach((sid) => {
    const root = document.getElementById(sid);
    if (!root) return;
    const m = () => markAppSectionDirty(sid);
    root.addEventListener("input", m, true);
    root.addEventListener("change", m, true);
  });

  api("/dashboard/settings")
    .then((r) => (r.ok ? r.json() : null))
    .then(applyDashboardSettingsToForms)
    .catch(() => {});

  /** Grille d’icônes (Emoji.family Fluent) pour choisir l’emoji des tampons sans taper. */
  document.getElementById("app-engagement-save")?.addEventListener("click", async () => {
    const feedback = document.getElementById("app-engagement-save-feedback");
    const gEnable = document.getElementById("app-engagement-google-enable");
    const gPoints = document.getElementById("app-engagement-google-points");
    const gPlaceId = document.getElementById("app-engagement-google-place-id");
    const igEnable = document.getElementById("app-engagement-instagram-enable");
    const igPoints = document.getElementById("app-engagement-instagram-points");
    const igUrl = document.getElementById("app-engagement-instagram-url");
    const tkEnable = document.getElementById("app-engagement-tiktok-enable");
    const tkPoints = document.getElementById("app-engagement-tiktok-points");
    const tkUrl = document.getElementById("app-engagement-tiktok-url");
    const fbEnable = document.getElementById("app-engagement-facebook-enable");
    const fbPoints = document.getElementById("app-engagement-facebook-points");
    const fbUrl = document.getElementById("app-engagement-facebook-url");
    const engagement_rewards = {
      google_review: { enabled: !!gEnable?.checked, points: Math.min(10, Math.max(1, parseInt(gPoints?.value, 10) || 2)), place_id: (gPlaceId?.value || "").trim(), require_approval: false },
      instagram_follow: { enabled: !!igEnable?.checked, points: Math.min(10, Math.max(1, parseInt(igPoints?.value, 10) || 1)), url: (igUrl?.value || "").trim() },
      tiktok_follow: { enabled: !!tkEnable?.checked, points: Math.min(10, Math.max(1, parseInt(tkPoints?.value, 10) || 1)), url: (tkUrl?.value || "").trim() },
      facebook_follow: { enabled: !!fbEnable?.checked, points: Math.min(10, Math.max(1, parseInt(fbPoints?.value, 10) || 1)), url: (fbUrl?.value || "").trim() },
    };
    try {
      const res = await api("/dashboard/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ engagement_rewards }) });
      if (!res.ok) throw new Error("Erreur enregistrement");
      if (feedback) { feedback.textContent = "Enregistré."; feedback.classList.remove("hidden", "error"); feedback.classList.add("success"); }
      setTimeout(() => { if (feedback) feedback.classList.add("hidden"); }, 3000);
      notifyAppSectionSaveSuccess("engagement");
    } catch (e) {
      if (feedback) { feedback.textContent = e.message || "Erreur lors de l'enregistrement."; feedback.classList.remove("hidden", "success"); feedback.classList.add("error"); }
    }
  });
  const supportedEngagementActions = ["google_review", "instagram_follow", "tiktok_follow", "facebook_follow"];
  const engagementModal = document.getElementById("app-engagement-modal");
  const engagementModalBackdrop = document.getElementById("app-engagement-modal-backdrop");
  const engagementModalClose = document.getElementById("app-engagement-modal-close");
  const engagementModalTitle = document.getElementById("app-engagement-modal-title");
  const engagementModalInputLabel = document.getElementById("app-engagement-modal-input-label");
  const engagementModalInput = document.getElementById("app-engagement-modal-input");
  const engagementModalPoints = document.getElementById("app-engagement-modal-points");
  const engagementModalSubmit = document.getElementById("app-engagement-modal-submit");
  function openEngagementModal(action, title, inputLabel, placeholder, currentValue, currentPoints) {
    if (!engagementModal || !supportedEngagementActions.includes(action)) return;
    engagementModal.dataset.currentAction = action;
    if (engagementModalTitle) engagementModalTitle.textContent = title;
    if (engagementModalInputLabel) engagementModalInputLabel.textContent = inputLabel;
    if (engagementModalInput) {
      engagementModalInput.placeholder = placeholder || "";
      engagementModalInput.value = currentValue || "";
    }
    if (engagementModalPoints) engagementModalPoints.value = Math.min(10, Math.max(1, parseInt(currentPoints, 10) || 1));
    engagementModal.classList.remove("hidden");
    engagementModalInput?.focus();
  }
  function closeEngagementModal() {
    if (engagementModal) engagementModal.classList.add("hidden");
    engagementModal?.removeAttribute("data-current-action");
  }
  document.getElementById("app-engagement-objectives-grid")?.addEventListener("click", (e) => {
    const card = e.target.closest(".app-engagement-objective-card");
    if (!card || card.disabled) return;
    const action = card.getAttribute("data-action");
    const label = card.querySelector(".app-engagement-objective-label")?.textContent?.trim() || action;
    const inputLabel = card.getAttribute("data-input-label") || "URL";
    const placeholder = card.getAttribute("data-placeholder") || "";
    if (!supportedEngagementActions.includes(action)) return;
    const gPlaceId = document.getElementById("app-engagement-google-place-id");
    const igUrl = document.getElementById("app-engagement-instagram-url");
    const tkUrl = document.getElementById("app-engagement-tiktok-url");
    const fbUrl = document.getElementById("app-engagement-facebook-url");
    const gPoints = document.getElementById("app-engagement-google-points");
    const igPoints = document.getElementById("app-engagement-instagram-points");
    const tkPoints = document.getElementById("app-engagement-tiktok-points");
    const fbPoints = document.getElementById("app-engagement-facebook-points");
    let value = "";
    let tickets = 1;
    if (action === "google_review") { value = gPlaceId?.value || ""; tickets = parseInt(gPoints?.value, 10) || 2; }
    else if (action === "instagram_follow") { value = igUrl?.value || ""; tickets = parseInt(igPoints?.value, 10) || 1; }
    else if (action === "tiktok_follow") { value = tkUrl?.value || ""; tickets = parseInt(tkPoints?.value, 10) || 1; }
    else if (action === "facebook_follow") { value = fbUrl?.value || ""; tickets = parseInt(fbPoints?.value, 10) || 1; }
    openEngagementModal(action, label, inputLabel, placeholder, value, tickets);
  });
  engagementModalBackdrop?.addEventListener("click", closeEngagementModal);
  engagementModalClose?.addEventListener("click", closeEngagementModal);
  engagementModalSubmit?.addEventListener("click", () => {
    const action = engagementModal?.dataset?.currentAction;
    if (!action || !supportedEngagementActions.includes(action)) return;
    const value = (engagementModalInput?.value || "").trim();
    const points = Math.min(10, Math.max(1, parseInt(engagementModalPoints?.value, 10) || 1));
    const gEnable = document.getElementById("app-engagement-google-enable");
    const gPoints = document.getElementById("app-engagement-google-points");
    const gPlaceId = document.getElementById("app-engagement-google-place-id");
    const igEnable = document.getElementById("app-engagement-instagram-enable");
    const igPoints = document.getElementById("app-engagement-instagram-points");
    const igUrl = document.getElementById("app-engagement-instagram-url");
    const tkEnable = document.getElementById("app-engagement-tiktok-enable");
    const tkPoints = document.getElementById("app-engagement-tiktok-points");
    const tkUrl = document.getElementById("app-engagement-tiktok-url");
    const fbEnable = document.getElementById("app-engagement-facebook-enable");
    const fbPoints = document.getElementById("app-engagement-facebook-points");
    const fbUrl = document.getElementById("app-engagement-facebook-url");
    if (action === "google_review") {
      if (gEnable) gEnable.checked = true;
      if (gPoints) gPoints.value = points;
      if (gPlaceId) gPlaceId.value = value;
    } else if (action === "instagram_follow") {
      if (igEnable) igEnable.checked = true;
      if (igPoints) igPoints.value = points;
      if (igUrl) igUrl.value = value;
    } else if (action === "tiktok_follow") {
      if (tkEnable) tkEnable.checked = true;
      if (tkPoints) tkPoints.value = points;
      if (tkUrl) tkUrl.value = value;
    } else if (action === "facebook_follow") {
      if (fbEnable) fbEnable.checked = true;
      if (fbPoints) fbPoints.value = points;
      if (fbUrl) fbUrl.value = value;
    }
    markAppSectionDirty("engagement");
    closeEngagementModal();
  });
  document.getElementById("app-game-save")?.addEventListener("click", async () => {
    const feedback = document.getElementById("app-game-save-feedback");
    const gameCode = "roulette";
    const payload = {
      ticket_cost: parseInt(gameTicketCostEl?.value, 10) || 1,
      daily_spin_limit: parseInt(gameDailyLimitEl?.value, 10) || 20,
      cooldown_seconds: parseInt(gameCooldownEl?.value, 10) || 10,
      enabled: loyaltyModeGameEl?.checked === true,
    };
    try {
      const gameRes = await api(`/dashboard/games/${encodeURIComponent(gameCode)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!gameRes.ok) throw new Error("Erreur configuration jeu");
      if (gameRewardsJsonEl && gameRewardsJsonEl.value.trim()) {
        const rewards = JSON.parse(gameRewardsJsonEl.value);
        const rewardsRes = await api(`/dashboard/games/${encodeURIComponent(gameCode)}/rewards`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rewards }),
        });
        if (!rewardsRes.ok) throw new Error("Erreur sauvegarde récompenses");
      }
      if (feedback) {
        feedback.textContent = "Configuration jeu enregistrée.";
        feedback.classList.remove("hidden", "error");
        feedback.classList.add("success");
      }
      notifyAppSectionSaveSuccess("personnaliser");
    } catch (err) {
      if (feedback) {
        feedback.textContent = err.message || "Impossible d'enregistrer la configuration jeu.";
        feedback.classList.remove("hidden", "success");
        feedback.classList.add("error");
      }
    }
  });
  function setEngagementPreviewIframeSrc() {
    const previewIframe = document.getElementById("app-engagement-preview-iframe");
    if (previewIframe && slug) {
      const base = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";
      previewIframe.src = base ? `${base}/fidelity/${encodeURIComponent(slug)}/jeu` : "";
    }
  }
  window.addEventListener("app-section-change", (e) => {
    if (e.detail?.sectionId !== "engagement") return;
    runEngagementAutoSuggest();
    setEngagementPreviewIframeSrc();
  }, { once: false });
  if (document.getElementById("engagement")?.classList.contains("app-section-visible")) setEngagementPreviewIframeSrc();

  const emojiPickerEl = document.getElementById("app-stamp-emoji-picker");
  if (emojiPickerEl && stampEmojiEl) {
    const ASSETS_ICONS = "/assets/icons";
    const CUSTOM_ICON_PATHS = {
      "2615": "cafe.png", "1f355": "pizza.png", "1f354": "burger.png", "1f32e": "kebab.png",
      "1f363": "sushi.png", "1f957": "salade.png", "1f950": "croissant.png", "1f356": "steak.png",
      "1f35e": "riz.png", "1f956": "baguette.png", "1f381": "giftgold.png", "2705": "checkvert.png",
    };
    const STAMP_ICONS = [
      { emoji: "☕", hexcode: "2615", annotation: "Café" }, { emoji: "🍕", hexcode: "1f355", annotation: "Pizza" },
      { emoji: "🍔", hexcode: "1f354", annotation: "Burger" }, { emoji: "🥐", hexcode: "1f950", annotation: "Croissant" },
      { emoji: "🥗", hexcode: "1f957", annotation: "Salade" }, { emoji: "🍣", hexcode: "1f363", annotation: "Sushi" },
      { emoji: "🌮", hexcode: "1f32e", annotation: "Taco" }, { emoji: "🍗", hexcode: "1f356", annotation: "Steak" },
      { emoji: "🍚", hexcode: "1f35e", annotation: "Riz" }, { emoji: "🥖", hexcode: "1f956", annotation: "Baguette" },
      { emoji: "🎁", hexcode: "1f381", annotation: "Cadeau" }, { emoji: "✅", hexcode: "2705", annotation: "Validé" },
    ];
    function renderPicker(list) {
      if (!Array.isArray(list) || !list.length) return;
      const size = 40;
      list.forEach((item) => {
        const emoji = item.emoji;
        const hexcode = (item.hexcode || "").replace(/_/g, "-");
        const norm = hexcode ? hexcode.split("-")[0] : "";
        if (!emoji) return;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "app-emoji-picker-btn";
        btn.title = item.annotation || emoji;
        btn.setAttribute("aria-label", item.annotation || emoji);
        const customFile = CUSTOM_ICON_PATHS[norm];
        const imgSrc = customFile ? `${ASSETS_ICONS}/${customFile}` : null;
        if (imgSrc) {
          const img = document.createElement("img");
          img.src = imgSrc;
          img.alt = "";
          img.width = size;
          img.height = size;
          img.loading = "lazy";
          img.onerror = () => { btn.textContent = emoji; };
          btn.appendChild(img);
        } else btn.textContent = emoji;
        btn.dataset.emoji = emoji;
        btn.addEventListener("click", () => {
          stampEmojiEl.value = emoji;
          emojiPickerEl.querySelectorAll(".app-emoji-picker-btn").forEach((b) => b.classList.remove("selected"));
          btn.classList.add("selected");
          markAppSectionDirty("personnaliser");
          if (typeof updatePersonnaliserPreview === "function") updatePersonnaliserPreview();
        });
        emojiPickerEl.appendChild(btn);
      });
      const current = (stampEmojiEl.value || "").trim();
      if (current) {
        const match = emojiPickerEl.querySelector(`.app-emoji-picker-btn[data-emoji="${current.replace(/"/g, "\\\"")}"]`);
        if (match) match.classList.add("selected");
      }
    }
    renderPicker(STAMP_ICONS);
    window.syncStampEmojiPickerSelection = function () {
      if (!emojiPickerEl || !stampEmojiEl) return;
      emojiPickerEl.querySelectorAll(".app-emoji-picker-btn").forEach((b) => b.classList.remove("selected"));
      let current = (stampEmojiEl.value || "").trim();
      if (!current) {
        stampEmojiEl.value = "☕";
        current = "☕";
      }
      const match = emojiPickerEl.querySelector(`.app-emoji-picker-btn[data-emoji="${current.replace(/"/g, "\\\"")}"]`);
      if (match) match.classList.add("selected");
      else {
        const firstBtn = emojiPickerEl.querySelector(".app-emoji-picker-btn");
        if (firstBtn) {
          firstBtn.classList.add("selected");
          stampEmojiEl.value = firstBtn.dataset.emoji || "☕";
        }
      }
    };
    window.syncStampEmojiPickerSelection();
  }

  function getDominantColorsFromImage(imageSource, maxColors = 4) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const size = 40;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve([]); return; }
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        const bucket = new Map();
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a < 140) continue;
          const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          if (lum > 0.92 || lum < 0.06) continue;
          const kr = Math.round(r / 24) * 24, kg = Math.round(g / 24) * 24, kb = Math.round(b / 24) * 24;
          const key = `${kr},${kg},${kb}`;
          bucket.set(key, (bucket.get(key) || 0) + 1);
        }
        const sorted = [...bucket.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxColors);
        const hexes = sorted.map(([k]) => {
          const [rr, gg, bb] = k.split(",").map(Number);
          return "#" + [rr, gg, bb].map((x) => Math.min(255, x).toString(16).padStart(2, "0")).join("");
        });
        resolve(hexes);
      };
      img.onerror = () => resolve([]);
      img.src = imageSource;
    });
  }

  function hideLogoColorSwatchRows() {
    const ids = ["app-logo-colors-swatches-bg", "app-logo-colors-swatches-fg", "app-logo-colors-swatches-label"];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.innerHTML = "";
        el.classList.add("hidden");
      }
    });
  }

  function renderLogoColorSwatches(colors) {
    const cBg = document.getElementById("app-logo-colors-swatches-bg");
    const cFg = document.getElementById("app-logo-colors-swatches-fg");
    const cLbl = document.getElementById("app-logo-colors-swatches-label");
    if (!cBg || !cFg || !cLbl) return;
    cBg.innerHTML = "";
    cFg.innerHTML = "";
    cLbl.innerHTML = "";
    if (!colors || colors.length === 0) {
      hideLogoColorSwatchRows();
      return;
    }
    const ariaTarget = {
      bg: "au fond de la carte et au bandeau",
      fg: "au texte de la carte",
      label: "aux labels de la carte",
    };
    function fillRow(container, targetKey) {
      colors.forEach((hex) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "app-logo-color-swatch";
        btn.style.background = hex;
        btn.title = hex;
        btn.setAttribute("aria-label", "Appliquer " + hex + " " + ariaTarget[targetKey]);
        btn.addEventListener("click", () => {
          const h = hex.startsWith("#") ? hex : "#" + hex;
          if (targetKey === "bg") {
            if (personnaliserBg) personnaliserBg.value = h;
            if (personnaliserBgHex) personnaliserBgHex.value = h;
            syncStripToBg();
          } else if (targetKey === "fg") {
            if (personnaliserFg) personnaliserFg.value = h;
            if (personnaliserFgHex) personnaliserFgHex.value = h;
          } else {
            if (personnaliserLabel) personnaliserLabel.value = h;
            if (personnaliserLabelHex) personnaliserLabelHex.value = h;
          }
          updatePersonnaliserPreview();
        });
        container.appendChild(btn);
      });
    }
    fillRow(cBg, "bg");
    fillRow(cFg, "fg");
    fillRow(cLbl, "label");
    cBg.classList.remove("hidden");
    cFg.classList.remove("hidden");
    cLbl.classList.remove("hidden");
  }

  function extractAndShowLogoColors(imageSource) {
    if (!imageSource) {
      hideLogoColorSwatchRows();
      return;
    }
    getDominantColorsFromImage(imageSource, 4).then((colors) => renderLogoColorSwatches(colors));
  }

  async function applyLogoFromFile(file) {
    if (!file || !file.type.startsWith("image/")) {
        showPersonnaliserMessage("Choisissez une image (JPG, PNG).", true);
        return;
      }
      try {
        personnaliserLogoRemoveRequested = false;
        personnaliserLogoDataUrl = await resizeLogoToDataUrl(file, 640, 0.9, "auto");
        if (personnaliserLogoPreview) {
          personnaliserLogoPreview.src = personnaliserLogoDataUrl;
          personnaliserLogoPreview.classList.remove("hidden");
        }
        if (personnaliserLogoPlaceholder) personnaliserLogoPlaceholder.classList.add("hidden");
        extractAndShowLogoColors(personnaliserLogoDataUrl);
        syncPersonnaliserLogoClearVisibility();
        updatePersonnaliserPreview();
      } catch (err) {
        showPersonnaliserMessage("Impossible de charger l'image. Choisissez un fichier JPG ou PNG valide.", true);
    }
  }

  async function applyCardBgFromFile(file) {
    if (!file || !file.type.startsWith("image/")) {
      showPersonnaliserMessage("Choisissez une image (JPG, PNG).", true);
      return;
    }
    try {
      personnaliserCardBgRemoveRequested = false;
      personnaliserCardBgDataUrl = await resizeLogoToDataUrl(file, 750, 0.85, "jpeg");
      if (personnaliserCardBgPreview) {
        personnaliserCardBgPreview.src = personnaliserCardBgDataUrl;
        personnaliserCardBgPreview.classList.remove("hidden");
      }
      if (personnaliserCardBgPlaceholder) personnaliserCardBgPlaceholder.classList.add("hidden");
      syncPersonnaliserCardBgClearVisibility();
    } catch (err) {
      showPersonnaliserMessage("Impossible de charger l'image de fond.", true);
    }
    updatePersonnaliserPreview();
  }

  async function applyStampIconFromFile(file) {
    if (!file || !file.type.startsWith("image/")) {
      showReglesMessage("Choisissez une image (JPG, PNG).", true);
      return;
    }
    try {
      personnaliserStampIconRemoveRequested = false;
      personnaliserStampIconDataUrl = await resizeLogoToDataUrl(file, 256, 0.9, "auto");
      if (personnaliserStampIconPreview) {
        personnaliserStampIconPreview.src = personnaliserStampIconDataUrl;
        personnaliserStampIconPreview.classList.remove("hidden");
      }
      if (personnaliserStampIconPlaceholder) personnaliserStampIconPlaceholder.classList.add("hidden");
      if (personnaliserStampIconRemove) personnaliserStampIconRemove.classList.remove("hidden");
      markAppSectionDirty("personnaliser");
    } catch (err) {
      showReglesMessage("Impossible de charger l'icône.", true);
    }
    updatePersonnaliserPreview();
  }

  function setupImageDropZone(zoneEl, onFile) {
    if (!zoneEl) return;
    zoneEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      zoneEl.classList.add("app-drop-zone-active");
    });
    zoneEl.addEventListener("dragleave", (e) => {
      if (!zoneEl.contains(e.relatedTarget)) zoneEl.classList.remove("app-drop-zone-active");
    });
    zoneEl.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      zoneEl.classList.remove("app-drop-zone-active");
      const file = e.dataTransfer?.files?.[0];
      if (file) onFile(file);
    });
    zoneEl.addEventListener("paste", (e) => {
      const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith("image/"));
      const file = item?.getAsFile?.();
      if (file) {
        e.preventDefault();
        onFile(file);
      }
    });
  }

  if (personnaliserLogo) {
    personnaliserLogo.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (file) await applyLogoFromFile(file);
    });
    const logoDropZone = document.getElementById("app-logo-drop-zone");
    setupImageDropZone(logoDropZone, (file) => applyLogoFromFile(file));
  }

  if (personnaliserCardBg) {
    personnaliserCardBg.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (file) await applyCardBgFromFile(file);
    });
    const cardBgDropZone = document.getElementById("app-card-bg-drop-zone");
    setupImageDropZone(cardBgDropZone, (file) => applyCardBgFromFile(file));
  }

  if (personnaliserStampIcon) {
    personnaliserStampIcon.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (file) await applyStampIconFromFile(file);
    });
    const stampIconDropZone = document.getElementById("app-stamp-icon-drop-zone");
    setupImageDropZone(stampIconDropZone, (file) => applyStampIconFromFile(file));
  }
  if (personnaliserStampIconRemove) {
    personnaliserStampIconRemove.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      personnaliserStampIconRemoveRequested = true;
      personnaliserStampIconDataUrl = "";
      if (personnaliserStampIcon) personnaliserStampIcon.value = "";
      if (personnaliserStampIconPreview) {
        personnaliserStampIconPreview.src = "";
        personnaliserStampIconPreview.classList.add("hidden");
      }
      if (personnaliserStampIconPlaceholder) {
        personnaliserStampIconPlaceholder.textContent = "+";
        personnaliserStampIconPlaceholder.classList.remove("hidden");
      }
      personnaliserStampIconRemove.classList.add("hidden");
      markAppSectionDirty("personnaliser");
      updatePersonnaliserPreview();
    });
  }

  if (personnaliserCardBgClear) {
    personnaliserCardBgClear.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      personnaliserCardBgRemoveRequested = true;
      if (personnaliserCardBgDataUrl && personnaliserCardBgDataUrl.startsWith("blob:")) {
        try { URL.revokeObjectURL(personnaliserCardBgDataUrl); } catch (_) {}
      }
      personnaliserCardBgDataUrl = "";
      if (personnaliserCardBg) personnaliserCardBg.value = "";
      if (personnaliserCardBgPreview) {
        personnaliserCardBgPreview.src = "";
        personnaliserCardBgPreview.classList.add("hidden");
      }
      if (personnaliserCardBgPlaceholder) {
        personnaliserCardBgPlaceholder.textContent = "+ Choisir une image de fond (glisser une image ou cliquer)";
        personnaliserCardBgPlaceholder.classList.remove("hidden");
      }
      syncPersonnaliserCardBgClearVisibility();
      markAppSectionDirty("personnaliser");
      updatePersonnaliserPreview();
      requestAnimationFrame(() => updatePersonnaliserPreview());
    });
  }

  if (personnaliserLogoClear) {
    personnaliserLogoClear.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      personnaliserLogoRemoveRequested = true;
      if (personnaliserLogoDataUrl && personnaliserLogoDataUrl.startsWith("blob:")) {
        try { URL.revokeObjectURL(personnaliserLogoDataUrl); } catch (_) {}
      }
      personnaliserLogoDataUrl = "";
      if (personnaliserLogo) personnaliserLogo.value = "";
      if (personnaliserLogoPreview) {
        personnaliserLogoPreview.src = "";
        personnaliserLogoPreview.classList.add("hidden");
      }
      if (personnaliserLogoPlaceholder) personnaliserLogoPlaceholder.classList.remove("hidden");
      const sw = document.getElementById("app-logo-colors-swatches");
      if (sw) sw.classList.add("hidden");
      syncPersonnaliserLogoClearVisibility();
      updatePersonnaliserPreview();
      markAppSectionDirty("personnaliser");
    });
  }

  function showReglesMessage(text, isError = false) {
    const el = document.getElementById("app-regles-message");
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("hidden", !text);
    el.classList.remove("success", "error");
    if (text) el.classList.add(isError ? "error" : "success");
  }

  function buildCardRulesPatchBody() {
    const body = {};
    const isStamps = programTypeStamps && programTypeStamps.checked;
    body.programType = isStamps ? "stamps" : "points";
    body.loyaltyMode = loyaltyModeGameEl?.checked ? "points_game_tickets" : "points_cash";
    if (pointsPerEuroEl) body.pointsPerEuro = parseInt(pointsPerEuroEl.value, 10) || 1;
    if (pointsPerVisitEl) body.pointsPerVisit = parseInt(pointsPerVisitEl.value, 10) || 0;
    if (pointsPerTicketEl) {
      const ppt = parseInt(pointsPerTicketEl.value, 10);
      if (!Number.isNaN(ppt) && ppt > 0) body.pointsPerTicket = ppt;
    }
    if (pointsMinAmountEl && pointsMinAmountEl.value.trim() !== "") {
      const minVal = parseFloat(pointsMinAmountEl.value);
      if (!Number.isNaN(minVal) && minVal >= 0) body.pointsMinAmountEur = minVal;
    }
    if (!isStamps) {
      const tiers = readPointTierInputs(document);
      if (tiers.length) body.pointsRewardTiers = tiers;
    }
    if (isStamps) body.requiredStamps = 10;
    else if (requiredStampsEl) body.requiredStamps = parseInt(requiredStampsEl.value, 10) || 10;
    if (stampEmojiEl) body.stampEmoji = stampEmojiEl.value.trim() || undefined;
    if (stampRewardLabelEl) body.stampRewardLabel = stampRewardLabelEl.value.trim() || undefined;
    if (isStamps) {
      if (stampSkipMidEl?.checked) body.stampMidRewardLabel = null;
      else {
        const midTrim = stampMidRewardLabelEl?.value?.trim() || "";
        body.stampMidRewardLabel = midTrim || null;
      }
    }
    if (personnaliserStampIconRemoveRequested) body.stampIconBase64 = "";
    else if (personnaliserStampIconDataUrl && typeof personnaliserStampIconDataUrl === "string" && personnaliserStampIconDataUrl.startsWith("data:")) {
      body.stampIconBase64 = personnaliserStampIconDataUrl;
    }
    return body;
  }

  const reglesSave = document.getElementById("app-regles-save");
  if (reglesSave) {
    reglesSave.addEventListener("click", async () => {
      const body = buildCardRulesPatchBody();
      reglesSave.disabled = true;
      showReglesMessage("");
      const url = `${API_BASE}/api/businesses/${encodeURIComponent(slug)}${dashboardToken ? `?token=${encodeURIComponent(dashboardToken)}` : ""}`;
      const headers = { "Content-Type": "application/json", ...getAuthHeaders() };
      if (dashboardToken) headers["X-Dashboard-Token"] = dashboardToken;
      try {
        const res = await fetch(url, { method: "PATCH", headers, body: JSON.stringify(body) });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          showReglesMessage("Règles enregistrées.");
          notifyAppSectionSaveSuccess("personnaliser");
          updatePersonnaliserPreview();
          if (body.stampIconBase64 === "") {
            personnaliserStampIconRemoveRequested = false;
            personnaliserStampIconDataUrl = "";
            if (personnaliserStampIcon) personnaliserStampIcon.value = "";
            if (personnaliserStampIconPreview) {
              personnaliserStampIconPreview.src = "";
              personnaliserStampIconPreview.classList.add("hidden");
            }
            if (personnaliserStampIconPlaceholder) personnaliserStampIconPlaceholder.classList.remove("hidden");
            if (personnaliserStampIconRemove) personnaliserStampIconRemove.classList.add("hidden");
            updatePersonnaliserPreview();
          } else if (body.stampIconBase64) {
            personnaliserStampIconRemoveRequested = false;
            api("/stamp-icon?v=" + Date.now())
              .then((r) => (r.ok ? r.blob() : null))
              .then((blob) => {
                if (blob && personnaliserStampIconPreview) {
                  personnaliserStampIconDataUrl = URL.createObjectURL(blob);
                  personnaliserStampIconPreview.src = personnaliserStampIconDataUrl;
                  personnaliserStampIconPreview.classList.remove("hidden");
                  if (personnaliserStampIconPlaceholder) personnaliserStampIconPlaceholder.classList.add("hidden");
                  if (personnaliserStampIconRemove) personnaliserStampIconRemove.classList.remove("hidden");
                  updatePersonnaliserPreview();
                }
              })
              .catch(() => {});
          }
        } else {
          let errMsg = data.error || "Erreur lors de l'enregistrement.";
          if (res.status === 401) errMsg = "Accès refusé. Utilisez le lien reçu par e-mail pour ouvrir cette page (il contient le token), ou déconnectez-vous puis reconnectez-vous.";
          else if (res.status === 404) errMsg = "Commerce introuvable.";
          showReglesMessage(errMsg, true);
        }
      } catch (_) {
        showReglesMessage("Erreur réseau. Vérifiez votre connexion.", true);
      }
      reglesSave.disabled = false;
    });
  }

  if (personnaliserSave) {
    personnaliserSave.addEventListener("click", async () => {
      const backgroundColor = personnaliserBgHex?.value?.trim() || personnaliserBg?.value || "#1e3a8a";
      const foregroundColor = personnaliserFgHex?.value?.trim() || personnaliserFg?.value || "#ffffff";
      const labelColor = personnaliserLabelHex?.value?.trim() || personnaliserLabel?.value || "#dbeafe";
      const toHex = (v) => {
        const s = (v || "").trim();
        if (/^#[0-9A-Fa-f]{6}$/.test(s)) return s;
        if (/^[0-9A-Fa-f]{6}$/.test(s)) return "#" + s;
        return undefined;
      };
      const personnaliserOrgName = (personnaliserOrg?.value ?? "").trim();
      const body = {
        ...(personnaliserOrgName ? { organizationName: personnaliserOrgName } : {}),
        backgroundColor: toHex(backgroundColor),
        foregroundColor: toHex(foregroundColor),
        labelColor: toHex(labelColor),
        stripColor: toHex(backgroundColor),
      };
      const stripDisplayMode = stripDisplayText && stripDisplayText.checked ? "text" : "logo";
      body.stripDisplayMode = stripDisplayMode;
      if (stripDisplayMode === "text" && stripTextEl) body.stripText = stripTextEl.value.trim() || undefined;
      // N'envoyer le logo que si c'est un data URL (nouvelle image choisie). Une blob URL (logo chargé depuis l'API) ne doit pas être envoyée sinon on écrase le logo en base.
      if (personnaliserLogoRemoveRequested) {
        body.logoBase64 = null;
      } else if (personnaliserLogoDataUrl && typeof personnaliserLogoDataUrl === "string" && personnaliserLogoDataUrl.startsWith("data:")) {
        body.logoBase64 = personnaliserLogoDataUrl;
      }
      if (personnaliserCardBgRemoveRequested) body.cardBackgroundBase64 = "";
      else if (personnaliserCardBgDataUrl && typeof personnaliserCardBgDataUrl === "string" && personnaliserCardBgDataUrl.startsWith("data:")) body.cardBackgroundBase64 = personnaliserCardBgDataUrl;
      const addressEl = document.getElementById("app-personnaliser-address");
      if (addressEl) {
        const addressVal = addressEl.value?.trim() || "";
        const locTextVal = document.getElementById("app-personnaliser-location-text")?.value?.trim();
        const radiusVal = document.getElementById("app-personnaliser-radius")?.value;
        body.locationAddress = addressVal || null;
        if (addressVal) {
          showPersonnaliserMessage("Localisation de l'adresse en cours…", false);
          try {
            const coords = await geocodeAddress(addressVal);
            if (coords) {
              body.locationLat = coords.lat;
              body.locationLng = coords.lng;
            } else {
              showPersonnaliserMessage("Adresse non trouvée. Vérifiez l'adresse ou réessayez. Les autres modifications seront enregistrées.", true);
            }
          } catch (e) {
            showPersonnaliserMessage("Impossible de localiser l'adresse (réseau). Les autres modifications seront enregistrées.", true);
          }
        } else {
          body.locationLat = null;
          body.locationLng = null;
        }
        if (locTextVal !== undefined) body.locationRelevantText = locTextVal || undefined;
        if (radiusVal !== undefined) {
          body.locationRadiusMeters =
            radiusVal === "" ? undefined : clampLocationRadiusMetersClient(parseInt(radiusVal, 10));
        }
      }
      const labelRestantsVal = document.getElementById("app-personnaliser-label-restants")?.value?.trim();
      if (labelRestantsVal) body.labelRestants = labelRestantsVal;
      const rulesPatch = buildCardRulesPatchBody();
      Object.assign(body, rulesPatch);
      personnaliserSave.disabled = true;
      showPersonnaliserMessage("");
      const url = `${API_BASE}/api/businesses/${encodeURIComponent(slug)}${dashboardToken ? `?token=${encodeURIComponent(dashboardToken)}` : ""}`;
      const headers = { "Content-Type": "application/json", ...getAuthHeaders() };
      if (dashboardToken) headers["X-Dashboard-Token"] = dashboardToken;
      try {
        const res = await fetch(url, { method: "PATCH", headers, body: JSON.stringify(body) });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          showPersonnaliserMessage("Modifications enregistrées.");
          notifyAppSectionSaveSuccess("personnaliser");
          showReglesMessage("");
          if (rulesPatch.stampIconBase64 === "") {
            personnaliserStampIconRemoveRequested = false;
            personnaliserStampIconDataUrl = "";
            if (personnaliserStampIcon) personnaliserStampIcon.value = "";
            if (personnaliserStampIconPreview) {
              personnaliserStampIconPreview.src = "";
              personnaliserStampIconPreview.classList.add("hidden");
            }
            if (personnaliserStampIconPlaceholder) personnaliserStampIconPlaceholder.classList.remove("hidden");
            if (personnaliserStampIconRemove) personnaliserStampIconRemove.classList.add("hidden");
            updatePersonnaliserPreview();
          } else if (rulesPatch.stampIconBase64) {
            personnaliserStampIconRemoveRequested = false;
            api("/stamp-icon?v=" + Date.now())
              .then((r) => (r.ok ? r.blob() : null))
              .then((blob) => {
                if (blob && personnaliserStampIconPreview) {
                  personnaliserStampIconDataUrl = URL.createObjectURL(blob);
                  personnaliserStampIconPreview.src = personnaliserStampIconDataUrl;
                  personnaliserStampIconPreview.classList.remove("hidden");
                  if (personnaliserStampIconPlaceholder) personnaliserStampIconPlaceholder.classList.add("hidden");
                  if (personnaliserStampIconRemove) personnaliserStampIconRemove.classList.remove("hidden");
                  updatePersonnaliserPreview();
                }
              })
              .catch(() => {});
          }
          refreshCardRulesChecklist();
          if (personnaliserOrgName) {
            currentOrganizationName = personnaliserOrgName;
            const sideBiz = document.getElementById("app-business-name");
            if (sideBiz) sideBiz.textContent = personnaliserOrgName;
          }
          updateCoordsDisplay(data.locationLat, data.locationLng);
          if (personnaliserLogo) personnaliserLogo.value = "";
          if (body.cardBackgroundBase64 === "") {
            personnaliserCardBgRemoveRequested = false;
            hasCardBackgroundFromServer = false;
            syncPersonnaliserAccordionServerCardBg();
            personnaliserCardBgDataUrl = "";
            if (personnaliserCardBg) personnaliserCardBg.value = "";
            if (personnaliserCardBgPreview) {
              personnaliserCardBgPreview.src = "";
              personnaliserCardBgPreview.classList.add("hidden");
            }
            if (personnaliserCardBgPlaceholder) {
              personnaliserCardBgPlaceholder.textContent = "+ Choisir une image de fond";
              personnaliserCardBgPlaceholder.classList.remove("hidden");
            }
            syncPersonnaliserCardBgClearVisibility();
          } else if (body.cardBackgroundBase64) {
            hasCardBackgroundFromServer = true;
            syncPersonnaliserAccordionServerCardBg();
            personnaliserCardBgDataUrl = "";
            if (personnaliserCardBg) personnaliserCardBg.value = "";
            if (personnaliserCardBgPlaceholder) {
              personnaliserCardBgPlaceholder.textContent = "Image de fond enregistrée";
              personnaliserCardBgPlaceholder.classList.remove("hidden");
            }
            syncPersonnaliserCardBgClearVisibility();
            api("/card-background?v=" + Date.now())
              .then((r) => (r.ok ? r.blob() : null))
              .then((blob) => {
                if (blob && personnaliserCardBgPreview) {
                  personnaliserCardBgDataUrl = URL.createObjectURL(blob);
                  personnaliserCardBgPreview.src = personnaliserCardBgDataUrl;
                  personnaliserCardBgPreview.classList.remove("hidden");
                  if (personnaliserCardBgPlaceholder) personnaliserCardBgPlaceholder.classList.add("hidden");
                  syncPersonnaliserCardBgClearVisibility();
                  updatePersonnaliserPreview();
                }
              })
              .catch(() => {});
          }
          // Toujours recharger le logo depuis l'API après enregistrement : garde l'affichage cohérent et met à jour personnaliserLogoDataUrl (blob URL) pour les prochains saves.
          personnaliserLogoRemoveRequested = false;
          api("/logo?v=" + Date.now())
              .then((r) => (r.ok ? r.blob() : null))
              .then((blob) => {
                if (blob && personnaliserLogoPreview) {
                  hasLogoOnServerPersonnaliser = true;
                  const url = URL.createObjectURL(blob);
                personnaliserLogoDataUrl = url;
                  personnaliserLogoPreview.src = url;
                  personnaliserLogoPreview.classList.remove("hidden");
                  if (personnaliserLogoPlaceholder) personnaliserLogoPlaceholder.classList.add("hidden");
                  const walletLogo = document.getElementById("app-wallet-preview-logo");
                  if (walletLogo) {
                    walletLogo.src = url;
                    walletLogo.classList.remove("hidden");
                  }
                  syncPersonnaliserLogoClearVisibility();
                  updatePersonnaliserPreview();
                  refreshSidebarBusinessLogo();
          } else {
                hasLogoOnServerPersonnaliser = false;
                personnaliserLogoDataUrl = "";
            if (personnaliserLogoPreview) {
              personnaliserLogoPreview.src = "";
              personnaliserLogoPreview.classList.add("hidden");
            }
            if (personnaliserLogoPlaceholder) personnaliserLogoPlaceholder.classList.remove("hidden");
            syncPersonnaliserLogoClearVisibility();
            updatePersonnaliserPreview();
            refreshSidebarBusinessLogo();
          }
            })
            .catch(() => {
              syncPersonnaliserLogoClearVisibility();
              updatePersonnaliserPreview();
              refreshSidebarBusinessLogo();
            });
        } else {
          let errMsg = data.error || "Erreur lors de l'enregistrement.";
          if (res.status === 401) errMsg = "Accès refusé. Utilisez le lien reçu par e-mail pour ouvrir cette page (il contient le token), ou déconnectez-vous puis reconnectez-vous.";
          else if (res.status === 404) errMsg = "Commerce introuvable.";
          else if (res.status === 500) errMsg = data.error || "Erreur serveur. Réessayez.";
          showPersonnaliserMessage(errMsg, true);
        }
      } catch (_) {
        showPersonnaliserMessage("Erreur réseau. Vérifiez votre connexion.", true);
      }
      personnaliserSave.disabled = false;
    });
  }

  /** Après changement du nom d’établissement (Profil ou chargement) : sidebar, Ma carte, aperçus. */
  function propagateEstablishmentDisplayName(displayName) {
    const n = (displayName || "").trim();
    currentOrganizationName = n || "Votre commerce";
    const side = document.getElementById("app-business-name");
    if (side) side.textContent = n || slug || "Mon espace";
    if (personnaliserOrg && n) personnaliserOrg.value = n;
    try {
      if (typeof updatePersonnaliserPreview === "function") updatePersonnaliserPreview();
    } catch (_) {
      /* preview pas encore initialisé */
    }
    try {
      if (typeof updateAppNotificationPreview === "function") updateAppNotificationPreview();
    } catch (_) {
      /* idem */
    }
    const headerAvatar = document.getElementById("app-dashboard-profile-avatar");
    const initialsEl = document.getElementById("app-dashboard-profile-initials");
    if (initialsEl && n && (!headerAvatar || headerAvatar.classList.contains("hidden"))) {
      const parts = n.split(/\s+/).filter(Boolean);
      let ini = "";
      if (parts.length >= 2) ini = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      else if (parts.length === 1 && parts[0].length >= 2) ini = parts[0].slice(0, 2).toUpperCase();
      else if (parts.length === 1) ini = (parts[0][0] || "?").toUpperCase();
      initialsEl.textContent = ini || "ME";
    }
  }

  // ——— Profil (nom, logo, adresse) ———
  const profilOrg = document.getElementById("app-profil-org");
  const profilAddress = document.getElementById("app-profil-address");
  const profilLogoPreview = document.getElementById("app-profil-logo-preview");
  const profilLogoPlaceholder = document.getElementById("app-profil-logo-placeholder");
  const profilLogoInput = document.getElementById("app-profil-logo-input");
  const profilLogoRemove = document.getElementById("app-profil-logo-remove");
  const profilLogoIconPreview = document.getElementById("app-profil-logo-icon-preview");
  const profilLogoIconPlaceholder = document.getElementById("app-profil-logo-icon-placeholder");
  const profilLogoIconInput = document.getElementById("app-profil-logo-icon-input");
  const profilLogoIconRemove = document.getElementById("app-profil-logo-icon-remove");
  const profilSlugDisplay = document.getElementById("app-profil-slug-display");
  const profilMessage = document.getElementById("app-profil-message");
  const profilSave = document.getElementById("app-profil-save");
  const profilSaveText = document.getElementById("app-profil-save-text");
  const profilSaveSpinner = document.getElementById("app-profil-save-spinner");
  const profilEmailInput = document.getElementById("app-profil-email");
  const profilAccountMessage = document.getElementById("app-profil-account-message");
  const profilChangePasswordBtn = document.getElementById("app-profil-change-password");
  const profilSubscriptionStatus = document.getElementById("app-profil-subscription-status");
  let profilLogoDataUrl = "";
  let profilLogoRemoved = false;
  let profilLogoIconDataUrl = "";
  let profilLogoIconRemoved = false;
  const profilAddressSuggestions = document.getElementById("app-profil-address-suggestions");
  let profilAddrDebounce = null;

  function hideProfilAddressSuggestions() {
    if (profilAddressSuggestions) {
      profilAddressSuggestions.classList.add("hidden");
      profilAddressSuggestions.innerHTML = "";
    }
    profilAddress?.setAttribute("aria-expanded", "false");
  }

  function escapeHtmlProfilAddr(s) {
    const div = document.createElement("div");
    div.textContent = String(s);
    return div.innerHTML;
  }

  if (profilAddress && profilAddressSuggestions) {
    profilAddress.addEventListener("input", () => {
      if (profilAddrDebounce) clearTimeout(profilAddrDebounce);
      const q = (profilAddress.value || "").trim();
      markAppSectionDirty("profil");
      if (q.length < 2) {
        hideProfilAddressSuggestions();
        return;
      }
      profilAddrDebounce = setTimeout(async () => {
        const features = await photonGeocodeFeatures(q, 8);
        profilAddressSuggestions.innerHTML = "";
        if (!features.length) {
          hideProfilAddressSuggestions();
          return;
        }
        features.forEach((f) => {
          const coords = f.geometry?.coordinates;
          if (!coords || coords.length < 2) return;
          const props = f.properties || {};
          const displayAddr = formatPhotonAddress(props);
          const main = props.name || [props.street, props.housenumber].filter(Boolean).join(" ") || "Adresse";
          const sub = [props.postcode, props.city, props.country].filter(Boolean).join(", ");
          const li = document.createElement("li");
          li.setAttribute("role", "option");
          li.innerHTML = sub
            ? `${escapeHtmlProfilAddr(main)}<small>${escapeHtmlProfilAddr(sub)}</small>`
            : escapeHtmlProfilAddr(main);
          li.addEventListener("click", () => {
            if (profilAddress) profilAddress.value = displayAddr;
            hideProfilAddressSuggestions();
            markAppSectionDirty("profil");
          });
          profilAddressSuggestions.appendChild(li);
        });
        profilAddressSuggestions.classList.remove("hidden");
        profilAddress.setAttribute("aria-expanded", "true");
      }, 320);
    });

    profilAddress.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hideProfilAddressSuggestions();
    });

    document.addEventListener("click", (e) => {
      if (!profilAddressSuggestions || profilAddressSuggestions.classList.contains("hidden")) return;
      const t = /** @type {Node} */ (e.target);
      if (profilAddress?.contains(t) || profilAddressSuggestions.contains(t)) return;
      hideProfilAddressSuggestions();
    });
  }

  function showProfilMessage(text, isError = false) {
    if (!profilMessage) return;
    profilMessage.textContent = text || "";
    profilMessage.classList.toggle("hidden", !text);
    profilMessage.classList.toggle("success", text && !isError);
    profilMessage.classList.toggle("error", text && isError);
  }

  function showProfilAccountMessage(text, isError = false) {
    if (!profilAccountMessage) return;
    profilAccountMessage.textContent = text || "";
    profilAccountMessage.classList.toggle("hidden", !text);
    profilAccountMessage.classList.toggle("success", text && !isError);
    profilAccountMessage.classList.toggle("error", text && isError);
  }

  function loadProfil() {
    return api("/dashboard/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) {
          showProfilMessage("Impossible de charger les données de l’établissement. Vérifiez la connexion ou rechargez la page.", true);
          return;
        }
        const orgName = (data.organization_name ?? data.organizationName ?? "").trim();
        if (profilOrg) profilOrg.value = orgName;
        propagateEstablishmentDisplayName(orgName);
        if (profilAddress) profilAddress.value = (data.location_address ?? data.locationAddress ?? "").trim();
        hideProfilAddressSuggestions();
        const base = (typeof window !== "undefined" && window.location?.origin) ? window.location.origin.replace(/\/$/, "") : "";
        if (profilSlugDisplay) {
          profilSlugDisplay.textContent = base ? `${base}/fidelity/${slug}` : `/fidelity/${slug}`;
          const link = document.createElement("a");
          link.href = base ? `${base}/fidelity/${slug}` : "#";
          link.target = "_blank";
          link.rel = "noopener";
          link.textContent = base ? `${base}/fidelity/${slug}` : slug;
          link.style.color = "inherit";
          profilSlugDisplay.innerHTML = "";
          profilSlugDisplay.appendChild(link);
        }
        profilLogoDataUrl = "";
        if (profilLogoPreview) {
          profilLogoPreview.src = "";
          profilLogoPreview.classList.add("hidden");
        }
        if (profilLogoPlaceholder) {
          profilLogoPlaceholder.textContent = "Aucun logo";
          profilLogoPlaceholder.classList.remove("hidden");
        }
        if (profilLogoRemove) profilLogoRemove.classList.add("hidden");
        profilLogoRemoved = false;
        if (profilLogoIconPreview) {
          profilLogoIconPreview.src = "";
          profilLogoIconPreview.classList.add("hidden");
        }
        if (profilLogoIconPlaceholder) {
          profilLogoIconPlaceholder.textContent = "Aucun logo carré";
          profilLogoIconPlaceholder.classList.remove("hidden");
        }
        if (profilLogoIconRemove) profilLogoIconRemove.classList.add("hidden");
        profilLogoIconRemoved = false;
        profilLogoIconDataUrl = "";
        if (data.logo_url ?? data.logoUrl) {
          api("/logo?v=" + Date.now())
            .then((r) => (r.ok ? r.blob() : null))
            .then((blob) => {
              if (blob && profilLogoPreview) {
                const url = URL.createObjectURL(blob);
                profilLogoPreview.src = url;
                profilLogoPreview.classList.remove("hidden");
                if (profilLogoPlaceholder) profilLogoPlaceholder.classList.add("hidden");
                if (profilLogoRemove) profilLogoRemove.classList.remove("hidden");
              }
              refreshSidebarBusinessLogo();
            })
            .catch(() => {
              refreshSidebarBusinessLogo();
            });
        } else {
          refreshSidebarBusinessLogo();
        }
        if (data.logo_icon_url ?? data.logoIconUrl) {
          api("/logo-icon?v=" + Date.now())
            .then((r) => (r.ok ? r.blob() : null))
            .then((blob) => {
              if (blob && profilLogoIconPreview) {
                const url = URL.createObjectURL(blob);
                profilLogoIconPreview.src = url;
                profilLogoIconPreview.classList.remove("hidden");
                if (profilLogoIconPlaceholder) profilLogoIconPlaceholder.classList.add("hidden");
                if (profilLogoIconRemove) profilLogoIconRemove.classList.remove("hidden");
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {
        showProfilMessage("Erreur réseau lors du chargement du profil.", true);
      });
  }

  registerAppDiscardHandler("profil", () => loadProfil());

  // Renseigne les infos compte (email, abonnement) à partir de /api/auth/me (événement émis après initAppDashboard)
  window.addEventListener("fidpass-auth-me", (e) => {
    const d = e.detail || {};
    const user = d.user;
    const subscription = d.subscription || null;
    const hasActiveSubscription = !!(d.hasActiveSubscription ?? d.has_active_subscription);
    if (profilEmailInput && user?.email) profilEmailInput.value = user.email;
    if (profilSubscriptionStatus) {
      let text = "Aucun abonnement actif";
      if (hasActiveSubscription) {
        text = "Abonnement actif";
        if (subscription?.plan_id) text += ` — ${subscription.plan_id}`;
      }
      profilSubscriptionStatus.textContent = text;
    }
  });

  if (profilLogoInput) {
    profilLogoInput.addEventListener("change", async (e) => {
      const file = e.target?.files?.[0];
      if (!file) return;
      try {
        if (typeof resizeLogoToDataUrl === "function") {
          profilLogoDataUrl = await resizeLogoToDataUrl(file, 640, 0.9, "auto");
        } else {
          const reader = new FileReader();
          profilLogoDataUrl = await new Promise((res, rej) => {
            reader.onload = () => res(reader.result);
            reader.onerror = rej;
            reader.readAsDataURL(file);
          });
        }
        if (profilLogoPreview) {
          profilLogoPreview.src = profilLogoDataUrl;
          profilLogoPreview.classList.remove("hidden");
        }
        if (profilLogoPlaceholder) profilLogoPlaceholder.classList.add("hidden");
        if (profilLogoRemove) profilLogoRemove.classList.remove("hidden");
      } catch (err) {
        showProfilMessage("Impossible de charger l'image. Choisissez un fichier JPG ou PNG.", true);
      }
      profilLogoInput.value = "";
    });
  }
  if (profilLogoRemove) {
    profilLogoRemove.addEventListener("click", () => {
      profilLogoDataUrl = "";
      profilLogoRemoved = true;
      if (profilLogoPreview) {
        profilLogoPreview.src = "";
        profilLogoPreview.classList.add("hidden");
      }
      if (profilLogoPlaceholder) {
        profilLogoPlaceholder.textContent = "Aucun logo";
        profilLogoPlaceholder.classList.remove("hidden");
      }
      profilLogoRemove.classList.add("hidden");
      showProfilMessage("");
    });
  }

  if (profilLogoIconInput) {
    profilLogoIconInput.addEventListener("change", async (e) => {
      const file = e.target?.files?.[0];
      if (!file) return;
      try {
        if (typeof resizeLogoToDataUrl === "function") {
          profilLogoIconDataUrl = await resizeLogoToDataUrl(file, 512, 0.88, "auto");
        } else {
          const reader = new FileReader();
          profilLogoIconDataUrl = await new Promise((res, rej) => {
            reader.onload = () => res(reader.result);
            reader.onerror = rej;
            reader.readAsDataURL(file);
          });
        }
        if (profilLogoIconPreview) {
          profilLogoIconPreview.src = profilLogoIconDataUrl;
          profilLogoIconPreview.classList.remove("hidden");
        }
        if (profilLogoIconPlaceholder) profilLogoIconPlaceholder.classList.add("hidden");
        if (profilLogoIconRemove) profilLogoIconRemove.classList.remove("hidden");
        profilLogoIconRemoved = false;
      } catch (err) {
        showProfilMessage("Impossible de charger l’image du logo carré. Choisissez un JPG ou PNG.", true);
      }
      profilLogoIconInput.value = "";
    });
  }
  if (profilLogoIconRemove) {
    profilLogoIconRemove.addEventListener("click", () => {
      profilLogoIconDataUrl = "";
      profilLogoIconRemoved = true;
      if (profilLogoIconPreview) {
        profilLogoIconPreview.src = "";
        profilLogoIconPreview.classList.add("hidden");
      }
      if (profilLogoIconPlaceholder) {
        profilLogoIconPlaceholder.textContent = "Aucun logo carré";
        profilLogoIconPlaceholder.classList.remove("hidden");
      }
      profilLogoIconRemove.classList.add("hidden");
      showProfilMessage("");
    });
  }

  document.getElementById("app-profil-open-slug-editor")?.addEventListener("click", () => {
    const name = profilOrg?.value?.trim() || "";
    openPersonnaliserShareWithSuggestedSlug(name);
  });

  if (profilSave) {
    profilSave.addEventListener("click", async () => {
      const organizationName = profilOrg?.value?.trim() || "";
      const addressVal = profilAddress?.value?.trim() || "";
      const body = {
        organization_name: organizationName || undefined,
        location_address: addressVal || undefined,
      };
      if (profilLogoRemoved) {
        body.logo_base64 = null;
      } else if (profilLogoDataUrl && typeof profilLogoDataUrl === "string" && profilLogoDataUrl.startsWith("data:")) {
        body.logo_base64 = profilLogoDataUrl;
      }
      if (profilLogoIconRemoved) {
        body.logo_icon_base64 = null;
      } else if (profilLogoIconDataUrl && typeof profilLogoIconDataUrl === "string" && profilLogoIconDataUrl.startsWith("data:")) {
        body.logo_icon_base64 = profilLogoIconDataUrl;
      }
      if (addressVal) {
        try {
          const coords = await geocodeAddress(addressVal);
          if (coords) {
            body.location_lat = coords.lat;
            body.location_lng = coords.lng;
          }
        } catch (_) {}
      }
      profilSave.disabled = true;
      if (profilSaveText) profilSaveText.classList.add("hidden");
      if (profilSaveSpinner) profilSaveSpinner.classList.remove("hidden");
      showProfilMessage("");
      const url = `${API_BASE}/api/businesses/${encodeURIComponent(slug)}${dashboardToken ? `?token=${encodeURIComponent(dashboardToken)}` : ""}`;
      const headers = { "Content-Type": "application/json", ...getAuthHeaders() };
      if (dashboardToken) headers["X-Dashboard-Token"] = dashboardToken;
      try {
        const res = await fetch(url, { method: "PATCH", headers, body: JSON.stringify(body) });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          showProfilMessage("Modifications enregistrées.");
          notifyAppSectionSaveSuccess("profil");
          profilLogoRemoved = false;
          propagateEstablishmentDisplayName(organizationName);
          refreshSidebarBusinessLogo();
          if (body.logo_base64 && profilLogoPreview?.src?.startsWith("data:")) {
            profilLogoDataUrl = "";
          }
          if (body.logo_base64 === null) {
            if (profilLogoPreview) {
              profilLogoPreview.src = "";
              profilLogoPreview.classList.add("hidden");
            }
            if (profilLogoPlaceholder) {
              profilLogoPlaceholder.textContent = "Aucun logo";
              profilLogoPlaceholder.classList.remove("hidden");
            }
            if (profilLogoRemove) profilLogoRemove.classList.add("hidden");
          }
          profilLogoIconRemoved = false;
          if (body.logo_icon_base64 && profilLogoIconPreview?.src?.startsWith("data:")) {
            profilLogoIconDataUrl = "";
          }
          if (body.logo_icon_base64 === null) {
            if (profilLogoIconPreview) {
              profilLogoIconPreview.src = "";
              profilLogoIconPreview.classList.add("hidden");
            }
            if (profilLogoIconPlaceholder) {
              profilLogoIconPlaceholder.textContent = "Aucun logo carré";
              profilLogoIconPlaceholder.classList.remove("hidden");
            }
            if (profilLogoIconRemove) profilLogoIconRemove.classList.add("hidden");
          }
        } else {
          showProfilMessage(data.error || "Erreur lors de l'enregistrement.", true);
        }
      } catch (_) {
        showProfilMessage("Erreur réseau. Réessayez.", true);
      }
      profilSave.disabled = false;
      if (profilSaveText) profilSaveText.classList.remove("hidden");
      if (profilSaveSpinner) profilSaveSpinner.classList.add("hidden");
    });
  }

  if (profilChangePasswordBtn) {
    profilChangePasswordBtn.addEventListener("click", async () => {
      const email = profilEmailInput?.value?.trim();
      if (!email) {
        showProfilAccountMessage("Email inconnu. Rechargez la page ou reconnectez-vous.", true);
        return;
      }
      showProfilAccountMessage("");
      profilChangePasswordBtn.disabled = true;
      try {
        const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          showProfilAccountMessage(
            data.message || "Si un compte existe avec cet email, vous allez recevoir un lien pour choisir un nouveau mot de passe.",
            false
          );
        } else {
          showProfilAccountMessage(data.error || "Impossible d'envoyer l'e-mail. Réessayez plus tard.", true);
        }
      } catch (_) {
        showProfilAccountMessage("Erreur réseau. Vérifiez votre connexion et réessayez.", true);
      }
      profilChangePasswordBtn.disabled = false;
    });
  }

  window.addEventListener("app-section-change", (e) => {
    if (e.detail?.sectionId !== "profil") return;
    loadProfil();
    const sidebarEmail = document.getElementById("app-user-email")?.textContent?.trim();
    if (profilEmailInput && sidebarEmail && !profilEmailInput.value?.trim()) {
      profilEmailInput.value = sidebarEmail;
    }
  });
  if (document.getElementById("profil")?.classList.contains("app-section-visible")) loadProfil();

  // ——— Scanner (caméra) ———
  const caisseChoose = document.getElementById("app-caisse-choose");
  const scannerVerifying = document.getElementById("app-scanner-verifying");
  const scannerFullscreen = document.getElementById("app-scanner-fullscreen");
  const scannerFullscreenViewport = document.getElementById("app-scanner-fullscreen-viewport");
  const scannerFullscreenVerifying = document.getElementById("app-scanner-fullscreen-verifying");
  const scannerSuccessFlash = document.getElementById("app-scanner-success-flash");
  const scannerFullscreenReject = document.getElementById("app-scanner-fullscreen-reject");
  const scannerFullscreenRejectMsg = document.getElementById("app-scanner-fullscreen-reject-msg");
  const scannerReject = document.getElementById("app-scanner-reject");
  const scannerRejectTitle = document.getElementById("app-scanner-reject-title");
  const scannerRejectMessage = document.getElementById("app-scanner-reject-message");
  const scannerRetryBtn = document.getElementById("app-scanner-retry");
  const scannerResult = document.getElementById("app-scanner-result");
  const scannerResultName = document.getElementById("app-scanner-result-name");
  const scannerResultEmail = document.getElementById("app-scanner-result-email");
  const scannerResultPoints = document.getElementById("app-scanner-result-points");
  const scannerResultLastVisit = document.getElementById("app-scanner-result-last-visit");
  const scannerHistoryList = document.getElementById("app-scanner-history-list");
  const scannerOneVisit = document.getElementById("app-scanner-one-visit");
  const scannerAmount = document.getElementById("app-scanner-amount");
  const scannerAddPoints = document.getElementById("app-scanner-add-points");
  const scannerResume = document.getElementById("app-scanner-resume");
  const scannerResultMessage = document.getElementById("app-scanner-result-message");
  const scannerCard = document.getElementById("app-scanner-card");
  const scannerActionsStamps = document.getElementById("app-scanner-actions-stamps");
  const scannerActionsPoints = document.getElementById("app-scanner-actions-points");
  const scannerAddOneStamp = document.getElementById("app-scanner-add-one-stamp");

  let scannerInstance = null;
  let scannerCurrentMemberId = null;
  let scannerCurrentMember = null;
  let scannerVisitOnly = false;
  let scannerProgramType = "points";
  let scannerRequiredStamps = 10;
  let scannerPointsPerEuro = 1;

  function hideAllScannerStates() {
    if (scannerVerifying) scannerVerifying.classList.add("hidden");
    if (scannerReject) scannerReject.classList.add("hidden");
    if (scannerResult) scannerResult.classList.add("hidden");
    if (caisseChoose) caisseChoose.classList.remove("hidden");
    scannerCard?.classList.remove("app-scanner-has-overlay");
  }

  function closeFullscreenScanner() {
    if (scannerFullscreen) { scannerFullscreen.classList.add("hidden"); scannerFullscreen.setAttribute("aria-hidden", "true"); }
    if (scannerFullscreenVerifying) scannerFullscreenVerifying.classList.add("hidden");
    if (scannerSuccessFlash) scannerSuccessFlash.classList.add("hidden");
    if (scannerFullscreenReject) scannerFullscreenReject.classList.add("hidden");
  }

  function showScannerVerifying() {
    if (caisseChoose) caisseChoose.classList.add("hidden");
    if (scannerVerifying) scannerVerifying.classList.remove("hidden");
    if (scannerReject) scannerReject.classList.add("hidden");
    if (scannerResult) scannerResult.classList.add("hidden");
    scannerCard?.classList.add("app-scanner-has-overlay");
  }

  function scannerFeedbackSuccess() {
    try { if (navigator.vibrate) navigator.vibrate(100); } catch (_) {}
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      gain.gain.value = 0.15;
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    } catch (_) {}
  }
  function scannerFeedbackReject() {
    try { if (navigator.vibrate) navigator.vibrate([50, 50, 50]); } catch (_) {}
  }

  function showFullscreenReject(message) {
    scannerFeedbackReject();
    if (scannerFullscreenVerifying) scannerFullscreenVerifying.classList.add("hidden");
    if (scannerSuccessFlash) scannerSuccessFlash.classList.add("hidden");
    if (scannerFullscreenReject && scannerFullscreenRejectMsg) {
      scannerFullscreenRejectMsg.textContent = message || "Ce QR code ne correspond pas à un client de votre commerce.";
      scannerFullscreenReject.classList.remove("hidden");
    }
  }

  function showScannerReject(message, isCameraError = false) {
    scannerFeedbackReject();
    closeFullscreenScanner();
    hideAllScannerStates();
    if (scannerReject) scannerReject.classList.remove("hidden");
    if (scannerRejectTitle) scannerRejectTitle.textContent = isCameraError ? "Caméra inaccessible" : "Code non reconnu";
    if (scannerRejectMessage) scannerRejectMessage.textContent = message || (isCameraError ? "Autorisez la caméra dans les paramètres du navigateur (icône cadenas ou « i » dans la barre d’adresse), puis réessayez. En HTTP la caméra ne fonctionne pas : utilisez https://." : "Ce QR code ne correspond pas à un client de votre commerce.");
    scannerCard?.classList.add("app-scanner-has-overlay");
  }

  async function showScannerResult(member) {
    scannerFeedbackSuccess();
    scannerCurrentMemberId = member.id;
    scannerCurrentMember = member;
    if (scannerFullscreenVerifying) scannerFullscreenVerifying.classList.add("hidden");
    if (scannerSuccessFlash) scannerSuccessFlash.classList.remove("hidden");
    await new Promise((r) => setTimeout(r, 1200));
    closeFullscreenScanner();
    hideAllScannerStates();
    if (scannerResult) scannerResult.classList.remove("hidden");
    if (caisseChoose) caisseChoose.classList.add("hidden");
    scannerCard?.classList.add("app-scanner-has-overlay");

    try {
      const settingsRes = await api("/dashboard/settings");
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        let pt = (data.program_type ?? data.programType ?? "").toLowerCase();
        if (pt !== "points" && pt !== "stamps") {
          pt = (data.required_stamps ?? data.requiredStamps) > 0 ? "stamps" : "points";
        }
        scannerProgramType = pt;
        scannerRequiredStamps = Math.max(1, parseInt(data.required_stamps ?? data.requiredStamps, 10) || 10);
        scannerPointsPerEuro = data.points_per_euro ?? data.pointsPerEuro ?? 1;
      }
    } catch (_) {}

    const displayName = member.name?.trim() || member.email || "Client";
    if (scannerResultName) scannerResultName.textContent = displayName;
    if (scannerResultEmail) {
      scannerResultEmail.textContent = member.email || "";
      scannerResultEmail.classList.toggle("hidden", !member.email);
    }
    const pts = member.points ?? 0;
    if (scannerResultPoints) {
      scannerResultPoints.textContent = scannerProgramType === "stamps"
        ? `${Math.min(pts, scannerRequiredStamps)} / ${scannerRequiredStamps} tampons`
        : `${pts} point(s)`;
    }
    if (scannerActionsStamps) scannerActionsStamps.classList.toggle("hidden", scannerProgramType !== "stamps");
    if (scannerActionsPoints) scannerActionsPoints.classList.toggle("hidden", scannerProgramType === "stamps");

    if (scannerResultLastVisit) {
      if (member.last_visit_at) {
        scannerResultLastVisit.textContent = "Dernière visite : " + formatDate(member.last_visit_at);
        scannerResultLastVisit.classList.remove("hidden");
      } else {
        scannerResultLastVisit.textContent = "";
        scannerResultLastVisit.classList.add("hidden");
      }
    }
    if (scannerResultMessage) { scannerResultMessage.classList.add("hidden"); scannerResultMessage.textContent = ""; }
    if (scannerAmount) scannerAmount.value = "";
    const pointsPreviewEl = document.getElementById("app-scanner-points-preview");
    if (pointsPreviewEl) { pointsPreviewEl.classList.add("hidden"); pointsPreviewEl.textContent = ""; }
    scannerVisitOnly = false;

    if (scannerProgramType === "points" && scannerAmount) {
      setTimeout(() => {
        scannerAmount.focus();
      }, 450);
    } else {
      const firstBtn = scannerResult?.querySelector("button:not([disabled]), .app-btn-primary, [id^='app-caisse-one'], [id^='app-scanner-']");
      if (firstBtn && typeof firstBtn.focus === "function") {
        setTimeout(() => firstBtn.focus(), 450);
      }
    }

    if (scannerHistoryList) {
      scannerHistoryList.innerHTML = "";
      try {
        const txRes = await api("/dashboard/transactions?limit=5&memberId=" + encodeURIComponent(member.id));
        if (txRes.ok) {
          const { transactions } = await txRes.json();
          if (transactions?.length) {
            transactions.forEach((t) => {
              const li = document.createElement("li");
              const label = scannerProgramType === "stamps"
                ? (t.points === 1 ? "1 tampon" : `+${t.points} tampons`)
                : `+${t.points} pt${t.points > 1 ? "s" : ""}`;
              li.textContent = `${label} — ${formatDate(t.created_at)}`;
              scannerHistoryList.appendChild(li);
            });
          } else {
            const li = document.createElement("li");
            li.className = "app-scanner-history-empty";
            li.textContent = "Aucune opération pour l’instant.";
            scannerHistoryList.appendChild(li);
          }
        }
      } catch (_) {}
    }
    updateRedeemButtons();
  }

  function hideScannerResult() {
    scannerCurrentMemberId = null;
    scannerCurrentMember = null;
    hideAllScannerStates();
    if (caisseChoose) caisseChoose.classList.remove("hidden");
    if (scannerResultMessage) { scannerResultMessage.classList.add("hidden"); scannerResultMessage.textContent = ""; }
    if (caisseMessage) { caisseMessage.classList.add("hidden"); caisseMessage.textContent = ""; }
    updateRedeemButtons();
  }

  const scannerCameraSelect = document.getElementById("app-scanner-camera-select");
  let scannerCameraList = [];

  /** Construit la config caméra à partir du deviceId sélectionné ou facingMode. */
  function getCameraConfigFromSelection(deviceId) {
    const base = { width: { ideal: 1280 }, height: { ideal: 720 } };
    if (deviceId && deviceId !== "default") {
      return deviceId;
    }
    return { facingMode: "user", ...base };
  }

  function fillCameraSelect(cameras) {
    if (!scannerCameraSelect) return;
    scannerCameraList = cameras;
    scannerCameraSelect.innerHTML = "";
    if (cameras.length === 0) {
      scannerCameraSelect.innerHTML = '<option value="default">Par défaut</option>';
      return;
    }
    cameras.forEach((cam, i) => {
      const opt = document.createElement("option");
      opt.value = cam.deviceId;
      opt.textContent = cam.label || "Caméra " + (i + 1);
      scannerCameraSelect.appendChild(opt);
    });
  }

  function getSelectedCameraId() {
    if (!scannerCameraSelect || !scannerCameraSelect.value) return "default";
    return scannerCameraSelect.value;
  }

  async function startScannerWithCamera(cameraConfig, allowFallback = true) {
    if (scannerInstance || !scannerFullscreenViewport) return;
    const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
    const config = { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE] };
    scannerInstance = new Html5Qrcode("app-scanner-fullscreen-viewport", config);
    const qrboxSize = Math.min(280, Math.min(window.innerWidth, window.innerHeight) * 0.72);
    const scanConfig = { fps: 15, qrbox: { width: qrboxSize, height: qrboxSize } };

    scannerInstance.start(cameraConfig, scanConfig, async (decodedText) => {
      if (scannerCurrentMemberId) return;
      const instance = scannerInstance;
      try {
        if (instance) await instance.stop();
      } catch (_) {}
      scannerInstance = null;
      if (scannerFullscreenVerifying) scannerFullscreenVerifying.classList.remove("hidden");
      if (scannerSuccessFlash) scannerSuccessFlash.classList.add("hidden");
      if (scannerFullscreenReject) scannerFullscreenReject.classList.add("hidden");
      const memberId = decodedText.trim();
      try {
        const res = await api("/members/" + encodeURIComponent(memberId));
        if (res.status === 404) {
          showFullscreenReject("Ce QR code ne correspond pas à un client de votre commerce.");
          return;
        }
        if (!res.ok) {
          showFullscreenReject("Erreur serveur. Réessayez dans un instant.");
          return;
        }
        const member = await res.json();
        await showScannerResult(member);
      } catch (_) {
        showFullscreenReject("Impossible de vérifier le code. Vérifiez votre connexion et réessayez.");
      }
    }, () => {}).catch((err) => {
      scannerInstance = null;
      const canFallback = allowFallback && (typeof cameraConfig === "string" || (cameraConfig && cameraConfig.deviceId));
      if (canFallback) {
        // Fallback robuste desktop: webcam user sans deviceId strict.
        startScannerWithCamera({ facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, false).catch(() => {});
        return;
      }
      closeFullscreenScanner();
      const msg = err?.message || "Impossible d'accéder à la caméra. Vérifiez les permissions du navigateur.";
      showScannerReject(msg, true);
    });
  }

  async function startFullscreenScanner() {
    if (scannerInstance) return;
    if (!scannerFullscreen || !scannerFullscreenViewport) return;

    // Demander l'accès caméra IMMÉDIATEMENT (dans le même « geste » que le clic), sinon Chrome ne montre pas la demande
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
    } catch (err) {
      const msg = err?.message || "Impossible d'accéder à la caméra. Vérifiez les permissions (site en HTTPS, clic sur le cadenas pour autoriser la caméra).";
      showScannerReject(msg, true);
      return;
    }

    const cameras = await navigator.mediaDevices.enumerateDevices().then((devices) => devices.filter((d) => d.kind === "videoinput"));
    const videoTrack = stream.getVideoTracks()[0];
    const workingDeviceId = videoTrack ? videoTrack.getSettings().deviceId : null;
    stream.getTracks().forEach((t) => t.stop());

    scannerFullscreen.classList.remove("hidden");
    scannerFullscreen.setAttribute("aria-hidden", "false");
    if (scannerFullscreenVerifying) scannerFullscreenVerifying.classList.add("hidden");
    if (scannerSuccessFlash) scannerSuccessFlash.classList.add("hidden");
    if (scannerFullscreenReject) scannerFullscreenReject.classList.add("hidden");
    scannerFullscreenViewport.innerHTML = "";
    fillCameraSelect(cameras);
    if (scannerCameraSelect) scannerCameraSelect.disabled = false;

    // Sur PC, utiliser la même caméra que celle qui a répondu à la demande (évite « arrière » / flux noir)
    const deviceId = workingDeviceId || (cameras.length > 0 ? getSelectedCameraId() || cameras[0].deviceId : null) || "default";
    if (scannerCameraSelect && workingDeviceId && cameras.some((c) => c.deviceId === workingDeviceId)) {
      scannerCameraSelect.value = workingDeviceId;
    }
    const cameraConfig = getCameraConfigFromSelection(deviceId);
    await startScannerWithCamera(cameraConfig, true);
  }

  function restartScannerWithSelectedCamera() {
    if (!scannerFullscreen || scannerFullscreen.classList.contains("hidden")) return;
    if (scannerInstance) {
      scannerInstance.stop().then(async () => {
        scannerInstance = null;
        scannerFullscreenViewport.innerHTML = "";
        const deviceId = getSelectedCameraId();
        const cameraConfig = getCameraConfigFromSelection(deviceId);
        await startScannerWithCamera(cameraConfig, true);
      }).catch(async () => {
        scannerInstance = null;
        scannerFullscreenViewport.innerHTML = "";
        const deviceId = getSelectedCameraId();
        const cameraConfig = getCameraConfigFromSelection(deviceId);
        await startScannerWithCamera(cameraConfig, true);
      });
    }
  }

  if (scannerCameraSelect) {
    scannerCameraSelect.addEventListener("change", () => restartScannerWithSelectedCamera());
  }

  function stopFullscreenScanner() {
    if (scannerInstance) {
      scannerInstance.stop().then(() => {
        scannerInstance = null;
        closeFullscreenScanner();
      }).catch(() => {
        scannerInstance = null;
        closeFullscreenScanner();
      });
    } else {
      closeFullscreenScanner();
    }
  }

  document.getElementById("app-scanner-launch-btn")?.addEventListener("click", () => startFullscreenScanner());
  document.getElementById("app-scanner-fullscreen-close")?.addEventListener("click", () => stopFullscreenScanner());
  document.getElementById("app-scanner-fullscreen-retry")?.addEventListener("click", () => {
    if (scannerFullscreenReject) scannerFullscreenReject.classList.add("hidden");
    if (scannerFullscreenViewport) scannerFullscreenViewport.innerHTML = "";
    startFullscreenScanner();
  });

  scannerRetryBtn?.addEventListener("click", () => {
    hideAllScannerStates();
    if (caisseChoose) caisseChoose.classList.remove("hidden");
    startFullscreenScanner();
  });

  scannerResume?.addEventListener("click", () => {
    hideScannerResult();
  });

  scannerOneVisit?.addEventListener("click", () => { scannerVisitOnly = true; if (scannerAmount) scannerAmount.value = ""; updateScannerPointsPreview(); });
  const scannerPointsPreview = document.getElementById("app-scanner-points-preview");
  function updateScannerPointsPreview() {
    if (!scannerPointsPreview || scannerProgramType !== "points") return;
    const raw = (scannerAmount?.value || "").replace(",", ".").trim();
    const amt = parseFloat(raw);
    if (!Number.isFinite(amt) || amt <= 0) {
      scannerPointsPreview.classList.add("hidden");
      scannerPointsPreview.textContent = "";
      return;
    }
    const pts = Math.floor(amt * scannerPointsPerEuro);
    scannerPointsPreview.textContent = `= ${pts} point${pts !== 1 ? "s" : ""}`;
    scannerPointsPreview.classList.remove("hidden");
  }
  scannerAmount?.addEventListener("input", () => { scannerVisitOnly = false; updateScannerPointsPreview(); });

  const scannerAmountTap = document.getElementById("app-scanner-amount-tap");
  if (scannerAmountTap && scannerAmount) {
    scannerAmountTap.addEventListener("click", () => { scannerAmount.focus(); });
  }

  scannerAddOneStamp?.addEventListener("click", async () => {
    if (!scannerCurrentMemberId) return;
    scannerAddOneStamp.disabled = true;
    try {
      const headers = { "Content-Type": "application/json", ...getAuthHeaders() };
      if (dashboardToken) headers["X-Dashboard-Token"] = dashboardToken;
      const res = await fetch(`${API_BASE}/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(scannerCurrentMemberId)}/points`, {
        method: "POST",
        headers,
        body: JSON.stringify({ visit: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (scannerResultMessage) {
          scannerResultMessage.textContent = data.error || "Erreur";
          scannerResultMessage.classList.remove("hidden");
        }
        return;
      }
      const total = data.points;
      if (scannerResultMessage) {
        scannerResultMessage.textContent = `+1 tampon enregistré. ${Math.min(total, scannerRequiredStamps)} / ${scannerRequiredStamps} tampons.`;
        scannerResultMessage.classList.remove("hidden");
      }
      if (scannerResultPoints) {
        scannerResultPoints.textContent = `${Math.min(total, scannerRequiredStamps)} / ${scannerRequiredStamps} tampons`;
      }
      scannerCurrentMember = scannerCurrentMember ? { ...scannerCurrentMember, points: total } : null;
      await refresh();
    } catch (_) {
      if (scannerResultMessage) {
        scannerResultMessage.textContent = "Erreur réseau.";
        scannerResultMessage.classList.remove("hidden");
      }
    }
    scannerAddOneStamp.disabled = false;
  });

  scannerAddPoints?.addEventListener("click", async () => {
    if (!scannerCurrentMemberId) return;
    const amountRaw = (scannerAmount?.value || "").replace(",", ".").trim();
    const body = scannerVisitOnly ? { visit: true } : { amount_eur: parseFloat(amountRaw) || 0 };
    if (!scannerVisitOnly && !body.amount_eur) {
      if (scannerResultMessage) {
        scannerResultMessage.textContent = "Indiquez un montant (€) ou cliquez sur « 1 passage ».";
        scannerResultMessage.classList.remove("hidden");
      }
      return;
    }
    try {
      const headers = { "Content-Type": "application/json", ...getAuthHeaders() };
      if (dashboardToken) headers["X-Dashboard-Token"] = dashboardToken;
      const res = await fetch(`${API_BASE}/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(scannerCurrentMemberId)}/points`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (scannerResultMessage) {
          scannerResultMessage.textContent = data.error || "Erreur";
          scannerResultMessage.classList.remove("hidden");
        }
        return;
      }
      const added = data.points_added ?? data.points;
      const total = data.points;
      if (scannerResultMessage) {
        scannerResultMessage.textContent = scannerProgramType === "stamps"
          ? `+1 tampon enregistré. ${Math.min(total, scannerRequiredStamps)} / ${scannerRequiredStamps} tampons.`
          : `${added} point(s) ajouté(s). Total : ${total} pts.`;
        scannerResultMessage.classList.remove("hidden");
      }
      if (scannerResultPoints) {
        scannerResultPoints.textContent = scannerProgramType === "stamps"
          ? `${Math.min(total, scannerRequiredStamps)} / ${scannerRequiredStamps} tampons`
          : `${total} point(s)`;
      }
      scannerCurrentMember = scannerCurrentMember ? { ...scannerCurrentMember, points: total } : null;
      await refresh();
    } catch (_) {
      if (scannerResultMessage) {
        scannerResultMessage.textContent = "Erreur réseau.";
        scannerResultMessage.classList.remove("hidden");
      }
    }
  });

  document.querySelectorAll("#app-app .app-sidebar-link[data-section]").forEach((link) => {
    link.addEventListener("click", () => {
      const id = link.getAttribute("data-section");
      if (id !== "dashboard") stopFullscreenScanner();
    });
  });
  window.addEventListener("app-section-change", (e) => {
    if (e.detail?.sectionId !== "dashboard") stopFullscreenScanner();
  });

  let allMembers = [];
  let selectedMemberId = null;
  let addPointsVisitOnly = false;
  const CAISSE_RECENT_KEY = `fidpass_caisse_recent_${slug}`;
  const CAISSE_RECENT_MAX = 10;

  function getCaisseRecent() {
    try {
      const raw = localStorage.getItem(CAISSE_RECENT_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
  }
  function addToCaisseRecent(member) {
    if (!member?.id) return;
    let list = getCaisseRecent().filter((x) => x.id !== member.id);
    list.unshift({ id: member.id, name: member.name || "Client" });
    list = list.slice(0, CAISSE_RECENT_MAX);
    try {
      localStorage.setItem(CAISSE_RECENT_KEY, JSON.stringify(list));
    } catch (_) {}
    renderCaisseRecent();
  }
  function renderCaisseRecent() {
    const container = document.getElementById("app-caisse-recent");
    if (!container) return;
    const list = getCaisseRecent();
    if (list.length === 0) { container.innerHTML = ""; return; }
    container.innerHTML = list.map((m) => `<button type="button" class="app-caisse-recent-btn" data-id="${escapeHtml(m.id)}">${escapeHtml(m.name)}</button>`).join("");
    container.querySelectorAll(".app-caisse-recent-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        try {
          const res = await api("/members/" + encodeURIComponent(id));
          if (!res.ok) return;
          const member = await res.json();
          addToCaisseRecent(member);
          await showScannerResult(member);
          if (caisseChoose) caisseChoose.classList.add("hidden");
          if (scannerResult) scannerResult.classList.remove("hidden");
          if (scannerCard) scannerCard.classList.add("app-scanner-has-overlay");
          updateRedeemButtons();
        } catch (_) {}
      });
    });
  }

  const redeemStampsBtn = document.getElementById("app-redeem-stamps");
  const redeemPointsInput = document.getElementById("app-redeem-points");
  const redeemPointsBtn = document.getElementById("app-redeem-points-btn");
  function updateRedeemButtons() {
    const enabled = !!scannerCurrentMemberId;
    if (redeemStampsBtn) redeemStampsBtn.disabled = !enabled;
    if (redeemPointsBtn) redeemPointsBtn.disabled = !enabled;
  }
  function doRedeem(body) {
    if (!scannerCurrentMemberId) return;
    const url = `${API_BASE}/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(scannerCurrentMemberId)}/redeem`;
    const headers = { "Content-Type": "application/json", ...getAuthHeaders() };
    if (dashboardToken) headers["X-Dashboard-Token"] = dashboardToken;
    return fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  }
  redeemStampsBtn?.addEventListener("click", async () => {
    if (!scannerCurrentMemberId) return;
    redeemStampsBtn.disabled = true;
    try {
      const res = await doRedeem({ type: "stamps" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (scannerResultMessage) { scannerResultMessage.textContent = data.error || "Erreur"; scannerResultMessage.classList.remove("hidden"); }
        redeemStampsBtn.disabled = false;
        return;
      }
      if (scannerResultMessage) { scannerResultMessage.textContent = "Récompense tampons utilisée."; scannerResultMessage.classList.remove("hidden"); }
      if (scannerResultPoints) scannerResultPoints.textContent = `0 / ${scannerRequiredStamps} tampons`;
      scannerCurrentMember = scannerCurrentMember ? { ...scannerCurrentMember, points: 0 } : null;
      await refresh();
    } catch (_) {
      if (scannerResultMessage) { scannerResultMessage.textContent = "Erreur réseau."; scannerResultMessage.classList.remove("hidden"); }
    }
    redeemStampsBtn.disabled = false;
  });
  redeemPointsBtn?.addEventListener("click", async () => {
    if (!scannerCurrentMemberId) return;
    const pts = parseInt(redeemPointsInput?.value || "0", 10);
    if (!pts || pts <= 0) {
      if (scannerResultMessage) { scannerResultMessage.textContent = "Indiquez un nombre de points à déduire."; scannerResultMessage.classList.remove("hidden"); }
      return;
    }
    redeemPointsBtn.disabled = true;
    try {
      const res = await doRedeem({ type: "points", points: pts });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (scannerResultMessage) { scannerResultMessage.textContent = data.error || "Erreur"; scannerResultMessage.classList.remove("hidden"); }
        redeemPointsBtn.disabled = false;
        return;
      }
      const newPts = data.new_points ?? 0;
      if (scannerResultMessage) { scannerResultMessage.textContent = `${pts} point(s) déduit(s). Solde : ${newPts} pts.`; scannerResultMessage.classList.remove("hidden"); }
      if (scannerResultPoints) scannerResultPoints.textContent = `${newPts} point(s)`;
      if (redeemPointsInput) redeemPointsInput.value = "";
      scannerCurrentMember = scannerCurrentMember ? { ...scannerCurrentMember, points: newPts } : null;
      await refresh();
    } catch (_) {
      if (scannerResultMessage) { scannerResultMessage.textContent = "Erreur réseau."; scannerResultMessage.classList.remove("hidden"); }
    }
    redeemPointsBtn.disabled = false;
  });

  function showCaisseMessage(text, isError = false) {
    if (!caisseMessage) return;
    caisseMessage.textContent = text;
    caisseMessage.classList.remove("hidden", "success", "error");
    caisseMessage.classList.add(isError ? "error" : "success");
  }

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }
  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function getDashboardPeriod() {
    return (dashboardPeriodSelect && dashboardPeriodSelect.value) || "this_month";
  }

  function getDashboardPeriodRange(period) {
    const now = new Date();
    let start = new Date(now);
    let end = new Date(now);
    if (period === "7d") {
      start.setDate(end.getDate() - 6);
    } else if (period === "30d") {
      start.setDate(end.getDate() - 29);
    } else if (period === "6m") {
      start.setMonth(end.getMonth() - 6);
    } else if (period === "this_month") {
      start = new Date(end.getFullYear(), end.getMonth(), 1);
    }
    const sameYear = start.getFullYear() === end.getFullYear();
    const optsStart = { day: "2-digit", month: "short" };
    const optsEnd = sameYear ? { day: "2-digit", month: "short", year: "numeric" } : { day: "2-digit", month: "short", year: "numeric" };
    const startStr = start.toLocaleDateString("fr-FR", optsStart);
    const endStr = end.toLocaleDateString("fr-FR", optsEnd);
    return `${startStr} - ${endStr}`;
  }

  const dashboardPeriodLabels = {
    "7d": "7 derniers jours",
    "30d": "30 derniers jours",
    this_month: "ce mois",
    "6m": "6 derniers mois",
  };

  function formatEuro(value) {
    return `${Number(value || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  }

  function syncDashboardPeriodUI(period) {
    if (dashboardPeriodSelect && dashboardPeriodSelect.value !== period) {
      dashboardPeriodSelect.value = period;
    }
    dashboardPeriodPills.forEach((pill) => {
      pill.classList.toggle("active", pill.dataset.period === period);
    });
    if (dashboardPeriodLabelEl) dashboardPeriodLabelEl.textContent = dashboardPeriodLabels[period] || "la période sélectionnée";
  }

  function setSimulatedMode(active) {
    dashboardUseSimulatedData = !!active;
    if (dashboardSimulateBtn) {
      dashboardSimulateBtn.textContent = dashboardUseSimulatedData ? "Revenir aux données réelles" : "Charger données simulées";
    }
    if (dashboardSimulateState) {
      dashboardSimulateState.classList.toggle("hidden", !dashboardUseSimulatedData);
      dashboardSimulateState.textContent = dashboardUseSimulatedData ? "Mode test actif" : "";
    }
  }

  function getSimulatedStats(period) {
    const map = {
      "7d": { rev: 1280, tx: 64, members: 182, retention: 44, recurrent: 29, active: 80, points: 920, new30: 21, inactive30: 34, avgPoints: 17 },
      "30d": { rev: 5380, tx: 302, members: 182, retention: 57, recurrent: 88, active: 104, points: 2860, new30: 49, inactive30: 30, avgPoints: 24 },
      this_month: { rev: 4620, tx: 246, members: 182, retention: 53, recurrent: 77, active: 96, points: 2390, new30: 42, inactive30: 33, avgPoints: 22 },
      "6m": { rev: 28490, tx: 1408, members: 182, retention: 69, recurrent: 132, active: 126, points: 12480, new30: 42, inactive30: 33, avgPoints: 22 },
    };
    const base = map[period] || map.this_month;
    return {
      membersCount: base.members,
      pointsThisMonth: base.points,
      transactionsThisMonth: base.tx,
      newMembersLast30Days: base.new30,
      newMembersLast7Days: Math.max(0, Math.floor(base.new30 / 4)),
      inactiveMembers30Days: base.inactive30,
      pointsAveragePerMember: base.avgPoints,
      estimatedRevenueEur: base.rev,
      retentionPct: base.retention,
      recurrentMembersInPeriod: base.recurrent,
      activeMembersInPeriod: base.active,
    };
  }

  function getSimulatedEvolution(period) {
    const byPeriod = {
      "7d": [14],
      "30d": [42, 57, 74, 69],
      this_month: [39, 61, 70, 76],
      "6m": [28, 37, 44, 52, 49, 58, 63, 69, 64, 72, 79, 81, 75, 84, 92, 88, 95, 101, 97, 109, 116, 110, 122, 126, 119, 132],
    };
    const values = byPeriod[period] || byPeriod.this_month;
    return values.map((v, idx) => ({ weekIndex: idx, operationsCount: v }));
  }

  function renderDashboardInsights(data) {
    if (!insightSummaryEl || !insightFocusEl || !insightActionEl || !insightConfidenceEl) return;
    const retention = Number(data.retentionPct || 0);
    const inactive = Number(data.inactiveMembers30Days || 0);
    const recurrent = Number(data.recurrentMembersInPeriod || 0);
    const tx = Number(data.transactionsThisMonth || 0);
    const revenue = Number(data.estimatedRevenueEur || 0);
    const periodText = dashboardPeriodLabels[getDashboardPeriod()] || "la période";

    if (retention >= 55) {
      insightSummaryEl.textContent = `Très bonne dynamique sur ${periodText}: tes clients reviennent régulièrement et la base est active.`;
      insightFocusEl.textContent = "Capitaliser sur les habitués";
      insightActionEl.textContent = "Lancer une offre VIP aux récurrents";
    } else if (retention >= 30) {
      insightSummaryEl.textContent = `Activité correcte sur ${periodText}, mais il reste du potentiel pour transformer plus de membres en habitués.`;
      insightFocusEl.textContent = "Augmenter la fréquence d'achat";
      insightActionEl.textContent = "Relancer inactifs + bonus 2e visite";
    } else {
      insightSummaryEl.textContent = `La rétention est faible sur ${periodText}: une partie des membres ne revient pas encore assez souvent.`;
      insightFocusEl.textContent = "Réactiver les clients dormants";
      insightActionEl.textContent = "Campagne ciblée inactifs 30 jours";
    }

    let confidence = "Moyenne";
    if (revenue > 0 && tx > 0) confidence = "Élevée";
    if (revenue <= 0 && tx > 0) confidence = "Faible";
    if (inactive > 20 && recurrent < 5) confidence = "À surveiller";
    insightConfidenceEl.textContent = confidence;
  }

  async function loadStats() {
    const period = getDashboardPeriod();
    let data;
    if (dashboardUseSimulatedData) {
      data = getSimulatedStats(period);
    } else {
      const res = await api(`/dashboard/stats?period=${encodeURIComponent(period)}`);
      if (res.status === 401) throw new Error("Unauthorized");
      if (!res.ok) return null;
      const raw = await res.json();
      data = {
        membersCount: raw.members_count ?? raw.membersCount ?? 0,
        pointsThisMonth: raw.points_this_month ?? raw.pointsThisMonth ?? 0,
        transactionsThisMonth: raw.transactions_this_month ?? raw.transactionsThisMonth ?? 0,
        newMembersLast30Days: raw.new_members_last_30_days ?? raw.newMembersLast30Days ?? 0,
        newMembersLast7Days: raw.new_members_last_7_days ?? raw.newMembersLast7Days ?? 0,
        inactiveMembers30Days: raw.inactive_members_30_days ?? raw.inactiveMembers30Days ?? 0,
        pointsAveragePerMember: raw.points_average_per_member ?? raw.pointsAveragePerMember ?? 0,
        estimatedRevenueEur: raw.estimated_revenue_eur ?? raw.estimatedRevenueEur ?? 0,
        retentionPct: raw.retention_pct ?? raw.retentionPct ?? 0,
        recurrentMembersInPeriod: raw.recurrent_members_in_period ?? raw.recurrentMembersInPeriod ?? 0,
        activeMembersInPeriod: raw.active_members_in_period ?? raw.activeMembersInPeriod ?? 0,
      };
    }
    const avgTicket = data.transactionsThisMonth > 0 ? data.estimatedRevenueEur / data.transactionsThisMonth : 0;
    const revenuePerActive = data.activeMembersInPeriod > 0 ? data.estimatedRevenueEur / data.activeMembersInPeriod : 0;
    const frequency = data.activeMembersInPeriod > 0 ? data.transactionsThisMonth / data.activeMembersInPeriod : 0;
    if (statMembers) statMembers.textContent = data.membersCount;
    if (statMembersSegment) statMembersSegment.textContent = data.membersCount;
    if (statPoints) statPoints.textContent = data.pointsThisMonth;
    if (statTransactions) statTransactions.textContent = data.transactionsThisMonth;
    if (statNew30) statNew30.textContent = data.newMembersLast30Days;
    if (statInactive30) statInactive30.textContent = data.inactiveMembers30Days;
    if (statInactive30Main) statInactive30Main.textContent = data.inactiveMembers30Days;
    if (statAvgPoints) statAvgPoints.textContent = data.pointsAveragePerMember;
    if (statCardsActive) statCardsActive.textContent = data.membersCount;
    if (statRetention) statRetention.textContent = `${data.retentionPct} %`;
    if (statRetentionEcho) statRetentionEcho.textContent = `${data.retentionPct} %`;
    if (statRecurrent) statRecurrent.textContent = data.recurrentMembersInPeriod;
    if (statActiveMembers) statActiveMembers.textContent = data.activeMembersInPeriod;
    if (statFrequency) statFrequency.textContent = frequency.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (statAvgTicket) statAvgTicket.textContent = formatEuro(avgTicket);
    if (statRevenuePerActive) statRevenuePerActive.textContent = formatEuro(revenuePerActive);
    const statMoreRevenue = document.getElementById("app-stat-more-revenue");
    const statMoreAvgTicket = document.getElementById("app-stat-more-avg-ticket");
    const statMoreRevenuePerActive = document.getElementById("app-stat-more-revenue-per-active");
    const statMoreTransactions = document.getElementById("app-stat-more-transactions");
    const statMoreMembers = document.getElementById("app-stat-more-members");
    const statMoreNew30 = document.getElementById("app-stat-more-new30");
    const statMoreInactive30 = document.getElementById("app-stat-more-inactive30");
    const statMoreRetention = document.getElementById("app-stat-more-retention");
    const statMoreFrequency = document.getElementById("app-stat-more-frequency");
    const statMoreRecurrent = document.getElementById("app-stat-more-recurrent");
    if (statMoreRevenue) statMoreRevenue.textContent = formatEuro(data.estimatedRevenueEur);
    if (statMoreAvgTicket) statMoreAvgTicket.textContent = formatEuro(avgTicket);
    if (statMoreRevenuePerActive) statMoreRevenuePerActive.textContent = formatEuro(revenuePerActive);
    if (statMoreTransactions) statMoreTransactions.textContent = data.transactionsThisMonth;
    if (statMoreMembers) statMoreMembers.textContent = data.membersCount;
    if (statMoreNew30) statMoreNew30.textContent = data.newMembersLast30Days;
    if (statMoreInactive30) statMoreInactive30.textContent = data.inactiveMembers30Days;
    if (statMoreRetention) statMoreRetention.textContent = `${data.retentionPct} %`;
    if (statMoreFrequency) statMoreFrequency.textContent = frequency.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (statMoreRecurrent) statMoreRecurrent.textContent = data.recurrentMembersInPeriod;
    if (dashboardPeriodDisplay) {
      dashboardPeriodDisplay.textContent = getDashboardPeriodRange(period);
    }
    // Broadcast des stats pour d'autres composants (ex: badge notifications)
    window.dispatchEvent(new CustomEvent("fidpass-dashboard-stats", { detail: { stats: data } }));

    const mobileStatMembers = document.getElementById("app-mobile-stat-members");
    const mobileStatScans = document.getElementById("app-mobile-stat-scans");
    if (mobileStatMembers) mobileStatMembers.textContent = data.membersCount;
    if (mobileStatScans) mobileStatScans.textContent = data.transactionsThisMonth;
    syncDashboardPeriodUI(period);
    renderDashboardInsights(data);
    return data;
  }

  function renderOverviewAlerts(stats) {
    // L'ancien bandeau d'alertes est remplacé par le bouton Notifications du header.
    const alertsEl = document.getElementById("app-overview-alerts");
    if (alertsEl) {
      alertsEl.classList.add("hidden");
      alertsEl.innerHTML = "";
    }
  }

  const membersFilterEl = document.getElementById("app-members-filter");
  const membersSortEl = document.getElementById("app-members-sort");
  async function loadMembers(search = "", filter = "", sort = "last_visit") {
    const params = new URLSearchParams({ limit: 100 });
    if (search) params.set("search", search);
    if (filter) params.set("filter", filter);
    if (sort) params.set("sort", sort);
    const res = await api(`/dashboard/members?${params}`);
    if (!res.ok) return { members: [], total: 0 };
    return res.json();
  }

  function renderMembers(members) {
    const list = membersListEl;
    const empty = membersEmptyEl;
    if (!list) return;
    const arr = members || [];
    if (arr.length === 0) {
      list.innerHTML = "";
      if (empty) {
        empty.classList.remove("hidden");
        const hasSearchOrFilter = !!(membersSearchInput?.value?.trim() || membersFilterEl?.value);
        empty.querySelector("p").textContent = hasSearchOrFilter ? "Aucun membre ne correspond à votre recherche." : "Aucun membre pour le moment.";
      }
      return;
    }
    if (empty) empty.classList.add("hidden");
    const lastVisitLabel = (m) => (m.last_visit_at ? formatDate(m.last_visit_at) : "Jamais");
    const initial = (name) => (name && name.trim() ? String(name.trim()).charAt(0).toUpperCase() : "?");
    list.innerHTML = arr
      .map(
        (m) =>
          `<article class="app-membres-card" role="listitem" data-member-id="${escapeHtml(m.id)}" tabindex="0">
            <span class="app-membres-card-avatar" aria-hidden="true">${escapeHtml(initial(m.name || m.email))}</span>
            <div class="app-membres-card-body">
              <h3 class="app-membres-card-name">${escapeHtml(m.name || "Sans nom")}</h3>
              <p class="app-membres-card-email">${escapeHtml(m.email)}</p>
              <div class="app-membres-card-meta">
                <span class="app-membres-card-meta-item"><strong>${m.points ?? 0}</strong> points</span>
                <span class="app-membres-card-meta-item">Dernier passage : ${lastVisitLabel(m)}</span>
              </div>
            </div>
            <span class="app-membres-card-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></span>
          </article>`
      )
      .join("");
  }

  async function loadDashboardRecentHistory() {
    const res = await api("/dashboard/transactions?limit=8");
    if (!res.ok) return [];
    const data = await res.json();
    return data.transactions || [];
  }

  function renderDashboardRecentHistory(transactions) {
    const listEl = document.getElementById("app-dashboard-recent-list");
    if (!listEl) return;
    const arr = transactions || [];
    const typeLabel = (t) => {
      if (t.type === "points_correction") return "Correction caisse";
      if (t.type === "reward_redeem") return "Récompense";
      if (t.type !== "points_add") return t.type;
      const meta = t.metadata ? String(t.metadata) : "";
      return meta.includes("visit") ? "Passage" : "Points ajoutés";
    };
    const formatRecentDate = (iso) => {
      const d = new Date(iso);
      return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    };
    const initial = (name) => (name && name.trim() ? String(name.trim()).charAt(0).toUpperCase() : "?");
    const avatarColors = ["av-0", "av-1", "av-2", "av-3", "av-4", "av-5", "av-6", "av-7"];
    if (arr.length === 0) {
      listEl.innerHTML = '<p class="app-dashboard-recent-empty">Aucun passage récent.</p>';
      return;
    }
    listEl.innerHTML = arr
      .map(
        (t, i) =>
          `<article class="app-dashboard-recent-row" role="listitem">
            <div class="app-dashboard-recent-row-name">
              <span class="app-dashboard-recent-avatar ${avatarColors[i % avatarColors.length]}" aria-hidden="true">${escapeHtml(initial(t.member_name || t.member_email))}</span>
              <span class="app-dashboard-recent-name">${escapeHtml(t.member_name || "Sans nom")}</span>
            </div>
            <span class="app-dashboard-recent-type app-dashboard-recent-row-type">${typeLabel(t)}</span>
            <span class="app-dashboard-recent-date">${formatRecentDate(t.created_at)}</span>
          </article>`
      )
      .join("");
  }

  async function refresh() {
    try {
      const stats = await loadStats();
      if (stats) renderOverviewAlerts(stats);
      const recentTx = await loadDashboardRecentHistory();
      renderDashboardRecentHistory(recentTx);
    } catch (_) { return; }
    const membersData = await loadMembers(membersSearchInput?.value || "", membersFilterEl?.value || "", membersSortEl?.value || "last_visit");
    allMembers = membersData.members || [];
    renderMembers(allMembers);
  }

  memberSearchInput?.addEventListener("input", async () => {
    const q = memberSearchInput.value.trim();
    if (q.length < 2) {
      memberListEl?.classList.add("hidden");
      if (memberListEl) memberListEl.innerHTML = "";
      return;
    }
    const data = await loadMembers(q);
    const members = data.members || [];
    if (!memberListEl) return;
    memberListEl.innerHTML = members
      .map((m) => `<div class="app-member-item" data-id="${m.id}">${escapeHtml(m.name)} — ${escapeHtml(m.email)} (${m.points} pts)</div>`)
      .join("");
    memberListEl.classList.remove("hidden");
    memberListEl.querySelectorAll(".app-member-item").forEach((el) => {
      el.addEventListener("click", async () => {
        const id = el.dataset.id;
        const m = members.find((x) => x.id === id);
        memberListEl.classList.add("hidden");
        memberSearchInput.value = "";
        try {
          const res = await api("/members/" + encodeURIComponent(id));
          if (!res.ok) return;
          const member = await res.json();
          addToCaisseRecent(member);
          await showScannerResult(member);
          if (caisseChoose) caisseChoose.classList.add("hidden");
          if (scannerResult) scannerResult.classList.remove("hidden");
          if (scannerCard) scannerCard.classList.add("app-scanner-has-overlay");
          updateRedeemButtons();
        } catch (_) {}
      });
    });
  });
  renderCaisseRecent();

  membersSearchInput?.addEventListener("input", () => {
    const q = membersSearchInput.value.trim();
    const filter = membersFilterEl?.value || "";
    const sort = membersSortEl?.value || "last_visit";
    loadMembers(q, filter, sort).then((data) => {
      const members = data.members || [];
      allMembers = members;
      renderMembers(members);
    });
  });
  membersFilterEl?.addEventListener("change", () => refresh());
  membersSortEl?.addEventListener("change", () => refresh());
  dashboardPeriodSelect?.addEventListener("change", () => {
    syncDashboardPeriodUI(getDashboardPeriod());
    refresh();
  });
  dashboardSimulateBtn?.addEventListener("click", () => {
    setSimulatedMode(!dashboardUseSimulatedData);
    refresh();
  });
  dashboardToggleDetailsBtn?.addEventListener("click", () => {
    if (!dashboardDetailsEl) return;
    const willShow = dashboardDetailsEl.classList.contains("hidden");
    dashboardDetailsEl.classList.toggle("hidden", !willShow);
    if (dashboardToggleDetailsBtn) {
      dashboardToggleDetailsBtn.textContent = willShow
        ? "Masquer les indicateurs détaillés"
        : "Afficher les indicateurs détaillés";
    }
  });
  dashboardPeriodPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      const period = pill.dataset.period;
      if (!period) return;
      syncDashboardPeriodUI(period);
      refresh();
    });
  });

  const membersExportBtn = document.getElementById("app-members-export");
  if (membersExportBtn) {
    membersExportBtn.addEventListener("click", async () => {
      const params = new URLSearchParams();
      if (membersSearchInput?.value) params.set("search", membersSearchInput.value);
      if (membersFilterEl?.value) params.set("filter", membersFilterEl.value);
      if (membersSortEl?.value) params.set("sort", membersSortEl.value);
      const res = await api(`/dashboard/members/export?${params}`);
      if (!res.ok) return;
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `membres-${slug}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  const membersImportFile = document.getElementById("app-members-import-file");
  const membersImportFilename = document.getElementById("app-members-import-filename");
  const membersImportDuplicate = document.getElementById("app-members-import-duplicate");
  const membersImportBtn = document.getElementById("app-members-import-btn");
  const membersImportResult = document.getElementById("app-members-import-result");
  if (membersImportFile && membersImportBtn) {
    membersImportFile.addEventListener("change", () => {
      const file = membersImportFile.files?.[0];
      if (membersImportFilename) membersImportFilename.textContent = file ? file.name : "";
      membersImportBtn.disabled = !file;
    });
    membersImportBtn.addEventListener("click", async () => {
      const file = membersImportFile.files?.[0];
      if (!file) return;
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) {
        if (membersImportResult) { membersImportResult.textContent = "Le fichier doit contenir une ligne d’en-tête et au moins une ligne de données."; membersImportResult.classList.remove("hidden"); membersImportResult.classList.add("error"); }
        return;
      }
      const sep = lines[0].includes(";") ? ";" : ",";
      const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/^[\s"\uFEFF]+|[\s"]+$/g, ""));
      const emailIdx = headers.findIndex((h) => /e-?mail/.test(h) || h === "email");
      const nameIdx = headers.findIndex((h) => /^(nom|name|prénom|prenom|client)$/.test(h) || h === "name" || h === "nom");
      if (emailIdx === -1 || nameIdx === -1) {
        if (membersImportResult) { membersImportResult.textContent = "Colonnes requises : email (ou E-mail) et name (ou nom, prénom)."; membersImportResult.classList.remove("hidden"); membersImportResult.classList.add("error"); }
        return;
      }
      const pointsIdx = headers.findIndex((h) => /^(points|tampons|solde)$/.test(h));
      const members = [];
      for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
        const email = (cells[emailIdx] || "").trim();
        const name = (cells[nameIdx] || "").trim();
        if (!email) continue;
        const points = pointsIdx >= 0 && cells[pointsIdx] !== undefined ? parseInt(cells[pointsIdx], 10) : 0;
        members.push({ email, name: name || email, points: Number.isNaN(points) ? 0 : Math.max(0, points) });
      }
      if (members.length === 0) {
        if (membersImportResult) { membersImportResult.textContent = "Aucune ligne valide (email requis)."; membersImportResult.classList.remove("hidden"); membersImportResult.classList.add("error"); }
        return;
      }
      membersImportBtn.disabled = true;
      if (membersImportResult) { membersImportResult.textContent = "Import en cours…"; membersImportResult.classList.remove("hidden", "error"); }
      try {
        const url = `${API_BASE}/api/businesses/${encodeURIComponent(slug)}/members/import`;
        const headers = { "Content-Type": "application/json", ...getAuthHeaders() };
        if (dashboardToken) headers["X-Dashboard-Token"] = dashboardToken;
        const res = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({ members, onDuplicate: membersImportDuplicate?.value || "skip" }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          const msg = `${data.created ?? 0} créé(s), ${data.updated ?? 0} mis à jour, ${data.skipped ?? 0} ignoré(s), ${data.errors ?? 0} erreur(s).`;
          if (membersImportResult) { membersImportResult.textContent = msg; membersImportResult.classList.remove("error"); }
          membersImportFile.value = "";
          if (membersImportFilename) membersImportFilename.textContent = "";
          window.dispatchEvent(new Event("app-members-refresh"));
        } else {
          if (membersImportResult) { membersImportResult.textContent = data.error || "Erreur lors de l’import."; membersImportResult.classList.add("error"); }
        }
      } catch (e) {
        if (membersImportResult) { membersImportResult.textContent = "Erreur réseau."; membersImportResult.classList.add("error"); }
      }
      membersImportBtn.disabled = false;
    });
  }

  const overviewCopyLinkBtn = document.getElementById("app-overview-copy-link");
  if (overviewCopyLinkBtn) {
    overviewCopyLinkBtn.addEventListener("click", () => {
      if (!shareLinkEl) return;
      shareLinkEl.select();
      navigator.clipboard.writeText(shareLinkEl.value).then(() => {
        overviewCopyLinkBtn.textContent = "Lien copié !";
        setTimeout(() => { overviewCopyLinkBtn.textContent = "🔗 Copier le lien partage"; }, 2000);
      });
    });
  }

  const memberDetailModal = document.getElementById("app-member-detail-modal");
  const memberDetailBody = document.getElementById("app-member-detail-body");
  const memberDetailClose = memberDetailModal?.querySelector(".app-modal-close");
  const memberDetailBackdrop = memberDetailModal?.querySelector(".app-modal-backdrop");
  let memberDetailOpenId = null;

  function formatMemberTransactionLine(t) {
    const pts = Number(t.points) || 0;
    const signed = (pts > 0 ? "+" : "") + pts;
    let label = "Opération";
    if (t.type === "points_add") {
      const meta = t.metadata ? String(t.metadata) : "";
      label = meta.includes("visit") ? "Passage" : "Points ajoutés";
    } else if (t.type === "points_correction") {
      label = "Correction caisse";
    } else if (t.type === "reward_redeem") {
      label = "Récompense";
    }
    return `<li>${label} : ${signed} pts — ${formatDate(t.created_at)}</li>`;
  }

  function memberDetailMarkup(m, transactions) {
    const txList =
      (transactions || []).map(formatMemberTransactionLine).join("") || "<li>Aucune opération</li>";
    const extra =
      (m.phone ? `<p>Tél. : ${escapeHtml(m.phone)}</p>` : "") +
      (m.city ? `<p>Ville : ${escapeHtml(m.city)}</p>` : "") +
      (m.birth_date ? `<p>Naissance : ${escapeHtml(m.birth_date)}</p>` : "");
    return `
          <p><strong>${escapeHtml(m.name)}</strong></p>
          <p>${escapeHtml(m.email)}</p>
          ${extra}
          <p>${m.points} point(s)</p>
          <p>Dernière visite : ${m.last_visit_at ? formatDate(m.last_visit_at) : "—"}</p>
          <h3 style="font-size:1rem;margin:0.75rem 0 0.25rem">Historique</h3>
          <ul class="app-scanner-history-list">${txList}</ul>
          <div class="app-member-points-correction" style="margin-top:1rem;padding-top:0.75rem;border-top:1px solid var(--app-border, #e8e8e8)">
            <h3 style="font-size:1rem;margin:0 0 0.5rem">Retirer des points (erreur de caisse)</h3>
            <p style="font-size:0.875rem;margin:0 0 0.5rem;opacity:0.85">Enregistré dans l’historique ; le client est notifié sur Apple Wallet si applicable.</p>
            <div style="display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center">
              <input type="number" min="1" step="1" id="app-member-remove-points-input" placeholder="Nb pts" style="width:5.5rem;padding:0.35rem 0.5rem;border-radius:8px;border:1px solid var(--app-border, #ccc)" />
              <button type="button" class="btn btn-secondary" id="app-member-remove-points-btn">Retirer</button>
            </div>
            <p id="app-member-remove-points-msg" class="hidden" style="margin-top:0.5rem;font-size:0.875rem"></p>
          </div>
        `;
  }

  async function refreshMemberDetailPanel() {
    if (!memberDetailOpenId || !memberDetailBody) return;
    const member = allMembers.find((x) => x.id === memberDetailOpenId);
    const base = member || { id: memberDetailOpenId };
    try {
      const [full, data] = await Promise.all([
        api(`/members/${encodeURIComponent(memberDetailOpenId)}`).then((r) => (r.ok ? r.json() : base)),
        api(`/dashboard/transactions?memberId=${encodeURIComponent(memberDetailOpenId)}&limit=20`).then((r) =>
          r.ok ? r.json() : { transactions: [] }
        ),
      ]);
      const m = { ...base, ...full };
      memberDetailOpenId = m.id;
      memberDetailBody.innerHTML = memberDetailMarkup(m, data.transactions || []);
    } catch (_) {
      memberDetailBody.innerHTML = "<p>Erreur chargement.</p>";
    }
  }

  function openMemberDetail(member) {
    if (!memberDetailModal || !memberDetailBody) return;
    memberDetailOpenId = member.id;
    memberDetailBody.innerHTML = "<p>Chargement…</p>";
    memberDetailModal.classList.remove("hidden");
    Promise.all([
      api(`/members/${encodeURIComponent(member.id)}`).then((r) => (r.ok ? r.json() : member)),
      api(`/dashboard/transactions?memberId=${encodeURIComponent(member.id)}&limit=20`).then((r) =>
        r.ok ? r.json() : { transactions: [] }
      ),
    ])
      .then(([full, data]) => {
        const m = { ...member, ...full };
        memberDetailOpenId = m.id;
        memberDetailBody.innerHTML = memberDetailMarkup(m, data.transactions || []);
      })
      .catch(() => {
        memberDetailBody.innerHTML = "<p>Erreur chargement.</p>";
      });
  }
  function closeMemberDetail() {
    memberDetailOpenId = null;
    memberDetailModal?.classList.add("hidden");
  }

  memberDetailModal?.addEventListener("click", async (e) => {
    const btn = e.target.closest("#app-member-remove-points-btn");
    if (!btn || !memberDetailOpenId || !memberDetailBody) return;
    e.preventDefault();
    const input = memberDetailBody.querySelector("#app-member-remove-points-input");
    const msg = memberDetailBody.querySelector("#app-member-remove-points-msg");
    const n = parseInt(input?.value, 10);
    if (!input || !Number.isFinite(n) || n < 1) {
      if (msg) {
        msg.textContent = "Indiquez un nombre entier ≥ 1.";
        msg.classList.remove("hidden");
        msg.classList.remove("error");
      }
      return;
    }
    btn.disabled = true;
    try {
      const res = await api(`/members/${encodeURIComponent(memberDetailOpenId)}/points/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points: n }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (msg) {
          msg.textContent = data.error || "Erreur";
          msg.classList.add("error");
          msg.classList.remove("hidden");
        }
        btn.disabled = false;
        return;
      }
      if (msg) {
        msg.textContent = `Retiré : ${data.points_removed ?? n} pts. Nouveau solde : ${data.points} pts.`;
        msg.classList.remove("error");
        msg.classList.remove("hidden");
      }
      input.value = "";
      window.dispatchEvent(new Event("app-members-refresh"));
      await refreshMemberDetailPanel();
    } catch (_) {
      if (msg) {
        msg.textContent = "Erreur réseau.";
        msg.classList.add("error");
        msg.classList.remove("hidden");
      }
    }
    btn.disabled = false;
  });
  memberDetailClose?.addEventListener("click", closeMemberDetail);
  memberDetailBackdrop?.addEventListener("click", closeMemberDetail);
  membersListEl?.addEventListener("click", (e) => {
    const card = e.target.closest(".app-membres-card[data-member-id]");
    if (!card) return;
    const id = card.getAttribute("data-member-id");
    const member = allMembers.find((m) => m.id === id);
    if (member) openMemberDetail(member);
  });
  membersListEl?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = e.target.closest(".app-membres-card[data-member-id]");
    if (!card) return;
    e.preventDefault();
    const id = card.getAttribute("data-member-id");
    const member = allMembers.find((m) => m.id === id);
    if (member) openMemberDetail(member);
  });

  window.addEventListener("app-members-refresh", () => refresh());

  function updateAppNotificationPreview() {
    const bannerTitle = document.getElementById("app-notification-banner-title");
    const bannerIconFallback = document.getElementById("app-notification-banner-icon-fallback");
    const perimetreIconFallback = document.getElementById("app-perimetre-banner-icon-fallback");
    const fromSidebar = (document.getElementById("app-business-name")?.textContent ?? "").trim();
    const fromPersonnaliser = (document.getElementById("app-personnaliser-org")?.value ?? "").trim();
    const title =
      (bannerTitle?.value ?? "").trim() || fromSidebar || fromPersonnaliser || "Nom de votre commerce";
    if (bannerIconFallback) {
      bannerIconFallback.textContent = title.length > 14 ? title.slice(0, 12) + "…" : title || "Logo";
    }
    if (perimetreIconFallback) {
      perimetreIconFallback.textContent = title.length > 14 ? title.slice(0, 12) + "…" : title || "Logo";
    }
  }

  /** Icône aperçu campagne / push : média serveur dédié (`notification_icon`), indépendant des logos carte & fiche. */
  async function refreshCampaignNotificationBannerIcon() {
    const bannerIconImg = document.getElementById("app-notification-banner-icon-img");
    const bannerIconFallback = document.getElementById("app-notification-banner-icon-fallback");
    if (!bannerIconImg) return;
    try {
      const r = await api("/notification-icon?v=" + Date.now());
      if (!r.ok) throw new Error("No notification icon");
      const blob = await r.blob();
      if (!blob || blob.size === 0) throw new Error("Empty");
      const url = URL.createObjectURL(blob);
      if (bannerIconImg.src && bannerIconImg.src.startsWith("blob:")) URL.revokeObjectURL(bannerIconImg.src);
      bannerIconImg.src = url;
      bannerIconImg.classList.remove("hidden");
      if (bannerIconFallback) bannerIconFallback.classList.add("hidden");
    } catch (_) {
      bannerIconImg.classList.add("hidden");
      if (bannerIconFallback) bannerIconFallback.classList.remove("hidden");
    }
  }

  /** Bandeau périmètre + avatar header : logo carré commerce puis logo principal (pas l’icône campagne isolée). */
  async function refreshPerimeterAndHeaderMerchantIcons() {
    const perimetreIconImg = document.getElementById("app-perimetre-banner-icon-img");
    const perimetreIconFallback = document.getElementById("app-perimetre-banner-icon-fallback");
    const headerAvatar = document.getElementById("app-dashboard-profile-avatar");
    const headerInitials = document.getElementById("app-dashboard-profile-initials");
    let blob = null;
    for (const path of ["/logo-icon", "/logo"]) {
      try {
        const r = await api(path + "?v=" + Date.now());
        if (r.ok) {
          const b = await r.blob();
          if (b && b.size > 0) {
            blob = b;
            break;
          }
        }
      } catch (_) {
        /* next */
      }
    }
    if (blob) {
      const url = URL.createObjectURL(blob);
      if (perimetreIconImg) {
        if (perimetreIconImg.src && perimetreIconImg.src.startsWith("blob:")) URL.revokeObjectURL(perimetreIconImg.src);
        perimetreIconImg.src = url;
        perimetreIconImg.classList.remove("hidden");
      }
      if (perimetreIconFallback) perimetreIconFallback.classList.add("hidden");
      if (headerAvatar) {
        if (headerAvatar.src && headerAvatar.src.startsWith("blob:")) URL.revokeObjectURL(headerAvatar.src);
        headerAvatar.src = url;
        headerAvatar.classList.remove("hidden");
      }
      if (headerInitials) headerInitials.classList.add("hidden");
    } else {
      if (perimetreIconImg) perimetreIconImg.classList.add("hidden");
      if (perimetreIconFallback) perimetreIconFallback.classList.remove("hidden");
    }
  }

  async function refreshNotificationBannerIcon() {
    await refreshCampaignNotificationBannerIcon();
    await refreshPerimeterAndHeaderMerchantIcons();
  }

  document.getElementById("app-notification-banner-title")?.addEventListener("input", updateAppNotificationPreview);
  document.getElementById("app-notification-banner-message")?.addEventListener("input", updateAppNotificationPreview);

  const notificationBannerLogoInput = document.getElementById("app-notification-banner-logo-input");
  const notificationBannerLogoDrop = document.getElementById("app-notification-banner-logo-drop");
  if (notificationBannerLogoInput && notificationBannerLogoDrop) {
    notificationBannerLogoDrop.addEventListener("click", (e) => {
      if (e.target === notificationBannerLogoInput) return;
      notificationBannerLogoInput.click();
    });
    notificationBannerLogoInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result;
        if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) return;
        const url = `${API_BASE}/api/businesses/${encodeURIComponent(slug)}${dashboardToken ? `?token=${encodeURIComponent(dashboardToken)}` : ""}`;
        const headers = { "Content-Type": "application/json", ...getAuthHeaders() };
        if (dashboardToken) headers["X-Dashboard-Token"] = dashboardToken;
        try {
          const res = await fetch(url, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ notification_icon_base64: dataUrl }),
          });
          if (res.ok) {
            await refreshCampaignNotificationBannerIcon();
          }
        } catch (_) {}
        notificationBannerLogoInput.value = "";
      };
      reader.readAsDataURL(file);
    });
    setupImageDropZone(notificationBannerLogoDrop, (file) => {
      notificationBannerLogoInput.files = null;
      const dt = new DataTransfer();
      dt.items.add(file);
      notificationBannerLogoInput.files = dt.files;
      notificationBannerLogoInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  async function loadAppNotificationStats() {
    try {
      const res = await api("/notifications/stats");
      if (!res.ok) return;
      const data = await res.json();
      const el = document.getElementById("app-notifications-stats");
      const diagEl = document.getElementById("app-notifications-diagnostic");
      if (el) {
        const total = data.subscriptionsCount != null ? data.subscriptionsCount : 0;
        const membersCount = data.membersCount != null ? data.membersCount : 0;
        const web = data.webPushCount != null ? data.webPushCount : 0;
        const wallet = data.passKitCount != null ? data.passKitCount : 0;
        if (membersCount > 0 && total === 0) {
          el.textContent = `Tu as ${membersCount} membre(s). La carte peut être dans le Wallet ; aucun appareil ne nous a encore envoyé son enregistrement, donc on ne peut pas envoyer de notifications push.`;
        } else if (total === 0) {
          el.textContent = "Aucun appareil enregistré pour l'instant.";
        } else if (membersCount > 0) {
          el.textContent = `Tu as ${membersCount} membre(s). ${total} appareil(s) peuvent recevoir les notifications.`;
        } else if (wallet > 0 && web > 0) {
          el.textContent = `${total} appareil(s) peuvent recevoir les notifications (dont ${wallet} Apple Wallet, ${web} navigateur).`;
        } else if (wallet > 0) {
          el.textContent = `${total} appareil(s) peuvent recevoir les notifications (Apple Wallet).`;
        } else {
          el.textContent = `${total} appareil(s) peuvent recevoir les notifications.`;
        }
        const hintEl = document.getElementById("app-notifications-members-vs-devices-hint");
        if (hintEl) {
          if (membersCount > total && total > 0) {
            hintEl.textContent = "« Envoyer » envoie à tous les appareils enregistrés (" + total + "), pas à tous les " + membersCount + " membres.";
            hintEl.classList.remove("hidden");
          } else if (total > 0) {
            hintEl.textContent = "";
            hintEl.classList.remove("hidden");
          } else {
            hintEl.classList.add("hidden");
            hintEl.textContent = "";
          }
        }
      }
      const membersSummaryEl = document.getElementById("app-members-notifications-summary");
      if (membersSummaryEl) {
        const total = data.subscriptionsCount != null ? data.subscriptionsCount : 0;
        const membersCount = data.membersCount != null ? data.membersCount : 0;
        if (membersCount > 0 || total > 0) {
          membersSummaryEl.innerHTML = total > 0
            ? `<strong>Campagnes :</strong> ${total} appareil(s) peuvent recevoir les push. <a href="#notifications" class="app-link-inline">Envoyer une campagne →</a>`
            : `<strong>Campagnes :</strong> tu as ${membersCount} membre(s). La carte peut être bien dans le Wallet, mais <strong>aucun iPhone ne nous a encore envoyé son enregistrement</strong> — donc on ne peut pas envoyer de notifications push. Ce n’est pas que tu n’as pas la carte ; c’est que notre serveur n’a reçu le signal d’aucun appareil. <a href="#notifications" class="app-link-inline">Voir le diagnostic →</a>`;
          membersSummaryEl.classList.remove("hidden");
        } else {
          membersSummaryEl.classList.add("hidden");
          membersSummaryEl.innerHTML = "";
        }
      }
      if (diagEl) {
        const total = data.subscriptionsCount != null ? data.subscriptionsCount : 0;
        const passKitOk = data.passKitUrlConfigured === true;
        if (total === 0 && data.helpWhenNoDevice) {
          let html = "";
          if (data.paradoxExplanation) {
            html += `<p class="app-notifications-diagnostic-title">J'ai scanné la carte du client mais « 0 appareil » — pourquoi ?</p><p class="app-notifications-diagnostic-text">${escapeHtmlForServer(data.paradoxExplanation)}</p>`;
          } else if (data.membersVsDevicesExplanation) {
            html += `<p class="app-notifications-diagnostic-title">Pourquoi des membres mais « 0 appareil » ?</p><p class="app-notifications-diagnostic-text">${escapeHtmlForServer(data.membersVsDevicesExplanation)}</p>`;
          }
          if (data.dataDirHint) {
            html += `<p class="app-notifications-diagnostic-title">Les logs montrent des POST mais 0 ici ?</p><p class="app-notifications-diagnostic-text">${escapeHtmlForServer(data.dataDirHint)}</p>`;
          }
          html += `<p class="app-notifications-diagnostic-title">Pour enregistrer ton iPhone</p><p class="app-notifications-diagnostic-text">${escapeHtmlForServer(data.helpWhenNoDevice)}</p>`;
          if (data.testPasskitCurl) {
            const curlEscaped = data.testPasskitCurl.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            html += `<p class="app-notifications-diagnostic-text" style="margin-top: 0.75rem;"><strong>Test diagnostic :</strong> exécute cette commande dans un terminal (sur ton ordi). Si tu obtiens <code>HTTP 201</code>, l'API fonctionne et le blocage vient de l'iPhone ou du réseau.</p><pre class="app-notifications-curl">${curlEscaped}</pre>`;
          }
          diagEl.innerHTML = html;
          diagEl.classList.remove("hidden");
        } else if (total === 0 && !passKitOk && data.diagnostic) {
          diagEl.classList.add("hidden");
          diagEl.innerHTML = "";
        } else if (total === 0 && (data.paradoxExplanation || data.membersVsDevicesExplanation || data.dataDirHint)) {
          let html = "";
          if (data.paradoxExplanation || data.membersVsDevicesExplanation) {
            const text = data.paradoxExplanation || data.membersVsDevicesExplanation;
            const title = data.paradoxExplanation ? "J'ai scanné la carte du client mais « 0 appareil » — pourquoi ?" : "Pourquoi des membres mais « 0 appareil » ?";
            html += `<p class="app-notifications-diagnostic-title">${escapeHtmlForServer(title)}</p><p class="app-notifications-diagnostic-text">${escapeHtmlForServer(text)}</p>`;
          }
          if (data.dataDirHint) {
            html += `<p class="app-notifications-diagnostic-title">Les logs montrent des POST mais 0 ici ?</p><p class="app-notifications-diagnostic-text">${escapeHtmlForServer(data.dataDirHint)}</p>`;
          }
          diagEl.innerHTML = html || `<p class="app-notifications-diagnostic-title">Les logs montrent des POST mais 0 ici ?</p><p class="app-notifications-diagnostic-text">${escapeHtmlForServer(data.dataDirHint || "")}</p>`;
          diagEl.classList.remove("hidden");
        } else {
          diagEl.classList.add("hidden");
          diagEl.innerHTML = "";
        }
      }
      const removeTestWrap = document.getElementById("app-notifications-remove-test-wrap");
      if (removeTestWrap) {
        const total = data.subscriptionsCount != null ? data.subscriptionsCount : 0;
        removeTestWrap.classList.toggle("hidden", total === 0);
      }
      await loadAppNotificationCategories();
      updateAppNotificationPreview();
    } catch (_) {}
  }

  const NOTIF_CATEGORY_COLORS = ["#1e3a8a", "#2563eb", "#b45309", "#7c3aed", "#dc2626", "#0891b2"];
  let notifCategoriesCache = [];

  async function loadAppNotificationCategories() {
    try {
      const res = await api("/dashboard/categories");
      if (!res.ok) return;
      const data = await res.json();
      const categories = data.categories || [];
      notifCategoriesCache = categories;

      const targetAll = document.getElementById("app-notif-target-all");
      const targetCategories = document.getElementById("app-notif-target-categories");
      const targetCategoriesLabel = document.getElementById("app-notif-target-categories-label");
      const picksWrap = document.getElementById("app-notif-categories-picks");
      const picksList = document.getElementById("app-notif-categories-list");
      const manageList = document.getElementById("app-notif-categories-manage-list");

      if (targetCategoriesLabel) {
        targetCategoriesLabel.classList.toggle("hidden", categories.length === 0);
        targetCategoriesLabel.style.display = categories.length === 0 ? "none" : "";
      }
      if (targetCategories) targetCategories.disabled = categories.length === 0;

      if (picksList) {
        picksList.innerHTML = categories
          .map((c) => {
            const color = c.color_hex || c.colorHex || "#94a3b8";
            return `<label class="app-notif-category-chip" data-id="${escapeHtml(c.id)}">
              <input type="checkbox" class="app-notif-category-cb" data-id="${escapeHtml(c.id)}" />
              <span class="app-notif-category-chip-dot"></span>
              <span class="app-notif-category-chip-color" style="background:${color}"></span>
              <span class="app-notif-category-chip-name">${escapeHtml(c.name)}</span>
            </label>`;
          })
          .join("");
      }
      if (picksWrap) picksWrap.classList.toggle("hidden", !targetCategories?.checked);
      if (targetAll?.checked) picksWrap?.classList.add("hidden");

      if (manageList) {
        manageList.innerHTML = categories
          .map((c) => {
            const color = c.color_hex || c.colorHex || "#94a3b8";
            return `<div class="app-notif-category-manage-item" data-id="${escapeHtml(c.id)}" data-name="${escapeHtml(c.name)}">
              <span class="app-notif-category-chip-color" style="background:${color}"></span>
              <input type="text" class="app-input app-notif-category-input" value="${escapeHtml(c.name)}" maxlength="64" data-id="${escapeHtml(c.id)}" aria-label="Nom de la catégorie" />
              <div class="app-notif-category-manage-item-actions">
                <button type="button" class="app-notif-category-save" data-id="${escapeHtml(c.id)}" aria-label="Enregistrer">OK</button>
                <button type="button" class="app-notif-category-delete" data-id="${escapeHtml(c.id)}" aria-label="Supprimer">Supprimer</button>
              </div>
            </div>`;
          })
          .join("");
        manageList.querySelectorAll(".app-notif-category-manage-item").forEach((row) => {
          const id = row.dataset.id;
          const input = row.querySelector(".app-notif-category-input");
          const saveBtn = row.querySelector(".app-notif-category-save");
          const delBtn = row.querySelector(".app-notif-category-delete");
          const save = async () => {
            const name = input?.value?.trim();
            if (!name) return;
            try {
              const r = await api(`/dashboard/categories/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
              if (r.ok) {
                row.dataset.name = name;
                const chipName = document.querySelector(`.app-notif-category-chip[data-id="${id}"] .app-notif-category-chip-name`);
                if (chipName) chipName.textContent = name;
                notifCategoriesCache.find((c) => c.id === id).name = name;
              }
            } catch (_) {}
          };
          input?.addEventListener("blur", save);
          input?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } });
          saveBtn?.addEventListener("click", save);
          delBtn?.addEventListener("click", async () => {
            if (!confirm("Supprimer cette catégorie ? Les membres ne seront plus associés à celle-ci.")) return;
            try {
              const r = await api(`/dashboard/categories/${id}`, { method: "DELETE" });
              if (r.ok) {
                row.style.animation = "none";
                row.offsetHeight;
                row.style.animation = "app-notif-category-item-out 0.25s ease forwards";
                row.addEventListener("animationend", () => row.remove());
                notifCategoriesCache = notifCategoriesCache.filter((c) => c.id !== id);
                const chip = document.querySelector(`.app-notif-category-chip[data-id="${id}"]`);
                if (chip) chip.remove();
              }
            } catch (_) {}
          });
        });
      }
    } catch (_) {}
  }

  document.getElementById("app-notif-target-all")?.addEventListener("change", () => {
    const picks = document.getElementById("app-notif-categories-picks");
    if (picks) picks.classList.add("hidden");
  });
  document.getElementById("app-notif-target-categories")?.addEventListener("change", () => {
    const picks = document.getElementById("app-notif-categories-picks");
    if (picks) picks.classList.remove("hidden");
  });

  const notifCategoryNewName = document.getElementById("app-notif-category-new-name");
  const notifCategoryAddBtn = document.getElementById("app-notif-category-add-btn");
  const notifCategoriesManageFeedback = document.getElementById("app-notif-categories-manage-feedback");
  async function addNotifCategory() {
    const name = notifCategoryNewName?.value?.trim();
    if (!name) return;
    if (notifCategoryAddBtn) notifCategoryAddBtn.disabled = true;
    if (notifCategoriesManageFeedback) { notifCategoriesManageFeedback.classList.add("hidden"); notifCategoriesManageFeedback.textContent = ""; }
    try {
      const colorHex = NOTIF_CATEGORY_COLORS[notifCategoriesCache.length % NOTIF_CATEGORY_COLORS.length];
      const res = await api("/dashboard/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color_hex: colorHex }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.id) {
        notifCategoryNewName.value = "";
        notifCategoriesCache.push({ id: data.id, name: data.name || name, color_hex: colorHex });
        await loadAppNotificationCategories();
        if (notifCategoriesManageFeedback) {
          notifCategoriesManageFeedback.textContent = "Catégorie ajoutée.";
          notifCategoriesManageFeedback.classList.remove("hidden", "error");
          notifCategoriesManageFeedback.classList.add("success");
          setTimeout(() => { notifCategoriesManageFeedback.classList.add("hidden"); }, 2000);
        }
        document.getElementById("app-notif-target-categories-label")?.classList.remove("hidden");
        document.getElementById("app-notif-target-categories-label").style.display = "";
        document.getElementById("app-notif-target-categories").disabled = false;
      } else {
        if (notifCategoriesManageFeedback) {
          notifCategoriesManageFeedback.textContent = data.error || "Erreur";
          notifCategoriesManageFeedback.classList.remove("hidden", "success");
          notifCategoriesManageFeedback.classList.add("error");
        }
      }
    } catch (_) {
      if (notifCategoriesManageFeedback) {
        notifCategoriesManageFeedback.textContent = "Erreur réseau.";
        notifCategoriesManageFeedback.classList.remove("hidden", "success");
        notifCategoriesManageFeedback.classList.add("error");
      }
    }
    if (notifCategoryAddBtn) notifCategoryAddBtn.disabled = false;
  }
  notifCategoryAddBtn?.addEventListener("click", addNotifCategory);
  notifCategoryNewName?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addNotifCategory(); } });

  document.getElementById("app-notifications-remove-test-btn")?.addEventListener("click", async () => {
    const btn = document.getElementById("app-notifications-remove-test-btn");
    const wrap = document.getElementById("app-notifications-remove-test-wrap");
    if (btn) btn.disabled = true;
    try {
      const res = await api("/notifications/remove-test-device", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        await loadAppNotificationStats();
        if (wrap) { wrap.textContent = data.message || "Appareil de test supprimé."; wrap.classList.remove("hidden"); }
      } else {
        if (wrap) { wrap.textContent = data.error || "Erreur"; wrap.classList.remove("hidden"); }
      }
    } catch (_) {
      if (wrap) { wrap.textContent = "Erreur réseau."; wrap.classList.remove("hidden"); }
    }
    if (btn) btn.disabled = false;
  });

  async function patchNotificationBannerTexts() {
    const titleEl = document.getElementById("app-notification-banner-title");
    const messageEl = document.getElementById("app-notification-banner-message");
    const saveRes = await api("/dashboard/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notification_title_override: titleEl?.value?.trim() || null,
        notification_change_message: messageEl?.value?.trim() || null,
      }),
    });
    const saveData = await saveRes.json().catch(() => ({}));
    return { ok: saveRes.ok, saveData };
  }

  document.getElementById("app-notification-texts-store")?.addEventListener("click", async () => {
    const textsFeedbackEl = document.getElementById("app-notification-texts-feedback");
    const notifFeedbackEl = document.getElementById("app-notif-feedback");
    const btn = document.getElementById("app-notification-texts-store");
    if (btn) btn.disabled = true;
    if (textsFeedbackEl) textsFeedbackEl.classList.add("hidden");
    if (notifFeedbackEl) notifFeedbackEl.classList.add("hidden");
    try {
      const { ok, saveData } = await patchNotificationBannerTexts();
      if (!ok) {
        if (textsFeedbackEl) {
          textsFeedbackEl.classList.remove("hidden");
          textsFeedbackEl.textContent = saveData.error || "Erreur lors de l'enregistrement des textes.";
          textsFeedbackEl.classList.add("error");
          textsFeedbackEl.classList.remove("success");
        }
        if (btn) btn.disabled = false;
        return;
      }
      if (textsFeedbackEl) {
        textsFeedbackEl.classList.remove("hidden", "error");
        textsFeedbackEl.classList.add("success");
        textsFeedbackEl.textContent =
          "Textes enregistrés. Ils servent aussi au message « pass » et à l’aperçu. Utilisez « Envoyer la notification » pour diffuser.";
      }
      notifyAppSectionSaveSuccess("notifications");
    } catch (_) {
      if (textsFeedbackEl) {
        textsFeedbackEl.classList.remove("hidden", "success");
        textsFeedbackEl.classList.add("error");
        textsFeedbackEl.textContent = "Connexion interrompue lors de l’enregistrement. Vérifiez votre réseau et réessayez.";
      }
    }
    if (btn) btn.disabled = false;
  });

  document.getElementById("app-notification-texts-send")?.addEventListener("click", async () => {
    const titleEl = document.getElementById("app-notification-banner-title");
    const messageEl = document.getElementById("app-notification-banner-message");
    const textsFeedbackEl = document.getElementById("app-notification-texts-feedback");
    const notifFeedbackEl = document.getElementById("app-notif-feedback");
    const btn = document.getElementById("app-notification-texts-send");
    const targetCategories = document.getElementById("app-notif-target-categories");
    const message = messageEl?.value?.trim();
    if (!message) {
      if (notifFeedbackEl) {
        notifFeedbackEl.textContent = "Saisissez un message dans l'aperçu.";
        notifFeedbackEl.classList.remove("hidden", "success");
        notifFeedbackEl.classList.add("error");
      }
      return;
    }
    let categoryIds = undefined;
    if (targetCategories?.checked) {
      const checked = document.querySelectorAll(".app-notif-category-cb:checked");
      categoryIds = Array.from(checked).map((c) => c.dataset.id).filter(Boolean);
      if (categoryIds.length === 0) {
        if (notifFeedbackEl) {
          notifFeedbackEl.textContent = "Cochez au moins une catégorie pour envoyer.";
          notifFeedbackEl.classList.remove("hidden", "success");
          notifFeedbackEl.classList.add("error");
        }
        return;
      }
    }
    if (btn) btn.disabled = true;
    if (textsFeedbackEl) textsFeedbackEl.classList.add("hidden");
    if (notifFeedbackEl) notifFeedbackEl.classList.add("hidden");
    try {
      const { ok, saveData } = await patchNotificationBannerTexts();
      if (!ok) {
        if (textsFeedbackEl) {
          textsFeedbackEl.classList.remove("hidden");
          textsFeedbackEl.textContent = saveData.error || "Erreur lors de l'enregistrement des textes.";
          textsFeedbackEl.classList.add("error");
          textsFeedbackEl.classList.remove("success");
        }
        if (btn) btn.disabled = false;
        return;
      }
    } catch (_) {
      if (textsFeedbackEl) {
        textsFeedbackEl.classList.remove("hidden");
        textsFeedbackEl.textContent = "Connexion interrompue lors de l’enregistrement. Vérifiez votre réseau et réessayez.";
        textsFeedbackEl.classList.add("error");
        textsFeedbackEl.classList.remove("success");
      }
      if (btn) btn.disabled = false;
      return;
    }
    notifyAppSectionSaveSuccess("notifications");

    try {
      const res = await api("/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: titleEl?.value?.trim() || undefined,
          message,
          ...(categoryIds && categoryIds.length > 0 ? { category_ids: categoryIds } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (notifFeedbackEl) {
        notifFeedbackEl.classList.remove("hidden");
        if (res.ok) {
          const sent = data.sent != null ? data.sent : 0;
          const wp = data.sentWebPush != null ? data.sentWebPush : 0;
          const pk = data.sentPassKit != null ? data.sentPassKit : 0;
          if (sent === 0) notifFeedbackEl.textContent = data.message || "Aucun appareil n'a reçu la notification.";
          else {
            let msg = pk > 0 && wp > 0 ? `Notification envoyée à ${sent} appareil(s) (dont ${pk} Apple Wallet, ${wp} navigateur).` : pk > 0 ? `Notification envoyée à ${sent} appareil(s) (Apple Wallet).` : `Notification envoyée à ${sent} appareil(s).`;
            if (data.failed > 0 && data.errors?.length) msg += ` ${data.failed} échec(s).`;
            notifFeedbackEl.textContent = msg;
            const prevTip = notifFeedbackEl.nextElementSibling?.classList?.contains("app-notif-feedback-tip") ? notifFeedbackEl.nextElementSibling : null;
            if (prevTip) prevTip.remove();
            if (pk > 0) {
              const tip = document.createElement("p");
              tip.className = "app-notif-feedback-tip";
              tip.textContent = "";
              notifFeedbackEl.after(tip);
            }
          }
          notifFeedbackEl.classList.remove("error");
          notifFeedbackEl.classList.add("success");
        } else {
          notifFeedbackEl.textContent = data.error || "Erreur";
          notifFeedbackEl.classList.add("error");
        }
      }
      if (res.ok) loadAppNotificationStats();
    } catch (_) {
      if (notifFeedbackEl) {
        notifFeedbackEl.textContent =
          "Connexion interrompue pendant l’envoi (réseau, pare-feu ou bloqueur). Réessayez ou testez depuis un autre réseau / navigateur.";
        notifFeedbackEl.classList.remove("hidden", "success");
        notifFeedbackEl.classList.add("error");
      }
    }
    if (btn) btn.disabled = false;
  });

  async function loadCampaignSegments() {
    try {
      const res = await api("/notifications/campaign-segments");
      if (!res.ok) return;
      const data = await res.json();
      const ids = { inactive30: "app-campaign-count-inactive30", inactive90: "app-campaign-count-inactive90", new30: "app-campaign-count-new30", recurrent: "app-campaign-count-recurrent", points50: "app-campaign-count-points50" };
      for (const [key, id] of Object.entries(ids)) {
        const el = document.getElementById(id);
        if (el) el.textContent = data[key] ?? 0;
      }
    } catch (_) { /* ignore */ }
  }

  const CAMPAIGN_DEFAULTS = {
    inactive30: "On vous a manqué ! Revenez nous voir : -10% sur votre prochaine visite.",
    inactive90: "Ça fait longtemps ! Profitez de notre offre exclusive pour revenir.",
    new30: "Bienvenue chez nous ! Voici -10% sur votre première visite.",
    recurrent: "Merci pour votre fidélité ! Offre exclusive pour vous.",
    points50: "Vous avez des points à utiliser ! Venez les échanger contre une récompense.",
  };
  const CAMPAIGN_LABELS = {
    inactive30: "Relancer les inactifs (30 j)",
    inactive90: "Relancer les inactifs (90 j)",
    new30: "Bienvenue aux nouveaux",
    recurrent: "Récompenser les fidèles",
    points50: "Proches de la récompense",
  };

  let campaignModalSegment = null;
  const campaignModal = document.getElementById("app-campaign-modal");
  const campaignModalBackdrop = document.getElementById("app-campaign-modal-backdrop");
  const campaignModalTitle = document.getElementById("app-campaign-modal-title");
  const campaignModalSegmentEl = document.getElementById("app-campaign-modal-segment");
  const campaignModalMessage = document.getElementById("app-campaign-modal-message");
  const campaignModalCancel = document.getElementById("app-campaign-modal-cancel");
  const campaignModalSend = document.getElementById("app-campaign-modal-send");
  const campaignModalFeedback = document.getElementById("app-campaign-modal-feedback");

  function openCampaignModal(segment) {
    campaignModalSegment = segment;
    if (campaignModal) campaignModal.classList.remove("hidden");
    if (campaignModalTitle) campaignModalTitle.textContent = "Envoyer une campagne";
    if (campaignModalSegmentEl) campaignModalSegmentEl.textContent = CAMPAIGN_LABELS[segment] || segment;
    if (campaignModalMessage) campaignModalMessage.value = CAMPAIGN_DEFAULTS[segment] || "";
    if (campaignModalFeedback) { campaignModalFeedback.classList.add("hidden"); campaignModalFeedback.textContent = ""; }
  }
  function closeCampaignModal() {
    campaignModalSegment = null;
    if (campaignModal) campaignModal.classList.add("hidden");
  }
  campaignModalBackdrop?.addEventListener("click", closeCampaignModal);
  campaignModalCancel?.addEventListener("click", closeCampaignModal);
  campaignModalSend?.addEventListener("click", async () => {
    if (!campaignModalSegment) return;
    const message = campaignModalMessage?.value?.trim();
    if (!message) {
      if (campaignModalFeedback) { campaignModalFeedback.textContent = "Saisissez un message."; campaignModalFeedback.classList.remove("hidden"); campaignModalFeedback.classList.add("error"); }
      return;
    }
    if (campaignModalSend) campaignModalSend.disabled = true;
    if (campaignModalFeedback) { campaignModalFeedback.classList.add("hidden"); campaignModalFeedback.textContent = ""; }
    try {
      const titleEl = document.getElementById("app-notification-banner-title");
      const res = await api("/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: titleEl?.value?.trim() || undefined, message, segment: campaignModalSegment }),
      });
      const data = await res.json().catch(() => ({}));
      if (campaignModalFeedback) {
        campaignModalFeedback.classList.remove("hidden");
        if (res.ok) {
          const sent = data.sent ?? 0;
          campaignModalFeedback.textContent = sent > 0 ? `Envoyé à ${sent} appareil(s).` : (data.message || "Aucun appareil n'a reçu la notification.");
          campaignModalFeedback.classList.remove("error");
          campaignModalFeedback.classList.add("success");
          loadAppNotificationStats();
          loadCampaignSegments();
          setTimeout(closeCampaignModal, 1500);
        } else {
          campaignModalFeedback.textContent = data.error || "Erreur";
          campaignModalFeedback.classList.add("error");
        }
      }
    } catch (_) {
      if (campaignModalFeedback) {
        campaignModalFeedback.textContent =
          "Connexion interrompue (réseau, pare-feu ou bloqueur). Réessayez ou changez de réseau.";
        campaignModalFeedback.classList.remove("hidden");
        campaignModalFeedback.classList.add("error");
      }
    }
    if (campaignModalSend) campaignModalSend.disabled = false;
  });

  document.querySelectorAll(".app-campaign-send-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const seg = btn.dataset.segment;
      if (seg) openCampaignModal(seg);
    });
  });

  window.addEventListener("app-section-change", (e) => {
    if (e.detail?.sectionId === "notifications") {
      loadAppNotificationStats();
      loadCampaignSegments();
      updateAppNotificationPreview();
      refreshNotificationBannerIcon();
    }
  }, { once: false });

  initAppFlyerQr(slug, {
    pageOrigin,
    getShareLink: () => getShareLinkForSlug(slug),
    dashboardApi: (path, init) => api(path, init),
  });
  initAppCardRulesGuide();
  refresh();
  loadAppNotificationStats();
  loadCampaignSegments();
}

export { initAppPage };
