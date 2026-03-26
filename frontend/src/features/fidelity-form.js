/**
 * Formulaire carte fidélité (/fidelity/:slug) : récap règles, création membre, succès, engagement.
 * Exporte showSlugError pour la page fidelity.
 */
import { API_BASE } from "../config.js";
import { getRoute } from "../router/index.js";
import { CARD_TEMPLATES } from "../constants/builder.js";
import { escapeHtmlForServer } from "../utils/apiError.js";
import { initClientFidelityPage } from "../client-fidelity/bootstrap.js";
import { renderEngagementActionsMarkup } from "../client-fidelity/ui/mission-markup.js";
import { applyWalletButtonsLayout } from "../utils/walletPlatform.js";

const fidelityAppEl = document.getElementById("fidelity-app");


let _fidelityBusiness = null;

const form = document.getElementById("card-form");
const inputName = document.getElementById("input-name");
const inputEmail = document.getElementById("input-email");
const btnSubmit = document.getElementById("btn-submit");
const fidelityErrorEl = document.getElementById("fidelity-error");
const fidelitySuccessEl = document.getElementById("fidelity-success");
const btnAppleWallet = document.getElementById("btn-apple-wallet");
const btnGoogleWallet = document.getElementById("btn-google-wallet");
const fidelityGoogleErrorEl = document.getElementById("fidelity-google-error");
const btnAnotherCard = document.getElementById("btn-another-card");
const fidelityTitleEl = document.getElementById("fidelity-title");
const fidelitySubtitleEl = document.getElementById("fidelity-subtitle");
const pageLogo = document.querySelector("#fidelity-app .header .logo");

function getSlugFromPath() {
  const route = getRoute();
  return route.type === "fidelity" ? route.slug : null;
}

/** Template choisi (depuis l’URL) pour le pass. */
function getTemplateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const t = params.get("template");
  if (t && CARD_TEMPLATES.some((x) => x.id === t)) return t;
  return "classic";
}

function ensureFidelityPath(slug) {
  const path = window.location.pathname.replace(/\/$/, "");
  if (path === "" || path === "/" || path === "/fidelity") {
    history.replaceState(null, "", `/fidelity/${slug}`);
  }
}

async function fetchBusiness(slug) {
  const res = await fetch(`${API_BASE}/api/businesses/${encodeURIComponent(slug)}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error("Entreprise introuvable");
    throw new Error("Erreur serveur");
  }
  return res.json();
}

async function createMember(slug, name, email) {
  const res = await fetch(`${API_BASE}/api/businesses/${encodeURIComponent(slug)}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Erreur lors de la création");
  }
  return res.json();
}

function getPassUrl(slug, memberId) {
  const template = getTemplateFromUrl();
  const t = Date.now();
  return `${API_BASE}/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(memberId)}/pass?template=${encodeURIComponent(template)}&_=${t}`;
}

function redirectToPass(slug, memberId) {
  window.location.href = getPassUrl(slug, memberId);
}

function showError(message) {
  if (!fidelityErrorEl) return;
  fidelityErrorEl.textContent = message || "";
  fidelityErrorEl.classList.toggle("hidden", !message);
}

function setLoading(loading) {
  if (btnSubmit) {
    btnSubmit.disabled = loading;
    if (loading) {
      btnSubmit.innerHTML = "Création…";
    } else {
      btnSubmit.innerHTML = '<span class="fidelity-btn-icon" aria-hidden="true">&#63743;</span> Créer ma carte';
    }
  }
}

function setPageBusiness(business) {
  const params = new URLSearchParams(window.location.search);
  const etablissement = params.get("etablissement");
  const displayName = etablissement || business?.name;
  if (displayName && pageLogo) pageLogo.textContent = displayName;
  const orgName = etablissement || business?.organizationName;
  if (fidelityTitleEl) {
    fidelityTitleEl.textContent = orgName ? `Carte de fidélité ${orgName}` : "Carte de fidélité";
  }
  if (fidelitySubtitleEl) {
    fidelitySubtitleEl.textContent = orgName
      ? `Renseigne ton nom et ton email, puis ajoute la carte ${orgName} à ton téléphone.`
      : "Renseigne ton nom et ton email, puis ajoute la carte à ton téléphone.";
  }
}

const FIDPASS_SUCCESS_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 jours

