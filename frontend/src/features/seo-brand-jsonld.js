/**
 * JSON-LD de marque (MyFidPass / myfidpass.fr) — signaux forts pour la requête marque
 * et la désambiguïsation vs homonymes (.ch, autres secteurs).
 */

const DEFAULT_SITE_ORIGIN = "https://www.myfidpass.fr";

export function siteOriginForJsonLd() {
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return DEFAULT_SITE_ORIGIN;
}

/**
 * Graphe principal : WebSite + Organization + SoftwareApplication (un seul bloc @graph).
 */
export function getLandingJsonLd({ canonical, description }) {
  const origin = siteOriginForJsonLd();
  const orgId = `${origin}/#organization`;
  const webId = `${origin}/#website`;
  const logoUrl = `${origin}/assets/icone.png?v=20260416`;
  const sameAs = [
    "https://www.facebook.com/myfidpass",
    "https://x.com/myfidpass",
    "https://www.linkedin.com/company/myfidpass",
    "https://www.instagram.com/myfidpass",
  ];

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": webId,
        name: "MyFidPass",
        alternateName: ["Myfidpass", "myfidpass", "myfidpass.fr"],
        url: origin,
        inLanguage: "fr-FR",
        description,
        publisher: { "@id": orgId },
      },
      {
        "@type": "Organization",
        "@id": orgId,
        name: "MyFidPass",
        alternateName: ["Myfidpass", "myfidpass"],
        legalName: "MyFidPass",
        url: origin,
        logo: { "@type": "ImageObject", url: logoUrl },
        description:
          "Éditeur français de cartes de fidélité digitales pour commerces : Apple Wallet, Google Wallet, QR code et espace commerçant.",
        areaServed: { "@type": "Country", name: "France" },
        sameAs,
      },
      {
        "@type": "SoftwareApplication",
        name: "MyFidPass",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web, iOS, Android",
        offers: { "@type": "Offer", priceCurrency: "EUR" },
        url: canonical,
        description,
        publisher: { "@id": orgId },
        isPartOf: { "@id": webId },
      },
    ],
  };
}

/** Contenus structurés dédiés à la page /myfidpass (requête marque + FAQ). */
export function getMyFidPassBrandPageJsonLd(canonical, pageDescription) {
  const origin = siteOriginForJsonLd();
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "MyFidPass — site officiel",
      url: canonical,
      description: pageDescription,
      isPartOf: { "@type": "WebSite", name: "MyFidPass", url: origin },
      about: { "@type": "Thing", name: "Carte de fidélité digitale pour commerces" },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Où se trouve le site officiel MyFidPass ?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Le site officiel est https://www.myfidpass.fr . La marque s’écrit MyFidPass et propose des cartes de fidélité digitales pour commerces (Apple Wallet et Google Wallet).",
          },
        },
        {
          "@type": "Question",
          name: "Que permet MyFidPass pour un commerce ?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Créer une carte de fidélité digitale, la partager par QR code ou lien, permettre l’ajout dans Apple Wallet ou Google Wallet, et suivre les membres depuis un espace commerçant.",
          },
        },
        {
          "@type": "Question",
          name: "MyFidPass est-il destiné aux commerces en France ?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Oui. La solution cible les commerces locaux qui veulent digitaliser la fidélité sans imposer une application à télécharger pour le client.",
          },
        },
      ],
    },
  ];
}
