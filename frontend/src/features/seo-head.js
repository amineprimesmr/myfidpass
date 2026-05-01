const BASE_URL = "https://myfidpass.fr";
const DEFAULT_IMAGE = `${BASE_URL}/assets/icone.png?v=20260416`;
const JSON_LD_ID = "fidpass-seo-jsonld";

function toAbsoluteUrl(pathname) {
  try {
    return new URL(pathname, BASE_URL).toString();
  } catch (_) {
    return BASE_URL;
  }
}

function getPathname() {
  if (typeof window === "undefined") return "/";
  return window.location.pathname || "/";
}

function upsertMeta({ name, property, content }) {
  if (typeof document === "undefined") return;
  const selector = name ? `meta[name="${name}"]` : `meta[property="${property}"]`;
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement("meta");
    if (name) el.setAttribute("name", name);
    if (property) el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertCanonical(url) {
  if (typeof document === "undefined") return;
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", url);
}

function setJsonLd(json) {
  if (typeof document === "undefined") return;
  const existing = document.getElementById(JSON_LD_ID);
  if (!json) {
    existing?.remove();
    return;
  }
  const payload = Array.isArray(json) ? json : [json];
  const script = existing || document.createElement("script");
  script.id = JSON_LD_ID;
  script.setAttribute("type", "application/ld+json");
  script.textContent = JSON.stringify(payload.length === 1 ? payload[0] : payload);
  if (!existing) document.head.appendChild(script);
}

function getSeoByRoute(route) {
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
        url: BASE_URL,
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

export function applyRouteSeoHead(route) {
  if (typeof document === "undefined") return;
  const seo = getSeoByRoute(route);
  const title = seo.title || "Myfidpass";
  const description = seo.description || "";
  const canonical = seo.canonical || BASE_URL;
  const robots = seo.robots || "index,follow";
  const image = DEFAULT_IMAGE;

  document.title = title;
  upsertMeta({ name: "description", content: description });
  upsertMeta({ name: "robots", content: robots });
  upsertCanonical(canonical);

  upsertMeta({ property: "og:type", content: "website" });
  upsertMeta({ property: "og:site_name", content: "Myfidpass" });
  upsertMeta({ property: "og:title", content: title });
  upsertMeta({ property: "og:description", content: description });
  upsertMeta({ property: "og:url", content: canonical });
  upsertMeta({ property: "og:image", content: image });

  upsertMeta({ name: "twitter:card", content: "summary_large_image" });
  upsertMeta({ name: "twitter:title", content: title });
  upsertMeta({ name: "twitter:description", content: description });
  upsertMeta({ name: "twitter:image", content: image });

  setJsonLd(seo.jsonLd || null);
}
