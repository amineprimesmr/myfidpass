import { getCityLabelFromSlug } from "./seo-route-match.js";

const DEFAULT_SITE_ORIGIN = "https://www.myfidpass.fr";

function siteOrigin() {
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return DEFAULT_SITE_ORIGIN;
}

function getPathname() {
  if (typeof window === "undefined") return "/";
  return window.location.pathname || "/";
}

function toAbsoluteUrl(pathname) {
  try {
    return new URL(pathname, siteOrigin()).toString();
  } catch (_) {
    return siteOrigin();
  }
}

export function getSeoByRoute(route) {
  const path = getPathname();
  const canonical = toAbsoluteUrl(path);
  const brand = "Myfidpass";
  const defaultDescription =
    "Carte de fidelite digitale Apple Wallet et Google Wallet pour commerces. Lancez un programme en quelques minutes, sans application client.";

  const indexable = {
    title: `${brand} - Carte fidelite digitale pour commerces`,
    description: defaultDescription,
    robots: "index,follow,max-image-preview:large",
    canonical,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Myfidpass",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web, iOS, Android",
      offers: {
        "@type": "Offer",
        priceCurrency: "EUR",
      },
      url: canonical,
      description: defaultDescription,
      publisher: {
        "@type": "Organization",
        name: "Myfidpass",
        url: siteOrigin(),
      },
    },
  };

  if (route?.type === "landing") return indexable;

  if (route?.type === "seo-content") {
    const page = route.page || "";
    if (page === "solution-carte-fidelite-digitale") {
      return {
        ...indexable,
        title: "Carte de fidelite digitale: Apple Wallet + Google Wallet | Myfidpass",
        description:
          "Solution de carte de fidelite digitale pour commerces: Apple Wallet et Google Wallet, QR code, points et dashboard commercant.",
        jsonLd: [
          indexable.jsonLd,
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: [
              {
                "@type": "Question",
                name: "Qu'est-ce qu'une carte de fidelite digitale ?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Une carte de fidelite digitale est une carte client stockee dans Apple Wallet ou Google Wallet pour cumuler des points sans carte papier.",
                },
              },
              {
                "@type": "Question",
                name: "Faut-il installer une application cliente ?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Non. Le client ajoute sa carte via un lien ou un QR code directement dans son Wallet.",
                },
              },
            ],
          },
        ],
      };
    }
    if (page === "logiciel-fidelite-restaurant") {
      return {
        ...indexable,
        title: "Logiciel fidelite restaurant: programme Wallet simple | Myfidpass",
        description:
          "Augmentez la frequence de visite avec un logiciel de fidelite restaurant connecte Apple Wallet et Google Wallet, sans app client.",
        jsonLd: [
          indexable.jsonLd,
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: [
              {
                "@type": "Question",
                name: "Comment fideliser plus de clients dans un restaurant ?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Le plus efficace est de combiner un programme points ou tampons simple, visible en caisse, et des relances regulieres via Wallet.",
                },
              },
              {
                "@type": "Question",
                name: "Le programme fonctionne-t-il avec une caisse existante ?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Oui. Le commerce peut commencer en mode simple puis connecter sa caisse ou sa borne via API.",
                },
              },
            ],
          },
        ],
      };
    }
    if (page === "programme-fidelite-salon-beaute") {
      return {
        ...indexable,
        title: "Programme fidelite salon de beaute: carte digitale Wallet | Myfidpass",
        description:
          "Programme de fidelite pour institut, ongles, cils et beaute: carte digitale wallet, points/tampons, suivi clients et promotions.",
        jsonLd: [
          indexable.jsonLd,
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: [
              {
                "@type": "Question",
                name: "Quel programme de fidelite pour un salon de beaute ?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Un systeme points ou tampons avec recompenses simples et rappels de visite est adapte aux salons et instituts.",
                },
              },
              {
                "@type": "Question",
                name: "Les clientes peuvent-elles ajouter la carte facilement ?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Oui. L'ajout se fait en quelques clics depuis un lien ou QR code, sans telechargement d'application.",
                },
              },
            ],
          },
        ],
      };
    }
    if (page === "prix-carte-fidelite-digitale") {
      return {
        ...indexable,
        title: "Prix carte de fidelite digitale: comparatif et ROI | Myfidpass",
        description:
          "Consultez le prix d'une carte de fidelite digitale et les leviers ROI pour commerce local: cout, deploiement, rentabilite.",
        jsonLd: [
          indexable.jsonLd,
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: [
              {
                "@type": "Question",
                name: "Comment calculer le ROI d'un programme de fidelite digitale ?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Le ROI se calcule avec la hausse de frequence d'achat, la marge par visite et la retention comparee au cout mensuel.",
                },
              },
              {
                "@type": "Question",
                name: "Quel est le cout reel pour un commerce local ?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Le cout depend de l'offre choisie, mais la rentabilite vient surtout du nombre de clients qui reviennent plus souvent.",
                },
              },
            ],
          },
        ],
      };
    }
    if (page === "local-carte-fidelite-digitale") {
      const citySlug = String(route.citySlug || "").toLowerCase();
      const city = getCityLabelFromSlug(citySlug);
      if (!city) {
        return {
          title: "Myfidpass",
          description: defaultDescription,
          robots: "noindex,follow",
          canonical,
          jsonLd: null,
        };
      }
      const title = `Carte fidelite digitale ${city} | Myfidpass`;
      const description = `Carte de fidelite digitale pour commerces a ${city}: Apple Wallet, Google Wallet, QR code, points/tampons et suivi clients.`;
      return {
        title,
        description,
        robots: "index,follow,max-image-preview:large",
        canonical,
        jsonLd: [
          {
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: title,
            url: canonical,
            description,
            isPartOf: { "@type": "WebSite", name: "Myfidpass", url: siteOrigin() },
          },
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: [
              {
                "@type": "Question",
                name: `Comment lancer une carte fidelite digitale a ${city} ?`,
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Creez votre carte, affichez un QR code en point de vente, et laissez vos clients ajouter la carte a Apple Wallet ou Google Wallet en quelques secondes.",
                },
              },
              {
                "@type": "Question",
                name: "Est-ce adapte aux petits commerces ?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Oui. L'objectif est un programme simple a expliquer en caisse, avec un suivi clair pour le commercant.",
                },
              },
            ],
          },
        ],
      };
    }
    if (page === "logiciel-fidelite-boulangerie") {
      return {
        ...indexable,
        title: "Logiciel fidelite boulangerie: carte wallet | Myfidpass",
        description:
          "Programme de fidelite pour boulangerie: carte digitale Apple Wallet / Google Wallet, points ou tampons, QR code et suivi clients.",
      };
    }
    if (page === "logiciel-fidelite-boucherie") {
      return {
        ...indexable,
        title: "Logiciel fidelite boucherie: points wallet | Myfidpass",
        description:
          "Fidelisez vos clients avec un programme points simple, carte wallet et suivi depuis votre espace commercant.",
      };
    }
    if (page === "programme-fidelite-coiffure") {
      return {
        ...indexable,
        title: "Programme fidelite coiffure: carte digitale wallet | Myfidpass",
        description:
          "Fidelisation salon de coiffure / barbershop: carte Apple Wallet et Google Wallet, tampons ou points, experience client moderne.",
      };
    }
    if (page === "programme-fidelite-cafe") {
      return {
        ...indexable,
        title: "Programme fidelite cafe: tampons et points wallet | Myfidpass",
        description:
          "Coffee shop et cafe: lancez une carte fidelite digitale wallet avec QR code, tampons ou points, sans application client.",
      };
    }
    if (page === "integration-caisse-fidelite-wallet") {
      return {
        ...indexable,
        title: "Integration caisse: fidelite wallet (API) | Myfidpass",
        description:
          "Documentation pour integrer une caisse ou une borne a Myfidpass: crediter des points et synchroniser la fidelite avec Apple Wallet / Google Wallet.",
      };
    }
    if (page === "carte-fidelite-qr-code") {
      return {
        ...indexable,
        title: "Carte fidelite QR code: parcours client wallet | Myfidpass",
        description:
          "Guide pratique: QR code en point de vente, inscription client, ajout Apple Wallet / Google Wallet, et mesure des resultats.",
      };
    }
    if (page === "comparatif-stamp-me-alternative") {
      return {
        ...indexable,
        title: "Alternative Stamp Me: fidelite Apple/Google Wallet | Myfidpass",
        description:
          "Comparatif oriente execution: alternative wallet-first pour commerces locaux, avec dashboard et possibilite d'integration caisse.",
      };
    }
    if (page === "comparatif-sumup-loyalty-alternative") {
      return {
        ...indexable,
        title: "Alternative SumUp Loyalty: fidelite wallet commerce local | Myfidpass",
        description:
          "Comparer une approche wallet native pour la fidelite locale: adoption client, simplicite caisse, pilotage et integrations.",
      };
    }
    if (page === "guide-fidelisation-client-commerce") {
      return {
        ...indexable,
        title: "Guide fidelisation client commerce local | Myfidpass",
        description:
          "Guide complet pour fideliser les clients d'un commerce local: offre, mecanique points/tampons, lancement et suivi KPI.",
      };
    }
    if (page === "alternative-carte-fidelite-papier") {
      return {
        ...indexable,
        title: "Alternative a la carte de fidelite papier | Myfidpass",
        description:
          "Passez de la carte papier a une carte de fidelite digitale wallet et gagnez en retention, simplicite et pilotage business.",
      };
    }
  }

  if (route?.type === "fidelity") {
    return {
      title: "Carte fidelite client | Myfidpass",
      description:
        "Ajoutez votre carte de fidelite a Apple Wallet ou Google Wallet et cumulez vos points en magasin.",
      robots: "noindex,follow",
      canonical,
      jsonLd: null,
    };
  }

  if (route?.type === "legal") {
    return {
      title: "Mentions legales et politiques | Myfidpass",
      description: "Pages legales Myfidpass: mentions legales, RGPD, cookies, CGU et CGV.",
      robots: "index,follow",
      canonical,
      jsonLd: null,
    };
  }

  return {
    title: "Myfidpass",
    description: defaultDescription,
    robots: "noindex,follow",
    canonical,
    jsonLd: null,
  };
}
