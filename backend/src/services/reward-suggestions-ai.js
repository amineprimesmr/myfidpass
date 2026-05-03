/**
 * Suggestions de récompenses IA — ultra-personnalisées par commerce.
 * Utilise Google Places pour connaître les vrais produits/services avant d'appeler GPT.
 */
import { fetchPlaceContextForRewards } from "./google-place-for-rewards.js";

// ─── Prompt système ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es un expert en fidélisation client pour le commerce de proximité français.
Tu génères des suggestions de récompenses HYPER-PERSONNALISÉES pour un programme de fidélité.

══════ RÈGLES ABSOLUES — NE JAMAIS ENFREINDRE ══════

❌ TOTALEMENT INTERDIT :
- Réductions, pourcentages (ex : "10% de réduction", "-5€", "50% offert")
- Bons d'achat, chèques cadeaux, crédits, cashback
- Récompenses génériques : "cadeau", "surprise", "article offert", "produit au choix"
- Récompenses sans rapport avec le commerce ("accessoire de mode" pour un restaurant)
- Inventer des produits que le commerce ne vend pas

✅ OBLIGATOIRE :
- Uniquement des produits ou services RÉELS et SPÉCIFIQUES vendus par ce commerce
- Si restaurant/fast-food : plats du menu réels (ex : "Riz poulet Crousty offert", "Pad Thai offert")
- Si coiffeur : prestations réelles ("Coupe + brushing offert", "Soin kératine offert")
- Si boulangerie : produits réels ("Viennoiserie offerte", "Pain spécial offert")
- Si boucherie : produits réels ("500g de merguez offertes", "Poulet rôti offert")
- Si bar/café : consommations réelles ("Café offert", "Bière pression offerte")
- Libellés COURTS (max 6 mots), concrets, appétissants, spécifiques au commerce
- Les récompenses doivent progresser en valeur : la 1re atteignable en 2-4 visites

