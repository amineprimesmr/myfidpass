/**
 * Génération IA de suggestions de récompenses fidélité calibrées par secteur.
 * Modèle : gpt-4o-mini (JSON structuré, faible coût, aucune vision nécessaire).
 */

const SYSTEM_PROMPT = `Tu es un expert en fidélisation client et en économie du commerce de proximité français.
Tu génères des suggestions de récompenses pour un programme de fidélité en tenant compte de :
- La marge brute typique du secteur (ex : restauration ~65-72%, boucherie ~30-40%, coiffure ~55-65%)
- Le panier moyen estimé et la fréquence de visite mensuelle
- La psychologie de la récompense : la 1re doit être accessible en 2-4 visites pour créer l'engagement
- L'équilibre économique : la valeur totale des récompenses ≈ 10-20% du CA fidélisé
- Les libellés doivent être concrets, désirables et spécifiques au secteur (pas génériques)

Secteurs couverts (exemples non exhaustifs) :
boucherie, charcuterie, boulangerie, pâtisserie, épicerie, fromagerie, poissonnerie,
restaurant, brasserie, fast-food, pizza, burger, sushi, crêperie, kebab, sandwicherie, bar, café, glacier,
coiffeur, barbier, salon de coiffure, esthétique, onglerie, manucure, beauté, institut,
pharmacie, parapharmacie, optique, dentiste, médecin,
fleuriste, librairie, pressing, laverie, cordonnerie, serrurerie,
sport, salle de sport, yoga, pilates, fitness, coach,
vêtements, mode, boutique, bijouterie, maroquinerie,
auto, garage, carrosserie, lavage voiture,
informatique, téléphonie, réparation,
Crousty, kebab, and any other specific chain or concept

Retourne UNIQUEMENT un JSON valide sans markdown, sans texte avant ou après.`;

function buildUserPrompt({ sector, programType, loyaltyMode, requiredStamps, welcomeBonusAmount }) {
  const isStamps = programType === "stamps";
  const lines = [
    `Secteur : ${sector || "commerce généraliste"}`,
    `Mode fidélité : ${isStamps ? "tampons" : "points"}`,
  ];
  if (!isStamps) {
    lines.push(`Mode de gain : ${loyaltyMode === "points_game_tickets" ? "tickets de jeu" : "points sur achats (1 point ≈ 1 €)"}`);
  }
  if (isStamps && requiredStamps) {
    lines.push(`Tampons par cycle actuel : ${requiredStamps}`);
  }
  if (!isStamps && welcomeBonusAmount) {
    lines.push(`Bonus inscription actuel : ${welcomeBonusAmount} points`);
  }

  lines.push("");
  lines.push("Format JSON attendu :");
  lines.push(JSON.stringify({
    summary: "2-3 phrases : panier moyen estimé, fréquence visite/mois, logique économique choisie",
    tiers: [
      { points: "number — seuil palier 1", label: "récompense palier 1 (libellé court, spécifique)" },
      { points: "number — seuil palier 2", label: "récompense palier 2" },
      { points: "number — seuil palier 3", label: "récompense palier 3 (offre premium)" },
    ],
    stampReward: "récompense au cycle complet (Xᵉ tampon)",
    stampMidReward: "récompense à mi-cycle",
    startGameReward: "toute petite récompense dès l'inscription / 1re visite",
    requiredStamps: "number — nombre optimal de tampons par cycle (5-12)",
    welcomeBonusAmount: "number — points suggérés pour le bonus inscription",
  }, null, 2));

  return lines.join("\n");
}

/**
 * @returns {{ ok: true, data: RewardSuggestions } | { ok: false, error: string }}
 */
export async function generateRewardSuggestions({ apiKey, sector, programType, loyaltyMode, requiredStamps, welcomeBonusAmount }) {
  if (!apiKey || String(apiKey).trim().length < 20) {
    return { ok: false, error: "OPENAI_API_KEY non configurée." };
  }

  const userPrompt = buildUserPrompt({ sector, programType, loyaltyMode, requiredStamps, welcomeBonusAmount });

  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: [{ type: "input_text", text: SYSTEM_PROMPT }] },
        { role: "user", content: [{ type: "input_text", text: userPrompt }] },
      ],
      text: { format: { type: "text" } },
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`OpenAI HTTP ${resp.status}: ${txt.slice(0, 200)}`);
  }

  const data = await resp.json();
  const raw = String(data?.output_text || "").trim();

  let json;
  try {
    // Nettoie d'éventuels blocs ```json
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    json = JSON.parse(cleaned);
  } catch {
    throw new Error("Réponse IA non parsable comme JSON.");
  }

  // Validation et sanitisation
  const summary = String(json?.summary || "").trim().slice(0, 500);
  const tiers = Array.isArray(json?.tiers) ? json.tiers
    .filter(t => t && Number.isFinite(Number(t.points)) && Number(t.points) > 0)
    .slice(0, 4)
    .map(t => ({ points: Math.round(Number(t.points)), label: String(t.label || "").trim().slice(0, 80) }))
    : [];

  if (!summary || tiers.length === 0) {
    throw new Error("Suggestions IA incomplètes.");
  }

  const stampReward = String(json?.stampReward || "").trim().slice(0, 80);
  const stampMidReward = String(json?.stampMidReward || "").trim().slice(0, 80);
  const startGameReward = String(json?.startGameReward || "").trim().slice(0, 80);

  const rawStamps = Number(json?.requiredStamps);
  const requiredStampsOut = Number.isFinite(rawStamps) && rawStamps >= 3 && rawStamps <= 20
    ? Math.round(rawStamps) : null;

  const rawBonus = Number(json?.welcomeBonusAmount);
  const welcomeBonusAmountOut = Number.isFinite(rawBonus) && rawBonus > 0 ? Math.round(rawBonus) : null;

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
