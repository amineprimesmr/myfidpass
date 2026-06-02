/**
 * Calendrier Coupe du monde 2026 — phase de groupes (équipes du tirage déc. 2025)
 * + placeholders phase à élimination directe (équipes mises à jour par sync API).
 */

/** @typedef {{ external_id: string; title: string; team_home: string; team_away: string; starts_at: string; stage: string; group_code?: string; round_label?: string; venue?: string; predictions_open: number; sort_order: number }} CatalogMatch */

const GROUPS = {
  A: ["Mexique", "Afrique du Sud", "Corée du Sud", "Tchéquie"],
  B: ["Canada", "Bosnie-Herzégovine", "Qatar", "Suisse"],
  C: ["Brésil", "Maroc", "Haïti", "Écosse"],
  D: ["États-Unis", "Paraguay", "Australie", "Turquie"],
  E: ["Allemagne", "Curaçao", "Côte d'Ivoire", "Équateur"],
  F: ["Pays-Bas", "Japon", "Suède", "Tunisie"],
  G: ["Belgique", "Égypte", "Iran", "Nouvelle-Zélande"],
  H: ["Espagne", "Cap-Vert", "Arabie saoudite", "Uruguay"],
  I: ["France", "Sénégal", "Irak", "Norvège"],
  J: ["Argentine", "Algérie", "Autriche", "Jordanie"],
  K: ["Portugal", "RD Congo", "Ouzbékistan", "Colombie"],
  L: ["Angleterre", "Croatie", "Ghana", "Panama"],
};

/** Journées 1–3 par groupe (ISO UTC, heures indicatives FIFA). */
const GROUP_MATCHDAYS = {
  A: ["2026-06-11T19:00:00Z", "2026-06-18T22:00:00Z", "2026-06-24T19:00:00Z"],
  B: ["2026-06-12T19:00:00Z", "2026-06-18T19:00:00Z", "2026-06-24T19:00:00Z"],
  C: ["2026-06-13T19:00:00Z", "2026-06-19T19:00:00Z", "2026-06-25T01:00:00Z"],
  D: ["2026-06-13T01:00:00Z", "2026-06-19T22:00:00Z", "2026-06-25T01:00:00Z"],
  E: ["2026-06-14T19:00:00Z", "2026-06-20T19:00:00Z", "2026-06-25T19:00:00Z"],
  F: ["2026-06-14T22:00:00Z", "2026-06-20T22:00:00Z", "2026-06-25T22:00:00Z"],
  G: ["2026-06-15T19:00:00Z", "2026-06-21T19:00:00Z", "2026-06-26T19:00:00Z"],
  H: ["2026-06-15T22:00:00Z", "2026-06-21T22:00:00Z", "2026-06-26T22:00:00Z"],
  I: ["2026-06-16T19:00:00Z", "2026-06-22T19:00:00Z", "2026-06-26T19:00:00Z"],
  J: ["2026-06-16T22:00:00Z", "2026-06-22T22:00:00Z", "2026-06-27T19:00:00Z"],
  K: ["2026-06-17T19:00:00Z", "2026-06-23T19:00:00Z", "2026-06-27T22:00:00Z"],
  L: ["2026-06-17T22:00:00Z", "2026-06-23T22:00:00Z", "2026-06-27T22:00:00Z"],
};

/** Ronde classique 4 équipes : J1 (0-1, 2-3), J2 (0-2, 1-3), J3 (0-3, 1-2). */
const ROUND_ROBIN_PAIRINGS = [
  [[0, 1], [2, 3]],
  [[0, 2], [1, 3]],
  [[0, 3], [1, 2]],
];

/**
 * @param {string} groupCode
 * @param {string[]} teams
 * @param {string[]} dayStarts
 * @param {number} sortBase
 * @returns {CatalogMatch[]}
 */
