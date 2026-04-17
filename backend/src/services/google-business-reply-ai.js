/**
 * Génération IA de réponses aux avis Google Business Profile.
 * Utilise OpenAI (GPT) si OPENAI_API_KEY présent ; sinon heuristique locale.
 *
 * @module services/google-business-reply-ai
 */
import logger from "../lib/logger.js";

const FETCH_TIMEOUT_MS = 30_000;

/**
 * Dictionnaire ton → directive de style concise.
 */
const TONE_DIRECTIVES = {
  warm: "Chaleureux, très humain, reconnaissant. Utilise le prénom si fourni. Parle comme un commerçant reconnaissant.",
  professional: "Professionnel, courtois, concis. Évite les émojis. Structure claire.",
  empathetic: "Empathique, désolé pour l'expérience, propose une solution concrète (venir, appeler, email).",
  playful: "Convivial, léger, une touche d'humour délicat. Un emoji max.",
  formal: "Formel, respectueux, vouvoiement soutenu.",
};

/**
 * Construit un fallback heuristique si l'API n'est pas configurée ou échoue.
 */
function buildHeuristicReply({ review, businessName }) {
  const author = String(review?.author_name || review?.authorName || "").trim();
  const rating = Math.max(0, Math.min(5, Number(review?.rating) || 0));
  const first = author ? author.split(" ")[0] : "";
  const salute = first ? `Bonjour ${first},` : "Bonjour,";
  const sign = businessName ? `\n— L'équipe ${businessName}` : "";
  if (rating >= 4) {
    return `${salute}\n\nMerci infiniment pour votre retour et vos ${rating} étoiles ! Votre confiance nous fait énormément plaisir et nous sommes ravis de vous avoir accueilli. Au plaisir de vous revoir très bientôt.${sign}`;
  }
  if (rating === 3) {
    return `${salute}\n\nMerci pour votre retour — nous voulons toujours faire mieux. N'hésitez pas à nous contacter directement afin que nous puissions comprendre ce qui aurait pu être amélioré lors de votre passage. À bientôt.${sign}`;
  }
  if (rating > 0) {
    return `${salute}\n\nNous sommes sincèrement désolés que votre expérience n'ait pas été à la hauteur. Nous prenons votre retour très au sérieux. Pouvez-vous nous contacter directement (par message ou téléphone) afin que nous puissions comprendre ce qui s'est passé et, si possible, arranger les choses ? Merci.${sign}`;
  }
  return `${salute}\n\nMerci pour votre retour. N'hésitez pas à nous contacter directement pour que nous puissions échanger davantage.${sign}`;
}

/**
 * Génère une réponse à un avis.
 * @param {object} args
 * @param {object} args.review - ligne SQL google_business_reviews OU objet avec rating, comment, author_name
 * @param {string} [args.businessName]
 * @param {"warm"|"professional"|"empathetic"|"playful"|"formal"} [args.tone]
 * @param {string} [args.language] - "fr" par défaut
 * @param {string} [args.extraContext] - instructions commerçant (ex. "Proposer un retour gratuit")
 */
export async function generateReviewReply({
  review,
  businessName = "",
  tone = "warm",
  language = "fr",
  extraContext = "",
}) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  const safeReview = {
    rating: Number(review?.rating || 0),
    author: String(review?.author_name || review?.authorName || "").trim(),
    comment: String(review?.comment || "").trim(),
  };

  if (!apiKey || apiKey.length < 20) {
    return {
      ok: true,
      reply: buildHeuristicReply({ review: safeReview, businessName }),
      source: "heuristic",
    };
  }

  const toneDirective = TONE_DIRECTIVES[tone] || TONE_DIRECTIVES.warm;
  const systemPrompt = [
    "Tu es un assistant qui rédige la réponse officielle d'un commerçant à un avis Google Business Profile.",
    "La réponse sera publiée publiquement sur Google Maps sous le nom du commerçant.",
    "Règles ABSOLUES :",
    "- Langue : " + (language === "en" ? "English" : "français") + ".",
    "- Ton : " + toneDirective,
    "- 2 à 4 phrases, jamais plus. Jamais de liste à puces.",
    "- Si le client a laissé son prénom, utilise-le une fois.",
    "- Ne JAMAIS inventer de fait (promotion, rendez-vous, nom) qui n'est pas fourni.",
    "- Ne JAMAIS demander de supprimer ou modifier l'avis.",
    "- Signe par l'équipe/nom du commerçant si fourni.",
    "- Pas de hashtag, pas de lien, pas d'URL.",
    extraContext ? "- Consignes spécifiques du commerçant : " + extraContext : "",
  ]
    .filter(Boolean)
    .join("\n");

  const userPrompt = [
    `Nom du commerce : ${businessName || "(non renseigné)"}`,
    `Note : ${safeReview.rating}/5`,
    `Auteur de l'avis : ${safeReview.author || "(anonyme)"}`,
    `Texte de l'avis :\n${safeReview.comment || "(pas de texte, juste une note)"}`,
    "",
    "Rédige la réponse maintenant (aucun préambule, aucun guillemet, juste le texte de la réponse).",
  ].join("\n");

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 350,
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn({ status: res.status, text: text.slice(0, 200) }, "[gbp-reply-ai] openai error");
      return {
        ok: true,
        reply: buildHeuristicReply({ review: safeReview, businessName }),
        source: "heuristic_fallback",
      };
    }
    const data = await res.json().catch(() => ({}));
    const txt = String(data?.choices?.[0]?.message?.content || "").trim();
    if (!txt) {
      return {
        ok: true,
        reply: buildHeuristicReply({ review: safeReview, businessName }),
        source: "heuristic_fallback",
      };
    }
    return { ok: true, reply: txt, source: "openai" };
  } catch (err) {
    logger.warn({ err }, "[gbp-reply-ai] openai fetch failed");
    return {
      ok: true,
      reply: buildHeuristicReply({ review: safeReview, businessName }),
      source: "heuristic_fallback",
    };
  }
}
