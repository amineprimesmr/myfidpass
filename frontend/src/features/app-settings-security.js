/**
 * Dirty wiring section Securite.
 * @param {{
 * maxPasses: HTMLInputElement | null;
 * maxPoints: HTMLInputElement | null;
 * requireReceipt: HTMLInputElement | null;
 * tolerance: HTMLInputElement | null;
 * markDirty: () => void;
 * }} opts
 */
export function bindSettingsSecurity(opts) {
  opts.maxPasses?.addEventListener("input", opts.markDirty);
  opts.maxPoints?.addEventListener("input", opts.markDirty);
  opts.tolerance?.addEventListener("input", opts.markDirty);
  opts.requireReceipt?.addEventListener("change", opts.markDirty);
}
