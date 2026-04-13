import { renderEngagementActionsMarkup } from "./mission-markup.js";
import { renderProfileMissionModalMarkup } from "./profile-mission-modal-markup.js";
import { renderRewardsStepMarkup } from "./rewards-step-markup.js";
import { renderWalletStepMarkup } from "./wallet-step-markup.js";
import { renderRouletteInlineMarkup } from "./roulette-inline-markup.js";
import { renderQrGamePage } from "./qr-game-markup.js";
import { shouldShowQrThanksHero } from "../qr-game-flow.js";
import { buildNextRewardBannerState, renderNextRewardBannerMarkup } from "./next-reward-banner-markup.js";
import { resolveClientLogoImgSrc } from "../lib/resolve-client-logo-src.js";
import {
  buildHeroBalanceProgressState,
  renderHeroBalanceProgressMarkup,
} from "./hero-balance-progress-markup.js";
import {
  renderEarnMorePointsButtonMarkup,
  renderMissionsSheetMarkup,
} from "./missions-sheet-markup.js";

function isGuestPlaceholderEmail(email) {
  return typeof email === "string" && email.toLowerCase().endsWith("@guest.invalid");
}
function esc(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderClientPage(root, state, options = {}) {
  const businessName = esc(state.business?.organizationName || state.business?.name || "Carte fidélité");
  const hasMember = !!state.member?.id;
  const showWalletStep = hasMember;
  const memberSectionsAriaLabel = "Ton espace fidélité";
  const loyaltyGameTickets = (state.business?.loyalty_mode || "points_cash") === "points_game_tickets";
  const programType = String(state.business?.program_type || "points").toLowerCase();
  const isStampsProgram = programType === "stamps";
  const tickets = state.unlimitedTicketsTest ? 999 : Number(state.tickets?.ticket_balance || 0);
  const ticketStatusDotClass =
    tickets > 0 ? "fidelity-cta-pill-dot" : "fidelity-cta-pill-dot fidelity-cta-pill-dot--empty-tickets";
  const roulette = (state.games || []).find((g) => g.game_code === "roulette");
  const showRoulette = !!(roulette && roulette.enabled && (programType === "points" || programType === "stamps"));
  const engagementActionsRaw = Array.isArray(state.engagementActions) ? state.engagementActions : [];
  const isGuestPlaceholder = hasMember && isGuestPlaceholderEmail(state.member?.email);
  const profileEligible = !!(hasMember && state.member?.profile_ticket_eligible);
  const profileClaimed = !!state.member?.profile_bonus_claimed;
  const actionsForDisplay = engagementActionsRaw.filter((a) => {
    if (a.action_type === "profile_complete") {
      return profileEligible && !profileClaimed;
    }
    return true;
  });
  const showProfileMissionModal = hasMember && profileEligible && !profileClaimed && !isGuestPlaceholder;
  const memberFirstName = esc((state.member?.name || "").split(" ")[0] || "");
  const headerBalanceUnit = "pts";
  const slugForAssets = String(options.slug || state.slug || "");
  const apiBase = String(options.apiBase || "");
  const qrGameFlow = Boolean(hasMember && isGuestPlaceholder && showRoulette);

  if (qrGameFlow) {
    const googleAction = engagementActionsRaw.find((a) => a.action_type === "google_review");
    const defaultQrHero = "Participez au jeu et tentez de gagner une récompense.";
    const customHero = String(
      state.business?.fidelityQrHeroTitle ?? state.business?.fidelity_qr_hero_title ?? "",
    ).trim();
    const tagline = customHero || defaultQrHero;
    const rouletteHtml = renderRouletteInlineMarkup(esc, {
      tickets,
      spinCtaAriaLabel: "Jouer la partie — lancer la roue",
      ticketStatusDotClass,
      variant: "qr",
    });
    /** Logo page jeu QR = import « Flyer IA » si enregistré (`/public/flyer-qr-logo`), sinon bandeau Wallet. */
    const logoUrl = resolveClientLogoImgSrc(state.business, slugForAssets, apiBase);
    const qrThanksHeroMode = shouldShowQrThanksHero(slugForAssets);
    root.innerHTML = renderQrGamePage(esc, {
      businessNameEsc: businessName,
      businessTaglineEsc: esc(tagline),
      rouletteHtml,
      googleReviewUrl: googleAction?.url || "",
      logoUrl,
      qrThanksHeroMode,
    });
    return;
  }

  const nextRewardBannerHtml = !hasMember
    ? renderNextRewardBannerMarkup(
        esc,
        buildNextRewardBannerState({
          hasMember,
          business: state.business,
          member: state.member,
          programType,
          balanceUnit: headerBalanceUnit,
        }),
        { businessNameEsc: businessName },
      )
    : "";

  const engagementHtml = renderEngagementActionsMarkup(actionsForDisplay, esc);
  const showClassicProgram = !loyaltyGameTickets && !isStampsProgram;
  const step2Title = actionsForDisplay.length
    ? "Missions"
    : showClassicProgram
      ? "Cumule en caisse"
      : isStampsProgram
        ? "Points & récompenses"
        : "Programme";
  const step2Intro = actionsForDisplay.length
    ? ""
    : showClassicProgram
      ? "Tes points montent quand tu utilises ta carte au moment de payer."
      : isStampsProgram
        ? "À chaque passage validé, tu te rapproches de la récompense prévue."
        : `Présente ta carte chez <strong>${esc(businessName)}</strong> pour cumuler tes avantages.`;
  const rewardsStepHtml = renderRewardsStepMarkup(esc, {
    business: state.business,
    member: state.member,
    programType,
    balanceUnit: headerBalanceUnit,
  });

  const hasMissionsSheet = hasMember && actionsForDisplay.length > 0;
  const step2SectionHtml =
    actionsForDisplay.length > 0
      ? ""
      : `
        <section class="fidelity-v2-card fidelity-v2-step" id="fidelity-v2-step-2">
          <header class="fidelity-v2-step-header">
            <div class="fidelity-v2-step-head-text">
              <h2 class="fidelity-v2-card-title fidelity-v2-step-title">${esc(step2Title)}</h2>
            </div>
          </header>
          <div class="fidelity-v2-step-body">
            <div class="fidelity-v2-step-body-inner">
            ${step2Intro ? `<p class="fidelity-v2-card-desc fidelity-v2-step-desc">${step2Intro}</p>` : ""}
            <p id="fidelity-v2-action-feedback" class="fidelity-engagement-feedback hidden"></p>
            </div>
          </div>
        </section>
        `;

  const memberPoints = hasMember ? Math.max(0, Math.floor(Number(state.member?.points) || 0)) : 0;
  const appleWalletRegistered = hasMember && state.member?.apple_wallet_registered === true;
  const hasGoogleWallet = hasMember && Boolean(state.wallet?.google);
  const deliveryReceiptEnabled =
    hasMember && Number(state.business?.delivery_receipt_claims_enabled ?? state.business?.deliveryReceiptClaimsEnabled ?? 1) === 1;

  const memberLogoUrl = hasMember ? resolveClientLogoImgSrc(state.business, slugForAssets, apiBase) : "";
  const logoOnErr =
    "this.onerror=null;this.classList.add('fidelity-qr-logo--hidden');this.removeAttribute('src')";
  const memberHeroLogoHtml =
    hasMember && memberLogoUrl
      ? `<div class="fidelity-v2-hero-brand">
          <img class="fidelity-qr-logo" src="${esc(memberLogoUrl)}" alt="${businessName}" decoding="async" onerror="${logoOnErr}" />
        </div>`
      : "";

  root.innerHTML = `
    ${
      nextRewardBannerHtml
        ? `
    <header class="fidelity-v2-header fidelity-v2-header--next-reward">
      <div class="fidelity-v2-header-inner fidelity-v2-header-inner--next-reward">
        ${nextRewardBannerHtml}
      </div>
    </header>
    `
        : ""
    }

    <main class="fidelity-v2-main">

      ${hasMember ? `
        <!-- HERO membre existant -->
        <section class="fidelity-v2-hero fidelity-v2-hero-member">
          ${memberHeroLogoHtml}
          <div class="fidelity-v2-hero-greeting">
            <div>
              <h1 class="fidelity-v2-hero-title">Bonjour${memberFirstName ? ` ${memberFirstName}` : ""} !</h1>
              ${renderHeroBalanceProgressMarkup(
                esc,
                buildHeroBalanceProgressState({
                  memberPoints,
                  programType,
                  business: state.business,
                }),
              )}
              ${hasMissionsSheet ? renderEarnMorePointsButtonMarkup(esc) : ""}
            </div>
          </div>
        </section>
      ` : `
        <!-- HERO nouveau visiteur (bénéfices client : pas la « carte » en soi) -->
        <section class="fidelity-v2-hero fidelity-v2-hero-new">
          <div class="fidelity-v2-hero-icon">🎁</div>
          <h1 class="fidelity-v2-hero-title">Découvrez votre cadeau</h1>
          <p class="fidelity-v2-hero-subtitle">Chez <strong>${esc(businessName)}</strong>, un instant suffit.</p>
        </section>
      `}

      <!-- Formulaire d'inscription -->
      <section class="fidelity-v2-card fidelity-v2-signup-card ${hasMember ? "hidden" : ""}" id="fidelity-v2-signup" aria-label="Inscription aux offres">
        <form id="fidelity-v2-form" class="fidelity-v2-form" novalidate>
          <div class="fidelity-v2-input-group">
            <input id="fidelity-v2-name" class="fidelity-input" type="text" placeholder="prénom" autocomplete="given-name" aria-label="Prénom" required />
          </div>
          <div class="fidelity-v2-input-group">
            <input id="fidelity-v2-email" class="fidelity-input" type="email" placeholder="ton@email.com" autocomplete="email" aria-label="Adresse e-mail" required />
          </div>
          <span class="fidelity-cta-wrap fidelity-cta-wrap--full">
            <button id="fidelity-v2-submit" class="fidelity-cta-pill" type="submit">
              <span class="fidelity-cta-pill-dot" aria-hidden="true"></span>
              <span class="fidelity-cta-pill-label">Accéder à mes offres</span>
              <span class="fidelity-cta-pill-chevron" aria-hidden="true">›</span>
            </button>
          </span>
          <p id="fidelity-v2-error" class="fidelity-error hidden"></p>
        </form>
        <p class="fidelity-v2-signup-hint">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>
          Tes données sont sécurisées et ne sont jamais revendues.
        </p>
      </section>

      <div class="fidelity-v2-steps ${hasMember ? "" : "hidden"}" aria-label="${esc(memberSectionsAriaLabel)}">
        ${
          showWalletStep
            ? renderWalletStepMarkup(esc, {
                appleWalletRegistered,
                hasGoogleWallet,
              })
            : ""
        }

        <section class="fidelity-v2-card fidelity-v2-step fidelity-v2-step--rewards" id="fidelity-v2-rewards">
          <header class="fidelity-v2-step-header">
            <div class="fidelity-v2-step-head-text">
              <h2 class="fidelity-v2-card-title fidelity-v2-step-title fidelity-v2-step-title--rewards">
                <span class="fidelity-v2-step-title-emoji" aria-hidden="true">🎁</span>
                <span class="fidelity-v2-step-title-label">Récompenses</span>
              </h2>
            </div>
          </header>
          <div class="fidelity-v2-step-body">
            <div class="fidelity-v2-step-body-inner">
            ${rewardsStepHtml}
            </div>
          </div>
        </section>

        <!-- Missions / programme (points via missions, sans roue dans cet espace) -->
        ${step2SectionHtml}
      </div>

    </main>

    ${
      deliveryReceiptEnabled
        ? `
    <div class="fidelity-delivery-sticky" role="region" aria-label="Réclamation sur ticket de livraison">
      <div class="fidelity-delivery-sticky__inner">
        <input type="file" id="fidelity-delivery-receipt-file" class="fidelity-delivery-receipt-file-input" accept="image/*" capture="environment" aria-label="Photographier ou choisir une image du ticket" />
        <p id="fidelity-delivery-receipt-feedback" class="fidelity-delivery-sticky-feedback fidelity-engagement-feedback hidden" role="status"></p>
        <button type="button" id="fidelity-delivery-receipt-sticky-btn" class="fidelity-cta-pill fidelity-delivery-sticky-btn">
          <span class="fidelity-delivery-sticky-btn__cam" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg></span>
          <span class="fidelity-delivery-sticky-btn__label">Réclamer mes points</span>
        </button>
      </div>
    </div>
    `
        : ""
    }

    ${hasMissionsSheet ? renderMissionsSheetMarkup(esc, { engagementHtml, sheetTitle: step2Title }) : ""}

    ${showProfileMissionModal
      ? renderProfileMissionModalMarkup(esc, {
          name: state.member?.name,
          email: state.member?.email,
          phone: state.member?.phone,
          city: state.member?.city,
          birth: state.member?.birth_date,
        })
      : ""}

    ${
      hasMember
        ? ""
        : `
    <footer class="fidelity-v2-footer fidelity-v2-footer--dark">
      <p>Vous êtes un pro ?</p>
    </footer>
    `
    }
  `;
}
