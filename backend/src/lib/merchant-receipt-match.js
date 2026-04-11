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
