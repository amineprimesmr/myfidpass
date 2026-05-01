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

const SEO_COMPARATIVE_PAGES = {
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
  "comparatif-loyoly-alternative": {
    title: "Alternative Loyoly: carte fidelite Apple Wallet / Google Wallet",
    intro:
      "Loyoly met en avant la fidelite wallet et le re-engagement via notifications. Si votre priorite est un deploiement simple pour commerces locaux, comparez les criteres d'adoption client et d'execution terrain.",
    sections: [
      {
        heading: "Criteres de comparaison (factuels)",
        paragraphs: [
          "Ne comparez pas seulement les fonctionnalites: mesurez surtout le temps d'installation, le taux d'ajout wallet, et la facilite d'usage en caisse.",
        ],
        items: [
          "Parcours QR vers inscription puis wallet",
          "Pilotage commercant (membres, passages, campagnes)",
          "Integrations possibles (caisse / borne / API)",
        ],
      },
      {
        heading: "Quand Myfidpass est un bon fit",
        paragraphs: [
          "Quand vous voulez une solution wallet-first, rapide a expliquer au client, avec un objectif clair: augmenter les visites repetees.",
        ],
      },
    ],
    cta: {
      heading: "Tester sur votre commerce",
      text: "Lancez une carte, affichez un QR code, et mesurez l'inscription sur 7 jours.",
      links: [
        { href: "/creer-ma-carte", label: "Creer ma carte" },
        { href: "/carte-fidelite-qr-code", label: "Guide QR code" },
      ],
    },
  },
  "comparatif-heypongo-alternative": {
    title: "Alternative HeyPongo: fidelite wallet vs CRM tout-en-un",
    intro:
      "HeyPongo positionne un marketing plus large (CRM, automation). Si votre besoin #1 est une carte fidelite wallet ultra simple pour le point de vente, il est utile de separer les objectifs: acquisition vs repetition en magasin.",
    sections: [
      {
        heading: "Separer les problemes",
        paragraphs: [
          "Un CRM peut aider sur le long terme, mais la repetition en magasin demande souvent un parcours client immediat (scan + wallet) et une recompense claire.",
        ],
        items: [
          "Adoption client (wallet)",
          "Simplicite caisse",
          "Mesure des visites repetees",
        ],
      },
      {
        heading: "Approche recommandee",
        paragraphs: [
          "Commencez par une mecanique simple (points/tampons) puis ajoutez l'automation une fois que le socle d'adoption est la.",
        ],
      },
    ],
    cta: {
      heading: "Demarrer wallet-first",
      text: "Mettez en place une carte wallet et validez la retention avant d'elargir le scope marketing.",
      links: [
        { href: "/creer-ma-carte", label: "Creer ma carte" },
        { href: "/guide-fidelisation-client-commerce", label: "Guide fidélisation" },
      ],
    },
  },
  "comparatif-fiplink-alternative": {
    title: "Alternative Fiplink: fidelite digitale sans sur-complexifier le point de vente",
    intro:
      "Fiplink met en avant la gamification (roues, tickets, etc.). La gamification peut performer, mais elle doit rester comprehensible en 5 secondes en caisse. Comparez la simplicite percue par le client final.",
    sections: [
      {
        heading: "Risque principal de la gamification",
        paragraphs: [
          "Si le client ne comprend pas la regle instantanement, l'adoption baisse. Une version minimale (points/tampons + recompense) valide souvent mieux le produit au demarrage.",
        ],
        items: [
          "Regle simple affichee en 1 phrase",
          "Recompense atteignable rapidement",
          "Mesure des participations",
        ],
      },
      {
        heading: "Strategie",
        paragraphs: [
          "Demarrez simple, puis ajoutez un jeu une fois que le wallet est adopte.",
        ],
      },
    ],
    cta: {
      heading: "Lancer simple",
      text: "Creez une carte wallet avec une recompense claire, puis iterez.",
      links: [
        { href: "/creer-ma-carte", label: "Creer ma carte" },
        { href: "/prix-carte-fidelite-digitale", label: "Voir ROI" },
      ],
    },
  },
  "comparatif-stampeo-alternative": {
    title: "Alternative Stampeo: carte tampon digitale Apple Wallet / Google Wallet",
    intro:
      "Stampeo insiste sur un lancement rapide et un parcours wallet. L'enjeu pour vous est surtout la qualite du pilotage commercant, l'integration caisse, et la coherence branding sur Apple/Google Wallet.",
    sections: [
      {
        heading: "Checklist de decision",
        paragraphs: [
          "Comparez avec un critere unique: combien de clients ajoutent la carte dans les 7 premiers jours apres affichage du QR.",
        ],
        items: [
          "Temps d'ajout wallet",
          "Clarte tampons/points",
          "Suivi des membres actifs",
        ],
      },
      {
        heading: "Migration",
        paragraphs: [
          "Si vous changez de solution, gardez une periode de transition: double communication en caisse pendant 10 a 14 jours.",
        ],
      },
    ],
    cta: {
      heading: "Comparer en conditions reelles",
      text: "Testez Myfidpass en parallele sur un seul point de vente avant de generaliser.",
      links: [
        { href: "/creer-ma-carte", label: "Creer ma carte" },
        { href: "/solution-carte-fidelite-digitale", label: "Voir la solution" },
      ],
    },
  },
};

export function renderComparativeSeoPage(slug) {
  const page = SEO_COMPARATIVE_PAGES[slug];
  if (!page) return "";
  return wrapSeoPage(page);
}