function renderFidelityRulesRecap(business) {
  const el = document.getElementById("fidelity-rules-recap");
  if (!el) return;
  if (!business) {
    el.innerHTML = "<p class=\"fidelity-rules-text\">Les points sont crédités à chaque visite. Renseignez-vous en magasin pour les détails.</p>";
    return;
  }
  const programType = business.program_type;
  const parts = [];
  if (programType === "stamps" && business.required_stamps > 0) {
    const mid = (business.stamp_mid_reward_label || "").trim();
    const label = (business.stamp_reward_label || "1 offert").trim();
    if (mid) {
      parts.push(`<p class="fidelity-rules-text"><strong>5 points</strong> = ${escapeHtmlForServer(mid)}</p>`);
    }
    parts.push(`<p class="fidelity-rules-text"><strong>${business.required_stamps} points</strong> = ${escapeHtmlForServer(label)}</p>`);
  } else if (programType === "points" && Array.isArray(business.points_reward_tiers) && business.points_reward_tiers.length > 0) {
    parts.push("<p class=\"fidelity-rules-label\">Paliers de récompenses</p>");
    business.points_reward_tiers.forEach((tier) => {
      const pts = tier.points != null ? tier.points : tier.points_required;
      const lbl = (tier.label || "Récompense").trim();
      if (pts != null) parts.push(`<p class="fidelity-rules-text">${pts} points = ${escapeHtmlForServer(lbl)}</p>`);
    });
  }
  if (parts.length === 0) {
    el.innerHTML = "<p class=\"fidelity-rules-text\">Les points sont crédités à chaque visite. Renseignez-vous en magasin pour les détails.</p>";
  } else {
    el.innerHTML = "<p class=\"fidelity-rules-intro\">Règles du programme</p>" + parts.join("");
  }
}

