/**
 * Détection iOS / Android / desktop pour prioriser Apple Wallet vs Google Wallet.
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
 * @param {'apple' | 'google'} which
 */
export function walletCtaPillClasses(platform, which) {
  const base = "fidelity-cta-pill";
  if (platform === "desktop") {
    return `${base} fidelity-cta-pill--wallet-equal`;
  }
  const primary =
    (platform === "ios" && which === "apple") || (platform === "android" && which === "google");
  return primary
    ? `${base} fidelity-cta-pill--wallet-primary`
    : `${base} fidelity-cta-pill--wallet-secondary fidelity-cta-pill--compact`;
}

/**
 * @param {'ios' | 'android' | 'desktop'} platform
 */
export function walletDetectHintText(platform) {
  if (platform === "ios") {
    return "Sur iPhone ou iPad, utilise Apple Wallet pour ajouter la carte.";
  }
  if (platform === "android") {
    return "Sur Android, utilise Google Wallet pour ajouter la carte.";
  }
  return "Sur ordinateur : ouvre cette page sur ton téléphone pour ajouter la carte, ou choisis l’option qui correspond à ton appareil.";
}

/**
 * Classes pour les boutons .fidelity-btn (écran succès /fidelity).
 */
export function walletFidelityBtnClasses(platform, baseApple, baseGoogle) {
  if (platform === "desktop") {
    return {
      apple: `${baseApple} fidelity-btn--wallet-equal`,
      google: `${baseGoogle} fidelity-btn--wallet-equal`,
    };
  }
  if (platform === "ios") {
    return {
      apple: `${baseApple} fidelity-btn--wallet-primary`,
      google: `${baseGoogle} fidelity-btn--wallet-secondary`,
    };
  }
  return {
    apple: `${baseApple} fidelity-btn--wallet-secondary`,
    google: `${baseGoogle} fidelity-btn--wallet-primary`,
  };
}

/**
 * Applique l’ordre et les classes sur le bloc succès (#fidelity-success .fidelity-wallet-buttons).
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
  const { apple: clsA, google: clsG } = walletFidelityBtnClasses(platform, baseApple, baseGoogle);
  if (apple) apple.className = clsA;
  if (google) google.className = clsG;

  if (platform === "android" && apple && google && google.parentNode === container && apple.parentNode === container) {
    container.insertBefore(google, apple);
  } else if (platform !== "android" && apple && google && apple.parentNode === container && google.parentNode === container) {
    container.insertBefore(apple, google);
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
