/** Grille « fonctionnalités » au-dessus des 3 étapes — visuels remplaçables par carte. */
export const FINTAP_FEATURES_PLACEHOLDER_IMG = "/assets/etape1.png?v=20260206";

export const fintapFeaturesGridItems = [
  {
    id: "notifications",
    title: "Notifications illimitées",
    description:
      "Envoyez des messages à vos clients quand vous voulez : notifications push instantanées, sans plafond.",
    imageSrc: "/assets/site/A.png?v=20260505",
    /** Fondu du bas de l’image vers transparent (masque CSS sur la carte). */
    imageFadeBottom: true,
  },
  {
    id: "ca",
    title: "Boostez l'engagement",
    description:
      "Faites monter vos avis Google et votre communauté sur Instagram, TikTok… Une visibilité locale qui convertit.",
    visualKind: "engagement",
  },
  {
    id: "reputation",
    title: "E-réputation et visibilité",
    description:
      "Collectez plus d’avis Google et renforcez votre présence sur les réseaux sociaux, de façon naturelle.",
    imageSrc: FINTAP_FEATURES_PLACEHOLDER_IMG,
  },
  {
    id: "data",
    title: "Analysez vos performances",
    description:
      "Suivez les performances de votre commerce et le comportement d’achat avec un suivi clair et exploitable.",
    imageSrc: FINTAP_FEATURES_PLACEHOLDER_IMG,
    imageFadeBottom: true,
  },
];
