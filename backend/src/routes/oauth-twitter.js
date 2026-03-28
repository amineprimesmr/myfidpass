/**
 * OAuth 2.0 X (Twitter) — liaison compte pro (type Buffer) : callback HTTPS puis redirect myfidpass://social-oauth
 * Variables : TWITTER_OAUTH2_CLIENT_ID, TWITTER_OAUTH2_CLIENT_SECRET (portail developer.x.com)
 */
import { Router } from "express";
import { createHash, randomBytes } from "crypto";
import { getBusinessById, updateBusiness } from "../db/businesses.js";
import { getEngagementRewards } from "../db/engagement.js";

const router = Router();

const TWITTER_CLIENT_ID = process.env.TWITTER_OAUTH2_CLIENT_ID || "";
const TWITTER_CLIENT_SECRET = process.env.TWITTER_OAUTH2_CLIENT_SECRET || "";

/** state -> { codeVerifier, businessId, ts } */
const oauthStates = new Map();

function getPublicApiBase(req) {
  const fromEnv = (process.env.API_URL || "").replace(/\/$/, "").trim();
  if (fromEnv) return fromEnv;
  const proto = (req.get("x-forwarded-proto") || req.protocol || "https").split(",")[0].trim() || "https";
  const host = (req.get("x-forwarded-host") || req.get("host") || "").split(",")[0].trim();
  if (!host) return "";
  const scheme = proto === "http" || proto === "https" ? proto : "https";
  return `${scheme}://${host}`;
}

function base64Url(buf) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function cleanupStates() {
  const now = Date.now();
  for (const [k, v] of oauthStates.entries()) {
    if (now - v.ts > 15 * 60 * 1000) oauthStates.delete(k);
  }
}

/**
 * @param {string} businessId
 * @param {string} apiBase - ex. https://api.myfidpass.fr
 * @returns {{ authorizationUrl: string }}
 */
export function createTwitterAuthorizationUrl(businessId, apiBase) {
  if (!TWITTER_CLIENT_ID || !TWITTER_CLIENT_SECRET) {
    const err = new Error("twitter_oauth_not_configured");
    err.code = "twitter_oauth_not_configured";
    throw err;
  }
  const redirectUri = `${apiBase.replace(/\/$/, "")}/api/oauth/twitter/callback`;
  const codeVerifier = base64Url(randomBytes(32));
  const codeChallenge = base64Url(createHash("sha256").update(codeVerifier).digest());
  const state = base64Url(randomBytes(24));
  cleanupStates();
  oauthStates.set(state, { codeVerifier, businessId, ts: Date.now() });
  const scope = ["users.read", "offline.access"].join(" ");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: TWITTER_CLIENT_ID,
    redirect_uri: redirectUri,
    scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  const authorizationUrl = `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
  return { authorizationUrl };
}

router.get("/twitter/callback", async (req, res) => {
  const redirectApp = "myfidpass://social-oauth";
  try {
    const q = req.query || {};
    if (q.error) {
      return res.redirect(
        302,
        `${redirectApp}?provider=twitter&error=${encodeURIComponent(String(q.error))}`
      );
    }
    const code = q.code;
    const state = q.state;
    if (!code || !state) {
      return res.redirect(302, `${redirectApp}?provider=twitter&error=no_code`);
    }
    cleanupStates();
    const row = oauthStates.get(String(state));
    if (!row) {
      return res.redirect(302, `${redirectApp}?provider=twitter&error=invalid_state`);
    }
    oauthStates.delete(String(state));
    const apiBase = getPublicApiBase(req);
    const redirectUri = `${apiBase.replace(/\/$/, "")}/api/oauth/twitter/callback`;

    const tokenRes = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " + Buffer.from(`${TWITTER_CLIENT_ID}:${TWITTER_CLIENT_SECRET}`, "utf8").toString("base64"),
      },
      body: new URLSearchParams({
        code: String(code),
        grant_type: "authorization_code",
        client_id: TWITTER_CLIENT_ID,
        redirect_uri: redirectUri,
        code_verifier: row.codeVerifier,
      }).toString(),
    });
    const tokenJson = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok) {
      console.error("[oauth/twitter] token exchange failed", tokenRes.status, tokenJson);
      return res.redirect(302, `${redirectApp}?provider=twitter&error=token_exchange`);
    }
    const accessToken = tokenJson.access_token;
    if (!accessToken) {
      return res.redirect(302, `${redirectApp}?provider=twitter&error=no_access_token`);
    }

    const meRes = await fetch("https://api.twitter.com/2/users/me?user.fields=username", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const meJson = await meRes.json().catch(() => ({}));
    if (!meRes.ok || !meJson.data?.username) {
      console.error("[oauth/twitter] users/me failed", meRes.status, meJson);
      return res.redirect(302, `${redirectApp}?provider=twitter&error=user_me`);
    }
    const username = String(meJson.data.username).trim();
    const profileUrl = `https://x.com/${encodeURIComponent(username)}`;

    const business = getBusinessById(row.businessId);
    if (!business) {
      return res.redirect(302, `${redirectApp}?provider=twitter&error=no_business`);
    }

    const rewards = getEngagementRewards(row.businessId);
    const prev = rewards.twitter_follow || {};
    rewards.twitter_follow = {
      ...prev,
      enabled: true,
      points: typeof prev.points === "number" && prev.points > 0 ? prev.points : 10,
      url: profileUrl,
    };
    updateBusiness(row.businessId, { engagement_rewards: rewards });

    return res.redirect(
      302,
      `${redirectApp}?provider=twitter&ok=1&username=${encodeURIComponent(username)}`
    );
  } catch (e) {
    console.error("[oauth/twitter] callback", e);
    return res.redirect(302, `${redirectApp}?provider=twitter&error=callback_exception`);
  }
});

export default router;
export { TWITTER_CLIENT_ID };
