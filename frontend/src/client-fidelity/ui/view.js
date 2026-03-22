import { renderEngagementActionsMarkup } from "./mission-markup.js";
import { renderProfileMissionModalMarkup } from "./profile-mission-modal-markup.js";
import { renderRewardsStepMarkup } from "./rewards-step-markup.js";
import { buildNextRewardBannerState, renderNextRewardBannerMarkup } from "./next-reward-banner-markup.js";

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
  const baseTrim = String(apiBase || "").replace(/\/$/, "");
  /** Toujours tenter l’URL publique du logo (même base que les fetch API) — si 404, repli initiale. */
  const logoPath = slug ? `/api/businesses/${encodeURIComponent(slug)}/public/logo` : "";
  const logoAttemptSrc = logoPath ? (baseTrim ? `${baseTrim}${logoPath}` : logoPath) : "";
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
    const gameSubtitle = isStampsProgram ? "gagne des passages bonus" : "gagne des points bonus";
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
              ? `<img src="${esc(logoAttemptSrc)}" alt="" class="fidelity-roulette-logo-img" loading="eager" decoding="async" onerror="${logoImgOnError}" /><div class="fidelity-roulette-logo-fallback" data-fid-logo-fallback><span class="fidelity-roulette-logo-text">${esc(businessName.slice(0, 14)) || "VOTRE LOGO"}</span></div>`
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
    ? "Tourne la roue"
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
    stampEmoji: stampEmojiHeader,
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
        ${showWalletStep ? `
        <section class="fidelity-v2-card fidelity-v2-step" id="fidelity-v2-wallet">
          <header class="fidelity-v2-step-header">
            <div class="fidelity-v2-step-head-text">
              <h2 class="fidelity-v2-card-title fidelity-v2-step-title">Ajoute ta carte au Wallet</h2>
            </div>
          </header>
          <div class="fidelity-v2-step-body">
            <p class="fidelity-v2-card-desc fidelity-v2-step-desc">Ton pass sur le téléphone : prêt à chaque visite, toujours à portée de main.</p>
            <div class="fidelity-wallet-buttons">
              <span class="fidelity-cta-wrap fidelity-cta-wrap--full">
                <a href="#" id="fidelity-v2-apple" class="fidelity-cta-pill">
                  <svg class="fidelity-cta-pill-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
                  <span class="fidelity-cta-pill-label">Apple Wallet</span>
                  <span class="fidelity-cta-pill-chevron" aria-hidden="true">›</span>
                </a>
              </span>
              <span class="fidelity-cta-wrap fidelity-cta-wrap--full">
                <a href="#" id="fidelity-v2-google" class="fidelity-cta-pill">
                  <svg class="fidelity-cta-pill-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  <span class="fidelity-cta-pill-label">Google Wallet</span>
                  <span class="fidelity-cta-pill-chevron" aria-hidden="true">›</span>
                </a>
              </span>
            </div>
            <div class="fidelity-v2-wallet-confirm" id="fidelity-v2-wallet-confirm-block">
              <p class="fidelity-v2-wallet-confirm-title">Tu as fini l’ajout ?</p>
              <p class="fidelity-v2-wallet-confirm-desc">Après avoir suivi Apple ou Google Wallet, tu peux confirmer ici pour masquer ce bloc — la roue et les missions restent accessibles en dessous.</p>
              <button type="button" class="fidelity-v2-wallet-confirm-btn" id="fidelity-v2-wallet-confirm">Oui, j’ai ajouté ma carte</button>
              <p class="fidelity-v2-wallet-confirm-later">Pas encore ? Utilise les boutons ci-dessus, puis reviens cliquer ici.</p>
              <p class="fidelity-v2-wallet-confirm-hint">Nous ne pouvons pas vérifier automatiquement l’ajout — merci d’indiquer la vérité pour garder le programme équitable.</p>
            </div>
          </div>
        </section>
        ` : ""}

        <!-- Roue / missions / programme -->
        <section class="fidelity-v2-card fidelity-v2-step fidelity-v2-step--play" id="fidelity-v2-step-2">
          <header class="fidelity-v2-step-header">
            <div class="fidelity-v2-step-head-text">
              ${showRoulette ? `
              <h2 class="fidelity-v2-card-title fidelity-v2-step-title fidelity-v2-step-title--roulette">
                <span class="fidelity-v2-step-title-emoji" aria-hidden="true">🎡</span>
                <span class="fidelity-v2-step-title-label">Tourne la roue</span>
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
            ${showRoulette ? `
            <div class="fidelity-v2-step-wheel">
              <span class="fidelity-cta-wrap fidelity-cta-wrap--full">
                <a href="${gamePageUrl}" class="fidelity-cta-pill fidelity-cta-pill--wheel-cta" id="fidelity-v2-game-cta" aria-label="${esc(gameCtaAriaLabel)}">
                  <span class="fidelity-cta-wheel-line">
                    <span class="${ticketStatusDotClass}" aria-hidden="true"></span>
                    <span class="fidelity-cta-wheel-emoji" aria-hidden="true">🎟️</span>
                    <span id="fidelity-v2-tickets-display" class="fidelity-cta-wheel-tickets">${esc(String(tickets))} ticket${tickets !== 1 ? "s" : ""}</span>
                  </span>
                </a>
              </span>
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

        <section class="fidelity-v2-card fidelity-v2-step" id="fidelity-v2-rewards">
          <header class="fidelity-v2-step-header">
            <div class="fidelity-v2-step-head-text">
              <h2 class="fidelity-v2-card-title fidelity-v2-step-title">Récupère tes récompenses</h2>
            </div>
          </header>
          <div class="fidelity-v2-step-body">
            <div class="fidelity-v2-step-body-inner">
            ${rewardsStepHtml}
            </div>
          </div>
        </section>
      </div>

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
