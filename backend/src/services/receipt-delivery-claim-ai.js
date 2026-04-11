/**
 * Extraction + validation ticket livraison via OpenAI (vision).
 * Contexte commerce (nom, adresse) envoyé pour vérifier que le ticket correspond.
 */

const MAX_SIDE_PX = 1600;

/**
 * @param {object} p
 * @param {string} p.apiKey
 * @param {string} p.imageBase64 sans préfixe data:
 * @param {string} [p.mime]
 * @param {{ organizationName?: string, businessName?: string, locationAddress?: string }} [p.businessContext]
 */
export async function extractDeliveryReceiptWithOpenAI({ apiKey, imageBase64, mime = "image/jpeg", businessContext = {} }) {
  const key = String(apiKey || "").trim();
  if (key.length < 20) {
    return { ok: false, code: "AI_UNAVAILABLE", error: "Analyse ticket non configurée sur le serveur." };
  }
  const b64 = String(imageBase64 || "").replace(/^data:[^;]+;base64,/, "").trim();
  if (!b64 || b64.length < 80) {
    return { ok: false, code: "INVALID_IMAGE", error: "Image illisible ou trop petite." };
  }
  const dataUrl = `data:${mime};base64,${b64}`;

  const org = String(businessContext.organizationName || "").trim() || "(non renseigné)";
  const bname = String(businessContext.businessName || "").trim();
  const addr = String(businessContext.locationAddress || "").trim() || "(aucune adresse enregistrée pour ce commerce — indique null pour matches_expected_address si tu ne peux pas vérifier)";

  const schemaHint = [
    "Tu analyses un ticket ou une preuve de commande LIVRAISON (Uber Eats, Deliveroo, etc.).",
    "",
    "CONTEXTE — ce document doit correspondre à CE commerce pour valider des points fidélité :",
    `- Nom affiché programme (organization_name) : ${org}`,
    bname && bname !== org ? `- Nom interne commerce : ${bname}` : "",
    `- Adresse enregistrée du commerce (référence) : ${addr}`,
    "",
    "Règles strictes :",
    "- Extrais total TTC en euros (number), date du ticket si visible (receipt_date_iso YYYY-MM-DD), nom du restaurant / commerce sur le ticket, adresse visible sur le ticket (merchant_address_on_receipt, texte brut ou null).",
    "- matches_expected_merchant: true UNIQUEMENT si le commerce / restaurant sur le ticket est clairement le même que celui du contexte (nom reconnaissable, même enseigne). Sinon false.",
    "- matches_expected_address: true si une adresse sur le ticket est cohérente avec l’adresse de référence (même rue, code postal, ville — tolère légères variations). false si clairement une autre adresse. null si pas d’adresse lisible sur le ticket OU si le commerce n’a pas d’adresse de référence utile.",
    "- is_likely_food_delivery_receipt: true si c’est bien une commande livrée / ticket plateforme.",
    "- receipt_appears_legitimate: true si le document ressemble à un vrai ticket (pas un montage évident).",
    "",
    "Renvoie UNIQUEMENT un JSON (pas de markdown) :",
    '{ "total_ttc_eur": number|null, "currency": string|null, "receipt_date_iso": string|null,',
    ' "order_reference": string|null, "merchant_name_on_receipt": string|null,',
    ' "merchant_address_on_receipt": string|null,',
    ' "delivery_platform": "uber_eats"|"deliveroo"|"just_eat"|"other"|null,',
    ' "is_likely_food_delivery_receipt": boolean, "receipt_appears_legitimate": boolean,',
    ' "matches_expected_merchant": boolean, "matches_expected_address": boolean|null,',
    ' "raw_summary": string, "confidence": number 0..1 }',
    "Montants : virgule décimale européenne → nombre (ex. 24,90 → 24.9).",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 700,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: schemaHint },
              { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
            ],
          },
        ],
      }),
    });
    if (!resp.ok) {
      const errTxt = await resp.text().catch(() => "");
      return {
        ok: false,
        code: "AI_ERROR",
        error: `Analyse automatique indisponible (${resp.status}). ${errTxt.slice(0, 120)}`,
      };
    }
    const data = await resp.json();
    const raw = data?.choices?.[0]?.message?.content;
    if (!raw || typeof raw !== "string") {
      return { ok: false, code: "AI_PARSE", error: "Réponse d’analyse invalide." };
    }
    const json = JSON.parse(raw.trim());
    const total = json.total_ttc_eur != null ? Number(json.total_ttc_eur) : NaN;
    const confidence = Math.max(0, Math.min(1, Number(json.confidence) || 0));
    const orderRef = json.order_reference != null ? String(json.order_reference).trim() : "";
    const merchantName =
      json.merchant_name_on_receipt != null ? String(json.merchant_name_on_receipt).trim() : "";
    const merchantAddr =
      json.merchant_address_on_receipt != null ? String(json.merchant_address_on_receipt).trim() : "";
    const dateIso = json.receipt_date_iso != null ? String(json.receipt_date_iso).trim().slice(0, 10) : "";
    const platform = json.delivery_platform != null ? String(json.delivery_platform).trim().toLowerCase() : "";
    const rawSummary = json.raw_summary != null ? String(json.raw_summary).trim() : "";
    const isDelivery = json.is_likely_food_delivery_receipt === true;
    const legit = json.receipt_appears_legitimate === true;
    const matchM = json.matches_expected_merchant === true;
    let matchA = null;
    if (json.matches_expected_address === true) matchA = true;
    else if (json.matches_expected_address === false) matchA = false;
    else matchA = null;

    return {
      ok: true,
      value: {
        totalTtcEur: Number.isFinite(total) && total > 0 ? Math.round(total * 100) / 100 : null,
        currency: json.currency != null ? String(json.currency).trim() : null,
        receiptDateIso: /^\d{4}-\d{2}-\d{2}$/.test(dateIso) ? dateIso : null,
        orderReference: orderRef.slice(0, 120),
        merchantNameOnReceipt: merchantName.slice(0, 200),
        merchantAddressOnReceipt: merchantAddr.slice(0, 400),
        deliveryPlatform: ["uber_eats", "deliveroo", "just_eat", "other"].includes(platform) ? platform : null,
        isLikelyFoodDeliveryReceipt: isDelivery,
        receiptAppearsLegitimate: legit,
        matchesExpectedMerchant: matchM,
        matchesExpectedAddress: matchA,
        rawSummary: rawSummary.slice(0, 400),
        confidence,
      },
    };
  } catch (e) {
    return {
      ok: false,
      code: "AI_ERROR",
      error: e?.message || "Erreur lors de l’analyse du ticket.",
    };
  }
}

export { MAX_SIDE_PX };
