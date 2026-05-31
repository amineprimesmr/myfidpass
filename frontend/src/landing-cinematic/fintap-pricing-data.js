/** Tarifs landing — 1er mois à 1 € puis mensuel ou accès à vie. */

export const FINTAP_PRICING_FEATURES = [
  "Carte fidélité Apple Wallet & Google Wallet",
  "Notifications push & campagnes",
  "Flyers de jeu & export HD",
  "Tableau de bord commerçant",
];

export const FINTAP_PRICING_PLANS = [
  {
    id: "monthly",
    name: "Mensuel",
    price: "49 €",
    period: "/ mois",
    badge: "Recommandé",
    featured: true,
    summary: "Sans engagement — résiliable à tout moment.",
    detail: "1er mois à 1 €, puis 49 €/mois.",
    cta: "Commencer pour 1 €",
    href: "/app?fromLandingOnboarding=1",
  },
  {
    id: "lifetime",
    name: "À vie",
    price: "399,99 €",
    period: "paiement unique",
    badge: null,
    featured: false,
    summary: "Un seul règlement, accès permanent.",
    detail: "Toutes les fonctionnalités Pro, sans renouvellement.",
    cta: "Choisir l’accès à vie",
    href: "/paiement?plan=lifetime",
  },
];
