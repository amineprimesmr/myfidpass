function esc(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderClientPage(root, state) {
  const businessName = esc(state.business?.organizationName || state.business?.name || "Carte fidélité");
  const hasMember = !!state.member?.id;
  const isGameMode = (state.business?.loyalty_mode || "points_cash") === "points_game_tickets";
  const points = Number(state.member?.points || 0);
  const tickets = Number(state.tickets?.ticket_balance || 0);
  const pointsPerTicket = Number(state.business?.points_per_ticket || 10);
  const roulette = (state.games || []).find((g) => g.game_code === "roulette");
  const showRoulette = isGameMode && roulette && roulette.enabled;
  const spinCost = Number(roulette?.ticket_cost || 1);
  const rewards = Array.isArray(state.rewards) ? state.rewards : [];
  const actions = Array.isArray(state.engagementActions) ? state.engagementActions : [];

  root.innerHTML = `
    <header class="header fidelity-v2-header">
      <div class="header-inner fidelity-v2-header-inner">
        <a href="/" class="logo">Myfidpass</a>
        <span class="fidelity-v2-business">${businessName}</span>
      </div>
    </header>
    <main class="main fidelity-v2-main">
      <section class="fidelity-v2-hero">
        <h1 id="fidelity-v2-title">${hasMember ? "Ton espace fidélité" : "Crée ta carte fidélité"}</h1>
        <p>${hasMember ? "Consulte tes points, joue avec tes tickets et découvre tes récompenses." : "Inscris-toi pour suivre tes points et débloquer des récompenses."}</p>
      </section>

      <section class="fidelity-v2-card fidelity-v2-kpis ${hasMember ? "" : "hidden"}">
        <article><span>Points</span><strong id="fidelity-v2-points">${points}</strong></article>
        <article><span>Tickets</span><strong id="fidelity-v2-tickets">${tickets}</strong></article>
        <article><span>Mode</span><strong>${isGameMode ? "Jeu" : "Points / €"}</strong></article>
      </section>

      <section class="fidelity-v2-card fidelity-v2-flow ${hasMember ? "" : "hidden"}">
        <h2>Comment ça marche</h2>
        <div class="fidelity-v2-flow-grid">
          <div class="fidelity-v2-flow-step"><span>1</span><p>Gagner des points</p></div>
          <div class="fidelity-v2-flow-step"><span>2</span><p>Convertir en tickets</p></div>
          <div class="fidelity-v2-flow-step"><span>3</span><p>Jouer et gagner</p></div>
        </div>
      </section>

      <section class="fidelity-v2-card ${hasMember ? "hidden" : ""}" id="fidelity-v2-signup">
        <form id="fidelity-v2-form" class="fidelity-v2-form" novalidate>
          <input id="fidelity-v2-name" class="fidelity-input" type="text" placeholder="Ton prénom ou nom" autocomplete="name" required />
          <input id="fidelity-v2-email" class="fidelity-input" type="email" placeholder="ton@email.com" autocomplete="email" required />
          <button id="fidelity-v2-submit" class="fidelity-btn" type="submit">Créer ma carte</button>
          <p id="fidelity-v2-error" class="fidelity-error hidden"></p>
        </form>
      </section>

      <section class="fidelity-v2-card ${hasMember ? "" : "hidden"}" id="fidelity-v2-wallet">
        <h2>Ajouter au Wallet</h2>
        <div class="fidelity-wallet-buttons">
          <a href="#" id="fidelity-v2-apple" class="fidelity-btn fidelity-btn-apple">Apple Wallet</a>
          <a href="#" id="fidelity-v2-google" class="fidelity-btn fidelity-btn-google">Google Wallet</a>
        </div>
        <button id="fidelity-v2-refresh" class="fidelity-btn fidelity-btn-secondary" type="button">Actualiser mes données</button>
      </section>

      <section class="fidelity-v2-card ${showRoulette ? "" : "hidden"}" id="fidelity-v2-game">
        <div class="fidelity-slot-machine-container">
          <div class="fidelity-slot-header">
            <h2 class="fidelity-slot-title">SLOT MACHINE</h2>
            <div class="fidelity-slot-tickets">
              <span class="fidelity-slot-ticket-icon">🎟️</span>
              <span class="fidelity-slot-ticket-count" id="fidelity-slot-ticket-count">${tickets}</span>
            </div>
          </div>
          
          <div class="fidelity-slot-window">
            <div class="fidelity-slot-reel" id="fidelity-slot-reel">
              <!-- Reel items will be injected here by JS -->
              <div class="fidelity-slot-item">Prêt à jouer ?</div>
            </div>
            <div class="fidelity-slot-overlay"></div>
          </div>

          <div class="fidelity-slot-controls">
            <button id="fidelity-v2-spin-btn" class="fidelity-slot-btn" type="button" ${tickets < spinCost ? 'disabled' : ''}>
              <span class="fidelity-slot-btn-text">SPIN</span>
              <span class="fidelity-slot-btn-cost">${spinCost} TICKET${spinCost > 1 ? "S" : ""}</span>
            </button>
          </div>
          
          <div class="fidelity-slot-convert-area">
            <p class="fidelity-slot-convert-hint">${pointsPerTicket} pts = 1 ticket</p>
            <div class="fidelity-slot-convert-row">
              <input id="fidelity-v2-convert-input" class="fidelity-slot-input" type="number" min="${pointsPerTicket}" step="${pointsPerTicket}" placeholder="Pts à convertir" />
              <button id="fidelity-v2-convert-btn" class="fidelity-slot-convert-btn" type="button">Convertir</button>
            </div>
            <p id="fidelity-v2-game-feedback" class="fidelity-slot-feedback hidden"></p>
          </div>
        </div>
      </section>

      <section class="fidelity-v2-card ${actions.length ? "" : "hidden"}" id="fidelity-v2-actions">
        <h2>Étape 1 - Gagner des points bonus</h2>
        <div class="fidelity-engagement-actions">
          ${actions
            .map(
              (a) => `
            <div class="fidelity-engagement-item" data-action-type="${esc(a.action_type)}">
              <div class="fidelity-engagement-item-info">
                <span class="fidelity-engagement-item-label">${esc(a.label)}</span>
                <span class="fidelity-engagement-item-points">+${Number(a.points || 0)} points</span>
              </div>
              <div class="fidelity-engagement-item-btns">
                <a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer" class="fidelity-btn fidelity-btn-secondary">Ouvrir</a>
                <button type="button" class="fidelity-btn" data-claim-action="${esc(a.action_type)}">Réclamer</button>
              </div>
            </div>
          `
            )
            .join("")}
        </div>
        <p id="fidelity-v2-action-feedback" class="fidelity-engagement-feedback hidden"></p>
      </section>

      <section class="fidelity-v2-card ${hasMember && !isGameMode ? "" : "hidden"}">
        <h2>Programme points classique</h2>
        <p class="fidelity-v2-muted">Ici tes points servent directement pour des avantages en caisse. Le mode jeu n'est pas activé pour ce commerce.</p>
      </section>

      <section class="fidelity-v2-card ${hasMember ? "" : "hidden"}" id="fidelity-v2-rewards">
        <h2>Mes récompenses</h2>
        <ul class="fidelity-v2-reward-list">
          ${
            rewards.length
              ? rewards
                .map(
                  (r) => `<li><strong>${esc(r.reward?.label || "Lot")}</strong><span>${esc(r.status || "granted")}</span></li>`
                )
                .join("")
              : "<li class='fidelity-v2-empty'>Aucune récompense pour le moment.</li>"
          }
        </ul>
      </section>

      <section class="fidelity-v2-card">
        <h2>Test UI Uiverse</h2>
        <div class="ui-parent">
          <div class="ui-card">
            <div class="ui-logo">
              <span class="ui-circle ui-circle1"></span>
              <span class="ui-circle ui-circle2"></span>
              <span class="ui-circle ui-circle3"></span>
              <span class="ui-circle ui-circle4"></span>
              <span class="ui-circle ui-circle5">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="ui-svg"><path d="M12 2L2 22h20L12 2z"/></svg>
              </span>
            </div>
            <div class="ui-glass"></div>
            <div class="ui-content">
              <span class="ui-title">UIVERSE 3D</span>
              <span class="ui-text">Passe la souris dessus pour voir l'effet 3D incroyable !</span>
            </div>
            <div class="ui-bottom">
              <div class="ui-social-buttons-container">
                <button class="ui-social-button"><svg class="ui-svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg></button>
                <button class="ui-social-button"><svg class="ui-svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg></button>
                <button class="ui-social-button"><svg class="ui-svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg></button>
              </div>
              <div class="ui-view-more">
                <button class="ui-view-more-button">Voir plus</button>
                <svg class="ui-svg" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  `;
}
