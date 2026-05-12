/**
 * POST correction caisse : retire des points (historique + push Wallet si applicable).
 * Partagé entre /members/:id/points/remove et /dashboard/members/:id/points/remove.
 */
import {
  getMemberForBusiness,
  deductPoints,
  createTransaction,
  getPushTokensForMember,
  mergeBusinessAssetsForPass,
} from "../../db.js";
import { sendPassKitUpdate } from "../../apns.js";
import { syncGoogleWalletObjectForMember } from "../../google-wallet.js";
import { ensureOperationalSubscription, getApiBase } from "./shared.js";

async function syncGoogleWalletAfterMemberMutation(member, business, req) {
  const walletBusiness = mergeBusinessAssetsForPass(business);
  try {
    const result = await syncGoogleWalletObjectForMember(member, walletBusiness, getApiBase(req));
    if (!result.ok) {
      console.warn("[Google Wallet] sync correction échouée:", {
        slug: walletBusiness?.slug,
        memberId: member?.id,
        googleStatus: result.googleStatus,
        googleError: result.googleError?.message || result.error,
      });
    }
  } catch (e) {
    console.warn("[Google Wallet] sync correction exception:", {
      slug: walletBusiness?.slug,
      memberId: member?.id,
      error: e?.message || String(e),
    });
  }
}

export async function postMemberPointsRemove(req, res) {
  const business = req.business;
  if (!ensureOperationalSubscription(req, res, business)) return;

  const member = getMemberForBusiness(req.params.memberId, business.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });

  const n = Math.floor(Number(req.body?.points));
  if (!Number.isInteger(n) || n <= 0) {
    return res.status(400).json({
      error: "Indiquez un nombre entier de points à retirer (supérieur à 0).",
      code: "INVALID_POINTS_REMOVE",
    });
  }

  const current = Number(member.points) || 0;
  if (current < n) {
    return res.status(400).json({
      error: `Solde insuffisant (${current} pts). Impossible de retirer ${n} pts.`,
      code: "NOT_ENOUGH_POINTS",
    });
  }

  const updated = deductPoints(member.id, n);
  createTransaction({
    businessId: business.id,
    memberId: member.id,
    type: "points_correction",
    points: -n,
    metadata: { reason: "cashier_correction" },
    actorUserId: req.user?.id,
  });
  const tokens = getPushTokensForMember(member.id);
  for (const token of tokens) {
    try {
      await sendPassKitUpdate(token);
    } catch (_) {
      /* ignore */
    }
  }
  await syncGoogleWalletAfterMemberMutation(updated, business, req);
  res.json({
    id: updated.id,
    points: updated.points,
    points_removed: n,
  });
}
