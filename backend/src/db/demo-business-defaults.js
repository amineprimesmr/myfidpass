/**
 * Données par défaut pour la business slug `demo` (local / vitrine).
 * Paliers points + missions engagement toutes actives avec URLs factices.
 */

/** Mode tickets + rouleau : évite MODE_DISABLED sur conversion / jeu */
export const DEMO_LOYALTY_MODE = "points_game_tickets";

export const DEMO_POINTS_REWARD_TIERS_JSON = JSON.stringify([
  { points: 50, label: "Boisson offerte" },
  { points: 100, label: "Menu du jour" },
  { points: 200, label: "Repas offert" },
]);

/** Place ID Google Maps réel (bureau Google Sydney) — pour tester le flux avis en démo */
const DEMO_GOOGLE_PLACE_ID = "ChIJN1t_tDeuEmsRUsoyG83frY4";

export const DEMO_ENGAGEMENT_REWARDS_JSON = JSON.stringify({
  google_review: {
    enabled: true,
    points: 1,
    place_id: DEMO_GOOGLE_PLACE_ID,
    require_approval: false,
    auto_verify_enabled: true,
  },
  instagram_follow: { enabled: true, points: 1, url: "https://www.instagram.com/" },
  tiktok_follow: { enabled: true, points: 1, url: "https://www.tiktok.com/" },
  facebook_follow: { enabled: true, points: 1, url: "https://www.facebook.com/" },
  twitter_follow: { enabled: true, points: 1, url: "https://x.com/" },
  trustpilot_review: { enabled: true, points: 1, url: "https://www.trustpilot.com/" },
  tripadvisor_review: { enabled: true, points: 1, url: "https://www.tripadvisor.com/" },
});
