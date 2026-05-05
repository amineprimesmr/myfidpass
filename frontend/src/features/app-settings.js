import { geocodeAddress } from "../utils/geocoding.js";
import { buildSettingsPatchPayload, isValidEmail, mapDashboardSettingsToForm } from "./app-settings-helpers.js";
import { bindSettingsAccount } from "./app-settings-account.js";
import { bindSettingsNotifications } from "./app-settings-notifications.js";
import { bindSettingsLocation } from "./app-settings-location.js";
import { bindSettingsSecurity } from "./app-settings-security.js";
import { bindSettingsEstablishment } from "./app-settings-establishment.js";
import { initSettingsReferral } from "./app-settings-referral.js";

/**
 * @param {{
 * api: (path: string, init?: RequestInit) => Promise<Response>;
 * slug: string;
 * markDirty: () => void;
 * notifySaveSuccess: () => void;
 * registerDiscardHandler: (handler: () => Promise<unknown>) => void;
 * propagateEstablishmentDisplayName: (name: string) => void;
 * refreshSidebarBusinessLogo: () => void;
 * applyCommerceIosHomeState: (settings: Record<string, unknown>) => void;
 * openSlugEditor: (name: string) => void;
 * resizeLogoToDataUrl?: (file: File, size: number, quality: number, mode: string) => Promise<string>;
 * }} deps
 */
