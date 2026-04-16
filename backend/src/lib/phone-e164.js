/**
 * Normalisation téléphone → E.164 (priorité France mobile 06/07).
 * @param {string} raw
 * @returns {string | null}
 */
export function normalizePhoneE164(raw) {
  const s0 = String(raw ?? "").trim();
  if (!s0) return null;
  let s = s0.replace(/\s/g, "");
  const digits = s.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;

  // Déjà E.164
  if (s0.startsWith("+")) {
    const d = s.slice(1).replace(/\D/g, "");
    if (d.length >= 8 && d.length <= 15) return `+${d}`;
    return null;
  }

  // France : 06xxxxxxxx / 07xxxxxxxx
  if (digits.length === 10 && digits.startsWith("0") && (digits[1] === "6" || digits[1] === "7")) {
    return `+33${digits.slice(1)}`;
  }

  // 33xxxxxxxxx sans +
  if (digits.length === 11 && digits.startsWith("33")) {
    return `+${digits}`;
  }

  // 9 chiffres après indicatif court (rare) — refuser si ambigu
  return null;
}
