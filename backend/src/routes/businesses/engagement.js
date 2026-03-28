/**
 * Engagement : actions publiques, start, return, claim-auto, claim.
 * Référence : REFONTE-REGLES.md — max 15 routes par fichier.
 */
import { Router } from "express";
import { randomUUID } from "crypto";
import {
  getMemberForBusiness,
  getEngagementRewards,
  businessUsesTicketBonuses,
  createEngagementCompletion,
  createEngagementProof,
  getEngagementProofByTokenHash,
  markEngagementProofReturned,
  incrementEngagementProofAttempts,
  finalizeEngagementProof,
  countRecentEngagementProofStarts,
} from "../../db.js";
import {
  buildIpHash,
  buildDeviceHash,
  hashValue,
  signProofToken,
  verifyProofToken,
  getProofTtlSeconds,
  computeProofScore,
} from "../../services/engagement-proof.js";
import { getApiBase, checkStartRateLimit } from "./shared.js";

export function engagementActionsHandler(req, res) {
  const business = req.business;
  const rewards = getEngagementRewards(business.id);
  const actions = [];
  if (rewards.google_review?.enabled && rewards.google_review?.place_id && rewards.google_review?.points > 0) {
    actions.push({
      action_type: "google_review",
      label: "Laisser un avis Google",
      points: 1,
      url: `https://search.google.com/local/writereview?placeid=${encodeURIComponent(rewards.google_review.place_id.trim())}`,
      require_approval: false,
      auto_verify_enabled: rewards.google_review.auto_verify_enabled !== false,
    });
  }
  if (businessUsesTicketBonuses(business.id)) {
    actions.unshift({
      action_type: "profile_complete",
      label: "Complète ton profil",
      points: 1,
      url: "#",
    });
  }
  [
    "instagram_follow",
    "tiktok_follow",
    "facebook_follow",
    "twitter_follow",
    "snapchat_follow",
    "linkedin_follow",
    "youtube_follow",
    "trustpilot_review",
    "tripadvisor_review",
  ].forEach((key) => {
    const c = rewards[key];
    if (c?.enabled && c?.url && c?.points > 0) {
      const labels = {
        instagram_follow: "Nous suivre sur Instagram",
        tiktok_follow: "Nous suivre sur TikTok",
        facebook_follow: "Nous suivre sur Facebook",
        twitter_follow: "Nous suivre sur X (Twitter)",
        snapchat_follow: "Nous suivre sur Snapchat",
        linkedin_follow: "Nous suivre sur LinkedIn",
        youtube_follow: "S’abonner sur YouTube",
        trustpilot_review: "Laisser un avis Trustpilot",
        tripadvisor_review: "Laisser un avis TripAdvisor",
      };
      actions.push({
        action_type: key,
        label: labels[key] || key,
        points: 1,
        url: String(c.url).trim(),
      });
    }
  });
  res.json({ actions });
}

const engagementRouter = Router();

engagementRouter.post("/start", (req, res) => {
  const business = req.business;
  const slug = req.params.slug;
  const { memberId, action_type: actionType, client_fingerprint: clientFingerprint } = req.body || {};
  if (!memberId || !actionType) {
    return res.status(400).json({ error: "memberId et action_type requis" });
  }
  if (actionType !== "google_review") {
    return res.status(400).json({ error: "Action non supportée en auto-vérification V1." });
  }
  const member = getMemberForBusiness(memberId, business.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });

  const rewards = getEngagementRewards(business.id);
  const cfg = rewards?.google_review || {};
  if (!cfg.enabled || !cfg.place_id) {
    return res.status(400).json({ error: "Action Google non activée pour ce commerce." });
  }
  if (cfg.auto_verify_enabled === false) {
    return res.status(400).json({ error: "Auto-vérification désactivée par le commerce." });
  }

  const ipHash = buildIpHash(req);
  if (!checkStartRateLimit(ipHash)) {
    return res.status(429).json({ error: "Trop de tentatives. Réessayez dans 1 minute." });
  }
  const recentStarts = countRecentEngagementProofStarts({
    businessId: business.id,
    memberId,
    actionType,
    sinceMinutes: 5,
  });
  if (recentStarts >= 5) {
    return res.status(429).json({ error: "Trop de tentatives rapprochées pour cette action." });
  }

  const proofId = randomUUID();
  const nonce = randomUUID().replace(/-/g, "");
  const issuedAt = Date.now();
  const ttlSeconds = getProofTtlSeconds();
  const expiresAtIso = new Date(issuedAt + ttlSeconds * 1000).toISOString();
  const payload = {
    pid: proofId,
    bid: business.id,
    mid: memberId,
    act: actionType,
    nonce,
    iat: issuedAt,
  };
  const proofToken = signProofToken(payload);
  const tokenHash = hashValue(proofToken);
  const deviceHash = buildDeviceHash(clientFingerprint);
  createEngagementProof({
    id: proofId,
    businessId: business.id,
    memberId,
    actionType,
    nonce,
    tokenHash,
    expiresAt: expiresAtIso,
    startIpHash: ipHash,
    startDeviceHash: deviceHash,
  });

  const apiBase = getApiBase(req);
  const openUrl = `${apiBase}/api/businesses/${encodeURIComponent(slug)}/engagement/return?token=${encodeURIComponent(proofToken)}`;
  res.status(201).json({
    proof_token: proofToken,
    open_url: openUrl,
    expires_in_sec: ttlSeconds,
    action_type: actionType,
  });
});