export function initAppSettings(deps) {
  const settingsRoot = document.getElementById("profil");
  if (!settingsRoot) return;

  const els = {
    org: document.getElementById("app-profil-org"),
    address: document.getElementById("app-profil-address"),
    contactEmail: document.getElementById("app-settings-contact-email"),
    contactPhone: document.getElementById("app-settings-contact-phone"),
    logoPreview: document.getElementById("app-profil-logo-preview"),
    logoPlaceholder: document.getElementById("app-profil-logo-placeholder"),
    logoInput: document.getElementById("app-profil-logo-input"),
    logoRemove: document.getElementById("app-profil-logo-remove"),
    logoIconPreview: document.getElementById("app-profil-logo-icon-preview"),
    logoIconPlaceholder: document.getElementById("app-profil-logo-icon-placeholder"),
    logoIconInput: document.getElementById("app-profil-logo-icon-input"),
    logoIconRemove: document.getElementById("app-profil-logo-icon-remove"),
    slugDisplay: document.getElementById("app-profil-slug-display"),
    message: document.getElementById("app-profil-message"),
    save: document.getElementById("app-profil-save"),
    saveText: document.getElementById("app-profil-save-text"),
    saveSpinner: document.getElementById("app-profil-save-spinner"),
    email: document.getElementById("app-profil-email"),
    accountMessage: document.getElementById("app-profil-account-message"),
    changePassword: document.getElementById("app-profil-change-password"),
    notifMessage: document.getElementById("app-settings-notif-message"),
    notifSave: document.getElementById("app-settings-notif-save"),
    notifSend: document.getElementById("app-settings-notif-send"),
    notifFeedback: document.getElementById("app-settings-notif-feedback"),
    locationOpenMaps: document.getElementById("app-settings-location-open-maps"),
    securityPasses: document.getElementById("app-settings-security-max-passes"),
    securityPoints: document.getElementById("app-settings-security-max-points"),
    securityRequireReceipt: document.getElementById("app-settings-security-require-receipt"),
    securityTolerance: document.getElementById("app-settings-security-tolerance"),
    addressSuggestions: document.getElementById("app-profil-address-suggestions"),
    openSlugEditor: document.getElementById("app-profil-open-slug-editor"),
  };

  let logoDataUrl = "";
  let logoRemoved = false;
  let logoIconDataUrl = "";
  let logoIconRemoved = false;

  function setFeedback(text, isError = false) {
    if (!els.message) return;
    els.message.textContent = text || "";
    els.message.classList.toggle("hidden", !text);
    els.message.classList.toggle("success", !!text && !isError);
    els.message.classList.toggle("error", !!text && isError);
  }

  function setAccountFeedback(text, isError = false) {
    if (!els.accountMessage) return;
    els.accountMessage.textContent = text || "";
    els.accountMessage.classList.toggle("hidden", !text);
    els.accountMessage.classList.toggle("success", !!text && !isError);
    els.accountMessage.classList.toggle("error", !!text && isError);
  }

  function setNotifFeedback(text, isError = false) {
    if (!els.notifFeedback) return;
    els.notifFeedback.textContent = text || "";
    els.notifFeedback.classList.toggle("hidden", !text);
    els.notifFeedback.classList.toggle("success", !!text && !isError);
    els.notifFeedback.classList.toggle("error", !!text && isError);
  }

  function hideAddressSuggestions() {
    if (!els.addressSuggestions) return;
    els.addressSuggestions.classList.add("hidden");
    els.addressSuggestions.innerHTML = "";
    els.address?.setAttribute("aria-expanded", "false");
  }

  function updateSlugDisplay() {
    if (!els.slugDisplay) return;
    const base = window.location?.origin?.replace(/\/$/, "") || "";
    const url = `${base}/fidelity/${deps.slug}`;
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = url;
    link.style.color = "inherit";
    els.slugDisplay.innerHTML = "";
    els.slugDisplay.appendChild(link);
  }

  function resetLogoVisuals() {
    if (els.logoPreview) {
      els.logoPreview.src = "";
      els.logoPreview.classList.add("hidden");
    }
    if (els.logoPlaceholder) els.logoPlaceholder.classList.remove("hidden");
    els.logoRemove?.classList.add("hidden");
    logoRemoved = false;
    logoDataUrl = "";
  }

  function resetLogoIconVisuals() {
    if (els.logoIconPreview) {
      els.logoIconPreview.src = "";
      els.logoIconPreview.classList.add("hidden");
    }
    if (els.logoIconPlaceholder) els.logoIconPlaceholder.classList.remove("hidden");
    els.logoIconRemove?.classList.add("hidden");
    logoIconRemoved = false;
    logoIconDataUrl = "";
  }

  async function hydrateForm() {
    const res = await deps.api("/dashboard/settings");
    if (!res.ok) throw new Error("settings_load_failed");
    const data = await res.json();
    deps.applyCommerceIosHomeState(data);
    const mapped = mapDashboardSettingsToForm(data);
    if (els.org) els.org.value = mapped.organizationName;
    deps.propagateEstablishmentDisplayName(mapped.organizationName);
    if (els.address) els.address.value = mapped.locationAddress;
    if (els.contactEmail) els.contactEmail.value = mapped.contactEmail;
    if (els.contactPhone) els.contactPhone.value = mapped.contactPhone;
    if (els.securityPasses) els.securityPasses.value = String(mapped.scanMaxPassesPerMemberPerDay || 0);
    if (els.securityPoints) els.securityPoints.value = String(mapped.scanMaxPointsPerTransaction || 0);
    if (els.securityRequireReceipt) els.securityRequireReceipt.checked = !!mapped.requireReceiptQrValidation;
    if (els.securityTolerance) els.securityTolerance.value = String(mapped.receiptQrToleranceCents ?? 5);
    if (els.notifMessage) els.notifMessage.value = mapped.notificationChangeMessage || "";
    hideAddressSuggestions();
    updateSlugDisplay();
    resetLogoVisuals();
    resetLogoIconVisuals();

    if (data.logo_url || data.logoUrl) {
      const logoRes = await deps.api(`/logo?v=${Date.now()}`);
      if (logoRes.ok && els.logoPreview) {
        const blob = await logoRes.blob();
        els.logoPreview.src = URL.createObjectURL(blob);
        els.logoPreview.classList.remove("hidden");
        els.logoPlaceholder?.classList.add("hidden");
        els.logoRemove?.classList.remove("hidden");
      }
    }
    if (data.logo_icon_url || data.logoIconUrl) {
      const logoIconRes = await deps.api(`/logo-icon?v=${Date.now()}`);
      if (logoIconRes.ok && els.logoIconPreview) {
        const blob = await logoIconRes.blob();
        els.logoIconPreview.src = URL.createObjectURL(blob);
        els.logoIconPreview.classList.remove("hidden");
        els.logoIconPlaceholder?.classList.add("hidden");
        els.logoIconRemove?.classList.remove("hidden");
      }
    }
    deps.refreshSidebarBusinessLogo();
  }

  async function saveAllSettings() {
    const state = {
      organizationName: els.org?.value || "",
      locationAddress: els.address?.value || "",
      contactEmail: els.contactEmail?.value || "",
      contactPhone: els.contactPhone?.value || "",
      scanMaxPassesPerMemberPerDay: els.securityPasses?.value || 0,
      scanMaxPointsPerTransaction: els.securityPoints?.value || 0,
      requireReceiptQrValidation: !!els.securityRequireReceipt?.checked,
      receiptQrToleranceCents: els.securityTolerance?.value || 5,
      notificationChangeMessage: els.notifMessage?.value || "",
    };
    if (!isValidEmail(state.contactEmail)) {
      setFeedback("L’e-mail de contact n’est pas valide.", true);
      return;
    }
    const payload = buildSettingsPatchPayload(state);
    if (logoRemoved) payload.logo_base64 = null;
    else if (logoDataUrl.startsWith("data:")) payload.logo_base64 = logoDataUrl;
    if (logoIconRemoved) payload.logo_icon_base64 = null;
    else if (logoIconDataUrl.startsWith("data:")) payload.logo_icon_base64 = logoIconDataUrl;
    if (state.locationAddress.trim()) {
      const coords = await geocodeAddress(state.locationAddress.trim()).catch(() => null);
      if (coords) {
        payload.location_lat = coords.lat;
        payload.location_lng = coords.lng;
      }
    }

    els.save && (els.save.disabled = true);
    els.saveText?.classList.add("hidden");
    els.saveSpinner?.classList.remove("hidden");
    setFeedback("");
    const saveRes = await deps.api("/dashboard/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const saveData = await saveRes.json().catch(() => ({}));
    els.save && (els.save.disabled = false);
    els.saveText?.classList.remove("hidden");
    els.saveSpinner?.classList.add("hidden");
    if (!saveRes.ok) {
      setFeedback(saveData.error || "Erreur lors de l’enregistrement.", true);
      return;
    }
    logoRemoved = false;
    logoIconRemoved = false;
    logoDataUrl = "";
    logoIconDataUrl = "";
    deps.propagateEstablishmentDisplayName(String(state.organizationName).trim());
    deps.refreshSidebarBusinessLogo();
    deps.notifySaveSuccess();
    setFeedback("");
  }

  els.contactEmail?.addEventListener("input", deps.markDirty);
  els.contactPhone?.addEventListener("input", deps.markDirty);
  els.notifMessage?.addEventListener("input", deps.markDirty);
  els.save?.addEventListener("click", () => { void saveAllSettings(); });

  bindSettingsEstablishment({
    orgInput: /** @type {HTMLInputElement | null} */ (els.org),
    addressInput: /** @type {HTMLInputElement | null} */ (els.address),
    addressSuggestions: els.addressSuggestions,
    logoInput: /** @type {HTMLInputElement | null} */ (els.logoInput),
    logoRemove: /** @type {HTMLButtonElement | null} */ (els.logoRemove),
    logoPreview: /** @type {HTMLImageElement | null} */ (els.logoPreview),
    logoPlaceholder: els.logoPlaceholder,
    logoIconInput: /** @type {HTMLInputElement | null} */ (els.logoIconInput),
    logoIconRemove: /** @type {HTMLButtonElement | null} */ (els.logoIconRemove),
    logoIconPreview: /** @type {HTMLImageElement | null} */ (els.logoIconPreview),
    logoIconPlaceholder: els.logoIconPlaceholder,
    markDirty: deps.markDirty,
    resizeLogoToDataUrl: deps.resizeLogoToDataUrl,
    setFeedback,
    onLogoStateChange: (next) => {
      if (typeof next.logoDataUrl === "string") logoDataUrl = next.logoDataUrl;
      if (typeof next.logoRemoved === "boolean") logoRemoved = next.logoRemoved;
      if (typeof next.logoIconDataUrl === "string") logoIconDataUrl = next.logoIconDataUrl;
      if (typeof next.logoIconRemoved === "boolean") logoIconRemoved = next.logoIconRemoved;
    },
  });

  bindSettingsSecurity({
    maxPasses: /** @type {HTMLInputElement | null} */ (els.securityPasses),
    maxPoints: /** @type {HTMLInputElement | null} */ (els.securityPoints),
    requireReceipt: /** @type {HTMLInputElement | null} */ (els.securityRequireReceipt),
    tolerance: /** @type {HTMLInputElement | null} */ (els.securityTolerance),
    markDirty: deps.markDirty,
  });
  bindSettingsNotifications({
    api: deps.api,
    messageInput: /** @type {HTMLTextAreaElement | null} */ (els.notifMessage),
    sendBtn: /** @type {HTMLButtonElement | null} */ (els.notifSend),
    saveBtn: /** @type {HTMLButtonElement | null} */ (els.notifSave),
    setFeedback: setNotifFeedback,
    onSaveRequested: () => { void saveAllSettings(); },
  });
  bindSettingsLocation({
    openMapsBtn: /** @type {HTMLButtonElement | null} */ (els.locationOpenMaps),
    addressInput: /** @type {HTMLInputElement | null} */ (els.address),
  });
  bindSettingsAccount({
    changePasswordBtn: /** @type {HTMLButtonElement | null} */ (els.changePassword),
    emailInput: /** @type {HTMLInputElement | null} */ (els.email),
    setFeedback: setAccountFeedback,
  });
  els.openSlugEditor?.addEventListener("click", () => deps.openSlugEditor(String(els.org?.value || "").trim()));
  document.getElementById("app-settings-close")?.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("app-settings-close-request"));
  });
  initSettingsReferral({ api: deps.api });
  initDevSimulatePayment({ api: deps.api });

  window.addEventListener("app-section-change", (event) => {
    if (event.detail?.sectionId !== "profil") return;
    void hydrateForm().catch(() => setFeedback("Erreur reseau lors du chargement.", true));
    const sidebarEmail = document.getElementById("app-user-email")?.textContent?.trim();
    if (els.email && sidebarEmail && !els.email.value?.trim()) els.email.value = sidebarEmail;
  });
  deps.registerDiscardHandler(() => hydrateForm());
  if (settingsRoot.classList.contains("app-section-visible")) {
    void hydrateForm().catch(() => setFeedback("Erreur reseau lors du chargement.", true));
  }
}

