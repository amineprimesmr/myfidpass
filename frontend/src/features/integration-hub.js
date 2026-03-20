/**
 * Hub Intégration (dashboard) + aperçu page publique prestataire.
 */
import catalog from "../data/integrations-catalog.json";
import { createIntegrationGuide } from "./integration-guide.js";

const DOC_HREF =
  "https://github.com/amineprimesmr/myfidpass/blob/main/docs/INTEGRATION-API-BORNES-CAISSES.md";

const STATUS_LABEL = {
  kit: "Kit API",
  beta: "Bêta",
  coming: "",
  partner: "Partenaire",
};

/** @param {unknown} s */
function esc(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @param {string} status */
function badgeClass(status) {
  const safe = status in STATUS_LABEL ? status : "kit";
  return `app-int-badge app-int-badge--${safe}`;
}

/**
 * @param {string} q
 * @param {{ name: string, description: string, summary?: string, tags?: string[] }} item
 */
function matchesQuery(q, item) {
  if (!q) return true;
  const sum = item.summary || "";
  const hay = `${item.name} ${sum} ${item.description} ${(item.tags || []).join(" ")}`.toLowerCase();
  return hay.includes(q);
}

/**
 * @param {{ slug?: string, apiBase?: string, origin?: string }} opts
 */
export function initIntegrationHub(opts) {
  const root = document.getElementById("app-integration-hub-root");
  const searchEl = document.getElementById("app-integration-search");
  if (!root) return;

  const resolvedApiBase = opts.apiBase || "https://api.myfidpass.fr";
  const guide = createIntegrationGuide({
    resolvedApiBase,
    fallbackSlug: opts.slug || "",
  });

  const categories = [...catalog.categories].sort((a, b) => a.order - b.order);

  function renderCatalog(filter) {
    const q = filter.trim().toLowerCase();
    const parts = [];

    for (const cat of categories) {
      const items = catalog.integrations.filter((i) => i.categoryId === cat.id && matchesQuery(q, i));
      if (!items.length) continue;

          const cards = items
        .map((item) => {
          const muted = item.status === "coming";
          const logoSrc = item.logo ? esc(item.logo) : "";
          const initial = esc((item.name || "?").trim().charAt(0).toUpperCase());
          const summaryText = esc(item.summary || item.description || "");
          const badgeLabel = STATUS_LABEL[item.status] || (item.status !== "coming" ? item.status : "");
          const badgeHtml = badgeLabel
            ? `<span class="${badgeClass(item.status)}">${esc(badgeLabel)}</span>`
            : "";
          const logoBlock = logoSrc
            ? `<span class="app-int-card-logo-wrap"><img class="app-int-card-logo" src="${logoSrc}" alt="" loading="lazy" decoding="async" /><span class="app-int-card-logo-fallback" aria-hidden="true">${initial}</span></span>`
            : `<span class="app-int-card-logo-wrap app-int-card-logo-wrap--letter" aria-hidden="true">${initial}</span>`;
          return `
            <button type="button" class="app-int-card${muted ? " app-int-card--muted" : ""}" data-int-id="${esc(item.id)}" aria-label="Ouvrir la fiche ${esc(item.name)}">
              <div class="app-int-card-top">
                ${logoBlock}
                <div class="app-int-card-meta">
                  <span class="app-int-card-title">${esc(item.name)}</span>
                  ${badgeHtml}
                </div>
              </div>
              <p class="app-int-card-summary">${summaryText}</p>
            </button>
          `;
        })
        .join("");

      parts.push(`
        <section class="app-int-category" data-category="${esc(cat.id)}">
          <h3 class="app-int-category-title">${esc(cat.title)}</h3>
          <div class="app-int-cards">${cards}</div>
        </section>
      `);
    }

    if (!parts.length) {
      root.innerHTML =
        '<p class="app-int-empty">Aucun résultat. Essayez « Zelty », « borne », « WooCommerce »…</p>';
      return;
    }

    root.innerHTML = parts.join("");
    root.querySelectorAll(".app-int-card").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-int-id");
        const item = catalog.integrations.find((i) => i.id === id);
        if (item) guide.open(item);
      });
    });
    root.querySelectorAll(".app-int-card-logo").forEach((img) => {
      img.addEventListener("error", () => {
        img.closest(".app-int-card-logo-wrap")?.classList.add("app-int-card-logo-wrap--show-fallback");
      });
    });
  }

  searchEl?.addEventListener("input", () => renderCatalog(searchEl.value));
  renderCatalog("");
}

/**
 * @param {HTMLElement} container
 */
export function renderPublicCatalogSummary(container) {
  if (!container) return;

  const categories = [...catalog.categories].sort((a, b) => a.order - b.order);
  const html = categories
    .map((cat) => {
      const items = catalog.integrations.filter((i) => i.categoryId === cat.id);
      if (!items.length) return "";
      const chips = items
        .map((item) => {
          const muted = item.status === "coming" ? " landing-int-chip--muted" : "";
          return `<span class="landing-int-chip${muted}">${esc(item.name)}</span>`;
        })
        .join("");
      return `
        <div class="landing-int-cat">
          <h3 class="landing-int-cat-title">${esc(cat.title)}</h3>
          <div class="landing-int-chips">${chips}</div>
        </div>
      `;
    })
    .filter(Boolean)
    .join("");

  container.innerHTML =
    html +
    `<p class="landing-int-catalog-foot">Toutes les intégrations s’appuient sur la <a href="${DOC_HREF}" target="_blank" rel="noopener">même documentation API</a> (scan, lookup, erreurs).</p>`;
}
