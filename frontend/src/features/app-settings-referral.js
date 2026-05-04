import "./app-settings-referral.css";

/**
 * Initialise le système de parrainage dans les Réglages.
 * @param {{ api: (path: string, init?: RequestInit) => Promise<Response> }} deps
 */
export function initSettingsReferral({ api }) {
  const banner = document.getElementById("app-referral-banner");
  const panel = document.getElementById("app-referral-panel");
  if (!banner || !panel) return;

  const backBtn = document.getElementById("app-referral-back");
  const linkUrlEl = document.getElementById("app-referral-link-url");
  const copyBtn = document.getElementById("app-referral-copy-btn");
  const shareBtn = document.getElementById("app-referral-share-btn");
  const loadingEl = document.getElementById("app-referral-loading");
  const contentEl = document.getElementById("app-referral-content");
  const lockedEl = document.getElementById("app-referral-locked");
  const progressEl = document.getElementById("app-referral-progress");
  const discountsContainer = document.getElementById("app-referral-discounts");
  const toast = document.getElementById("app-referral-copied-toast");

  let referralUrl = "";
  let toastTimer = null;

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 2200);
  }

  function openPanel() {
    panel.classList.remove("hidden");
    panel.scrollTop = 0;
    loadReferralData();
  }

  function closePanel() {
    panel.classList.add("hidden");
  }

  banner.addEventListener("click", openPanel);
  backBtn?.addEventListener("click", closePanel);

  copyBtn?.addEventListener("click", () => {
    if (!referralUrl) return;
    navigator.clipboard?.writeText(referralUrl).catch(() => {}).finally(() => {});
    showToast("Lien copié !");
  });

  shareBtn?.addEventListener("click", () => {
    if (!referralUrl) return;
    if (navigator.share) {
      navigator
        .share({
          title: "Rejoignez Myfidpass",
          text: "Lancez votre programme de fidélité et profitez de 1 mois à 1 € — invitation personnelle.",
          url: referralUrl,
        })
        .catch(() => {});
    } else {
      navigator.clipboard?.writeText(referralUrl).catch(() => {});
      showToast("Lien copié !");
    }
  });

  function renderDiscounts(discounts) {
    if (!discountsContainer) return;
    if (!discounts || discounts.length === 0) {
      discountsContainer.innerHTML = "";
      return;
    }
    const totalParrainMonths = discounts
      .filter((d) => d.discount_type === "parrain_50pct")
      .reduce((s, d) => s + Math.max(0, d.months_total - d.months_used), 0);
    const parrainDiscount = discounts.find((d) => d.discount_type === "parraine_50pct");

    let html = "";
    if (totalParrainMonths > 0) {
      html += `
        <div class="app-referral-discount-banner">
          🎉 ${totalParrainMonths} mois à −50 % débloqué${totalParrainMonths > 1 ? "s" : ""}
          <div class="app-referral-discount-banner__label">Contactez-nous pour l'appliquer à votre prochaine facture.</div>
        </div>`;
    }
    if (parrainDiscount) {
      html += `
        <div class="app-referral-discount-banner">
          🎁 1 mois à −50 % (filleul)
          <div class="app-referral-discount-banner__label">Votre prochain mois est à moitié prix — contactez-nous.</div>
        </div>`;
    }
    discountsContainer.innerHTML = html;
  }

  async function loadReferralData() {
    if (!loadingEl || !contentEl || !lockedEl) return;
    loadingEl.classList.remove("hidden");
    contentEl.classList.add("hidden");
    lockedEl.classList.add("hidden");

    try {
      const res = await api("/dashboard/referral");
      loadingEl.classList.add("hidden");

      if (res.status === 403) {
        lockedEl.classList.remove("hidden");
        return;
      }
      if (!res.ok) {
        loadingEl.textContent = "Erreur lors du chargement.";
        loadingEl.classList.remove("hidden");
        return;
      }

      const data = await res.json();
      referralUrl = data.referral_url || "";

      if (linkUrlEl) linkUrlEl.textContent = referralUrl;
      if (progressEl) {
        const total = data.total_referrals ?? 0;
        const converted = data.converted_referrals ?? 0;
        progressEl.textContent = `${converted} / ${total} converti${converted > 1 ? "s" : ""}`;
      }
      renderDiscounts(data.discounts || []);
      contentEl.classList.remove("hidden");
    } catch (_) {
      loadingEl.classList.remove("hidden");
      loadingEl.textContent = "Erreur réseau.";
    }
  }

  /** Affiche/masque la bannière selon l'état d'abonnement. */
  window.addEventListener("fidpass-auth-me", (e) => {
    const d = e.detail || {};
    const hasActive = !!(d.hasActiveSubscription ?? d.has_active_subscription);
    banner.classList.toggle("hidden", !hasActive);
  });
}
