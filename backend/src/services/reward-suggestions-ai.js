/**
 * Génération IA de suggestions de récompenses fidélité calibrées par secteur.
 * Endpoint : /v1/chat/completions + response_format json_object (fiable, pas de /v1/responses).
 */

const SYSTEM_PROMPT = `Tu es un expert en fidélisation client et en économie du commerce de proximité français.
Tu génères des suggestions de récompenses pour un programme de fidélité en tenant compte :
- De la marge brute typique du secteur (restauration ~65%, boucherie ~35%, coiffure ~60%, etc.)
- Du panier moyen et de la fréquence de visite mensuelle estimés pour ce secteur
- La 1re récompense doit être atteignable en 2-4 visites (engagement rapide)
- La valeur totale accordée doit représenter 10-18 % du CA fidélisé
- Les libellés doivent être concrets, désirables et spécifiques au secteur (jamais génériques)

Secteurs couverts (non exhaustif) : boucherie, charcuterie, boulangerie, pâtisserie, épicerie, fromagerie,
restaurant, brasserie, fast-food, pizza, burger, sushi, crêperie, kebab, sandwicherie, bar, café, glacier,
coiffeur, barbier, esthétique, onglerie, manucure, beauté, institut, pharmacie, parapharmacie,
fleuriste, librairie, pressing, cordonnerie, sport, salle de sport, yoga, fitness, mode, bijouterie,
auto, garage, carrosserie, lavage voiture, informatique, téléphonie, Crousty, et tout autre commerce.

Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, sans bloc markdown.`;

function buildUserPrompt({ sector, programType, loyaltyMode, requiredStamps, welcomeBonusAmount }) {
  const isStamps = programType === "stamps";
  const lines = [
    `Commerce : ${sector || "commerce"}`,
    `Mode fidélité : ${isStamps ? "tampons" : "points"}`,
  ];
  if (!isStamps) {
    lines.push(`Mode de gain : ${loyaltyMode === "points_game_tickets" ? "tickets de jeu" : "1 point ≈ 1 €"}`);
    if (welcomeBonusAmount) lines.push(`Bonus inscription actuel : ${welcomeBonusAmount} pts`);
  }
  if (isStamps && requiredStamps) {
    lines.push(`Tampons par cycle actuel : ${requiredStamps}`);
  }
  lines.push(
    "",
    "Génère un JSON avec exactement ces clés :",
    '{ "summary": "string (2-3 phrases : panier moyen estimé, fréquence visite, logique économique)",',
    '  "tiers": [ { "points": number, "label": "string" }, ... ],  // 3 paliers points croissants',
    '  "stampReward": "string",     // récompense au cycle complet',
    '  "stampMidReward": "string",  // récompense à mi-cycle',
    '  "startGameReward": "string", // petite récompense dès le 1er scan / inscription',
    '  "requiredStamps": number,    // nb tampons optimal par cycle (5-12)',
    '  "welcomeBonusAmount": number // points suggérés pour le bonus inscription',
    "}"
  );
  return lines.join("\n");
}

/**
 * @returns {{ ok: true, data: object } | { ok: false, error: string }}
 */
export async function generateRewardSuggestions({
  apiKey,
  sector,
  programType,
  loyaltyMode,
  requiredStamps,
  welcomeBonusAmount,
}) {
  if (!apiKey || String(apiKey).trim().length < 20) {
    return { ok: false, error: "OPENAI_API_KEY non configurée." };
  }

  const userPrompt = buildUserPrompt({ sector, programType, loyaltyMode, requiredStamps, welcomeBonusAmount });

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      max_tokens: 900,
      temperature: 0.7,
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`OpenAI HTTP ${resp.status}: ${txt.slice(0, 300)}`);
  }

  const data = await resp.json();
  const raw = String(data?.choices?.[0]?.message?.content || "").trim();

  if (!raw) throw new Error("Réponse OpenAI vide.");

  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`JSON non parsable: ${raw.slice(0, 100)}`);
  }

  // Validation et sanitisation
  const summary = String(json?.summary || "").trim().slice(0, 500);
  const rawTiers = Array.isArray(json?.tiers) ? json.tiers : [];
  const tiers = rawTiers
    .filter((t) => t && Number.isFinite(Number(t.points)) && Number(t.points) > 0)
    .slice(0, 4)
    .map((t) => ({ points: Math.round(Number(t.points)), label: String(t.label || "").trim().slice(0, 80) }));

  if (!summary || tiers.length === 0) {
    throw new Error(`Suggestions incomplètes — summary="${summary}", tiers=${tiers.length}`);
  }

  const stampReward = String(json?.stampReward || "").trim().slice(0, 80);
  const stampMidReward = String(json?.stampMidReward || "").trim().slice(0, 80);
  const startGameReward = String(json?.startGameReward || "").trim().slice(0, 80);

  const rawStamps = Number(json?.requiredStamps);
  const requiredStampsOut =
    Number.isFinite(rawStamps) && rawStamps >= 3 && rawStamps <= 20 ? Math.round(rawStamps) : null;

  const rawBonus = Number(json?.welcomeBonusAmount);
  const welcomeBonusAmountOut =
    Number.isFinite(rawBonus) && rawBonus > 0 ? Math.round(rawBonus) : null;

  return {
    ok: true,
    data: {
      summary,
      tiers,
      stampReward,
      stampMidReward,
      startGameReward,
      requiredStamps: requiredStampsOut,
      welcomeBonusAmount: welcomeBonusAmountOut,
    },
  };
}
