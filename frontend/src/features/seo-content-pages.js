import { renderComparativeSeoPage } from "./seo-content-comparative-pages.js";
import { renderSeoExtraPage } from "./seo-content-extra-pages.js";
import { renderLocalCarteFideliteDigitalePage } from "./seo-local-pages.js";

function wrapSeoPage({ title, intro, sections, cta }) {
  const sectionsHtml = sections
    .map(
      (section) => `
      <section class="landing-legal-section">
        <h2>${section.heading}</h2>
        ${section.paragraphs.map((p) => `<p>${p}</p>`).join("")}
        ${
          Array.isArray(section.items) && section.items.length
            ? `<ul>${section.items.map((item) => `<li>${item}</li>`).join("")}</ul>`
            : ""
        }
      </section>
    `
    )
    .join("");

  const ctaLinks = (cta?.links || [])
    .map((link) => `<a href="${link.href}">${link.label}</a>`)
    .join("");

  return `
    <article class="landing-legal-article landing-seo-article">
      <h1>${title}</h1>
      <p>${intro}</p>
      ${sectionsHtml}
      <section class="landing-legal-section">
        <h2>${cta?.heading || "Prochaine etape"}</h2>
        <p>${cta?.text || ""}</p>
        <nav class="landing-legal-nav">
          ${ctaLinks}
        </nav>
      </section>
    </article>
  `;
}

