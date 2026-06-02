import { Router } from "express";
import {
  getMatchPredictionEntriesForMatch,
  listMatchPredictionDashboard,
  setMatchPredictionResult,
  updateMatchPredictionConfig,
} from "../../db.js";
import { syncWorldCup2026Matches, ensureWorldCupCatalogSeeded } from "../../lib/world-cup-match-sync.js";
import { pushPassKitUpdateForMember } from "../../lib/passkit-member-push.js";
import {
  blockStaffDashboardWrites,
  ensureDashboardAccess,
} from "./shared.js";

const router = Router({ mergeParams: true });

router.use((req, res, next) => {
  if (!ensureDashboardAccess(req, res, req.business)) return;
  if (!blockStaffDashboardWrites(req, res, req.business)) return;
  next();
});

router.get("/", async (req, res) => {
  ensureWorldCupCatalogSeeded();
  let payload = listMatchPredictionDashboard(req.business.id);
  if (!payload.matches?.length) {
    try {
      await syncWorldCup2026Matches();
      payload = listMatchPredictionDashboard(req.business.id);
    } catch (err) {
      console.warn("[match-predictions] sync CDM:", err?.message || err);
    }
  }
  return res.json(payload);
});

router.patch("/config", (req, res) => {
  const config = updateMatchPredictionConfig(req.business.id, req.body || {});
  if (!config) return res.status(404).json({ error: "Challenge introuvable" });
  return res.json({ ok: true, config });
});

router.get("/matches/:matchId/entries", (req, res) => {
  const entries = getMatchPredictionEntriesForMatch(req.business.id, req.params.matchId);
  return res.json({ entries });
});

router.post("/matches/:matchId/result", async (req, res) => {
  const result = setMatchPredictionResult({
    businessId: req.business.id,
    matchId: req.params.matchId,
    resultChoice: req.body?.result_choice ?? req.body?.resultChoice,
    actorUserId: req.user?.id ?? null,
  });
  if (result?.error === "invalid_choice") return res.status(400).json({ error: "Résultat invalide", code: "INVALID_CHOICE" });
  if (result?.error === "match_not_found") return res.status(404).json({ error: "Match introuvable", code: "MATCH_NOT_FOUND" });
  if (result?.error === "missing_result") return res.status(400).json({ error: "Résultat manquant", code: "MISSING_RESULT" });
  if (result?.error === "result_already_scored") return res.status(409).json({ error: "Résultat déjà scoré. Contactez le support pour une correction.", code: "RESULT_ALREADY_SCORED" });
  if (result?.error) return res.status(400).json({ error: "Scoring impossible", code: String(result.error).toUpperCase() });

  const entries = getMatchPredictionEntriesForMatch(req.business.id, req.params.matchId);
  const winners = entries.filter((entry) => Number(entry.points_awarded) > 0);
  await Promise.allSettled(
    winners.map((entry) => pushPassKitUpdateForMember(req.business.id, entry.member_id, "match_prediction")),
  );
  return res.json({ ...result, winners_count: winners.length });
});

export default router;
