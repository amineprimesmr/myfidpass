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

export const SEO_EXTRA_CONTENT_PAGES = {
  "logiciel-fidelite-boulangerie": {
    title: "Logiciel fidelite boulangerie",
    intro:
      "Une boulangerie a besoin d'un programme simple, rapide en caisse, et adapte aux achats frequents. Myfidpass propose une carte wallet avec points ou tampons.",
    sections: [
      {
        heading: "Pourquoi le wallet fonctionne en boulangerie",
        paragraphs: [
          "Les clients reviennent souvent pour le pain et les viennoiseries. Une carte sur telephone reduit la friction et augmente la repetition.",
        ],
        items: [
          "Points par euro ou par passage",
          "Recompenses simples (viennoiserie offerte, cafe offert)",
          "QR code en vitrine et en caisse",
        ],
      },
      {
        heading: "Mise en place en magasin",
        paragraphs: [
          "Affichez un QR code, expliquez la recompense en une phrase, et formez l'equipe pour scanner ou crediter les points en quelques secondes.",
        ],
      },
    ],
    cta: {
      heading: "Demarrer",
      text: "Creez votre carte et testez le programme sur vos clients reguliers.",
      links: [
        { href: "/creer-ma-carte", label: "Creer ma carte" },
        { href: "/prix-carte-fidelite-digitale", label: "Voir prix et ROI" },
      ],
    },
  },
  "logiciel-fidelite-boucherie": {
    title: "Logiciel fidelite boucherie",
    intro:
      "La boucherie artisanale se differencie par la qualite et la relation client. Un programme de points wallet renforce la recurrence sans complexite.",
    sections: [
      {
        heading: "Mecanique recommandee",
        paragraphs: [
          "Les points par euro sont souvent les plus compris. Definissez des paliers clairs pour des produits phares.",
        ],
        items: [
          "Points par euro depense",
          "Paliers cadeaux simples",
          "Suivi des membres actifs",
        ],
      },
      {
        heading: "Execution terrain",
        paragraphs: [
          "Le client presente sa carte wallet en caisse. Le commercant credite les points depuis l'espace commercant ou une integration caisse.",
        ],
      },
    ],
    cta: {
      heading: "Lancer votre programme",
      text: "Commencez avec une regle simple puis optimisez selon vos retours clients.",
      links: [
        { href: "/creer-ma-carte", label: "Creer ma carte" },
        { href: "/solution-carte-fidelite-digitale", label: "Voir la solution" },
      ],
    },
  },
  "programme-fidelite-coiffure": {
    title: "Programme fidelite coiffure",
    intro:
      "Salons et barbershops: la fidelite repose sur la frequence de coupe et les produits. Une carte digitale wallet modernise l'experience client.",
    sections: [
      {
        heading: "Offres qui convertissent",
        paragraphs: [
          "Privilegiez une recompense atteignable en 2 a 3 visites pour creer l'habitude, puis augmentez progressivement les paliers.",
        ],
        items: [
          "Tampons par visite",
          "Points sur prestations premium",
          "Bonus anniversaire (optionnel)",
        ],
      },
      {
        heading: "Experience client",
        paragraphs: [
          "Le client ajoute la carte une fois, puis la retrouve dans Apple Wallet ou Google Wallet sans application supplementaire.",
        ],
      },
    ],
    cta: {
      heading: "Activer votre carte",
      text: "Personnalisez votre carte et vos regles, puis communiquez sur le QR code en salon.",
      links: [
        { href: "/creer-ma-carte", label: "Creer ma carte" },
        { href: "/programme-fidelite-salon-beaute", label: "Voir inspiration beaute" },
      ],
    },
  },
  "programme-fidelite-cafe": {
    title: "Programme fidelite cafe et coffee shop",
    intro:
      "Les cafes ont une forte repetition quotidienne. Un programme wallet simple (tampons ou points) augmente la frequence sans friction.",
    sections: [
      {
        heading: "Mecaniques efficaces",
        paragraphs: [
          "Les tampons type 10 cafes = 1 offert fonctionnent tres bien quand la regle est affichee clairement en caisse.",
        ],
        items: [
          "Tampons par cafe",
          "Points par euro",
          "Promotions ponctuelles",
        ],
      },
      {
        heading: "Diffusion en point de vente",
        paragraphs: [
          "QR code sur comptoir, sticker vitrine, et rappel oral a chaque commande: c'est le trio le plus efficace.",
        ],
      },
    ],
    cta: {
      heading: "Demarrer",
      text: "Creez votre carte et testez une semaine avec une recompense simple.",
      links: [
        { href: "/creer-ma-carte", label: "Creer ma carte" },
        { href: "/logiciel-fidelite-restaurant", label: "Voir page restauration" },
      ],
    },
  },
  "integration-caisse-fidelite-wallet": {
    title: "Integration caisse: crediter des points vers Apple Wallet / Google Wallet",
    intro:
      "Pour automatiser la fidelite, votre caisse ou votre borne peut appeler une API pour crediter des points apres un achat. Myfidpass fournit une documentation technique pour integrateurs.",
    sections: [
      {
        heading: "Qui fait l'integration",
        paragraphs: [
          "Le commercant transmet un lien documentation + token a son installateur caisse. L'integrateur branche l'API sans compte Fidpass supplementaire.",
        ],
        items: [
          "API HTTP securisee",
          "Flux idempotent recommande",
          "Test sur environnement reel",
        ],
      },
      {
        heading: "Alternative sans integration",
        paragraphs: [
          "Si vous ne voulez pas toucher a la caisse au debut, utilisez le mode scanner depuis l'espace commercant.",
        ],
      },
    ],
    cta: {
      heading: "Obtenir la documentation",
      text: "Depuis l'espace commercant, copiez le lien d'integration pour votre prestataire.",
      links: [
        { href: "/creer-ma-carte", label: "Creer ma carte" },
        { href: "/solution-carte-fidelite-digitale", label: "Retour solution" },
      ],
    },
  },
  "carte-fidelite-qr-code": {
    title: "Carte fidelite QR code: le meilleur parcours client",
    intro:
      "Le QR code est le declencheur le plus simple: le client scanne, cree sa carte, et l'ajoute au wallet en quelques secondes.",
    sections: [
      {
        heading: "Bonnes pratiques QR",
        paragraphs: [
          "Placez le QR a hauteur client, avec une phrase unique qui explique la recompense. Evitez les QR trop petits ou caches derriere la vitre reflechissante.",
        ],
        items: [
          "QR unique par commerce",
          "Message court + recompense claire",
          "Test sur iPhone et Android",
        ],
      },
      {
        heading: "Mesure",
        paragraphs: [
          "Suivez le nombre d'inscriptions et la frequence de retour dans votre espace commercant pour optimiser votre offre.",
        ],
      },
    ],
    cta: {
      heading: "Generer votre QR",
      text: "Creez votre carte puis imprimez votre QR depuis votre espace.",
      links: [
        { href: "/creer-ma-carte", label: "Creer ma carte" },
        { href: "/prix-carte-fidelite-digitale", label: "Voir ROI" },
      ],
    },
  },
  "comparatif-stamp-me-alternative": {
    title: "Alternative a Stamp Me: carte fidelite Apple Wallet / Google Wallet",
    intro:
      "Si vous cherchez une alternative orientee wallet native, Myfidpass met l'accent sur un parcours client simple: QR code, inscription, ajout wallet, points en magasin.",
    sections: [
      {
        heading: "Ce que les commerces veulent en general",
        paragraphs: [
          "Simplicite pour le client final, pilotage pour le commercant, et possibilite d'integrer la caisse quand le programme est mature.",
        ],
        items: [
          "Wallet-first (Apple + Google)",
          "Dashboard commercant",
          "API caisse / borne",
        ],
      },
      {
        heading: "Comment choisir",
        paragraphs: [
          "Testez d'abord votre taux d'inscription et votre frequence de retour sur 14 jours, puis decidez si vous automatisez via caisse.",
        ],
      },
    ],
    cta: {
      heading: "Tester Myfidpass",
      text: "Lancez une carte et comparez l'adoption client sur votre point de vente.",
      links: [
        { href: "/creer-ma-carte", label: "Creer ma carte" },
        { href: "/prix-carte-fidelite-digitale", label: "Voir prix" },
      ],
    },
  },
  "comparatif-sumup-loyalty-alternative": {
    title: "Alternative SumUp Loyalty: fidelite wallet pour commerce local",
    intro:
      "Les solutions liees a un ecosysteme de paiement peuvent convenir a certains cas. Myfidpass vise une experience wallet claire, independante du choix de terminal, avec integration possible.",
    sections: [
      {
        heading: "Questions a se poser",
        paragraphs: [
          "Le critere principal est le taux d'adoption client: si l'ajout de carte est trop lourd, la fidelite ne demarre pas.",
        ],
        items: [
          "Parcours client en moins de 30 secondes",
          "Visibilite wallet (points/tampons)",
          "Pilotage commercant",
        ],
      },
      {
        heading: "Strategie de migration",
        paragraphs: [
          "Commencez par un QR code et une recompense simple, puis alignez vos regles avec votre historique client.",
        ],
      },
    ],
    cta: {
      heading: "Essayer",
      text: "Creez votre carte et mesurez l'inscription sur une semaine.",
      links: [
        { href: "/creer-ma-carte", label: "Creer ma carte" },
        { href: "/solution-carte-fidelite-digitale", label: "Voir la solution" },
      ],
    },
  },
};

export function renderSeoExtraPage(slug) {
  const page = SEO_EXTRA_CONTENT_PAGES[slug];
  if (!page) return "";
  return wrapSeoPage(page);
}
