/** Abonnement Pro mensuel (hors promo 1 €) — aligné sur la page paiement. */
export const MYFIDPASS_MONTHLY_COST = 49.99;

/** Hypothèses conservatrices — programmes fidélité commerce de proximité. */
export const REVENUE_SIMULATOR_ASSUMPTIONS = {
  /** Part des visiteurs qui s'inscrivent au programme. */
  participationRate: 0.14,
  /** Membres actifs (au moins 1 passage / mois). */
  activeMemberRate: 0.58,
  /** Visites additionnelles par membre actif et par mois. */
  extraVisitPerActiveMember: 0.18,
  /** Hausse de panier sur les achats membres. */
  basketLiftOnMembers: 0.05,
  /** Clients dormants réactivés (part des visiteurs / mois). */
  reactivationShare: 0.008,
  /** Plafond : le gain ne dépasse pas ce % du CA mensuel estimé. */
  maxIncrementalShareOfRevenue: 0.06,
  /**
   * Missions avis & réseaux — taux mensuels (membres inscrits / actifs).
   * Avis Google : mission post-visite (taux le plus élevé — toujours > follows).
   * Instagram / TikTok : missions follow (conversion plus faible).
   */
  googleReviewsPerActiveMember: 2,
  instagramFollowsPerEnrolledMember: 0.52,
  tiktokFollowsPerEnrolledMember: 0.38,
};

/** Canaux affichés dans le bloc estimation (icônes /assets/logos). */
export const REVENUE_SIMULATOR_ENGAGEMENT_CHANNELS = [
  {
    id: "google",
    icon: "/assets/logos/google.png",
    label: "Avis Google",
    period: "/mois",
  },
  {
    id: "instagram",
    icon: "/assets/logos/instagram.png",
    label: "Abonnés Instagram",
    period: "/mois",
  },
  {
    id: "tiktok",
    icon: "/assets/logos/tiktok.png",
    label: "Abonnés TikTok",
    period: "/mois",
  },
];

/** Conversion visiteurs/jour → base mensuelle du modèle. */
export const REVENUE_SIMULATOR_DAYS_PER_MONTH = 30;

export const REVENUE_SIMULATOR_DEFAULTS = {
  dailyVisitors: 40,
  avgBasket: 22,
};

export const REVENUE_SIMULATOR_LIMITS = {
  dailyVisitors: { min: 10, max: 200 },
  avgBasket: { min: 5, max: 90 },
};
