/**
 * Démarrages OAuth réseaux (dashboard JWT) — URLs pour ASWebAuthenticationSession.
 */
import { Router } from "express";
import {
  buildFacebookOAuthAuthorizeUrl,
  getDefaultMetaRedirectUri,
  isMetaOAuthConfigured,
  signMetaOAuthState,
} from "../../services/meta-instagram-oauth.js";
import {
  buildGoogleYouTubeAuthorizeUrl,
  getYouTubeRedirectUri,
  isYouTubeOAuthConfigured,
  signYouTubeOAuthState,
} from "../../services/google-youtube-oauth.js";
import {
  buildTikTokAuthorizeUrl,
  getTikTokRedirectUri,
  isTikTokOAuthConfigured,
  signTikTokOAuthState,
} from "../../services/tiktok-oauth.js";
import { ensureDashboardAccess } from "./shared.js";

const router = Router({ mergeParams: true });

router.get("/social-oauth/meta/start", (req, res) => {
  if (!req.business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!ensureDashboardAccess(req, res, req.business)) return;
  if (!isMetaOAuthConfigured()) {
    return res.status(503).json({
      error: "meta_oauth_non_configure",
      meta_oauth_available: false,
      hint: "META_APP_ID, META_APP_SECRET, API_URL.",
    });
  }
  const redirectUri = getDefaultMetaRedirectUri();
  if (!redirectUri) {
    return res.status(503).json({
      error: "api_url_manquant",
      meta_oauth_available: false,
    });
  }
  const state = signMetaOAuthState({ businessId: req.business.id, slug: req.params.slug });
  res.json({
    auth_url: buildFacebookOAuthAuthorizeUrl(redirectUri, state),
    meta_oauth_available: true,
    redirect_uri: redirectUri,
  });
});

router.get("/social-oauth/google-youtube/start", (req, res) => {
  if (!req.business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!ensureDashboardAccess(req, res, req.business)) return;
  if (!isYouTubeOAuthConfigured()) {
    return res.status(503).json({
      error: "youtube_oauth_non_configure",
      youtube_oauth_available: false,
      hint: "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, API_URL — ajouter redirect https://…/api/oauth/google-youtube/callback dans la console Google.",
    });
  }
  const redirectUri = getYouTubeRedirectUri();
  if (!redirectUri) {
    return res.status(503).json({ error: "api_url_manquant", youtube_oauth_available: false });
  }
  const state = signYouTubeOAuthState({ businessId: req.business.id, slug: req.params.slug });
  res.json({
    auth_url: buildGoogleYouTubeAuthorizeUrl(redirectUri, state),
    youtube_oauth_available: true,
    redirect_uri: redirectUri,
  });
});

router.get("/social-oauth/tiktok/start", (req, res) => {
  if (!req.business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!ensureDashboardAccess(req, res, req.business)) return;
  if (!isTikTokOAuthConfigured()) {
    return res.status(503).json({
      error: "tiktok_oauth_non_configure",
      tiktok_oauth_available: false,
      hint: "TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, API_URL — redirect TikTok Developer.",
    });
  }
  const redirectUri = getTikTokRedirectUri();
  if (!redirectUri) {
    return res.status(503).json({ error: "api_url_manquant", tiktok_oauth_available: false });
  }
  const state = signTikTokOAuthState({ businessId: req.business.id, slug: req.params.slug });
  res.json({
    auth_url: buildTikTokAuthorizeUrl(redirectUri, state),
    tiktok_oauth_available: true,
    redirect_uri: redirectUri,
  });
});

export default router;
