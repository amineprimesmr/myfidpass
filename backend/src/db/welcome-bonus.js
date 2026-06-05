/**
 * Bonus d'inscription : 10 points (mode points) ou 1 tampon (mode tampons) accordés une seule fois
 * à la première enregistrement PassKit Wallet du membre.
 */
import { getDb } from "./connection.js";
import { addPoints, addStampsWithCycleRollover } from "./members.js";
import { createTransaction } from "./transactions.js";
import { computeWelcomeStampGrantAmount } from "../lib/program-type-switch.js";

const db = getDb();

/**
 * Accorde le bonus d'inscription si toutes les conditions sont réunies :
 * - Le commerce a `welcome_bonus_enabled = 1`
 * - Aucune transaction `welcome_bonus` n'existe déjà pour ce membre × commerce
 * @returns {{ type: "points"|"stamps", amount: number } | null}
 */
/**
 * @param {object} business
 * @param {string} memberId
 * @param {{ source?: string }} [opts] — ex. `web_signup`, `wallet_register`
 */
export function grantWelcomeBonusIfEligible(business, memberId, opts = {}) {
  if (!business?.id || !memberId) return null;
  if (Number(business.welcome_bonus_enabled) !== 1) return null;

  const already = db
    .prepare(
      "SELECT 1 FROM transactions WHERE business_id = ? AND member_id = ? AND type = 'welcome_bonus' LIMIT 1",
    )
    .get(business.id, memberId);
  if (already) return null;

  const programType = (business.program_type || "").toLowerCase();
  const rawAmount = Number(business.welcome_bonus_amount);
  const defaultAmount = programType === "stamps" ? 1 : 10;
  const configuredAmount = Number.isInteger(rawAmount) && rawAmount > 0 ? rawAmount : defaultAmount;

  if (programType === "stamps") {
    const cycleSize =
      business.required_stamps != null && Number(business.required_stamps) > 0
        ? Math.floor(Number(business.required_stamps))
        : 10;
    const stampAmount = computeWelcomeStampGrantAmount(configuredAmount, cycleSize);
    const r = addStampsWithCycleRollover(memberId, stampAmount, cycleSize);
    if (!r.member) return null;
    createTransaction({
      businessId: business.id,
      memberId,
      type: "welcome_bonus",
      points: r.rawAdded,
      metadata: { source: opts.source || "wallet_register", mode: "stamps", amount_granted: r.rawAdded },
    });
    return { type: "stamps", amount: r.rawAdded };
  }

  // mode points (défaut)
  addPoints(memberId, configuredAmount);
  createTransaction({
    businessId: business.id,
    memberId,
    type: "welcome_bonus",
    points: configuredAmount,
    metadata: { source: opts.source || "wallet_register", mode: "points", amount_granted: configuredAmount },
  });
  return { type: "points", amount: configuredAmount };
}
