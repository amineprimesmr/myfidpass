/**
 * Extraction structurée d’un ticket de livraison via OpenAI (vision).
 * Clé : OPENAI_API_KEY (production).
 */

const MAX_SIDE_PX = 1600;

/**
 * @param {string} apiKey
 * @param {string} imageBase64 sans préfixe data:
 * @param {string} mime image/jpeg | image/png | image/webp
 */
export async function extractDeliveryReceiptWithOpenAI({ apiKey, imageBase64, mime = "image/jpeg" }) {
  const key = String(apiKey || "").trim();
  if (key.length < 20) {
    return { ok: false, code: "AI_UNAVAILABLE", error: "Analyse ticket non configurée sur le serveur." };
  }
  const b64 = String(imageBase64 || "").replace(/^data:[^;]+;base64,/, "").trim();
  if (!b64 || b64.length < 80) {
    return { ok: false, code: "INVALID_IMAGE", error: "Image illisible ou trop petite." };
  }
  const dataUrl = `data:${mime};base64,${b64}`;

  const schemaHint = [
    "Tu es un extracteur de données pour des tickets de commande livrée (Uber Eats, Deliveroo, Just Eat, etc.).",
    "Analyse l’image et renvoie UNIQUEMENT un objet JSON valide (pas de markdown) avec les clés :",
    '{ "total_ttc_eur": number|null, "currency": string|null, "receipt_date_iso": string|null (YYYY-MM-DD si tu vois une date),',
    ' "order_reference": string|null (numéro commande / ID visible),',
    ' "merchant_name_on_receipt": string|null (nom du restaurant / commerce sur le ticket),',
    ' "delivery_platform": "uber_eats"|"deliveroo"|"just_eat"|"other"|null,',
    ' "is_likely_food_delivery_receipt": boolean,',
    ' "raw_summary": string (une phrase courte sur ce que tu vois),',
    ' "confidence": number entre 0 et 1 }',
    "Si tu ne vois pas de total TTC clair, mets total_ttc_eur à null et confidence bas.",
    "Les montants européens utilisent souvent la virgule : interprète correctement (ex. 24,90 → 24.9).",
  ].join(" ");

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 600,
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
    const dateIso = json.receipt_date_iso != null ? String(json.receipt_date_iso).trim().slice(0, 10) : "";
    const platform = json.delivery_platform != null ? String(json.delivery_platform).trim().toLowerCase() : "";
    const rawSummary = json.raw_summary != null ? String(json.raw_summary).trim() : "";
    const isDelivery = json.is_likely_food_delivery_receipt === true;

    return {
      ok: true,
      value: {
        totalTtcEur: Number.isFinite(total) && total > 0 ? Math.round(total * 100) / 100 : null,
        currency: json.currency != null ? String(json.currency).trim() : null,
        receiptDateIso: /^\d{4}-\d{2}-\d{2}$/.test(dateIso) ? dateIso : null,
        orderReference: orderRef.slice(0, 120),
        merchantNameOnReceipt: merchantName.slice(0, 200),
        deliveryPlatform: ["uber_eats", "deliveroo", "just_eat", "other"].includes(platform) ? platform : null,
        isLikelyFoodDeliveryReceipt: isDelivery,
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
