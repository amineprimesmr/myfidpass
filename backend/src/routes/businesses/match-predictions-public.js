import { Router } from "express";
import {
  getMemberForBusiness,
  listMatchPredictionMatchesForMember,
  submitMatchPrediction,
} from "../../db.js";

const router = Router({ mergeParams: true });

router.get("/matches", (req, res) => {
  const memberId = String(req.query.memberId || "").trim();
  const data = listMatchPredictionMatchesForMember(req.business.id, memberId || null);
  return res.json(data);
});

router.post("/matches/:matchId/predictions", (req, res) => {
  const memberId = String(req.body?.memberId || req.body?.member_id || "").trim();
  if (!memberId) return res.status(400).json({ error: "memberId requis", code: "MEMBER_ID_REQUIRED" });
  const result = submitMatchPrediction({
    businessId: req.business.id,
    memberId,
    matchId: req.params.matchId,
    choice: req.body?.choice ?? req.body?.predicted_choice,
  });
  if (result?.error === "challenge_disabled") return res.status(400).json({ error: "Challenge désactivé", code: "CHALLENGE_DISABLED" });
  if (result?.error === "member_not_found") return res.status(404).json({ error: "Membre introuvable", code: "MEMBER_NOT_FOUND" });
  if (result?.error === "match_not_found") return res.status(404).json({ error: "Match introuvable", code: "MATCH_NOT_FOUND" });
  if (result?.error === "match_locked") return res.status(423).json({ error: "Pronostics verrouillés pour ce match", code: "MATCH_LOCKED" });
  if (result?.error === "invalid_choice") return res.status(400).json({ error: "Pronostic invalide", code: "INVALID_CHOICE" });
  if (result?.error) return res.status(400).json({ error: "Pronostic impossible", code: String(result.error).toUpperCase() });
  return res.json({ ok: true, match: result.entry });
});

router.get("/", (req, res) => {
  const memberId = String(req.params.memberId || "").trim();
  const member = getMemberForBusiness(memberId, req.business.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable", code: "MEMBER_NOT_FOUND" });
  return res.json(listMatchPredictionMatchesForMember(req.business.id, memberId));
});

export default router;
