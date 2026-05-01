import { photonGeocodeFeatures, formatPhotonAddress } from "../utils/geocoding.js";

/**
 * @param {{
 * orgInput: HTMLInputElement | null;
 * addressInput: HTMLInputElement | null;
 * addressSuggestions: HTMLElement | null;
 * logoInput: HTMLInputElement | null;
 * logoRemove: HTMLButtonElement | null;
 * logoPreview: HTMLImageElement | null;
 * logoPlaceholder: HTMLElement | null;
 * logoIconInput: HTMLInputElement | null;
 * logoIconRemove: HTMLButtonElement | null;
 * logoIconPreview: HTMLImageElement | null;
 * logoIconPlaceholder: HTMLElement | null;
 * markDirty: () => void;
 * resizeLogoToDataUrl?: (file: File, size: number, quality: number, mode: string) => Promise<string>;
 * setFeedback: (text: string, isError?: boolean) => void;
 * onLogoStateChange: (next: { logoDataUrl?: string; logoRemoved?: boolean; logoIconDataUrl?: string; logoIconRemoved?: boolean }) => void;
 * }} opts
 */
export function bindSettingsEstablishment(opts) {
  let addrDebounce = 0;

  function hideAddressSuggestions() {
    if (!opts.addressSuggestions) return;
    opts.addressSuggestions.classList.add("hidden");
    opts.addressSuggestions.innerHTML = "";
    opts.addressInput?.setAttribute("aria-expanded", "false");
  }

  opts.orgInput?.addEventListener("input", opts.markDirty);
  opts.addressInput?.addEventListener("input", () => {
    opts.markDirty();
    if (addrDebounce) clearTimeout(addrDebounce);
    const query = String(opts.addressInput?.value || "").trim();
    if (query.length < 2) return hideAddressSuggestions();
    addrDebounce = window.setTimeout(async () => {
      const features = await photonGeocodeFeatures(query, 8);
      if (!opts.addressSuggestions) return;
      opts.addressSuggestions.innerHTML = "";
      if (!features.length) return hideAddressSuggestions();
      for (const feature of features) {
        const li = document.createElement("li");
        li.setAttribute("role", "option");
        li.textContent = formatPhotonAddress(feature.properties || {});
        li.addEventListener("click", () => {
          if (opts.addressInput) opts.addressInput.value = li.textContent || "";
          opts.markDirty();
          hideAddressSuggestions();
        });
        opts.addressSuggestions.appendChild(li);
      }
      opts.addressSuggestions.classList.remove("hidden");
      opts.addressInput?.setAttribute("aria-expanded", "true");
    }, 320);
  });

  opts.logoInput?.addEventListener("change", async (event) => {
    const file = event.target?.files?.[0];
    if (!file) return;
    try {
      const logoDataUrl = opts.resizeLogoToDataUrl
        ? await opts.resizeLogoToDataUrl(file, 640, 0.9, "auto")
        : await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
      opts.onLogoStateChange({ logoDataUrl, logoRemoved: false });
      if (opts.logoPreview) {
        opts.logoPreview.src = logoDataUrl;
        opts.logoPreview.classList.remove("hidden");
      }
      opts.logoPlaceholder?.classList.add("hidden");
      opts.logoRemove?.classList.remove("hidden");
      opts.markDirty();
    } catch {
      opts.setFeedback("Import logo impossible (PNG, JPG ou WebP).", true);
    }
    if (opts.logoInput) opts.logoInput.value = "";
  });

  opts.logoIconInput?.addEventListener("change", async (event) => {
    const file = event.target?.files?.[0];
    if (!file) return;
    try {
      const logoIconDataUrl = opts.resizeLogoToDataUrl
        ? await opts.resizeLogoToDataUrl(file, 512, 0.88, "auto")
        : await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
      opts.onLogoStateChange({ logoIconDataUrl, logoIconRemoved: false });
      if (opts.logoIconPreview) {
        opts.logoIconPreview.src = logoIconDataUrl;
        opts.logoIconPreview.classList.remove("hidden");
      }
      opts.logoIconPlaceholder?.classList.add("hidden");
      opts.logoIconRemove?.classList.remove("hidden");
      opts.markDirty();
    } catch {
      opts.setFeedback("Import logo carre impossible (PNG, JPG ou WebP).", true);
    }
    if (opts.logoIconInput) opts.logoIconInput.value = "";
  });

  opts.logoRemove?.addEventListener("click", () => {
    opts.onLogoStateChange({ logoDataUrl: "", logoRemoved: true });
    if (opts.logoPreview) {
      opts.logoPreview.src = "";
      opts.logoPreview.classList.add("hidden");
    }
    opts.logoPlaceholder?.classList.remove("hidden");
    opts.logoRemove?.classList.add("hidden");
    opts.markDirty();
  });

  opts.logoIconRemove?.addEventListener("click", () => {
    opts.onLogoStateChange({ logoIconDataUrl: "", logoIconRemoved: true });
    if (opts.logoIconPreview) {
      opts.logoIconPreview.src = "";
      opts.logoIconPreview.classList.add("hidden");
    }
    opts.logoIconPlaceholder?.classList.remove("hidden");
    opts.logoIconRemove?.classList.add("hidden");
    opts.markDirty();
  });
}