function showFidelitySuccess(slug, memberId, memberName) {
  const toStore = { memberId, createdAt: Date.now() };
  if (memberName != null && String(memberName).trim()) toStore.memberName = String(memberName).trim();
  try {
    localStorage.setItem("fidpass_success_" + slug, JSON.stringify(toStore));
  } catch (_) {}
  const welcomeEl = document.getElementById("fidelity-welcome-name");
  const nameToShow = memberName != null ? String(memberName).trim() : (() => {
    try {
      const raw = localStorage.getItem("fidpass_success_" + slug);
      if (raw) {
        const o = JSON.parse(raw);
        return o.memberName || "";
      }
    } catch (_) {}
    return "";
  })();
  if (welcomeEl) {
    if (nameToShow) {
      welcomeEl.textContent = "Bienvenue, " + nameToShow + ".";
      welcomeEl.classList.remove("hidden");
      welcomeEl.setAttribute("aria-hidden", "false");
    } else {
      welcomeEl.textContent = "";
      welcomeEl.classList.add("hidden");
      welcomeEl.setAttribute("aria-hidden", "true");
    }
  }
  if (form) form.classList.add("hidden");
  if (fidelitySuccessEl) {
    fidelitySuccessEl.classList.remove("hidden");
    if (fidelityGoogleErrorEl) {
      fidelityGoogleErrorEl.classList.add("hidden");
      fidelityGoogleErrorEl.textContent = "";
    }
  }
  const passUrl = getPassUrl(slug, memberId);
  if (btnAppleWallet) {
    btnAppleWallet.href = passUrl;
    btnAppleWallet.onclick = (e) => {
      e.preventDefault();
      window.location.href = passUrl;
    };
  }
  const walletButtonsRow = btnAppleWallet?.closest(".fidelity-wallet-buttons");
  applyWalletButtonsLayout(walletButtonsRow);

  if (btnGoogleWallet) {
    btnGoogleWallet.href = "#";
    btnGoogleWallet.onclick = async (e) => {
      e.preventDefault();
      if (fidelityGoogleErrorEl) {
        fidelityGoogleErrorEl.classList.add("hidden");
        fidelityGoogleErrorEl.textContent = "";
      }
      try {
        const res = await fetch(
          `${API_BASE}/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(memberId)}/google-wallet-url`
        );
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.url) {
          window.open(data.url, "_blank", "noopener,noreferrer");
        } else {
          if (fidelityGoogleErrorEl) {
            fidelityGoogleErrorEl.textContent =
              data.code === "google_wallet_unavailable"
                ? "Google Wallet n’est pas configuré pour ce site. Utilisez Apple Wallet ou réessayez plus tard."
                : data.error || "Impossible d’ouvrir Google Wallet.";
            fidelityGoogleErrorEl.classList.remove("hidden");
          }
        }
      } catch (_) {
        if (fidelityGoogleErrorEl) {
          fidelityGoogleErrorEl.textContent = "Erreur réseau. Réessaie.";
          fidelityGoogleErrorEl.classList.remove("hidden");
        }
      }
    };
  }
  if (btnAnotherCard) {
    btnAnotherCard.onclick = () => {
      try {
        localStorage.removeItem("fidpass_success_" + slug);
      } catch (_) {}
      if (fidelitySuccessEl) fidelitySuccessEl.classList.add("hidden");
      if (form) form.classList.remove("hidden");
      if (fidelityGoogleErrorEl) {
        fidelityGoogleErrorEl.classList.add("hidden");
        fidelityGoogleErrorEl.textContent = "";
      }
      const afterAdd = document.getElementById("fidelity-after-add-section");
      if (afterAdd) afterAdd.classList.add("hidden");
    };
  }

  const afterAddSection = document.getElementById("fidelity-after-add-section");
  if (afterAddSection) {
    renderFidelityRulesRecap(_fidelityBusiness);
    afterAddSection.classList.remove("hidden");
  }

  const engagementBlock = document.getElementById("fidelity-engagement-block");
  const engagementEmptyEl = document.getElementById("fidelity-engagement-empty");
  const engagementActionsEl = document.getElementById("fidelity-engagement-actions");
  const engagementClaimFeedback = document.getElementById("fidelity-engagement-claim-feedback");
  const engagementProofTokens = new Map();
  function escapeHtmlFidelity(s) {
    const div = document.createElement("div");
    div.textContent = s == null ? "" : String(s);
    return div.innerHTML;
  }
  function setEngagementClaimFeedback(message, type = "success") {
    if (!engagementClaimFeedback) return;
    engagementClaimFeedback.textContent = message || "";
    engagementClaimFeedback.classList.remove("hidden", "success", "error");
    if (type === "error") engagementClaimFeedback.classList.add("error");
    else engagementClaimFeedback.classList.add("success");
  }
  function getEngagementFingerprint() {
    const parts = [
      navigator.userAgent || "",
      navigator.language || "",
      navigator.platform || "",
      String(screen?.width || ""),
      String(screen?.height || ""),
      String(new Date().getTimezoneOffset()),
    ];
    return parts.join("|");
  }
  async function loadEngagementActions() {
    if (!engagementBlock || !engagementActionsEl) return;
    if (engagementEmptyEl) engagementEmptyEl.classList.add("hidden");
    const retryDelays = [0, 1200, 3200];
    let actions = [];
    for (let i = 0; i < retryDelays.length; i += 1) {
      if (retryDelays[i] > 0) {
        await new Promise((resolve) => setTimeout(resolve, retryDelays[i]));
      }
      try {
        const current = await fetchEngagementActions(slug);
        if (Array.isArray(current) && current.length > 0) {
          actions = current.filter((a) => a.action_type !== "profile_complete");
          break;
        }
      } catch (_) {}
    }
    if (actions.length === 0) {
      engagementBlock.classList.add("hidden");
      if (engagementEmptyEl) engagementEmptyEl.classList.remove("hidden");
      return;
    }
    engagementBlock.classList.remove("hidden");
    engagementActionsEl.innerHTML = renderEngagementActionsMarkup(actions, escapeHtmlFidelity);
    const PENDING_CLAIM_KEY_MAIN = "fidelity_pending_engagement_claim";
    const PENDING_CLAIM_MIN_MS = 45000;
    const PENDING_CLAIM_MAX_MS = 24 * 60 * 60 * 1000;
    async function tryAutoClaimOnReturnFidelity() {
      try {
        const raw = sessionStorage.getItem(PENDING_CLAIM_KEY_MAIN);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (data.slug !== slug || !data.actionType || !data.ts) return;
        const age = Date.now() - data.ts;
        if (age < PENDING_CLAIM_MIN_MS || age > PENDING_CLAIM_MAX_MS) return;
        const successRaw = localStorage.getItem("fidpass_success_" + slug);
        if (!successRaw) return;
        const { memberId: storedMemberId } = JSON.parse(successRaw);
        if (!storedMemberId) return;
        sessionStorage.removeItem(PENDING_CLAIM_KEY_MAIN);
        const claimRes = await fetch(`${API_BASE}/api/businesses/${encodeURIComponent(slug)}/engagement/claim`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memberId: storedMemberId, action_type: data.actionType }),
        });
        const claimData = await claimRes.json().catch(() => ({}));
        if (claimRes.ok) {
          setEngagementClaimFeedback(claimData.message || "Points ajoutés à ta carte.");
        }
      } catch (_) {}
    }
    engagementActionsEl.querySelectorAll(".fidelity-engagement-open-link").forEach((openBtn) => {
      openBtn.addEventListener("click", () => {
        const actionType = openBtn.getAttribute("data-action-type");
        if (actionType) {
          sessionStorage.setItem(PENDING_CLAIM_KEY_MAIN, JSON.stringify({ slug, actionType, ts: Date.now() }));
        }
      });
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") tryAutoClaimOnReturnFidelity();
    });
    tryAutoClaimOnReturnFidelity();
  }
  loadEngagementActions();

  const btnEnableNotifications = document.getElementById("btn-enable-notifications");
  const notificationsStatusEl = document.getElementById("fidelity-notifications-status");
  const notificationsBlock = document.getElementById("fidelity-notifications-block");
  const isIOSDevice =
    /iPad|iPhone|iPod/i.test(navigator.userAgent || "") ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  async function trySubscribeToPush() {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      if (notificationsStatusEl) {
        notificationsStatusEl.textContent = "Les notifications ne sont pas supportées sur ce navigateur.";
        notificationsStatusEl.classList.remove("hidden");
      }
      return false;
    }
    if (Notification.permission === "denied") {
      if (notificationsStatusEl) {
        notificationsStatusEl.textContent = "Les notifications ont été bloquées. Autorisez-les dans les paramètres du navigateur pour recevoir les offres.";
        notificationsStatusEl.classList.remove("hidden", "success");
        notificationsStatusEl.classList.add("error");
      }
      return false;
    }
    if (btnEnableNotifications) btnEnableNotifications.disabled = true;
    if (notificationsStatusEl) {
      notificationsStatusEl.textContent = "Activation…";
      notificationsStatusEl.classList.remove("hidden", "error");
      notificationsStatusEl.classList.add("success");
    }
    try {
      let permission = Notification.permission;
      if (permission === "default") permission = await Notification.requestPermission();
      if (permission !== "granted") {
        if (notificationsStatusEl) {
          notificationsStatusEl.textContent = "Autorisez les notifications pour recevoir les offres et actualités.";
          notificationsStatusEl.classList.remove("success");
          notificationsStatusEl.classList.add("error");
        }
        if (btnEnableNotifications) btnEnableNotifications.disabled = false;
        return false;
      }
      const vapidRes = await fetch(`${API_BASE}/api/web-push/vapid-public`);
      if (!vapidRes.ok) throw new Error("Service notifications indisponible");
      const { publicKey } = await vapidRes.json();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const subJson = sub.toJSON ? sub.toJSON() : {
        endpoint: sub.endpoint,
        keys: {
          p256dh: arrayBufferToBase64(sub.getKey("p256dh")),
          auth: arrayBufferToBase64(sub.getKey("auth")),
        },
      };
      const res = await fetch(`${API_BASE}/api/web-push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          memberId,
          subscription: { endpoint: subJson.endpoint, keys: { p256dh: subJson.keys.p256dh, auth: subJson.keys.auth } },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erreur lors de l'abonnement");
      }
      if (notificationsStatusEl) {
        notificationsStatusEl.textContent = "Vous recevrez les offres et actualités par notification.";
        notificationsStatusEl.classList.remove("error");
        notificationsStatusEl.classList.add("success");
      }
      if (btnEnableNotifications) {
        btnEnableNotifications.textContent = "Notifications activées";
        btnEnableNotifications.disabled = true;
      }
      return true;
    } catch (err) {
      if (notificationsStatusEl) {
        notificationsStatusEl.textContent = err.message || "Erreur. Cliquez sur le bouton pour réessayer.";
        notificationsStatusEl.classList.remove("success");
        notificationsStatusEl.classList.add("error");
      }
      if (btnEnableNotifications) btnEnableNotifications.disabled = false;
      return false;
    }
  }

  if (btnEnableNotifications) btnEnableNotifications.onclick = () => trySubscribeToPush();
  if (notificationsBlock && isIOSDevice) {
    notificationsBlock.classList.add("hidden");
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i);
  return output;
}

function arrayBufferToBase64(buffer) {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function fetchEngagementActions(slug) {
  const encodedSlug = encodeURIComponent(slug);
  const noCacheKey = Date.now().toString();
  const candidates = [];
  const add = (url) => {
    if (url && !candidates.includes(url)) candidates.push(url);
  };
  add(`${API_BASE}/api/businesses/${encodedSlug}/engagement-actions?_=${encodeURIComponent(noCacheKey)}`);
  if (typeof window !== "undefined") {
    add(`${window.location.origin}/api/businesses/${encodedSlug}/engagement-actions?_=${encodeURIComponent(noCacheKey)}`);
    add(`https://api.myfidpass.fr/api/businesses/${encodedSlug}/engagement-actions?_=${encodeURIComponent(noCacheKey)}`);
  }
  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const data = await res.json().catch(() => ({}));
      if (Array.isArray(data.actions)) return data.actions;
    } catch (_) {}
  }
  return [];
}

