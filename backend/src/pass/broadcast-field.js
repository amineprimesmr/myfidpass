/**
 * Apple : changeMessage doit contenir %@ ; sans %@ on ajoute « préfixe + %@ » (ex. « Promo : %@ »).
 * Si le commerce a recopié le message diffusé comme « modèle » sans %@, éviter « texte %@ » + valeur identique
 * → « G La dalle G La dalle » dans Wallet.
 *
 * @param {string | null | undefined} rawBroadcast — dernier message diffusé (sans suffixe PassKit)
 */
export function normalizeChangeMessage(customMsg, rawBroadcast) {
  const c = (customMsg || "").trim();
  const raw = rawBroadcast != null ? String(rawBroadcast).trim() : "";
  if (!c) return "%@";
  if (c.includes("%@")) return c;
  if (raw && c === raw) return "%@";
  return `${c} %@`;
}

/**
 * Suffixe d’unicité PassKit : **toujours** appliqué dès qu’il y a un message (texte inchangé ou nouveau).
 * Combine (1) horodatage d’envoi (2) empreinte du texte brut (3) compteur d’envoi.
 * Ainsi le fichier pass.json diffère à chaque campagne, même si le texte visible est identique,
 * et la même pipeline s’applique quand le texte change.
 *
 * @param {string} rawBroadcast — message brut (non vide)
 * @param {string | null | undefined} lastBroadcastAt
 * @param {number | null | undefined} broadcastSendSeq
 */
export function buildBroadcastUniquenessSuffix(rawBroadcast, lastBroadcastAt, broadcastSendSeq) {
  const raw = rawBroadcast != null ? String(rawBroadcast).trim() : "";
  if (!raw) return "";

  let out = "";

  if (lastBroadcastAt != null && String(lastBroadcastAt).trim() !== "") {
    const s = String(lastBroadcastAt).trim();
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const n = 1 + (h % 6);
    out += "\u200B".repeat(n);
  }

  let ch = 0;
  for (let i = 0; i < raw.length; i++) ch = (ch * 31 + raw.charCodeAt(i)) >>> 0;
  const m = 2 + (ch % 7);
  const pick = ch % 3;
  const zw = pick === 0 ? "\u200B" : pick === 1 ? "\u200C" : "\u200D";
  out += zw.repeat(m);

  let seq = Number(broadcastSendSeq);
  if (!Number.isFinite(seq) || seq < 0) seq = 0;
  const a = 1 + (seq % 31);
  const b = 1 + ((Math.floor(seq / 31) | 0) % 17);
  out += "\u200C".repeat(a) + "\u200D".repeat(b);

  return out;
}

/**
 * Valeur du champ « Message » (verso / face) : texte visible + suffixe d’unicité **systématique**.
 * @param {string} rawBroadcast — message brut (déjà limité côté appelant si besoin)
 * @param {string | null | undefined} lastBroadcastAt — horodatage d’envoi
 * @param {number | null | undefined} broadcastSendSeq — compteur d’envois
 */
export function buildLastBroadcastFieldValue(rawBroadcast, lastBroadcastAt, broadcastSendSeq) {
  if (!rawBroadcast) return "—";
  const raw = String(rawBroadcast).trim();
  if (!raw) return "—";

  const suffix = buildBroadcastUniquenessSuffix(raw, lastBroadcastAt, broadcastSendSeq);
  const maxRaw = Math.max(0, 200 - suffix.length);
  return `${raw.slice(0, maxRaw)}${suffix}`;
}
