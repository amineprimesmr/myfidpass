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
        <h2>Jouer à la roulette</h2>
        <p>Conversion: ${pointsPerTicket} points = 1 ticket</p>
        <div class="fidelity-v2-row">
          <input id="fidelity-v2-convert-input" class="fidelity-input" type="number" min="${pointsPerTicket}" step="${pointsPerTicket}" placeholder="Points à convertir" />
          <button id="fidelity-v2-convert-btn" class="fidelity-btn fidelity-btn-secondary" type="button">Convertir</button>
        </div>
        <button id="fidelity-v2-spin-btn" class="fidelity-btn" type="button">Lancer la roulette (${Number(roulette?.ticket_cost || 1)} ticket)</button>
        <p id="fidelity-v2-game-feedback" class="fidelity-engagement-feedback hidden"></p>
      </section>

      <section class="fidelity-v2-card ${actions.length ? "" : "hidden"}" id="fidelity-v2-actions">
        <h2>Gagner des points bonus</h2>
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
    </main>
  `;
}
