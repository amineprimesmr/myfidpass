/**
 * Correspondance texte ticket (livraison) ↔ fiche commerce (nom, enseigne, slug).
 */

function stripDiacritics(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * @param {string} raw
 */
export function normalizeReceiptText(raw) {
  return stripDiacritics(String(raw || "").toLowerCase())
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {object} business Ligne SQLite businesses
 * @param {string} merchantNameOnReceipt
 * @param {string} fullContextText tout texte OCR / résumé pour élargir la recherche
 */
export function merchantNameLikelyMatchesBusiness(business, merchantNameOnReceipt, fullContextText) {
  const blob = normalizeReceiptText(`${merchantNameOnReceipt} ${fullContextText}`);
  if (!blob || blob.length < 3) return false;

  const org = normalizeReceiptText(business?.organization_name || "");
  const name = normalizeReceiptText(business?.name || "");
  const slugWords = normalizeReceiptText(String(business?.slug || "").replace(/-/g, " "));

  /** Au moins un token significatif (≥ 4 caractères) du commerce apparaît dans le ticket. */
  const candidateStrings = [org, name, slugWords].filter((s) => s.length >= 2);
  for (const c of candidateStrings) {
    const tokens = c.split(" ").filter((t) => t.length >= 4);
    for (const t of tokens) {
      if (blob.includes(t)) return true;
    }
  }
  /** Tokens 3 chars pour noms courts (ex. « Joe »). */
  for (const c of candidateStrings) {
    const tokens = c.split(" ").filter((t) => t.length === 3);
    for (const t of tokens) {
      if (blob.includes(t)) return true;
    }
  }
  return false;
}

/**
 * Cohérence adresse ticket ↔ adresse enregistrée du commerce (tokens / code postal).
 * @param {object} business
 * @param {string} extractedAddress
 */
export function receiptAddressLikelyMatchesBusiness(business, extractedAddress) {
  const bizAddr = String(business?.location_address || "").trim();
  const ext = String(extractedAddress || "").trim();
  if (!bizAddr || bizAddr.length < 8) return true;
  if (!ext || ext.length < 6) return false;
  const na = normalizeReceiptText(bizAddr);
  const nb = normalizeReceiptText(ext);
  const postalBiz = (bizAddr.match(/\b\d{5}\b/) || [])[0];
  const postalExt = (ext.match(/\b\d{5}\b/) || [])[0];
  if (postalBiz && postalExt && postalBiz !== postalExt) return false;
  const tokens = na.split(" ").filter((t) => t.length >= 4);
  let hits = 0;
  for (const t of tokens) {
    if (nb.includes(t)) hits++;
  }
  if (hits >= 2) return true;
  if (hits === 1 && tokens.length <= 2) return true;
  const digits = bizAddr.replace(/\D/g, "");
  if (digits.length >= 4 && nb.includes(digits.slice(0, 5))) return true;
  return false;
}
