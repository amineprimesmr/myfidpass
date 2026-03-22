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
  const loyaltyGameTickets = (state.business?.loyalty_mode || "points_cash") === "points_game_tickets";
  const programType = String(state.business?.program_type || "points").toLowerCase();
  const isStampsProgram = programType === "stamps";
  const points = Number(state.member?.points || 0);
  const tickets = state.unlimitedTicketsTest ? 999 : Number(state.tickets?.ticket_balance || 0);
  const roulette = (state.games || []).find((g) => g.game_code === "roulette");
  const showRoulette = !!(roulette && roulette.enabled && (programType === "points" || programType === "stamps"));
  const rewards = Array.isArray(state.rewards) ? state.rewards : [];
  const actions = Array.isArray(state.engagementActions) ? state.engagementActions : [];
  const gamePageUrl = slug ? `/fidelity/${encodeURIComponent(slug)}/jeu` : "#";
  const backUrl = slug ? `/fidelity/${encodeURIComponent(slug)}` : "/";
  const memberFirstName = esc((state.member?.name || "").split(" ")[0] || "");

  if (gamePage) {
    const gameSubtitle = isStampsProgram ? "gagne des passages bonus" : "gagne des points bonus";
    root.innerHTML = `
      <div class="fidelity-game-page">
        <a href="${backUrl}" class="fidelity-game-back-float">← Retour</a>
        <div class="fidelity-game-top">
          <div class="fidelity-roulette-logo">
            <span class="fidelity-roulette-logo-text">${esc(businessName.slice(0, 14)) || "VOTRE LOGO"}</span>
          </div>
          <h2 class="fidelity-roulette-title">
            <span class="fidelity-roulette-title-line">Tourne la roue et</span>
            <span class="fidelity-roulette-title-line">${esc(gameSubtitle)}</span>
          </h2>
          <div class="fidelity-roulette-btn-row">
            <span class="fidelity-cta-wrap">
              <button id="fidelity-v2-spin-btn" class="fidelity-cta-pill" type="button" aria-label="Lancer la roue">
                <span class="fidelity-cta-pill-dot" aria-hidden="true"></span>
                <span class="fidelity-cta-pill-label">Jouer&nbsp;!</span>
                <span class="fidelity-cta-pill-chevron" aria-hidden="true">›</span>
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

  /** Même base que les fetch API : évite logo cassé si le JSON renvoie une URL backend incorrecte (host interne, http, etc.). */
  const hasServerLogo = !!state.business?.logoUrl;
  const logoPath = slug ? `/api/businesses/${encodeURIComponent(slug)}/public/logo` : "";
  const baseTrim = String(apiBase || "").replace(/\/$/, "");
  const logoSrc = hasServerLogo && logoPath ? (baseTrim ? `${baseTrim}${logoPath}` : logoPath) : null;

  root.innerHTML = `
    <header class="fidelity-v2-header">
      <div class="fidelity-v2-header-inner">
        <div class="fidelity-v2-header-brand">
          ${logoSrc
            ? `<img src="${esc(logoSrc)}" alt="" class="fidelity-v2-logo" loading="lazy" decoding="async" />`
            : `<div class="fidelity-v2-logo-placeholder"><span>${esc(businessName.slice(0, 1).toUpperCase())}</span></div>`
          }
          <span class="fidelity-v2-business-name">${esc(businessName)}</span>
        </div>
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
              <p class="fidelity-v2-hero-subtitle">Voici ton espace fidélité chez <strong>${esc(businessName)}</strong></p>
            </div>
          </div>
        </section>

        <!-- KPIs membres -->
        <section class="fidelity-v2-card fidelity-v2-kpis-card">
          <div class="fidelity-v2-kpis">
            <div class="fidelity-v2-kpi">
              <div class="fidelity-v2-kpi-icon fidelity-v2-kpi-icon--points">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              </div>
              <div class="fidelity-v2-kpi-data">
                <strong id="fidelity-v2-points" class="fidelity-v2-kpi-value">${points}</strong>
                <span class="fidelity-v2-kpi-label">${isStampsProgram ? "Tampons" : "Points"}</span>
              </div>
            </div>
            ${showRoulette ? `
            <div class="fidelity-v2-kpi">
              <div class="fidelity-v2-kpi-icon fidelity-v2-kpi-icon--tickets">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/></svg>
              </div>
              <div class="fidelity-v2-kpi-data">
                <strong id="fidelity-v2-tickets" class="fidelity-v2-kpi-value">${tickets}</strong>
                <span class="fidelity-v2-kpi-label">Tickets</span>
              </div>
            </div>
            ` : ""}
            <div class="fidelity-v2-kpi">
              <div class="fidelity-v2-kpi-icon fidelity-v2-kpi-icon--mode">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>
              </div>
              <div class="fidelity-v2-kpi-data">
                <strong class="fidelity-v2-kpi-value">${isStampsProgram ? "🎫 Tampons" : loyaltyGameTickets ? "🎯 Jeu" : "💰 Points"}</strong>
                <span class="fidelity-v2-kpi-label">Mode</span>
              </div>
            </div>
          </div>
        </section>
      ` : `
        <!-- HERO nouveau visiteur -->
        <section class="fidelity-v2-hero fidelity-v2-hero-new">
          <div class="fidelity-v2-hero-icon">🎁</div>
          <h1 class="fidelity-v2-hero-title">Ta carte fidélité gratuite</h1>
          <p class="fidelity-v2-hero-subtitle">Rejoins le programme de fidélité de <strong>${esc(businessName)}</strong> et accumule des avantages à chaque visite.</p>
        </section>
      `}

      <!-- Formulaire d'inscription -->
      <section class="fidelity-v2-card fidelity-v2-signup-card ${hasMember ? "hidden" : ""}" id="fidelity-v2-signup">
        <div class="fidelity-v2-signup-header">
          <h2 class="fidelity-v2-card-title">Créer ma carte</h2>
        </div>
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
              <span class="fidelity-cta-pill-label">Créer ma carte gratuite</span>
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

      <!-- Wallet -->
      <section class="fidelity-v2-card ${hasMember ? "" : "hidden"}" id="fidelity-v2-wallet">
        <h2 class="fidelity-v2-card-title">📱 Ajouter au Wallet</h2>
        <p class="fidelity-v2-card-desc">Ajoute ta carte sur ton téléphone pour la retrouver facilement à chaque visite.</p>
        <div class="fidelity-wallet-buttons">
          <span class="fidelity-cta-wrap fidelity-cta-wrap--full">
            <a href="#" id="fidelity-v2-apple" class="fidelity-cta-pill">
              <span class="fidelity-cta-pill-dot" aria-hidden="true"></span>
              <svg class="fidelity-cta-pill-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
              <span class="fidelity-cta-pill-label">Apple Wallet</span>
              <span class="fidelity-cta-pill-chevron" aria-hidden="true">›</span>
            </a>
          </span>
          <span class="fidelity-cta-wrap fidelity-cta-wrap--full">
            <a href="#" id="fidelity-v2-google" class="fidelity-cta-pill">
              <span class="fidelity-cta-pill-dot" aria-hidden="true"></span>
              <svg class="fidelity-cta-pill-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              <span class="fidelity-cta-pill-label">Google Wallet</span>
              <span class="fidelity-cta-pill-chevron" aria-hidden="true">›</span>
            </a>
          </span>
        </div>
        <span class="fidelity-cta-wrap fidelity-cta-wrap--full">
          <button id="fidelity-v2-refresh" class="fidelity-cta-pill" type="button">
            <span class="fidelity-cta-pill-dot" aria-hidden="true"></span>
            <svg class="fidelity-cta-pill-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
            <span class="fidelity-cta-pill-label">Actualiser mes données</span>
            <span class="fidelity-cta-pill-chevron" aria-hidden="true">›</span>
          </button>
        </span>
      </section>

      <!-- Jeu roulette CTA -->
      <section class="fidelity-v2-card fidelity-v2-game-card ${showRoulette ? "" : "hidden"}" id="fidelity-v2-game-cta">
        <div class="fidelity-v2-game-header">
          <div class="fidelity-v2-game-emoji">🎡</div>
          <div>
            <h2 class="fidelity-v2-card-title">Roue des cadeaux</h2>
            <p class="fidelity-v2-card-desc">Tu as <strong id="fidelity-v2-tickets-display">${tickets}</strong> ticket${tickets !== 1 ? "s" : ""} — chaque ticket = 1 tour de roue !</p>
          </div>
        </div>
        <span class="fidelity-cta-wrap fidelity-cta-wrap--full">
          <a href="${gamePageUrl}" class="fidelity-cta-pill">
            <span class="fidelity-cta-pill-dot" aria-hidden="true"></span>
            <span class="fidelity-cta-pill-label">🎰 Jouer à la roue</span>
            <span class="fidelity-cta-pill-chevron" aria-hidden="true">›</span>
          </a>
        </span>
      </section>

      <!-- Actions d'engagement -->
      <section class="fidelity-v2-card ${actions.length ? "" : "hidden"}" id="fidelity-v2-actions">
        <div class="fidelity-v2-actions-header">
          <h2 class="fidelity-v2-card-title">🎯 Gagner des tickets</h2>
          <p class="fidelity-v2-card-desc">Complète ces missions pour gagner des tickets et jouer à la roue.</p>
        </div>
        <div class="fidelity-engagement-actions">
          ${actions
            .map((a) => {
              const ticketCount = Math.min(10, Math.max(1, Number(a.points) || (a.action_type === "google_review" ? 2 : 1)));
              const actionEmoji = a.action_type === "google_review" ? "⭐" : a.action_type === "instagram" ? "📸" : a.action_type === "facebook" ? "👍" : "🔗";
              return `
            <div class="fidelity-engagement-item" data-action-type="${esc(a.action_type)}">
              <div class="fidelity-engagement-item-emoji">${actionEmoji}</div>
              <div class="fidelity-engagement-item-info">
                <span class="fidelity-engagement-item-label">${esc(a.label)}</span>
                <span class="fidelity-engagement-item-points">+${ticketCount} ticket${ticketCount > 1 ? "s" : ""}</span>
              </div>
              <div class="fidelity-engagement-item-btns">
                <span class="fidelity-cta-wrap">
                  <a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer" class="fidelity-cta-pill fidelity-cta-pill--compact fidelity-engagement-open-link" data-action-type="${esc(a.action_type)}">
                    <span class="fidelity-cta-pill-dot" aria-hidden="true"></span>
                    <span class="fidelity-cta-pill-label">Ouvrir</span>
                    <span class="fidelity-cta-pill-chevron" aria-hidden="true">›</span>
                  </a>
                </span>
              </div>
            </div>
          `;
            })
            .join("")}
        </div>
        <p id="fidelity-v2-action-feedback" class="fidelity-engagement-feedback hidden"></p>
      </section>

      <!-- Programme points classique (non-jeu) -->
      <section class="fidelity-v2-card ${hasMember && !loyaltyGameTickets && !isStampsProgram ? "" : "hidden"}">
        <h2 class="fidelity-v2-card-title">💳 Programme fidélité classique</h2>
        <p class="fidelity-v2-card-desc">Tes points sont directement utilisables en caisse pour bénéficier de réductions et avantages.</p>
      </section>

      <!-- Récompenses -->
      <section class="fidelity-v2-card ${hasMember ? "" : "hidden"}" id="fidelity-v2-rewards">
        <h2 class="fidelity-v2-card-title">🏆 Mes récompenses</h2>
        <ul class="fidelity-v2-reward-list">
          ${
            rewards.length
              ? rewards
                .map((r) => `
                  <li class="fidelity-v2-reward-item">
                    <div class="fidelity-v2-reward-info">
                      <span class="fidelity-v2-reward-icon">🎁</span>
                      <strong>${esc(r.reward?.label || "Lot")}</strong>
                    </div>
                    <span class="fidelity-v2-reward-status fidelity-v2-reward-status--${esc(r.status || "granted")}">${esc(r.status === "used" ? "Utilisée" : r.status === "expired" ? "Expirée" : "Disponible")}</span>
                  </li>
                `)
                .join("")
              : `<li class="fidelity-v2-reward-empty">
                  <div class="fidelity-v2-reward-empty-icon">🎯</div>
                  <p>Continue à accumuler des points pour débloquer des récompenses !</p>
                </li>`
          }
        </ul>
      </section>

    </main>

    <footer class="fidelity-v2-footer">
      <p>Propulsé par <a href="https://myfidpass.fr" target="_blank" rel="noopener noreferrer">MyFidpass</a></p>
    </footer>
  `;
}
