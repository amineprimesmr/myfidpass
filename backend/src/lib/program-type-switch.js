/**
 * Bascule Points ↔ Tampons : alignement config commerce (sans accès DB).
 */

function normalizeProgramType(raw) {
  const pt = String(raw ?? "").trim().toLowerCase();
  if (pt === "stamps" || pt === "tampons") return "stamps";
  if (pt === "points" || pt === "point") return "points";
  return null;
}

function resolveProgramType(business) {
  return normalizeProgramType(business?.program_type) ?? "points";
}

function resolveNextProgramType(business, nextRaw) {
  return normalizeProgramType(nextRaw) ?? resolveProgramType({ ...business, program_type: nextRaw });
}

function welcomeBonusExplicitInBody(body = {}) {
  return body.welcome_bonus_amount !== undefined || body.welcomeBonusAmount !== undefined;
}

/**
 * Applique les side-effects PATCH quand `program_type` change (mutate `updates`).
 * @returns {{ switched: boolean, prevType: string, nextType: string }}
 */
export function applyProgramTypeSwitchSideEffects(business, updates, body = {}) {
  if (updates.program_type === undefined) {
    const t = resolveProgramType(business);
    return { switched: false, prevType: t, nextType: t };
  }
  const prevType = resolveProgramType(business);
  const nextType = resolveNextProgramType(business, updates.program_type);
  if (prevType === nextType) {
    return { switched: false, prevType, nextType };
  }

  if (nextType === "stamps") {
    if (updates.points_reward_tiers === undefined) {
      updates.points_reward_tiers = null;
    }
    updates.loyalty_mode = "points_cash";
    if (updates.required_stamps === undefined) {
      const rs = Number(business.required_stamps);
      updates.required_stamps = Number.isInteger(rs) && rs > 0 ? rs : 10;
    }
    if (updates.welcome_bonus_amount === undefined && !welcomeBonusExplicitInBody(body)) {
      updates.welcome_bonus_amount = 1;
    }
    if (updates.welcome_bonus_enabled === undefined && business.welcome_bonus_enabled == null) {
      updates.welcome_bonus_enabled = 1;
    }
  } else {
    updates.loyalty_mode = "points_cash";
    if (updates.points_per_euro === undefined) {
      const pe = Number(business.points_per_euro);
      updates.points_per_euro = Number.isFinite(pe) && pe >= 0 ? String(pe) : "1";
    }
    if (updates.points_per_visit === undefined) {
      const pv = Number(business.points_per_visit);
      updates.points_per_visit = Number.isFinite(pv) && pv >= 0 ? String(pv) : "0";
    }
    if (updates.welcome_bonus_amount === undefined && !welcomeBonusExplicitInBody(body)) {
      updates.welcome_bonus_amount = 10;
    }
  }

  return { switched: true, prevType, nextType };
}

/** Calcule le nombre de tampons accordés au bonus bienvenue (tests + doc). */
export function computeWelcomeStampGrantAmount(configuredAmount, cycleSize) {
  const cycle = Math.max(1, Math.floor(Number(cycleSize) || 10));
  const raw = Number(configuredAmount);
  let configured = Number.isInteger(raw) && raw > 0 ? raw : 1;
  if (configured === 10 && raw === 10) configured = 1;
  return Math.min(Math.max(1, configured), cycle);
}