function showSlugError(message) {
  const el = document.getElementById("fidelity-app");
  if (!el) return;
  el.innerHTML = `
    <header class="header"><div class="header-inner"><a href="/" class="logo">Myfidpass</a></div></header>
    <main class="main" style="text-align: center; padding: 3rem 1.5rem;">
      <p class="error-message" style="font-size: 1.1rem;">${message}</p>
      <p style="color: var(--text-muted); margin-top: 1rem;">Ex. : <a href="/fidelity/demo" style="color: var(--accent);">/fidelity/demo</a></p>
    </main>
  `;
}

function initFidelityApp(slug) {
  const route = getRoute();
  initClientFidelityPage({
    slug,
    apiBase: API_BASE,
    rootEl: fidelityAppEl,
  }).catch(() => {
    showSlugError(`Entreprise « ${slug} » introuvable.`);
  });
}

function runFidelityApp(slug) {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
  fetchBusiness(slug)
    .then((business) => {
      _fidelityBusiness = business;
      ensureFidelityPath(slug);
      setPageBusiness(business);
      // Au retour sur la page après ajout de la carte au Wallet, restaurer l’écran succès avec les missions
      try {
        const raw = localStorage.getItem("fidpass_success_" + slug);
        if (raw) {
          const { memberId: storedMemberId, memberName: storedMemberName, createdAt } = JSON.parse(raw);
          if (
            storedMemberId &&
            Date.now() - (createdAt || 0) < FIDPASS_SUCCESS_MAX_AGE
          ) {
            showFidelitySuccess(slug, storedMemberId, storedMemberName);
          }
        }
      } catch (_) {}
    })
    .catch(() => {
      showSlugError(`Entreprise « ${slug} » introuvable.`);
    });

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const s = getSlugFromPath();
      if (!s) return;

      const name = inputName?.value?.trim();
      const email = inputEmail?.value?.trim();
      if (!name || !email) {
        showError("Renseigne ton nom et ton email.");
        return;
      }

      setLoading(true);
      showError("");
      try {
        const data = await createMember(s, name, email);
        const memberId = data.memberId || data.member?.id;
        if (!memberId) throw new Error("Réponse serveur invalide");
        showFidelitySuccess(s, memberId, data.member?.name);
      } catch (err) {
        const isNetworkError = err.message === "Failed to fetch" || err.name === "TypeError";
        showError(
          isNetworkError
            ? "Le serveur ne répond pas. Lance le backend : npm run backend"
            : (err.message || "Une erreur est survenue. Réessaie.")
        );
      } finally {
        setLoading(false);
      }
    });
  }

  // Quand l’utilisateur revient sur l’onglet (bouton Retour après ajout au Wallet), réafficher l’écran succès et les missions
  window.addEventListener("pageshow", (e) => {
    if (!e.persisted) return;
    const s = getSlugFromPath();
    if (!s) return;
    try {
      const raw = localStorage.getItem("fidpass_success_" + s);
      if (!raw) return;
      const { memberId: storedMemberId, memberName: storedMemberName, createdAt } = JSON.parse(raw);
      if (storedMemberId && Date.now() - (createdAt || 0) < FIDPASS_SUCCESS_MAX_AGE) {
        showFidelitySuccess(s, storedMemberId, storedMemberName);
      }
    } catch (_) {}
  });
}

export { showSlugError, initFidelityApp, runFidelityApp };
