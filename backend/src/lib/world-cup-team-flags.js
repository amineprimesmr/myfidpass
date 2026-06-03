/**
 * Drapeaux (emoji + ISO2) pour les équipes du catalogue CDM 2026 (noms FR + variantes API).
 */

const TEAM_NAME_TO_ISO2 = {
  Mexique: "mx",
  "Afrique du Sud": "za",
  "Corée du Sud": "kr",
  Tchéquie: "cz",
  Canada: "ca",
  "Bosnie-Herzégovine": "ba",
  Qatar: "qa",
  Suisse: "ch",
  Brésil: "br",
  Maroc: "ma",
  Haïti: "ht",
  Écosse: "gb-sct",
  "États-Unis": "us",
  Paraguay: "py",
  Australie: "au",
  Turquie: "tr",
  Allemagne: "de",
  Curaçao: "cw",
  "Côte d'Ivoire": "ci",
  Équateur: "ec",
  "Pays-Bas": "nl",
  Japon: "jp",
  Suède: "se",
  Tunisie: "tn",
  Belgique: "be",
  Égypte: "eg",
  Iran: "ir",
  "Nouvelle-Zélande": "nz",
  Espagne: "es",
  "Cap-Vert": "cv",
  "Arabie saoudite": "sa",
  Uruguay: "uy",
  France: "fr",
  Sénégal: "sn",
  Irak: "iq",
  Norvège: "no",
  Argentine: "ar",
  Algérie: "dz",
  Autriche: "at",
  Jordanie: "jo",
  Portugal: "pt",
  "RD Congo": "cd",
  Ouzbékistan: "uz",
  Colombie: "co",
  Angleterre: "gb-eng",
  Croatie: "hr",
  Ghana: "gh",
  Panama: "pa",
  // Variantes API-Football (anglais)
  Mexico: "mx",
  "South Africa": "za",
  "South Korea": "kr",
  "Czech Republic": "cz",
  "Bosnia and Herzegovina": "ba",
  Brazil: "br",
  Morocco: "ma",
  Haiti: "ht",
  Scotland: "gb-sct",
  "United States": "us",
  USA: "us",
  Australia: "au",
  Turkey: "tr",
  Germany: "de",
  Curacao: "cw",
  "Ivory Coast": "ci",
  Ecuador: "ec",
  Netherlands: "nl",
  Japan: "jp",
  Sweden: "se",
  Tunisia: "tn",
  Belgium: "be",
  Egypt: "eg",
  "Saudi Arabia": "sa",
  Uruguay: "uy",
  Senegal: "sn",
  Iraq: "iq",
  Norway: "no",
  Argentina: "ar",
  Algeria: "dz",
  Austria: "at",
  Jordan: "jo",
  Portugal: "pt",
  "DR Congo": "cd",
  Uzbekistan: "uz",
  Colombia: "co",
  England: "gb-eng",
  Croatia: "hr",
  Ghana: "gh",
  Panama: "pa",
};

/** ISO2 ou sous-région → emoji drapeau régional. */
export function flagEmojiForIso(iso) {
  const raw = String(iso || "").trim().toLowerCase();
  if (!raw) return null;
  const code = raw.includes("-") ? raw.split("-").pop() : raw;
  if (!/^[a-z]{2}$/.test(code)) return null;
  const base = 0x1f1e6;
  const a = code.charCodeAt(0) - 97;
  const b = code.charCodeAt(1) - 97;
  if (a < 0 || a > 25 || b < 0 || b > 25) return null;
  return String.fromCodePoint(base + a, base + b);
}

export function iso2ForTeamName(name) {
  const key = String(name || "").trim();
  if (!key) return null;
  if (TEAM_NAME_TO_ISO2[key]) return TEAM_NAME_TO_ISO2[key];
  const lower = key.toLowerCase();
  for (const [label, iso] of Object.entries(TEAM_NAME_TO_ISO2)) {
    if (label.toLowerCase() === lower) return iso;
  }
  return null;
}

export function enrichMatchWithTeamFlags(match) {
  if (!match || typeof match !== "object") return match;
  const homeIso = iso2ForTeamName(match.team_home);
  const awayIso = iso2ForTeamName(match.team_away);
  return {
    ...match,
    team_home_iso: homeIso,
    team_away_iso: awayIso,
    team_home_flag: flagEmojiForIso(homeIso),
    team_away_flag: flagEmojiForIso(awayIso),
  };
}
