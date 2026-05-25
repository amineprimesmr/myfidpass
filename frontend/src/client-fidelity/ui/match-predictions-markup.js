function formatMatchDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function choiceLabel(match, choice) {
  if (choice === "home") return match.team_home;
  if (choice === "away") return match.team_away;
  if (choice === "draw") return "Match nul";
  return "";
}

export function renderMatchPredictionsMarkup(esc, data = {}) {
  if (!data?.enabled || !Array.isArray(data.matches) || data.matches.length === 0) return "";
  const points = Math.max(1, Math.floor(Number(data.points_per_correct_prediction) || 10));
  const cards = data.matches
    .map((match) => {
      const prediction = match.prediction || null;
      const locked = Boolean(match.locked);
      const scored = Boolean(match.result_choice);
      const won = scored && prediction?.predicted_choice === match.result_choice;
      const lost = scored && prediction && prediction.predicted_choice !== match.result_choice;
      const statusText = won
        ? `Gagné : +${Number(prediction.points_awarded || points)} points`
        : lost
          ? `Résultat : ${choiceLabel(match, match.result_choice)}`
          : locked
            ? "Pronostics verrouillés"
            : prediction
              ? `Ton choix : ${choiceLabel(match, prediction.predicted_choice)}`
              : "Choisis ton pronostic";
      const statusClass = won
        ? "fidelity-match-predictions__status--won"
        : lost
          ? "fidelity-match-predictions__status--lost"
          : "";
      const buttons = ["home", "draw", "away"]
        .map((choice) => {
          const selected = prediction?.predicted_choice === choice;
          const disabled = locked || scored;
          return `<button
            class="fidelity-match-predictions__choice ${selected ? "fidelity-match-predictions__choice--selected" : ""}"
            type="button"
            data-match-prediction-choice="${esc(choice)}"
            data-match-id="${esc(match.id)}"
            ${disabled ? "disabled" : ""}
          >${esc(choiceLabel(match, choice))}</button>`;
        })
        .join("");
      return `<article class="fidelity-match-predictions__match">
        <div class="fidelity-match-predictions__match-head">
          <div>
            <p class="fidelity-match-predictions__eyebrow">${esc(match.title || "Match sélectionné")}</p>
            <h3>${esc(match.team_home)} <span>vs</span> ${esc(match.team_away)}</h3>
          </div>
          <time datetime="${esc(match.starts_at)}">${esc(formatMatchDate(match.starts_at))}</time>
        </div>
        <div class="fidelity-match-predictions__choices" role="group" aria-label="Choix du pronostic">
          ${buttons}
        </div>
        <p class="fidelity-match-predictions__status ${statusClass}">${esc(statusText)}</p>
      </article>`;
    })
    .join("");

  return `<section class="fidelity-match-predictions fidelity-v2-card" id="fidelity-match-predictions">
    <div class="fidelity-match-predictions__header">
      <div>
        <p class="fidelity-match-predictions__eyebrow">Challenge</p>
        <h2>Pronostics foot</h2>
        <p>Pronostique les matchs sélectionnés. Chaque bon résultat rapporte automatiquement des points.</p>
      </div>
      <span>+${points} pts</span>
    </div>
    <div class="fidelity-match-predictions__list">
      ${cards}
    </div>
    <p id="fidelity-match-predictions-feedback" class="fidelity-match-predictions__feedback hidden"></p>
  </section>`;
}
