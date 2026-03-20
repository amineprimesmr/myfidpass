/**
 * Hub Intégration (dashboard + aperçu page publique prestataire).
 */
import catalog from "../data/integrations-catalog.json";

const DOC_HREF =
  "https://github.com/amineprimesmr/myfidpass/blob/main/docs/INTEGRATION-API-BORNES-CAISSES.md";

const STATUS_LABEL = {
  kit: "Kit API",
  beta: "Bêta",
  coming: "Bientôt",
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
 * @param {{ name: string, description: string, tags?: string[] }} item
 */
function matchesQuery(q, item) {
  if (!q) return true;
  const hay = `${item.name} ${item.description} ${(item.tags || []).join(" ")}`.toLowerCase();
  return hay.includes(q);
}

/** @param {HTMLElement} panel */
function clearDetail(panel) {
  panel.innerHTML =
    '<p class="app-integration-detail-placeholder">Sélectionnez une carte pour afficher le détail, les prérequis et le lien documentation.</p>';
}

/**
 * @param {{ slug?: string, apiBase?: string, origin?: string }} opts
 */
export function initIntegrationHub(opts) {
  const root = document.getElementById("app-integration-hub-root");
  const panel = document.getElementById("app-integration-detail-panel");
  const searchEl = document.getElementById("app-integration-search");
  if (!root || !panel) return;

  const slug = opts.slug || "VOTRE_SLUG";
  const apiBase = opts.apiBase || "https://api.myfidpass.fr";

  const categories = [...catalog.categories].sort((a, b) => a.order - b.order);
  let selectedId = /** @type {string | null} */ (null);

  function showDetail(id) {
    const item = catalog.integrations.find((i) => i.id === id);
    if (!item) return;
    selectedId = id;

    const bullets = (item.bullets || []).map((b) => `<li>${esc(b)}</li>`).join("");
    const tagLine = (item.tags || []).map((t) => `<span class="app-int-tag">${esc(t)}</span>`).join("");

    panel.innerHTML = `
      <div class="app-integration-detail-inner">
        <div class="app-integration-detail-head">
          <h3 class="app-integration-detail-title">${esc(item.name)}</h3>
          <span class="${badgeClass(item.status)}" aria-label="Statut">${esc(STATUS_LABEL[item.status] || item.status)}</span>
        </div>
        <p class="app-integration-detail-desc">${esc(item.description)}</p>
        ${bullets ? `<ul class="app-integration-detail-bullets">${bullets}</ul>` : ""}
        ${tagLine ? `<div class="app-int-tags" aria-label="Mots-clés">${tagLine}</div>` : ""}
        <p class="app-integration-detail-api-hint">L’API reste la même pour tous les commerces : <code>POST</code> …<code>/api/businesses/${esc(slug)}/integration/scan</code> avec le header <code>X-Dashboard-Token</code> (fourni par le commerçant). Base API actuelle : <code>${esc(apiBase)}</code></p>
        <a class="app-btn app-btn-secondary app-integration-detail-doc-btn" href="${DOC_HREF}" target="_blank" rel="noopener">Documentation API complète</a>
      </div>
    `;

    root.querySelectorAll(".app-int-card").forEach((el) => {
      el.classList.toggle("app-int-card--active", el.getAttribute("data-int-id") === id);
    });
  }

  function renderCatalog(filter) {
    const q = filter.trim().toLowerCase();
    const parts = [];

    for (const cat of categories) {
      const items = catalog.integrations.filter((i) => i.categoryId === cat.id && matchesQuery(q, i));
      if (!items.length) continue;

      const cards = items
        .map((item) => {
          const disabled = item.status === "coming";
          return `
            <button type="button" class="app-int-card${disabled ? " app-int-card--muted" : ""}" data-int-id="${esc(item.id)}" aria-label="${esc(item.name)}">
              <span class="app-int-card-title">${esc(item.name)}</span>
              <span class="${badgeClass(item.status)}">${esc(STATUS_LABEL[item.status] || item.status)}</span>
              <span class="app-int-card-desc">${esc(item.description.slice(0, 120))}${item.description.length > 120 ? "…" : ""}</span>
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
      selectedId = null;
      clearDetail(panel);
      return;
    }

    root.innerHTML = parts.join("");
    root.querySelectorAll(".app-int-card").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-int-id");
        if (id) showDetail(id);
      });
    });

    const still = selectedId && catalog.integrations.some((i) => i.id === selectedId && matchesQuery(q, i));
    if (still) showDetail(selectedId);
    else {
      selectedId = null;
      clearDetail(panel);
    }
  }

  searchEl?.addEventListener("input", () => renderCatalog(searchEl.value));
  renderCatalog("");
}

/**
 * Aperçu compact pour la page publique /integration (prestataire).
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
          const st = esc(STATUS_LABEL[item.status] || item.status);
          return `<span class="landing-int-chip${muted}" title="${st}">${esc(item.name)}</span>`;
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
