import { detectWalletPlatform } from "../../utils/walletPlatform.js";

const UNLOCK_STORAGE_PREFIX = "fid_rewards_wallet_unlocked_";

/**
 * @param {Record<string, unknown> | null | undefined} member
 */
export function memberAppleWalletRegistered(member) {
  if (!member) return false;
  return member.apple_wallet_registered === true || member.appleWalletRegistered === true;
}

/**
 * @param {string} slug
 * @param {string} memberId
 */
export function rewardsWalletUnlockStorageKey(slug, memberId) {
  return `${UNLOCK_STORAGE_PREFIX}${String(slug || "").trim()}_${String(memberId || "").trim()}`;
}

/**
 * @param {string} slug
 * @param {string} memberId
 */
export function markRewardsWalletUnlocked(slug, memberId) {
  if (!slug || !memberId) return;
  try {
    localStorage.setItem(rewardsWalletUnlockStorageKey(slug, memberId), String(Date.now()));
  } catch (_) {}
}

/**
 * @param {string} slug
 * @param {string} memberId
 */
export function readRewardsWalletUnlockedLocal(slug, memberId) {
  if (!slug || !memberId) return false;
  try {
    return !!localStorage.getItem(rewardsWalletUnlockStorageKey(slug, memberId));
  } catch {
    return false;
  }
}

/**
 * Récompenses visibles : Apple Wallet enregistré (PassKit) ou validation locale après Google Wallet.
 * @param {{
 *   member?: Record<string, unknown> | null;
 *   slug?: string;
 * }} state
 * @param {{ platform?: string }} [opts]
 */
export function memberRewardsUnlocked(state, opts = {}) {
  const member = state?.member;
  if (!member?.id) return false;
  if (memberAppleWalletRegistered(member)) return true;

  const slug = String(state.slug || "").trim();
  const memberId = String(member.id);
  const platform = opts.platform ?? detectWalletPlatform();

  if (platform === "ios") return false;

  return readRewardsWalletUnlockedLocal(slug, memberId);
}

/**
 * @param {{
 *   member?: Record<string, unknown> | null;
 *   slug?: string;
 *   appleWalletRegistered?: boolean;
 *   memberId?: string;
 * }} options
 */
export function walletStepShowsAddPassCta(options = {}) {
  const platform = options.platform ?? detectWalletPlatform();
  const slug = String(options.slug || "").trim();
  const memberId = String(options.memberId || "").trim();

  if (options.appleWalletRegistered === true || memberAppleWalletRegistered(options.member)) {
    return false;
  }

  if (platform === "ios") return true;

  if (readRewardsWalletUnlockedLocal(slug, memberId)) return false;

  return true;
}

/**
 * @param {(s: string) => string} esc
 */
export function renderRewardsWalletLockedMarkup(esc) {
  return `
    <div class="fid-rewards-wallet-locked" role="status">
      <div class="fid-rewards-wallet-locked__icon" aria-hidden="true">🎁</div>
      <p class="fid-rewards-wallet-locked__title">${esc("Récompenses à débloquer")}</p>
      <p class="fid-rewards-wallet-locked__text">${esc("Appuie sur « Débloquer ma récompense » pour ajouter ta carte, puis tes offres s’affichent ici.")}</p>
    </div>`;
}
