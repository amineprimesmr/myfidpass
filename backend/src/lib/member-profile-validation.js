/**
 * Validation des champs « profil client » (bonus ticket). Référence : REFONTE-REGLES.md.
 */

const PHONE_MIN = 8;
const PHONE_MAX = 22;
const CITY_MIN = 2;
const CITY_MAX = 80;

/**
 * @param {{ phone?: string, city?: string, birth_date?: string }} body
 * @returns {{ ok: true, phone: string, city: string, birth_date: string } | { ok: false, error: string, code?: string }}
 */
export function validateMemberProfilePayload(body) {
  const rawPhone = String(body?.phone ?? "").replace(/\s/g, "");
  const city = String(body?.city ?? "").trim();
  const birthRaw = String(body?.birth_date ?? body?.birthDate ?? "").trim();

  if (rawPhone.length < PHONE_MIN || rawPhone.length > PHONE_MAX) {
    return { ok: false, error: "Numéro de téléphone invalide (8 à 22 caractères, espaces ignorés).", code: "INVALID_PHONE" };
  }
  if (!/^[\d+().-]+$/.test(rawPhone)) {
    return { ok: false, error: "Numéro de téléphone : chiffres et symboles usuels uniquement.", code: "INVALID_PHONE" };
  }

  if (city.length < CITY_MIN || city.length > CITY_MAX) {
    return { ok: false, error: `Ville : entre ${CITY_MIN} et ${CITY_MAX} caractères.`, code: "INVALID_CITY" };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthRaw)) {
    return { ok: false, error: "Date de naissance au format AAAA-MM-JJ.", code: "INVALID_BIRTH_DATE" };
  }
  const [y, mo, d] = birthRaw.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return { ok: false, error: "Date de naissance invalide.", code: "INVALID_BIRTH_DATE" };
  }
  const now = new Date();
  if (dt > now) {
    return { ok: false, error: "Date de naissance dans le futur.", code: "INVALID_BIRTH_DATE" };
  }
  const ageYears = (now.getTime() - dt.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (ageYears < 13) {
    return { ok: false, error: "Réservé aux 13 ans et plus.", code: "INVALID_BIRTH_DATE" };
  }
  if (ageYears > 120) {
    return { ok: false, error: "Date de naissance invalide.", code: "INVALID_BIRTH_DATE" };
  }

  return { ok: true, phone: rawPhone, city, birth_date: birthRaw };
}