══════ CALIBRAGE ÉCONOMIQUE ══════
- La 1re récompense = produit peu coûteux, accessible vite → crée l'habitude
- La 2e = produit mid-range (représente ~1.5x le panier de la 1re)
- La 3e = offre premium ou repas complet → récompense la fidélité long terme
- Valeur totale accordée : 10-18% du CA fidélisé estimé

Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans texte autour.`;

// ─── Construction du prompt utilisateur ───────────────────────────────────────

function buildUserPrompt({ organizationName, sector, programType, loyaltyMode, requiredStamps, welcomeBonusAmount, placeCtx }) {
  const isStamps = programType === "stamps";
  const lines = [];

  // ── Identité commerce ──
  if (organizationName) lines.push(`Nom du commerce : ${organizationName}`);
  if (placeCtx?.found) {
    if (placeCtx.name && placeCtx.name !== organizationName) lines.push(`Nom Google : ${placeCtx.name}`);
    if (placeCtx.googleCategory) lines.push(`Catégorie Google : ${placeCtx.googleCategory}`);
    if (placeCtx.address) lines.push(`Adresse : ${placeCtx.address}`);
    if (placeCtx.editorialSummary) lines.push(`Description Google : ${placeCtx.editorialSummary}`);
    if (placeCtx.priceLevel != null) {
      const levels = ["très économique (€)", "économique (€€)", "milieu de gamme (€€€)", "haut de gamme (€€€€)"];
      lines.push(`Gamme de prix : ${levels[placeCtx.priceLevel] ?? placeCtx.priceLevel}`);
    }
  }
  if (sector) lines.push(`Secteur déclaré : ${sector}`);

  // ── Avis clients (extraits produits) ──
  if (placeCtx?.found && placeCtx.reviewExcerpts?.length) {
    lines.push("");
    lines.push("Extraits d'avis clients (mentionnent les vrais produits achetés) :");
    placeCtx.reviewExcerpts.forEach((r, i) => lines.push(`  [${i + 1}] ${r}`));
    lines.push("→ Utilise ces avis pour identifier les produits réels vendus et baser tes récompenses dessus.");
  }

  // ── Programme fidélité ──
  lines.push("");
  lines.push(`Mode fidélité : ${isStamps ? "tampons" : "points"}`);
  if (!isStamps) {
    lines.push(`Mode de gain : ${loyaltyMode === "points_game_tickets" ? "tickets de jeu" : "1 point = 1 € dépensé"}`);
    if (welcomeBonusAmount) lines.push(`Bonus inscription configuré : ${welcomeBonusAmount} pts`);
  }
  if (isStamps && requiredStamps) lines.push(`Tampons par cycle actuel : ${requiredStamps}`);

  // ── Instruction finale ──
  lines.push("");
  lines.push("Génère le JSON suivant (toutes les récompenses doivent être des produits/services RÉELS de ce commerce) :");
  lines.push(`{
  "summary": "2-3 phrases : ce que vend ce commerce, panier moyen estimé, fréquence de visite, logique choisie",
  "tiers": [
    { "points": <nombre>, "label": "<produit réel offert — max 6 mots>" },
    { "points": <nombre plus élevé>, "label": "<produit réel offert>" },
    { "points": <nombre encore plus élevé>, "label": "<produit premium ou repas complet>" }
  ],
  "stampReward": "<récompense cycle complet — produit réel>",
  "stampMidReward": "<récompense mi-cycle — produit réel>",
  "startGameReward": "<très petite récompense dès le 1er scan — produit peu coûteux>",
  "requiredStamps": <nombre optimal 5-12>,
  "welcomeBonusAmount": <points suggérés pour bonus inscription>
}`);

  return lines.join("\n");
}

// ─── Fonction principale ───────────────────────────────────────────────────────

/**
 * @returns {{ ok: true, data: object } | { ok: false, error: string }}
 */
export async function generateRewardSuggestions({
  apiKey,
  business,
  sector,
  programType,
  loyaltyMode,
  requiredStamps,
  welcomeBonusAmount,
}) {
  if (!apiKey || String(apiKey).trim().length < 20) {
    return { ok: false, error: "OPENAI_API_KEY non configurée." };
  }

  // ── Enrichissement Google Places ──
  const googleKey = process.env.GOOGLE_PLACES_API_KEY || "";
  let placeCtx = { found: false };
  if (googleKey) {
    try {
      placeCtx = await fetchPlaceContextForRewards(business, googleKey);
    } catch (_) {
      // Non bloquant
    }
  }

  const organizationName = String(business?.organization_name || "").trim();

  const userPrompt = buildUserPrompt({
    organizationName,
    sector,
    programType,
    loyaltyMode,
    requiredStamps,
    welcomeBonusAmount,
    placeCtx,
  });

  // ── Appel OpenAI ──
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
      temperature: 0.5,
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

  // ── Validation ──
  const summary = String(json?.summary || "").trim().slice(0, 600);
  const rawTiers = Array.isArray(json?.tiers) ? json.tiers : [];
  const tiers = rawTiers
    .filter((t) => t && Number.isFinite(Number(t.points)) && Number(t.points) > 0)
    .slice(0, 4)
    .map((t) => ({ points: Math.round(Number(t.points)), label: String(t.label || "").trim().slice(0, 80) }));

  if (!summary || tiers.length === 0) {
    throw new Error(`Suggestions incomplètes (summary=${Boolean(summary)}, tiers=${tiers.length})`);
  }

  const rawStamps = Number(json?.requiredStamps);
  const rawBonus = Number(json?.welcomeBonusAmount);

  return {
    ok: true,
    data: {
      summary,
      tiers,
      stampReward: String(json?.stampReward || "").trim().slice(0, 80),
      stampMidReward: String(json?.stampMidReward || "").trim().slice(0, 80),
      startGameReward: String(json?.startGameReward || "").trim().slice(0, 80),
      requiredStamps: Number.isFinite(rawStamps) && rawStamps >= 3 && rawStamps <= 20 ? Math.round(rawStamps) : null,
      welcomeBonusAmount: Number.isFinite(rawBonus) && rawBonus > 0 ? Math.round(rawBonus) : null,
      googleEnriched: placeCtx.found,
    },
  };
}
