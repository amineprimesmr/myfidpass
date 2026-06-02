import { detectWalletPlatform } from "../../utils/walletPlatform.js";
import { walletStepShowsAddPassCta } from "../lib/wallet-rewards-gate.js";

export { walletStepShowsAddPassCta };

/**
 * CTA hero : « Débloquer ma récompense » → ouvre Apple / Google Wallet.
 * @param {(s: string) => string} esc
 * @param {{ platform?: string; appleWalletRegistered?: boolean; hasGoogleWallet?: boolean; slug?: string; memberId?: string }} [options]
 */
export function renderWalletPassHeroShinyMarkup(esc, options = {}) {
  const platform = options.platform ?? detectWalletPlatform();
  const appleWalletRegistered = options.appleWalletRegistered === true;
  const hasGoogleWallet = Boolean(options.hasGoogleWallet);

  const unlockCta = (id, extraClass = "") => `<div class="fidelity-earn-points-cta-wrap fidelity-earn-points-cta-wrap--wallet-attention">
            <a href="#" id="${id}" class="fidelity-shiny-cta fidelity-shiny-cta--unlock-reward ${extraClass}" aria-label="${esc("Débloquer ma récompense")}">
              <span class="fidelity-shiny-cta__label"><span>${esc("Débloquer ma récompense")}</span></span>
            </a>
          </div>`;

  const blocks = [];
  if (platform === "ios") {
    if (!appleWalletRegistered) blocks.push(unlockCta("fidelity-v2-apple", "fidelity-shiny-cta--apple-wallet"));
  } else if (platform === "android") {
    blocks.push(unlockCta("fidelity-v2-google"));
  } else {
    if (!appleWalletRegistered) blocks.push(unlockCta("fidelity-v2-apple", "fidelity-shiny-cta--apple-wallet"));
    if (hasGoogleWallet) blocks.push(unlockCta("fidelity-v2-google"));
  }

  if (!blocks.length) return "";
  return `
          <div class="fidelity-wallet-hero-shiny-stack">
            ${blocks.join("\n")}
          </div>`;
}

const APPLE_WALLET_ICON_SRC = "/assets/iconapplewallet.png";

function appleWalletIconImg() {
  return `<img src="${APPLE_WALLET_ICON_SRC}" alt="" class="fidelity-cta-pill-icon fidelity-apple-wallet-png" width="20" height="20" decoding="async" aria-hidden="true" />`;
}

function googleSvg() {
  return `<svg class="fidelity-cta-pill-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>`;
}

/**
 * Boutons Wallet seuls — pas de carte / cadre (hero porte le CTA principal).
 * @param {(s: string) => string} _esc
 * @param {{ platform?: string; appleWalletRegistered?: boolean; hasGoogleWallet?: boolean; slug?: string; memberId?: string }} [options]
 */
export function renderWalletStepMarkup(_esc, options = {}) {
  const platform = options.platform ?? detectWalletPlatform();
  const appleWalletRegistered = options.appleWalletRegistered === true;
  const hasGoogleWallet = Boolean(options.hasGoogleWallet);

  if (walletStepShowsAddPassCta(options)) {
    return "";
  }

  const appleOnly = `
        <span class="fidelity-cta-wrap fidelity-cta-wrap--full">
          <a href="#" id="fidelity-v2-apple" class="fidelity-cta-pill fidelity-cta-pill--wallet-single" aria-label="Apple Wallet">
            ${appleWalletIconImg()}
            <span class="fidelity-cta-pill-label">Apple Wallet</span>
            <span class="fidelity-cta-pill-chevron" aria-hidden="true">›</span>
          </a>
        </span>`;
  const googleOnly = `
        <span class="fidelity-cta-wrap fidelity-cta-wrap--full">
          <a href="#" id="fidelity-v2-google" class="fidelity-cta-pill fidelity-cta-pill--wallet-single" aria-label="Google Wallet">
            ${googleSvg()}
            <span class="fidelity-cta-pill-label">Google Wallet</span>
            <span class="fidelity-cta-pill-chevron" aria-hidden="true">›</span>
          </a>
        </span>`;
  const appleDesktop = `
        <span class="fidelity-cta-wrap fidelity-cta-wrap--full">
          <a href="#" id="fidelity-v2-apple" class="fidelity-cta-pill fidelity-cta-pill--wallet-equal" aria-label="Apple Wallet">
            ${appleWalletIconImg()}
            <span class="fidelity-cta-pill-label">Apple Wallet</span>
            <span class="fidelity-cta-pill-chevron" aria-hidden="true">›</span>
          </a>
        </span>`;
  const googleDesktop = `
        <span class="fidelity-cta-wrap fidelity-cta-wrap--full">
          <a href="#" id="fidelity-v2-google" class="fidelity-cta-pill fidelity-cta-pill--wallet-equal" aria-label="Google Wallet">
            ${googleSvg()}
            <span class="fidelity-cta-pill-label">Google Wallet</span>
            <span class="fidelity-cta-pill-chevron" aria-hidden="true">›</span>
          </a>
        </span>`;

  let inner;
  if (platform === "ios") {
    inner = appleWalletRegistered ? "" : appleOnly;
  } else if (platform === "android") {
    inner = googleOnly;
  } else {
    const applePart = appleWalletRegistered ? "" : appleDesktop;
    const googlePart = hasGoogleWallet ? googleDesktop : "";
    inner = `${applePart}${googlePart}`;
  }

  if (!inner.trim()) return "";

  return `
      <div class="fidelity-v2-wallet-row" id="fidelity-v2-wallet">
        <div class="fidelity-wallet-buttons fidelity-wallet-buttons--${platform}">
${inner}
        </div>
      </div>`;
}
