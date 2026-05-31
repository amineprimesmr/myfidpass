import { getLandingJsonLd, getMyFidPassBrandPageJsonLd } from "./seo-brand-jsonld.js";
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
  const brand = "MyFidPass";
  const defaultDescription =
    "Site officiel myfidpass.fr : carte de fidélité digitale Apple Wallet et Google Wallet pour commerces en France. Programme sans appli client, lancement rapide.";

  const indexable = {
    title: `${brand} (myfidpass.fr) — Carte de fidélité digitale Apple Wallet & Google Wallet`,
    description: defaultDescription,
    robots: "index,follow,max-image-preview:large",
    canonical,
    jsonLd: getLandingJsonLd({ canonical, description: defaultDescription }),
  };

  if (route?.type === "landing") return indexable;

  if (route?.type === "seo-content") {
    const page = route.page || "";
    if (page === "myfidpass") {
      const pageDesc =
        "MyFidPass est la marque myfidpass.fr : carte de fidélité digitale, Apple Wallet, Google Wallet et programme pour commerces en France.";
      return {
        ...indexable,
        title: "MyFidPass — site officiel myfidpass.fr (carte fidélité digitale)",
        description: pageDesc,
        jsonLd: [getLandingJsonLd({ canonical, description: pageDesc }), ...getMyFidPassBrandPageJsonLd(canonical, pageDesc)],
      };
    }
    if (page === "carte-fidelite-digitale") {
      return {
        ...indexable,
        title: "Carte fidelite digitale: Apple Wallet et Google Wallet | MyFidPass",
        description:
          "Carte fidelite digitale pour commerce local: QR code, parcours client sans appli, points/tampons et suivi commercant.",
      };
    }
    if (page === "logiciel-carte-fidelite") {
      return {
        ...indexable,
        title: "Logiciel carte de fidelite pour commerces | MyFidPass",
        description:
          "Logiciel carte de fidelite wallet: creation rapide, suivi clients, programme points/tampons et integrations caisse.",
      };
    }
    if (page === "solution-carte-fidelite-digitale") {
      return {
        ...indexable,
        title: "Carte de fidelite digitale: Apple Wallet + Google Wallet | MyFidPass",
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
        title: "Logiciel fidelite restaurant: programme Wallet simple | MyFidPass",
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
        title: "Programme fidelite salon de beaute: carte digitale Wallet | MyFidPass",
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
        title: "Prix carte de fidelite digitale: comparatif et ROI | MyFidPass",
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
          title: "MyFidPass",
          description: defaultDescription,
          robots: "noindex,follow",
          canonical,
          jsonLd: null,
        };
      }
      const title = `Carte fidelite digitale ${city} | MyFidPass`;
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
            isPartOf: { "@type": "WebSite", name: "MyFidPass", url: siteOrigin() },
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
        title: "Logiciel fidelite boulangerie: carte wallet | MyFidPass",
        description:
          "Programme de fidelite pour boulangerie: carte digitale Apple Wallet / Google Wallet, points ou tampons, QR code et suivi clients.",
      };
    }
    if (page === "logiciel-fidelite-boucherie") {
      return {
        ...indexable,
        title: "Logiciel fidelite boucherie: points wallet | MyFidPass",
        description:
          "Fidelisez vos clients avec un programme points simple, carte wallet et suivi depuis votre espace commercant.",
      };
    }
    if (page === "programme-fidelite-coiffure") {
      return {
        ...indexable,
        title: "Programme fidelite coiffure: carte digitale wallet | MyFidPass",
        description:
          "Fidelisation salon de coiffure / barbershop: carte Apple Wallet et Google Wallet, tampons ou points, experience client moderne.",
      };
    }
    if (page === "programme-fidelite-cafe") {
      return {
        ...indexable,
        title: "Programme fidelite cafe: tampons et points wallet | MyFidPass",
        description:
          "Coffee shop et cafe: lancez une carte fidelite digitale wallet avec QR code, tampons ou points, sans application client.",
      };
    }
    if (page === "integration-caisse-fidelite-wallet") {
      return {
        ...indexable,
        title: "Integration caisse: fidelite wallet (API) | MyFidPass",
        description:
          "Documentation pour integrer une caisse ou une borne a MyFidPass: crediter des points et synchroniser la fidelite avec Apple Wallet / Google Wallet.",
      };
    }
    if (page === "carte-fidelite-qr-code") {
      return {
        ...indexable,
        title: "Carte fidelite QR code: parcours client wallet | MyFidPass",
        description:
          "Guide pratique: QR code en point de vente, inscription client, ajout Apple Wallet / Google Wallet, et mesure des resultats.",
      };
    }
    if (page === "comparatif-stamp-me-alternative") {
      return {
        ...indexable,
        title: "Alternative Stamp Me: fidelite Apple/Google Wallet | MyFidPass",
        description:
          "Comparatif oriente execution: alternative wallet-first pour commerces locaux, avec dashboard et possibilite d'integration caisse.",
      };
    }
    if (page === "comparatif-sumup-loyalty-alternative") {
      return {
        ...indexable,
        title: "Alternative SumUp Loyalty: fidelite wallet commerce local | MyFidPass",
        description:
          "Comparer une approche wallet native pour la fidelite locale: adoption client, simplicite caisse, pilotage et integrations.",
      };
    }
    if (page === "comparatif-loyoly-alternative") {
      return {
        ...indexable,
        title: "Alternative Loyoly: fidelite Apple Wallet / Google Wallet | MyFidPass",
        description:
          "Page de comparaison (criteres): adoption wallet, simplicite en caisse, pilotage commercant, integrations et ROI pour commerce local.",
      };
    }
    if (page === "comparatif-heypongo-alternative") {
      return {
        ...indexable,
        title: "Alternative HeyPongo: fidelite wallet vs CRM marketing | MyFidPass",
        description:
          "Comparer une approche wallet-first pour la repetition en magasin vs une stack marketing plus large: criteres, deploiement et mesure.",
      };
    }
    if (page === "comparatif-fiplink-alternative") {
      return {
        ...indexable,
        title: "Alternative Fiplink: fidelite digitale simple en point de vente | MyFidPass",
        description:
          "Comparer gamification et mecaniques simples: adoption client, comprehension en caisse, et iteration hebdomadaire pour commerces locaux.",
      };
    }
    if (page === "comparatif-stampeo-alternative") {
      return {
        ...indexable,
        title: "Alternative Stampeo: carte tampon digitale wallet | MyFidPass",
        description:
          "Comparer les solutions de cartes tampons digitales Apple Wallet / Google Wallet: adoption, branding, pilotage et integrations.",
      };
    }
    if (page === "guide-fidelisation-client-commerce") {
      return {
        ...indexable,
        title: "Guide fidelisation client commerce local | MyFidPass",
        description:
          "Guide complet pour fideliser les clients d'un commerce local: offre, mecanique points/tampons, lancement et suivi KPI.",
      };
    }
    if (page === "alternative-carte-fidelite-papier") {
      return {
        ...indexable,
        title: "Alternative a la carte de fidelite papier | MyFidPass",
        description:
          "Passez de la carte papier a une carte de fidelite digitale wallet et gagnez en retention, simplicite et pilotage business.",
      };
    }
  }

  if (route?.type === "saas-pro-payment") {
    const desc =
      "Plan Pro MyFidPass : 49,99 €/mois ou 399 €/an, premier mois à 1 €. Passez au plan Pro pour votre carte fidélité digitale.";
    return {
      title: "Plan Pro — Tarifs (49,99 €/mois ou 399 €/an) | MyFidPass",
      description: desc,
      robots: "index,follow",
      canonical,
      jsonLd: null,
    };
  }

  if (route?.type === "fidelity") {
    return {
      title: "Carte fidelite client | MyFidPass",
      description:
        "Ajoutez votre carte de fidelite a Apple Wallet ou Google Wallet et cumulez vos points en magasin.",
      robots: "noindex,follow",
      canonical,
      jsonLd: null,
    };
  }

  if (route?.type === "legal") {
    const page = route.page || "";
    if (page === "politique") {
      const description =
        "Politique de confidentialité MyFidPass (RGPD) : données personnelles, TikTok et réseaux sociaux liés aux missions, droits, hébergement et contact DPO.";
      return {
        title: "Politique de confidentialité (RGPD) | MyFidPass",
        description,
        robots: "index,follow",
        canonical,
        jsonLd: null,
      };
    }
    return {
      title: "Mentions legales et politiques | MyFidPass",
      description: "Pages legales MyFidPass: mentions legales, RGPD, cookies, CGU et CGV.",
      robots: "index,follow",
      canonical,
      jsonLd: null,
    };
  }

  if (route?.type === "get-app") {
    return {
      title: "Télécharger l'app MyFidPass | App Store & Google Play",
      description:
        "Téléchargez l'application MyFidPass pour commerçants : carte fidélité digitale, Apple Wallet, Google Wallet et gestion clients.",
      robots: "index,follow",
      canonical,
      jsonLd: null,
    };
  }

  if (route?.type === "contact") {
    const description =
      "Contacter MyFidPass : support commercants et clients pour carte fidelite digitale, Apple Wallet, Google Wallet et espace marchand.";
    return {
      title: "Contact | MyFidPass",
      description,
      robots: "index,follow",
      canonical,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "ContactPage",
        name: "Contact MyFidPass",
        url: canonical,
        description,
        mainEntity: {
          "@type": "Organization",
          name: "MyFidPass",
          url: siteOrigin(),
          email: "contact@myfidpass.fr",
          telephone: "+33-805-980-685",
        },
      },
    };
  }

  return {
    title: "MyFidPass",
    description: defaultDescription,
    robots: "noindex,follow",
    canonical,
    jsonLd: null,
  };
}