/**
 * Bouton dev : simule un abonnement actif sans passer par Stripe.
 * @param {{ api: (path: string, init?: RequestInit) => Promise<Response> }} deps
 */
function initDevSimulatePayment({ api }) {
  const btn = document.getElementById("app-dev-simulate-payment-btn");
  const statusEl = document.getElementById("app-dev-simulate-payment-status");
  if (!btn) return;

  async function checkState() {
    try {
      const res = await api("/dashboard/dev-simulate-payment");
      if (!res.ok) return;
      const data = await res.json();
      const isSimulated = data.simulated === true;
      btn.textContent = isSimulated ? "Désactiver la simulation" : "Simuler le paiement";
      btn.style.background = isSimulated ? "#6b7280" : "#b45309";
      if (statusEl) statusEl.textContent = isSimulated ? "Simulation active" : "";
    } catch (_) {}
  }

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    if (statusEl) statusEl.textContent = "…";
    try {
      const stateRes = await api("/dashboard/dev-simulate-payment");
      const state = stateRes.ok ? await stateRes.json() : {};
      const method = state.simulated ? "DELETE" : "POST";
      const res = await api("/dashboard/dev-simulate-payment", { method });
      if (res.ok) {
        if (statusEl) statusEl.textContent = state.simulated ? "Simulation retirée. Rechargement…" : "Simulation activée ! Rechargement…";
        setTimeout(() => window.location.reload(), 700);
      } else {
        if (statusEl) statusEl.textContent = "Erreur";
        btn.disabled = false;
      }
    } catch (_) {
      if (statusEl) statusEl.textContent = "Erreur réseau";
      btn.disabled = false;
    }
  });

  void checkState();
}
