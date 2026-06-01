/** Tarifs landing — 1er mois à 1 € puis mensuel ou annuel. */

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
  },
  {
    id: "annual",
    name: "Annuel",
    price: "399 €",
    period: "/ an",
    badge: null,
    featured: false,
    summary: "Facturation annuelle — sans engagement.",
    detail: "1er mois à 1 €, puis 399 €/an (soit ~34 €/mois).",
    cta: "Choisir l’offre annuelle",
  },
];
