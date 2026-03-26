/**
 * Détection iOS / Android / desktop pour n’afficher que le Wallet adapté à l’appareil.
 * @param {{ userAgent?: string }} opts
 * @returns {'ios' | 'android' | 'desktop'}
 */
export function detectWalletPlatform(opts = {}) {
  const ua =
    opts.userAgent ??
    (typeof navigator !== "undefined" && navigator.userAgent ? navigator.userAgent : "");
  const isIOS =
    /iPhone|iPod/i.test(ua) ||
    /iPad/i.test(ua) ||
    (typeof navigator !== "undefined" &&
      navigator.platform === "MacIntel" &&
      Number(navigator.maxTouchPoints) > 1);
  if (isIOS) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

/**
 * @param {'ios' | 'android' | 'desktop'} platform
 */
export function walletDetectHintText(platform) {
  if (platform === "ios") {
    return "Sur iPhone ou iPad, ajoute la carte avec Apple Wallet.";
  }
  if (platform === "android") {
    return "Sur Android, ajoute la carte avec Google Wallet.";
  }
  return "Sur ordinateur : ouvre cette page sur ton téléphone pour ajouter la carte, ou choisis ci-dessous selon ton appareil.";
}

/**
 * Applique un seul bouton Wallet sur mobile (masque l’autre) ; sur desktop les deux restent visibles.
 * @param {HTMLElement | null} container
 */
export function applyWalletButtonsLayout(container) {
  if (!container || typeof document === "undefined") return;
  const platform = detectWalletPlatform();
  container.classList.remove("fidelity-wallet-buttons--ios", "fidelity-wallet-buttons--android", "fidelity-wallet-buttons--desktop");
  container.classList.add(`fidelity-wallet-buttons--${platform}`);

  const apple = container.querySelector("#btn-apple-wallet");
  const google = container.querySelector("#btn-google-wallet");
  const baseApple = "fidelity-btn fidelity-btn-apple";
  const baseGoogle = "fidelity-btn fidelity-btn-google";

  if (platform === "ios") {
    if (apple) {
      apple.className = `${baseApple} fidelity-btn--wallet-single`;
      apple.classList.remove("hidden");
    }
    if (google) google.classList.add("hidden");
  } else if (platform === "android") {
    if (google) {
      google.className = `${baseGoogle} fidelity-btn--wallet-single`;
      google.classList.remove("hidden");
    }
    if (apple) apple.classList.add("hidden");
  } else {
    if (apple) {
      apple.className = `${baseApple} fidelity-btn--wallet-equal`;
      apple.classList.remove("hidden");
    }
    if (google) {
      google.className = `${baseGoogle} fidelity-btn--wallet-equal`;
      google.classList.remove("hidden");
    }
    if (apple && google && apple.parentNode === container && google.parentNode === container) {
      container.insertBefore(apple, google);
    }
  }

  const parent = container.parentNode;
  let hint = parent?.querySelector(":scope > .fidelity-wallet-detect-hint");
  const text = walletDetectHintText(platform);
  if (!hint && parent) {
    hint = document.createElement("p");
    hint.className = "fidelity-wallet-detect-hint";
    hint.setAttribute("role", "note");
    parent.insertBefore(hint, container);
  }
  if (hint) hint.textContent = text;
}