engagementRouter.get("/return", (req, res) => {
  const business = req.business;
  const token = (req.query.token || "").toString();
  const parsed = verifyProofToken(token);
  if (!parsed || parsed.bid !== business.id || parsed.act !== "google_review" || !parsed.pid) {
    return res.status(400).send("Lien de vérification invalide.");
  }
  const tokenHash = hashValue(token);
  const proof = getEngagementProofByTokenHash(tokenHash);
  if (!proof || proof.id !== parsed.pid || proof.business_id !== business.id) {
    return res.status(400).send("Preuve introuvable.");
  }
  const expiresAtMs = Date.parse(String(proof.expires_at || ""));
  if (!Number.isFinite(expiresAtMs) || expiresAtMs < Date.now()) {
    return res.status(410).send("Lien expiré. Recommencez l'action depuis votre carte.");
  }
  markEngagementProofReturned(proof.id, buildIpHash(req));
  const rewards = getEngagementRewards(business.id);
  const placeId = rewards?.google_review?.place_id;
  if (!placeId) return res.status(400).send("Place ID Google manquant.");
  const googleUrl = `https://search.google.com/local/writereview?placeid=${encodeURIComponent(String(placeId).trim())}`;
  return res.redirect(302, googleUrl);
});

engagementRouter.post("/claim-auto", (req, res) => {
  const business = req.business;
  const { memberId, action_type: actionType, proof_token: proofToken, client_fingerprint: clientFingerprint } = req.body || {};
  if (!memberId || !actionType || !proofToken) {
    return res.status(400).json({ error: "memberId, action_type et proof_token requis" });
  }
  if (actionType !== "google_review") {
    return res.status(400).json({ error: "Action non supportée en auto-vérification V1." });
  }
  const member = getMemberForBusiness(memberId, business.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });

  const parsed = verifyProofToken(proofToken);
  if (!parsed || parsed.bid !== business.id || parsed.mid !== memberId || parsed.act !== actionType) {
    return res.status(400).json({ error: "Preuve invalide." });
  }
  const tokenHash = hashValue(proofToken);
  const proof = getEngagementProofByTokenHash(tokenHash);
  if (!proof || proof.id !== parsed.pid || proof.business_id !== business.id || proof.member_id !== memberId) {
    return res.status(400).json({ error: "Preuve introuvable." });
  }
  if (proof.status === "claimed_approved" || proof.status === "claimed_pending_review") {
    return res.status(400).json({ error: "Cette preuve a déjà été utilisée." });
  }
  const expiresAtMs = Date.parse(String(proof.expires_at || ""));
  if (!Number.isFinite(expiresAtMs) || expiresAtMs < Date.now()) {
    return res.status(410).json({ error: "Preuve expirée. Recommencez l'action.", code: "proof_expired" });
  }

  const proofAfterAttempt = incrementEngagementProofAttempts(proof.id);
  const claimIpHash = buildIpHash(req);
  const claimDeviceHash = buildDeviceHash(clientFingerprint);
  const scored = computeProofScore({
    proof: proofAfterAttempt || proof,
    claimIpHash,
    claimDeviceHash,
    nowMs: Date.now(),
  });

  const completionResult = createEngagementCompletion(business.id, memberId, actionType, {
    proofId: proof.id,
    proofScore: scored.score,
  });
  if (completionResult.error === "already_done") {
    finalizeEngagementProof({
      proofId: proof.id,
      status: "claimed_rejected",
      score: scored.score,
      reasons: [...scored.reasons, "already_done"],
      claimIpHash,
      claimDeviceHash,
    });
    return res.status(400).json({ error: "Action déjà réalisée récemment.", code: "already_done" });
  }
  if (completionResult.error) {
    return res.status(400).json({ error: "Impossible de traiter la demande." });
  }

  finalizeEngagementProof({
    proofId: proof.id,
    status: "claimed_approved",
    score: scored.score,
    reasons: scored.reasons,
    completionId: completionResult.completion.id,
    claimIpHash,
    claimDeviceHash,
  });

  const ticketsGranted = completionResult.ticketsGranted ?? 0;
  return res.status(201).json({
    completion_id: completionResult.completion.id,
    status: completionResult.status,
    points_granted: completionResult.pointsGranted ?? 0,
    tickets_granted: ticketsGranted,
    score: scored.score,
    message:
      ticketsGranted > 0
        ? `${ticketsGranted} ticket${ticketsGranted > 1 ? "s" : ""} ajouté${ticketsGranted > 1 ? "s" : ""} automatiquement.`
        : "C'est enregistré.",
  });
});

engagementRouter.post("/claim", (req, res) => {
  const business = req.business;
  const { memberId, action_type: actionType } = req.body || {};
  if (!memberId || !actionType) {
    return res.status(400).json({ error: "memberId et action_type requis" });
  }
  const member = getMemberForBusiness(memberId, business.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });
  const result = createEngagementCompletion(business.id, memberId, actionType, {});
  if (result.error === "action_disabled") {
    return res.status(400).json({ error: "Cette action n'est pas activée." });
  }
  if (result.error === "already_done") {
    return res.status(400).json({ error: "Vous avez déjà effectué cette action.", code: "already_done" });
  }
  const ticketsGranted = result.ticketsGranted ?? 0;
  res.status(201).json({
    completion_id: result.completion.id,
    status: result.status,
    points_granted: result.pointsGranted ?? 0,
    tickets_granted: ticketsGranted,
    message:
      ticketsGranted > 0
        ? `${ticketsGranted} ticket${ticketsGranted > 1 ? "s" : ""} ajouté${ticketsGranted > 1 ? "s" : ""} à ta carte.`
        : "C'est enregistré.",
  });
});

export { engagementRouter };
