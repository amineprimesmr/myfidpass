/** Grille « fonctionnalités » au-dessus des 3 étapes — visuels remplaçables par carte. */
export const FINTAP_FEATURES_PLACEHOLDER_IMG = "/assets/etape1.png?v=20260206";

export const fintapFeaturesGridItems = [
  {
    id: "notifications",
    title: "Notifications illimitées",
    description:
      "Envoyez des messages à vos clients à tout moment, en quelques secondes.",
    imageSrc: "/assets/site/A.png?v=20260505",
    /** Fondu du bas de l’image vers transparent (masque CSS sur la carte). */
    imageFadeBottom: true,
  },
  {
    id: "ca",
    title: "Boostez votre visibilité",
    description:
      "Faites monter vos avis Google et votre communauté sur Instagram, TikTok… Une visibilité locale qui convertit.",
    visualKind: "engagement",
  },
  {
    id: "reputation",
    title: "Flyers intelligents avec QR code",
    description:
      "Diffusez votre offre partout : un scan et le client rejoint votre programme en quelques secondes.",
    imageSrc: "/assets/site/C.png?v=20260505",
  },
  {
    id: "data",
    title: "Analysez vos performances",
    description:
      "Découvrez les habitudes de vos clients et comprenez enfin ce qui fait revenir vos meilleurs acheteurs.",
    imageSrc: FINTAP_FEATURES_PLACEHOLDER_IMG,
    imageFadeBottom: true,
  },
];
