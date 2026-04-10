/**
 * Démarrage OAuth Meta (Instagram) — JWT dashboard requis.
 */
import { Router } from "express";
import {
  buildFacebookOAuthAuthorizeUrl,
  getDefaultMetaRedirectUri,
  isMetaOAuthConfigured,
  signMetaOAuthState,
} from "../../services/meta-instagram-oauth.js";
import { ensureDashboardAccess } from "./shared.js";

const router = Router({ mergeParams: true });

router.get("/social-oauth/meta/start", (req, res) => {
  if (!req.business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!ensureDashboardAccess(req, res, req.business)) return;
  if (!isMetaOAuthConfigured()) {
    return res.status(503).json({
      error: "meta_oauth_non_configure",
      meta_oauth_available: false,
      hint: "Définir META_APP_ID, META_APP_SECRET et API_URL sur le serveur.",
    });
  }
  const redirectUri = getDefaultMetaRedirectUri();
  if (!redirectUri) {
    return res.status(503).json({
      error: "api_url_manquant",
      meta_oauth_available: false,
      hint: "Variable API_URL ou PUBLIC_API_URL requise pour l’URI de callback Meta.",
    });
  }
  const state = signMetaOAuthState({ businessId: req.business.id, slug: req.params.slug });
  const authUrl = buildFacebookOAuthAuthorizeUrl(redirectUri, state);
  res.json({
    auth_url: authUrl,
    meta_oauth_available: true,
    redirect_uri: redirectUri,
  });
});

export default router;
