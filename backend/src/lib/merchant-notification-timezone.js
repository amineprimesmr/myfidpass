/**
 * Fuseau horaire commerçant pour campagnes `daily_at` / `once_at` / anniversaires.
 * Défaut Europe/Paris (produit FR) ; surcharge via MERCHANT_NOTIFICATION_TZ.
 */

export function getMerchantNotificationTimezone() {
  const tz = String(process.env.MERCHANT_NOTIFICATION_TZ || "Europe/Paris").trim();
  return tz || "Europe/Paris";
}

/**
 * @param {Date} [date]
 * @param {string} [timeZone]
 * @returns {{ year: number; month: number; day: number; hour: number; minute: number; ymd: string; md: string }}
 */
export function getZonedCalendarParts(date = new Date(), timeZone = getMerchantNotificationTimezone()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  );
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const ymd = `${String(year).padStart(4, "0")}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
  const md = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { year, month, day, hour, minute, ymd, md };
}

/** Fenêtre après l’heure cible (cron ~1 min) : évite de rater le créneau. */
const DAILY_AT_GRACE_MINUTES = 3;

/**
 * @param {string} eventType — ex. daily_at:09:30
 */
export function shouldRunDailyAtNow(eventType, now = new Date(), timeZone = getMerchantNotificationTimezone()) {
  const m = /^daily_at:(\d{2}):(\d{2})$/.exec(String(eventType || ""));
  if (!m) return false;
  const targetH = Number(m[1]);
  const targetM = Number(m[2]);
  if (!Number.isFinite(targetH) || !Number.isFinite(targetM)) return false;
  const { hour, minute } = getZonedCalendarParts(now, timeZone);
  const nowMinutes = hour * 60 + minute;
  const targetMinutes = targetH * 60 + targetM;
  return nowMinutes >= targetMinutes && nowMinutes <= targetMinutes + DAILY_AT_GRACE_MINUTES;
}

/**
 * @param {string} eventType — ex. once_at:2026-06-06T09:30
 */
export function shouldRunOnceAtNow(eventType, now = new Date(), timeZone = getMerchantNotificationTimezone()) {
  const m = /^once_at:(\d{4})-(\d{2})-(\d{2})[tT](\d{2}):(\d{2})$/.exec(String(eventType || ""));
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const hh = Number(m[4]);
  const mm = Number(m[5]);
  const { year, month, day, hour, minute } = getZonedCalendarParts(now, timeZone);
  if (year !== y || month !== mo || day !== d) return false;
  const nowMinutes = hour * 60 + minute;
  const targetMinutes = hh * 60 + mm;
  return nowMinutes >= targetMinutes && nowMinutes <= targetMinutes + DAILY_AT_GRACE_MINUTES;
}
