/**
 * Actions section Localisation.
 * @param {{ openMapsBtn: HTMLButtonElement | null; addressInput: HTMLInputElement | null }} opts
 */
export function bindSettingsLocation(opts) {
  opts.openMapsBtn?.addEventListener("click", () => {
    const query = encodeURIComponent(String(opts.addressInput?.value || "").trim());
    if (!query) return;
    window.open(`https://maps.apple.com/?q=${query}`, "_blank", "noopener");
  });
}