const SEO_CONTENT_PAGES = {
  "solution-carte-fidelite-digitale": {
    title: "Carte de fidelite digitale pour commerces",
    intro:
      "Myfidpass permet aux commerces de remplacer les cartes papier par une carte de fidelite Apple Wallet et Google Wallet, activee via lien ou QR code.",
    sections: [
      {
        heading: "Pourquoi passer au digital",
        paragraphs: [
          "Les cartes papier sont oubliees, perdues et difficiles a piloter. Une carte wallet reste sur le telephone du client et simplifie le passage en caisse.",
          "Le commerce gagne en frequence de visite, en lisibilite sur les points/tampons et en capacite de relance client.",
        ],
        items: [
          "Ajout de carte en quelques secondes",
          "Suivi des points et historique",
          "Parcours sans application a installer",
        ],
      },
      {
        heading: "Ce que couvre la solution",
        paragraphs: [
          "Le programme inclut la creation de carte, la collecte des membres, la gestion des points/tampons, et un espace commercant avec indicateurs.",
        ],
        items: [
          "Apple Wallet + Google Wallet",
          "Lien unique par commerce et QR code",
          "Dashboard simple pour l'equipe terrain",
        ],
      },
    ],
    cta: {
      heading: "Lancer votre programme",
      text: "Commencez par creer votre carte puis configurez vos regles de fidelite.",
      links: [
        { href: "/creer-ma-carte", label: "Creer ma carte" },
        { href: "/prix-carte-fidelite-digitale", label: "Voir prix et ROI" },
        { href: "/carte-fidelite-digitale-paris", label: "Exemple local: Paris" },
      ],
    },
  },
  "logiciel-fidelite-restaurant": {
    title: "Logiciel de fidelite restaurant",
    intro:
      "Pour la restauration, la fidelite doit etre rapide en caisse, claire pour le client, et mesurable sur le chiffre d'affaires. C'est le coeur du logiciel Myfidpass.",
    sections: [
      {
        heading: "Cas d'usage restaurant",
        paragraphs: [
          "Les restaurants, coffee shops et fast-foods ont un besoin fort de repetition d'achat. Un programme wallet facilite les visites recurrentes.",
        ],
        items: [
          "Points par euro depense",
          "Tampons type 10 achats = 1 offert",
          "Offres ponctuelles (double points, bonus)",
        ],
      },
      {
        heading: "Integration operationnelle",
        paragraphs: [
          "Le commercant peut ajouter des points depuis son espace et connecter progressivement sa caisse ou sa borne via API.",
          "Cela permet de commencer vite puis d'automatiser les flux une fois le ROI valide.",
        ],
      },
    ],
    cta: {
      heading: "Demarrer en restauration",
      text: "Configurez votre carte et vos regles, puis activez votre equipe caisse.",
      links: [
        { href: "/creer-ma-carte", label: "Demarrer maintenant" },
        { href: "/solution-carte-fidelite-digitale", label: "Voir la solution complete" },
      ],
    },
  },
  "programme-fidelite-salon-beaute": {
    title: "Programme de fidelite salon de beaute",
    intro:
      "Instituts, ongleries, cils et salons de beaute peuvent fideliser sans carte papier grace a une carte digitale wallet simple a presenter en caisse.",
    sections: [
      {
        heading: "Pourquoi ce secteur performe bien",
        paragraphs: [
          "La beaute fonctionne avec une forte recurrence de rendez-vous. Les programmes points/tampons sont compris et adoptes rapidement.",
        ],
        items: [
          "Parcours client mobile-first",
          "Offres anniversaire ou visite recurrente",
          "Image moderne du salon",
        ],
      },
      {
        heading: "Mise en place rapide",
        paragraphs: [
          "Le salon partage un lien ou un QR code. Le client cree sa carte et l'ajoute dans Apple Wallet ou Google Wallet en quelques clics.",
        ],
      },
    ],
    cta: {
      heading: "Lancer votre programme beaute",
      text: "Creez votre carte et adaptez vos recompenses a votre frequence de rendez-vous.",
      links: [
        { href: "/creer-ma-carte", label: "Creer ma carte beaute" },
        { href: "/prix-carte-fidelite-digitale", label: "Estimer le ROI" },
      ],
    },
  },
  "prix-carte-fidelite-digitale": {
    title: "Prix d'une carte de fidelite digitale",
    intro:
      "Le bon calcul n'est pas seulement le prix logiciel, mais le ROI global: retention, panier moyen et frequence de visite.",
    sections: [
      {
        heading: "Comment evaluer le cout",
        paragraphs: [
          "Comparez le prix mensuel a l'augmentation du nombre de visites. Une hausse moderee de la retention couvre souvent rapidement l'abonnement.",
        ],
        items: [
          "Nombre de clients actifs mensuels",
          "Frequence moyenne de retour",
          "Marge moyenne par achat",
        ],
      },
      {
        heading: "ROI attendu en pratique",
        paragraphs: [
          "Sur les commerces a achats repetes, le wallet permet de reduire la friction et d'augmenter les passages en caisse.",
          "L'objectif est d'obtenir des gains visibles en moins de 30 jours puis d'industrialiser le programme.",
        ],
      },
    ],
    cta: {
      heading: "Passer a l'action",
      text: "Creez votre carte puis suivez vos resultats hebdomadaires dans le dashboard.",
      links: [
        { href: "/creer-ma-carte", label: "Creer ma carte" },
        { href: "/logiciel-fidelite-restaurant", label: "Voir cas restauration" },
      ],
    },
  },
  "guide-fidelisation-client-commerce": {
    title: "Guide fidelisation client pour commerce local",
    intro:
      "Ce guide donne une methode simple pour structurer un programme de fidelite local: offre, mecanique, lancement, suivi et optimisation.",
    sections: [
      {
        heading: "Construire une offre claire",
        paragraphs: [
          "Choisissez une regle facile a comprendre pour vos clients: points par euro ou tampons par passage.",
          "Definissez une recompense atteignable rapidement pour creer l'habitude de retour.",
        ],
      },
      {
        heading: "Piloter chaque semaine",
        paragraphs: [
          "Suivez les inscriptions, les passages et les recompenses utilisees. Ajustez votre mecanique selon les retours terrain.",
        ],
        items: [
          "Taux d'inscription clients",
          "Frequence de retour par membre",
          "Taux d'utilisation des recompenses",
        ],
      },
    ],
    cta: {
      heading: "Mettre en place votre programme",
      text: "Passez de la theorie a l'action avec une carte wallet operationnelle en quelques minutes.",
      links: [
        { href: "/solution-carte-fidelite-digitale", label: "Voir la solution" },
        { href: "/creer-ma-carte", label: "Creer ma carte" },
      ],
    },
  },
  "alternative-carte-fidelite-papier": {
    title: "Alternative a la carte de fidelite papier",
    intro:
      "La carte de fidelite papier montre vite ses limites. Une alternative digitale wallet permet une meilleure retention et une execution plus fiable.",
    sections: [
      {
        heading: "Limites du papier",
        paragraphs: [
          "Les clients oublient ou perdent leur carte. Le commerce ne peut pas suivre proprement la performance ni relancer les membres.",
        ],
        items: [
          "Perte et oubli frequents",
          "Aucune donnee exploitable",
          "Pas de parcours mobile moderne",
        ],
      },
      {
        heading: "Pourquoi le wallet fonctionne mieux",
        paragraphs: [
          "La carte est dans le telephone du client, le scan est simple en caisse, et le commercant suit ses KPIs dans un espace dedie.",
        ],
      },
    ],
    cta: {
      heading: "Remplacer votre carte papier",
      text: "Migrez vers une carte digitale et suivez vos performances de fidelisation.",
      links: [
        { href: "/prix-carte-fidelite-digitale", label: "Voir prix et ROI" },
        { href: "/creer-ma-carte", label: "Demarrer" },
      ],
    },
  },
};

export function getSeoContentPageHtml(pageSlug, route) {
  if (pageSlug === "local-carte-fidelite-digitale") {
    return renderLocalCarteFideliteDigitalePage(route?.citySlug || "");
  }

  const page = SEO_CONTENT_PAGES[pageSlug];
  if (page) return wrapSeoPage(page);

  const comparative = renderComparativeSeoPage(pageSlug);
  if (comparative) return comparative;

  return renderSeoExtraPage(pageSlug);
}