function buildGroupStageMatches(groupCode, teams, dayStarts, sortBase) {
  const out = [];
  let n = 0;
  for (let md = 0; md < ROUND_ROBIN_PAIRINGS.length; md += 1) {
    const dayBase = Date.parse(dayStarts[md] || dayStarts[0]);
    let pairIdx = 0;
    for (const [hi, ai] of ROUND_ROBIN_PAIRINGS[md]) {
      const home = teams[hi];
      const away = teams[ai];
      const startsAt = Number.isFinite(dayBase)
        ? new Date(dayBase + pairIdx * 3 * 60 * 60 * 1000).toISOString()
        : dayStarts[md] || dayStarts[0];
      pairIdx += 1;
      const externalId = `wc2026-group-${groupCode.toLowerCase()}-m${md + 1}-${hi + 1}v${ai + 1}`;
      const title =
        md === 0 && groupCode === "A" && hi === 0 && ai === 1
          ? "Match d'ouverture"
          : `Groupe ${groupCode} · J${md + 1}`;
      out.push({
        external_id: externalId,
        title,
        team_home: home,
        team_away: away,
        starts_at: startsAt,
        stage: "group",
        group_code: groupCode,
        round_label: `Phase de groupes · Groupe ${groupCode}`,
        predictions_open: 1,
        sort_order: sortBase + n,
      });
      n += 1;
    }
  }
  return out;
}

/** @returns {CatalogMatch[]} */
function buildKnockoutPlaceholders() {
  const out = [];
  let order = 500;
  const add = (externalId, title, roundLabel, stage, startsAt, home, away) => {
    out.push({
      external_id: externalId,
      title,
      team_home: home,
      team_away: away,
      starts_at: startsAt,
      stage,
      round_label: roundLabel,
      predictions_open: 0,
      sort_order: order,
    });
    order += 1;
  };

  for (let i = 1; i <= 16; i += 1) {
    add(
      `wc2026-r32-${i}`,
      `16e de finale ${i}`,
      "8e de finale",
      "round_of_32",
      `2026-06-${28 + Math.floor((i - 1) / 4)}T${16 + (i % 4) * 2}:00:00Z`,
      "Équipe à confirmer",
      "Équipe à confirmer",
    );
  }
  for (let i = 1; i <= 8; i += 1) {
    add(
      `wc2026-r16-${i}`,
      `8e de finale ${i}`,
      "8e de finale",
      "round_of_16",
      `2026-07-0${4 + Math.floor((i - 1) / 4)}T${18 + (i % 4) * 2}:00:00Z`,
      "Vainqueur match précédent",
      "Vainqueur match précédent",
    );
  }
  for (let i = 1; i <= 4; i += 1) {
    add(
      `wc2026-qf-${i}`,
      `Quart de finale ${i}`,
      "Quart de finale",
      "quarter_final",
      `2026-07-${9 + Math.floor((i - 1) / 2)}T${20 + (i % 2) * 2}:00:00Z`,
      "Vainqueur 8e",
      "Vainqueur 8e",
    );
  }
  add(
    "wc2026-sf-1",
    "Demi-finale 1",
    "Demi-finale",
    "semi_final",
    "2026-07-14T20:00:00Z",
    "Vainqueur quart",
    "Vainqueur quart",
  );
  add(
    "wc2026-sf-2",
    "Demi-finale 2",
    "Demi-finale",
    "semi_final",
    "2026-07-15T20:00:00Z",
    "Vainqueur quart",
    "Vainqueur quart",
  );
  add(
    "wc2026-third",
    "Match pour la 3e place",
    "3e place",
    "third_place",
    "2026-07-18T20:00:00Z",
    "Perdant demi-finale",
    "Perdant demi-finale",
  );
  add(
    "wc2026-final",
    "Finale",
    "Finale",
    "final",
    "2026-07-19T20:00:00Z",
    "Vainqueur demi-finale",
    "Vainqueur demi-finale",
  );
  return out;
}

/** @returns {CatalogMatch[]} */
export function buildWorldCup2026Catalog() {
  const matches = [];
  let sortBase = 0;
  for (const [code, teams] of Object.entries(GROUPS)) {
    const days = GROUP_MATCHDAYS[code] || GROUP_MATCHDAYS.A;
    const groupMatches = buildGroupStageMatches(code, teams, days, sortBase);
    matches.push(...groupMatches);
    sortBase += groupMatches.length;
  }
  matches.push(...buildKnockoutPlaceholders());
  return matches;
}

export const WORLD_CUP_2026_META = {
  tournament: "FIFA World Cup 2026",
  starts_on: "2026-06-11",
  ends_on: "2026-07-19",
  total_matches: 104,
  group_matches: 72,
};
