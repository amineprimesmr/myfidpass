import { createHash, createHmac, timingSafeEqual } from "crypto";

const PROOF_SECRET = process.env.ENGAGEMENT_PROOF_SECRET || process.env.JWT_SECRET || "fidpass-proof-secret";
const PROOF_TTL_SECONDS = 30 * 60;

function base64UrlEncode(input) {
  return Buffer.from(input).toString("base64url");
}

function base64UrlDecode(input) {
  return Buffer.from(input, "base64url").toString("utf8");
}

export function hashValue(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

export function buildIpHash(reqOrIp) {
  if (!reqOrIp || typeof reqOrIp !== "object") return null;
  const get = reqOrIp.get;
  if (typeof get !== "function") return null;
  try {
    const xff = get.call(reqOrIp, "x-forwarded-for");
    const raw = (xff ? String(xff).split(",")[0] : reqOrIp.ip || "").trim();
    return raw ? hashValue(raw) : null;
  } catch (_) {
    return null;
  }
}

export function buildDeviceHash(clientFingerprint) {
  if (!clientFingerprint) return null;
  return hashValue(String(clientFingerprint).trim().slice(0, 512));
}

export function signProofToken(payload) {
  const body = base64UrlEncode(JSON.stringify(payload));
  const sig = createHmac("sha256", PROOF_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyProofToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", PROOF_SECRET).update(body).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null;
  try {
    return JSON.parse(base64UrlDecode(body));
  } catch (_) {
    return null;
  }
}

export function getProofTtlSeconds() {
  return PROOF_TTL_SECONDS;
}

export function computeProofScore({ proof, claimIpHash, claimDeviceHash, nowMs = Date.now() }) {
  let score = 0;
  const reasons = [];
  const startedAtMs = Date.parse((proof.created_at || "").replace(" ", "T") + "Z");
  const returnedAtMs = proof.returned_at ? Date.parse(String(proof.returned_at).replace(" ", "T") + "Z") : 0;
  const elapsedSec = Number.isFinite(startedAtMs) ? Math.max(0, (nowMs - startedAtMs) / 1000) : 0;

  if (returnedAtMs > 0) {
    score += 0.45;
    reasons.push("return_callback_ok");
  } else {
    reasons.push("missing_return_callback");
  }

  if (elapsedSec >= 20 && elapsedSec <= PROOF_TTL_SECONDS) {
    score += 0.2;
    reasons.push("elapsed_time_ok");
  } else {
    reasons.push("elapsed_time_suspicious");
  }

  if (proof.start_ip_hash && claimIpHash && proof.start_ip_hash === claimIpHash) {
    score += 0.15;
    reasons.push("ip_match");
  } else {
    reasons.push("ip_mismatch");
  }

  if (proof.start_device_hash && claimDeviceHash && proof.start_device_hash === claimDeviceHash) {
    score += 0.15;
    reasons.push("device_match");
  } else {
    reasons.push("device_mismatch");
  }

  const attempts = Number(proof.attempt_count) || 0;
  if (attempts > 1) {
    score -= 0.25;
    reasons.push("multiple_attempts");
  }

  const normalized = Math.max(0, Math.min(1, Number(score.toFixed(2))));
  const verdict = normalized >= 0.75 ? "approved" : "pending_review";
  return { score: normalized, reasons, verdict, elapsedSec };
}
