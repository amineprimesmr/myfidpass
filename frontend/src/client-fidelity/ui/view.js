import { renderEngagementActionsMarkup } from "./mission-markup.js";
import { renderProfileMissionModalMarkup } from "./profile-mission-modal-markup.js";
import { renderRewardsStepMarkup } from "./rewards-step-markup.js";
import { renderWalletStepMarkup } from "./wallet-step-markup.js";
import { buildNextRewardBannerState, renderNextRewardBannerMarkup } from "./next-reward-banner-markup.js";
import { resolveClientLogoImgSrc } from "../lib/resolve-client-logo-src.js";

function esc(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderClientPage(root, state, options = {}) {
  const { gamePage = false, slug = "", apiBase = "" } = options;
  const businessName = esc(state.business?.organizationName || state.business?.name || "Carte fidélité");
  const hasMember = !!state.member?.id;
  const walletConfirmed = !!state.walletConfirmed;
  const showWalletStep = hasMember && !walletConfirmed;
  const memberHeroSubtitle = `Tes avantages chez <strong>${esc(businessName)}</strong>`;
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
  const profileEligible = !!(hasMember && state.member?.profile_ticket_eligible);
  const profileClaimed = !!state.member?.profile_bonus_claimed;
  const actionsForDisplay = engagementActionsRaw.filter((a) => {
    if (a.action_type === "profile_complete") {
      return profileEligible && !profileClaimed;
    }
    return true;
  });
  const showProfileMissionModal = hasMember && profileEligible && !profileClaimed;
  const gamePageUrl = slug ? `/fidelity/${encodeURIComponent(slug)}/jeu` : "#";
  const backUrl = slug ? `/fidelity/${encodeURIComponent(slug)}` : "/";
  const memberFirstName = esc((state.member?.name || "").split(" ")[0] || "");
  /** Logo : même origine que la page si proxy (apiBase vide), sinon URL API absolue. */
  const logoAttemptSrc = resolveClientLogoImgSrc(state.business, slug, apiBase);
  const logoImgAlt = esc(businessName) || "Logo";
  const logoImgOnError =
    "this.style.display='none';var w=this.closest('.fidelity-v2-header-brand-logo,.fidelity-roulette-logo-wrap');if(w){var f=w.querySelector('[data-fid-logo-fallback]');if(f)f.style.display='flex';}";
  const memberBalance =
    hasMember && state.member?.id != null ? Math.max(0, Math.floor(Number(state.member?.points) || 0)) : null;
  const headerBalanceUnit = isStampsProgram
    ? (() => {
        const raw = String(state.business?.label_restants || "").trim();
        if (!raw) return "tampons";
        return raw.length <= 14 ? raw : "tampons";
      })()
    : "pts";
  const stampEmojiHeader =
    isStampsProgram && state.business?.stamp_emoji
      ? esc(String(state.business.stamp_emoji).trim().slice(0, 8))
      : "";
  const spinCtaAriaLabel = `Lancer la roue — ${tickets} ticket${tickets !== 1 ? "s" : ""} disponible${tickets !== 1 ? "s" : ""}`;

  if (gamePage) {
    const gameSubtitle = isStampsProgram ? "Gagne des passages bonus" : "Gagne des points bonus";
    root.innerHTML = `
      <div class="fidelity-game-page">
        <a href="${backUrl}" class="fidelity-game-back-float">← Retour</a>
        ${memberBalance != null ? `
        <div class="fidelity-game-balance-pill" role="status" aria-label="${esc(isStampsProgram ? "Tampons sur ta carte" : "Points sur ta carte")}">
          <div class="fidelity-v2-header-balance-inner">
            ${stampEmojiHeader ? `<span class="fidelity-v2-header-balance-emoji" aria-hidden="true">${stampEmojiHeader}</span>` : ""}
            <span class="fidelity-v2-header-balance-num">${esc(String(memberBalance))}</span>
            <span class="fidelity-v2-header-balance-unit">${esc(headerBalanceUnit)}</span>
          </div>
        </div>
        ` : ""}
        <div class="fidelity-game-top">
          <div class="fidelity-roulette-logo-wrap fidelity-roulette-logo">
            ${logoAttemptSrc
              ? `<img src="${esc(logoAttemptSrc)}" alt="${logoImgAlt}" class="fidelity-roulette-logo-img" loading="eager" decoding="async" onerror="${logoImgOnError}" /><div class="fidelity-roulette-logo-fallback" data-fid-logo-fallback><span class="fidelity-roulette-logo-text">${esc(businessName.slice(0, 14)) || "VOTRE LOGO"}</span></div>`
              : `<span class="fidelity-roulette-logo-text">${esc(businessName.slice(0, 14)) || "VOTRE LOGO"}</span>`
            }
          </div>
          <h2 class="fidelity-roulette-title">
            <span class="fidelity-roulette-title-line">Tourne la roue et</span>
            <span class="fidelity-roulette-title-line">${esc(gameSubtitle)}</span>
          </h2>
          <div class="fidelity-roulette-btn-row">
            <span class="fidelity-cta-wrap">
              <button id="fidelity-v2-spin-btn" class="fidelity-cta-pill fidelity-cta-pill--wheel-cta" type="button" aria-label="${esc(spinCtaAriaLabel)}">
                <span class="fidelity-cta-wheel-line">
                  <span class="${ticketStatusDotClass}" aria-hidden="true"></span>
                  <span class="fidelity-cta-wheel-emoji" aria-hidden="true">🎟️</span>
                  <span id="fidelity-v2-tickets-display" class="fidelity-cta-wheel-tickets">${esc(String(tickets))} ticket${tickets !== 1 ? "s" : ""}</span>
                  <span class="fidelity-cta-wheel-sep" aria-hidden="true">·</span>
                  <span class="fidelity-cta-wheel-action">Jouer</span>
                  <span class="fidelity-cta-pill-chevron" aria-hidden="true">›</span>
                </span>
              </button>
            </span>
          </div>
        </div>
        <div class="fidelity-roulette-wheel-zone">
          <div class="fidelity-roulette-wheel-mount">
            <div class="fidelity-roulette-wheel-outer">
              <div class="fidelity-roulette-wheel" id="fidelity-roulette-wheel"></div>
              <div class="fidelity-roulette-wheel-rim" aria-hidden="true"></div>
              <div class="fidelity-roulette-indicator" aria-hidden="true"></div>
            </div>
          </div>
        </div>
        <p id="fidelity-v2-game-feedback" class="fidelity-roulette-feedback hidden"></p>
      </div>
    `;
    return;
  }

  const engagementHtml = renderEngagementActionsMarkup(actionsForDisplay, esc);
  const showClassicProgram = !loyaltyGameTickets && !isStampsProgram;
  const step2Title = showRoulette
    ? "Gagne des points"
    : actionsForDisplay.length
      ? "Gagne des tickets & bonus"
      : showClassicProgram
        ? "Cumule en caisse"
        : isStampsProgram
          ? "Tampons & récompenses"
          : "Profite de ton programme";
  const step2Intro = showRoulette
    ? actionsForDisplay.length
      ? ""
      : `Ouvre la page jeu pour utiliser la roue${tickets > 0 ? "" : " dès que tu auras des tickets"}.`
    : actionsForDisplay.length
      ? "Quelques actions rapides pour gagner des tickets."
      : showClassicProgram
        ? "Tes points montent quand tu utilises ta carte au moment de payer."
        : isStampsProgram
          ? "À chaque passage validé, tu te rapproches de la récompense prévue."
          : `Présente ta carte chez <strong>${esc(businessName)}</strong> pour cumuler tes avantages.`;
  const gameCtaAriaLabel = `Tourner la roue — ${tickets} ticket${tickets !== 1 ? "s" : ""} disponible${tickets !== 1 ? "s" : ""}`;
  const rewardsStepHtml = renderRewardsStepMarkup(esc, {
    business: state.business,
    member: state.member,
    programType,
    balanceUnit: headerBalanceUnit,
  });
  const nextRewardBannerState = buildNextRewardBannerState({
    hasMember,
    business: state.business,
    member: state.member,
    programType,
    balanceUnit: headerBalanceUnit,
  });
  const nextRewardBannerHtml = renderNextRewardBannerMarkup(esc, nextRewardBannerState, { businessNameEsc: businessName });

  root.innerHTML = `
    <header class="fidelity-v2-header fidelity-v2-header--next-reward">
      <div class="fidelity-v2-header-inner fidelity-v2-header-inner--next-reward">
        ${nextRewardBannerHtml}
      </div>
    </header>

    <main class="fidelity-v2-main">

      ${hasMember ? `
        <!-- HERO membre existant -->
        <section class="fidelity-v2-hero fidelity-v2-hero-member">
          <div class="fidelity-v2-hero-greeting">
            <span class="fidelity-v2-hero-wave">👋</span>
            <div>
              <h1 class="fidelity-v2-hero-title">Bonjour${memberFirstName ? ` ${memberFirstName}` : ""} !</h1>
              <p class="fidelity-v2-hero-subtitle">${memberHeroSubtitle}</p>
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
        ${showWalletStep ? renderWalletStepMarkup(esc) : ""}

        <!-- Roue / missions / programme -->
        <section class="fidelity-v2-card fidelity-v2-step fidelity-v2-step--play" id="fidelity-v2-step-2">
          <header class="fidelity-v2-step-header">
            <div class="fidelity-v2-step-head-text">
              ${showRoulette ? `
              <h2 class="fidelity-v2-card-title fidelity-v2-step-title fidelity-v2-step-title--roulette">
                <span class="fidelity-v2-step-title-emoji" aria-hidden="true">🎡</span>
                <span class="fidelity-v2-step-title-label">${esc(step2Title)}</span>
              </h2>
              ` : `
              <h2 class="fidelity-v2-card-title fidelity-v2-step-title">${esc(step2Title)}</h2>
              `}
            </div>
          </header>
          <div class="fidelity-v2-step-body">
            <div class="fidelity-v2-step-body-inner">
            ${step2Intro ? `<p class="fidelity-v2-card-desc fidelity-v2-step-desc">${step2Intro}</p>` : ""}
            ${showRoulette && actionsForDisplay.length ? `
            <div class="fidelity-v2-step-missions fidelity-v2-step-missions--before-wheel">
              <div class="fidelity-v2-missions-rail" data-fid-missions-rail="1" role="region" aria-label="Missions pour gagner des tickets" tabindex="0">
                <div class="fidelity-engagement-actions fidelity-engagement-actions--rail" id="fidelity-v2-actions">${engagementHtml}</div>
              </div>
            </div>
            ` : ""}
            ${!showRoulette && actionsForDisplay.length ? `
            <div class="fidelity-v2-step-missions">
              <div class="fidelity-engagement-actions" id="fidelity-v2-actions">${engagementHtml}</div>
            </div>
            ` : ""}
            <p id="fidelity-v2-action-feedback" class="fidelity-engagement-feedback hidden"></p>
            </div>
          </div>
        </section>

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
      </div>

    ${showRoulette && hasMember ? `
    <div class="fidelity-v2-sticky-play-cta">
      <div class="fidelity-v2-sticky-play-inner">
        <span class="fidelity-cta-wrap fidelity-cta-wrap--full">
          <a href="${gamePageUrl}" class="fidelity-cta-pill fidelity-cta-pill--wheel-cta" id="fidelity-v2-game-cta" aria-label="${esc(gameCtaAriaLabel)}">
            <span class="fidelity-cta-wheel-line">
              <span class="${ticketStatusDotClass}" aria-hidden="true"></span>
              <span class="fidelity-cta-wheel-emoji" aria-hidden="true">🎟️</span>
              <span id="fidelity-v2-tickets-display" class="fidelity-cta-wheel-tickets">${esc(String(tickets))} ticket${tickets !== 1 ? "s" : ""}</span>
              <span class="fidelity-cta-wheel-sep" aria-hidden="true">·</span>
              <span class="fidelity-cta-wheel-action">Jouer</span>
              <span class="fidelity-cta-pill-chevron" aria-hidden="true">›</span>
            </span>
          </a>
        </span>
      </div>
    </div>
    ` : ""}

    </main>

    ${showProfileMissionModal
      ? renderProfileMissionModalMarkup(esc, {
          name: state.member?.name,
          email: state.member?.email,
          phone: state.member?.phone,
          city: state.member?.city,
          birth: state.member?.birth_date,
        })
      : ""}

    <footer class="fidelity-v2-footer">
      <p>Propulsé par <a href="https://myfidpass.fr" target="_blank" rel="noopener noreferrer">MyFidpass</a></p>
    </footer>
  `;
}
