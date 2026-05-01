import { getCityLabelFromSlug } from "./seo-route-match.js";

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

export function renderLocalCarteFideliteDigitalePage(citySlug) {
  const city = getCityLabelFromSlug(citySlug);
  if (!city) return "";

  return wrapSeoPage({
    title: `Carte de fidelite digitale ${city} (Apple Wallet / Google Wallet)`,
    intro: `Myfidpass aide les commerces de ${city} a lancer une carte de fidelite digitale dans Apple Wallet et Google Wallet: QR code, points/tampons, suivi clients.`,
    sections: [
      {
        heading: "Pourquoi une carte wallet en local",
        paragraphs: [
          `A ${city}, la concurrence locale est forte. Un programme wallet visible sur telephone augmente la repetition sans carte papier.`,
        ],
        items: [
          "Parcours client simple (QR + inscription)",
          "Branding commerce sur la carte",
          "Pilotage depuis un espace commercant",
        ],
      },
      {
        heading: "Secteurs qui performent",
        paragraphs: [
          "Restauration rapide, cafes, boulangeries, beaute et commerces de proximite a achats repetes: ce sont les meilleurs premiers cas d'usage.",
        ],
      },
    ],
    cta: {
      heading: "Lancer votre programme",
      text: "Creez votre carte et commencez par une recompense simple, puis optimisez chaque semaine.",
      links: [
        { href: "/creer-ma-carte", label: "Creer ma carte" },
        { href: "/solution-carte-fidelite-digitale", label: "Voir la solution" },
        { href: "/prix-carte-fidelite-digitale", label: "Prix et ROI" },
      ],
    },
  });
}
