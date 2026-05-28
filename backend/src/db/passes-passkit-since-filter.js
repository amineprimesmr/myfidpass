/**
 * Logique pure du filtre GET registrations PassKit (`passesUpdatedSince` → 204 ou liste).
 * Extraite pour tests de régression (2 campagnes rapprochées).
 */

export function parsePassUpdatedAt(str) {
  if (!str || typeof str !== "string") return 0;
  const s = str.trim();
  const iso = s.replace(" ", "T").replace(/Z?$/, "Z");
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

export const PASSKIT_SINCE_SLACK_MS = 3500;

export function passesUpdatedSinceCutoffMs(tag) {
  const ts = parsePassUpdatedAt(tag);
  if (!ts) return 0;
  const raw = String(tag).trim();
  const hasSubSecond = /\.\d{1,3}/.test(raw);
  const base = hasSubSecond ? ts : ts - 1000;
  return Math.max(0, base - PASSKIT_SINCE_SLACK_MS);
}

export function effectivePassKitRowUpdateTs(row) {
  const passMs = Number(row.pass_last_modified_ms);
  const passMsOk = Number.isFinite(passMs) && passMs > 0 ? passMs : 0;
  return Math.max(
    parsePassUpdatedAt(row.last_visit_at),
    parsePassUpdatedAt(row.last_broadcast_at),
    parsePassUpdatedAt(row.created_at),
    parsePassUpdatedAt(row.notification_pass_layout_at),
    passMsOk
  );
}

export function passRowPassKitNeedsUpdate(row, sinceMs) {
  const passMs = Number(row.pass_last_modified_ms);
  if (Number.isFinite(passMs) && passMs > sinceMs) return true;
  const broadcastMs = parsePassUpdatedAt(row.last_broadcast_at);
  if (broadcastMs > sinceMs) return true;
  return effectivePassKitRowUpdateTs(row) > sinceMs;
}

/**
 * @param {Array<object>} base — lignes SQL pass_registrations + member + business
 * @param {string|null} passesUpdatedSince
 */
export function filterPassKitRegistrationRows(base, passesUpdatedSince = null) {
  if (!passesUpdatedSince || !String(passesUpdatedSince).trim()) {
    return base;
  }
  const sinceMs = passesUpdatedSinceCutoffMs(String(passesUpdatedSince));
  let list = base.filter((r) => passRowPassKitNeedsUpdate(r, sinceMs));
  if (list.length === 0 && base.length > 0) {
    const recentBroadcast = base.some((r) => {
      const b = parsePassUpdatedAt(r.last_broadcast_at);
      return b > 0 && b >= sinceMs - PASSKIT_SINCE_SLACK_MS;
    });
    if (recentBroadcast) list = base;
  }
  return list;
}
