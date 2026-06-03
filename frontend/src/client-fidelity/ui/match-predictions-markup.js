function formatMatchDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function msUntil(iso) {
  const t = Date.parse(String(iso || ""));
  if (!Number.isFinite(t)) return null;
  return Math.max(0, t - Date.now());
}

function formatCountdown(ms) {
  if (ms == null) return "";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h >= 48) {
    const d = Math.floor(h / 24);
    return `${d} j ${h % 24} h`;
  }
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")} min`;
  return `${Math.max(1, m)} min`;
}

function pickNextMatch(data) {
  if (data?.next_match && typeof data.next_match === "object") return data.next_match;
  const list = Array.isArray(data?.matches) ? data.matches : [];
  const now = Date.now();
  return (
    list
      .filter((m) => m.predictions_open !== false && !m.locked && m.status === "scheduled")
      .filter((m) => {
        const c = Date.parse(m.cutoff_at || m.starts_at || "");
        return Number.isFinite(c) && c > now;
      })
      .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))[0] || null
  );
}

function flagBlock(flag, iso, teamName, esc) {
  const emoji = flag ? esc(flag) : "🏳️";
  const isoAttr = iso ? ` data-iso="${esc(iso)}"` : "";
  return `<div class="fidelity-mp-flag"${isoAttr} aria-hidden="true">${emoji}</div>
    <p class="fidelity-mp-team-name">${esc(teamName)}</p>`;
}

function choiceCard(match, choice, esc, points) {
  const prediction = match.prediction || null;
  const locked = Boolean(match.locked);
  const scored = Boolean(match.result_choice);
  const selected = prediction?.predicted_choice === choice;
  const disabled = locked || scored;
  const label =
    choice === "home" ? match.team_home : choice === "away" ? match.team_away : "Match nul";
  const sub =
    choice === "draw"
      ? "Égalité"
      : choice === "home"
        ? "Domicile"
        : "Extérieur";
  const flag =
    choice === "home"
      ? match.team_home_flag
      : choice === "away"
        ? match.team_away_flag
        : "⚖️";
  return `<button
    type="button"
    class="fidelity-mp-choice ${selected ? "fidelity-mp-choice--selected" : ""}"
    data-match-prediction-choice="${esc(choice)}"
    data-match-id="${esc(match.id)}"
    ${disabled ? "disabled" : ""}
    aria-pressed="${selected ? "true" : "false"}"
  >
    <span class="fidelity-mp-choice__flag" aria-hidden="true">${flag ? esc(flag) : "•"}</span>
    <span class="fidelity-mp-choice__label">${esc(label)}</span>
    <span class="fidelity-mp-choice__sub">${esc(sub)}</span>
  </button>`;
}

export function renderMatchPredictionsMarkup(esc, data = {}) {
  if (!data?.enabled) return "";
  const points = Math.max(1, Math.floor(Number(data.points_per_correct_prediction) || 10));
  const match = pickNextMatch(data);

  if (!match) {
    return `<section class="fidelity-match-predictions fidelity-v2-card fidelity-mp" id="fidelity-match-predictions">
      <div class="fidelity-mp__hero fidelity-mp__hero--empty">
        <p class="fidelity-mp__eyebrow">Coupe du monde 2026</p>
        <h2>Prochain pronostic bientôt</h2>
        <p class="fidelity-mp__lede">Le prochain match ouvert aux pronostics apparaîtra ici. Recharge la page dans un instant.</p>
      </div>
    </section>`;
  }

  const prediction = match.prediction || null;
  const locked = Boolean(match.locked);
  const scored = Boolean(match.result_choice);
  const won = scored && prediction?.predicted_choice === match.result_choice;
  const lost = scored && prediction && prediction.predicted_choice !== match.result_choice;
  const cutoffMs = msUntil(match.cutoff_at);
  const countdown = cutoffMs != null ? formatCountdown(cutoffMs) : "";

  let statusText = "Choisis le vainqueur (ou le nul)";
  let statusClass = "";
  if (won) {
    statusText = `Bravo ! +${Number(prediction.points_awarded || points)} points`;
    statusClass = "fidelity-mp-status--won";
  } else if (lost) {
    statusText = `Résultat final : ${match.result_choice === "home" ? match.team_home : match.result_choice === "away" ? match.team_away : "nul"}`;
    statusClass = "fidelity-mp-status--lost";
  } else if (locked) {
    statusText = "Pronostics fermés pour ce match";
    statusClass = "fidelity-mp-status--locked";
  } else if (prediction) {
    statusText = "Pronostic enregistré — tu peux le modifier avant la fermeture";
    statusClass = "fidelity-mp-status--saved";
  }

  return `<section class="fidelity-match-predictions fidelity-v2-card fidelity-mp" id="fidelity-match-predictions" data-cutoff="${esc(match.cutoff_at || "")}">
    <div class="fidelity-mp__glow" aria-hidden="true"></div>
    <header class="fidelity-mp__header">
      <div>
        <p class="fidelity-mp__eyebrow">Coupe du monde 2026</p>
        <h2>Prochain match</h2>
        <p class="fidelity-mp__lede">${esc(match.round_label || match.title || "Phase de groupes")}</p>
      </div>
      <div class="fidelity-mp__reward" aria-label="Gain par bon pronostic">
        <span class="fidelity-mp__reward-value">+${points}</span>
        <span class="fidelity-mp__reward-label">pts</span>
      </div>
    </header>

    <div class="fidelity-mp__pitch">
      <div class="fidelity-mp__team fidelity-mp__team--home">
        ${flagBlock(match.team_home_flag, match.team_home_iso, match.team_home, esc)}
      </div>
      <div class="fidelity-mp__vs" aria-hidden="true">
        <span>VS</span>
        ${countdown ? `<time class="fidelity-mp__countdown" datetime="${esc(match.cutoff_at)}">⏱ ${esc(countdown)}</time>` : ""}
      </div>
      <div class="fidelity-mp__team fidelity-mp__team--away">
        ${flagBlock(match.team_away_flag, match.team_away_iso, match.team_away, esc)}
      </div>
    </div>

    <p class="fidelity-mp__kickoff">
      <time datetime="${esc(match.starts_at)}">${esc(formatMatchDate(match.starts_at))}</time>
    </p>

    <div class="fidelity-mp__choices" role="group" aria-label="Ton pronostic">
      ${choiceCard(match, "home", esc, points)}
      ${choiceCard(match, "draw", esc, points)}
      ${choiceCard(match, "away", esc, points)}
    </div>

    <p class="fidelity-mp-status ${statusClass}" role="status">${esc(statusText)}</p>
    <p id="fidelity-match-predictions-feedback" class="fidelity-match-predictions__feedback fidelity-mp__feedback hidden" aria-live="polite"></p>
  </section>`;
}
