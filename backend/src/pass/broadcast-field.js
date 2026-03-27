/** Apple : changeMessage doit contenir %@ ; sans %@ on ajoute le suffixe pour préserver le préfixe commerce (ex. « Promo : %@ »). */
export function normalizeChangeMessage(customMsg) {
  const c = (customMsg || "").trim();
  if (!c) return "%@";
  if (c.includes("%@")) return c;
  return `${c} %@`;
}

/**
 * Suffixes invisibles (zero-width) pour que la valeur du champ change à chaque envoi,
 * même si le texte affiché est identique (PassKit / Wallet ignorent les doublons stricts).
 * @param {string | null | undefined} lastBroadcastAt
 * @param {number | null | undefined} broadcastSendSeq — incrémenté à chaque `setLastBroadcastMessage` (unicité garantie)
 */
export function invisibleBroadcastSuffix(lastBroadcastAt, broadcastSendSeq) {
  let base = "";
  if (lastBroadcastAt != null && String(lastBroadcastAt).trim() !== "") {
    const s = String(lastBroadcastAt).trim();
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const n = 1 + (h % 6);
    base = "\u200B".repeat(n);
  }
  const seq = Number(broadcastSendSeq);
  if (Number.isFinite(seq) && seq > 0) {
    const a = 1 + (seq % 31);
    const b = 1 + ((Math.floor(seq / 31) | 0) % 17);
    base += "\u200C".repeat(a) + "\u200D".repeat(b);
  }
  return base;
}

/**
 * Valeur du champ verso « Message » (sans date/heure visible).
 * @param {string} rawBroadcast — message brut (déjà limité côté DB)
 * @param {string | null | undefined} lastBroadcastAt — horodatage d’envoi
 * @param {number | null | undefined} broadcastSendSeq — compteur d’envois (même texte → compteur différent → pass distinct)
 */
export function buildLastBroadcastFieldValue(rawBroadcast, lastBroadcastAt, broadcastSendSeq) {
  if (!rawBroadcast) return "—";
  const suffix = invisibleBroadcastSuffix(lastBroadcastAt, broadcastSendSeq);
  const maxRaw = Math.max(0, 200 - suffix.length);
  return `${rawBroadcast.slice(0, maxRaw)}${suffix}`;
}
