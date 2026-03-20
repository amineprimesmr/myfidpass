/**
 * Guide intégration : page complète dans la section (pas de modale).
 */
const DOC_HREF =
  "https://github.com/amineprimesmr/myfidpass/blob/main/docs/INTEGRATION-API-BORNES-CAISSES.md";

const STATUS_LABEL = {
  kit: "Kit API",
  beta: "Bêta",
  coming: "Bientôt",
  partner: "Partenaire",
};

const STEP_LABELS = ["Contexte", "Votre lien", "À transmettre", "Côté technique"];

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

function readTechFromDom(resolvedApiBase, fallbackSlug) {
  const baseUrl =
    document.getElementById("app-integration-base-url")?.value?.trim() || resolvedApiBase || "https://api.myfidpass.fr";
  const slug = document.getElementById("app-integration-slug")?.value?.trim() || fallbackSlug || "VOTRE_SLUG";
  const prestataire = document.getElementById("app-integration-prestataire-link")?.value || "";
  const curl = document.getElementById("app-integration-curl")?.textContent || "";
  const openPage = document.getElementById("app-integration-open-page")?.getAttribute("href") || prestataire;
  return { baseUrl, slug, prestataire, curl, openPage };
}

async function copyText(text, btn, doneLabel) {
  try {
    await navigator.clipboard.writeText(text);
    if (btn) {
      const prev = btn.textContent;
      btn.textContent = doneLabel || "Copié !";
      setTimeout(() => {
        btn.textContent = prev;
      }, 1600);
    }
  } catch {
    if (btn) btn.textContent = "Erreur";
  }
}

/**
 * @param {{ resolvedApiBase: string, fallbackSlug: string }} ctx
 */
export function createIntegrationGuide(ctx) {
  const catalogView = document.getElementById("app-integration-catalog-view");
  const guideView = document.getElementById("app-integration-guide-view");
  const backBtn = document.getElementById("app-int-guide-back");
  const titleEl = document.getElementById("app-int-sheet-title");
  const kickerEl = document.getElementById("app-int-sheet-kicker");
  const badgeWrap = document.getElementById("app-int-sheet-badge-wrap");
  const progressEl = document.getElementById("app-int-sheet-progress");
  const bodyEl = document.getElementById("app-int-sheet-body");
  const prevBtn = document.getElementById("app-int-sheet-prev");
  const nextBtn = document.getElementById("app-int-sheet-next");

  if (!guideView || !bodyEl || !titleEl || !progressEl || !prevBtn || !nextBtn) {
    return { open: () => {} };
  }

  /** @type {{ id: string, name: string, description: string, status: string, bullets?: string[] } | null} */
  let current = null;
  let stepIndex = 0;

  function close() {
    guideView.classList.add("hidden");
    guideView.setAttribute("aria-hidden", "true");
    catalogView?.classList.remove("hidden");
    current = null;
  }

  function renderProgress() {
    progressEl.innerHTML = STEP_LABELS.map((label, i) => {
      const done = i < stepIndex ? " app-int-step-dot--done" : "";
      const active = i === stepIndex ? " app-int-step-dot--active" : "";
      return `<span class="app-int-step-dot${done}${active}" title="${esc(label)}"><span class="app-int-step-dot-num">${i + 1}</span><span class="app-int-step-dot-label">${esc(label)}</span></span>`;
    }).join("");
  }

  function renderBody() {
    if (!current) return;
    const tech = readTechFromDom(ctx.resolvedApiBase, ctx.fallbackSlug);
    const item = current;
    const isComing = item.status === "coming";

    if (stepIndex === 0) {
      const bullets = (item.bullets || []).map((b) => `<li>${esc(b)}</li>`).join("");
      const warn = isComing
        ? `<div class="app-int-callout app-int-callout--warn"><strong>Bientôt disponible.</strong> Il n’y a pas encore de connecteur prêt à l’emploi pour ce logiciel. Vous pouvez déjà utiliser l’<strong>API générique</strong> (étape 4) ou nous écrire pour un accompagnement.</div>`
        : "";
      bodyEl.innerHTML = `
        <div class="app-int-step-block">
          <p class="app-int-lead">Voici ce que cette intégration représente pour <strong>votre commerce</strong> et comment Myfidpass s’y branche.</p>
          <p class="app-int-step-text">${esc(item.description)}</p>
          ${bullets ? `<ul class="app-int-step-list">${bullets}</ul>` : ""}
          ${warn}
          <p class="app-int-hint-muted">Les étapes suivantes vous guident : d’abord ce que <strong>vous</strong> envoyez, puis ce que le <strong>prestataire</strong> reçoit, enfin le détail technique.</p>
        </div>`;
      return;
    }

    if (stepIndex === 1) {
      bodyEl.innerHTML = `
        <div class="app-int-step-block">
          <p class="app-int-lead"><strong>Étape la plus simple pour vous :</strong> transmettre la page documentation à la personne qui gère votre caisse ou votre borne.</p>
          <p class="app-int-step-text">Elle explique l’API sans avoir besoin d’un compte Myfidpass. Vous n’avez rien à coder.</p>
          <label class="app-int-field-label" for="app-int-sheet-fake-link">Lien à copier-coller (e-mail, SMS…)</label>
          <div class="app-int-copy-row">
            <input type="text" id="app-int-sheet-fake-link" class="app-input app-int-copy-input" readonly value="${esc(tech.prestataire)}" />
            <button type="button" class="app-btn app-btn-primary" id="app-int-copy-presta">Copier le lien</button>
          </div>
          <p class="app-int-step-actions">
            <a class="app-btn app-btn-secondary" href="${esc(tech.openPage)}" target="_blank" rel="noopener">Ouvrir la page prestataire</a>
          </p>
        </div>`;
      document.getElementById("app-int-copy-presta")?.addEventListener("click", (e) => {
        copyText(tech.prestataire, /** @type {HTMLButtonElement} */ (e.currentTarget));
      });
      return;
    }

    if (stepIndex === 2) {
      bodyEl.innerHTML = `
        <div class="app-int-step-block">
          <p class="app-int-lead">Votre prestataire aura besoin de <strong>deux informations</strong> en plus du lien (vous les copiez ci-dessous).</p>
          <div class="app-int-info-card">
            <p class="app-int-info-title">1. Token d’accès</p>
            <p class="app-int-step-text">C’est la clé secrète : elle apparaît dans l’URL de <strong>votre</strong> tableau de bord quand vous ouvrez Myfidpass depuis le lien reçu par e-mail (<code>?token=…</code>). À communiquer <strong>uniquement</strong> à votre prestataire de confiance, jamais sur un forum public.</p>
          </div>
          <label class="app-int-field-label" for="app-int-sheet-slug">2. Identifiant commerce (slug)</label>
          <div class="app-int-copy-row">
            <input type="text" id="app-int-sheet-slug" class="app-input app-int-copy-input" readonly value="${esc(tech.slug)}" />
            <button type="button" class="app-btn app-btn-primary" id="app-int-copy-slug">Copier</button>
          </div>
          <label class="app-int-field-label" for="app-int-sheet-base">3. URL de base de l’API</label>
          <div class="app-int-copy-row">
            <input type="text" id="app-int-sheet-base" class="app-input app-int-copy-input" readonly value="${esc(tech.baseUrl)}" />
            <button type="button" class="app-btn app-btn-primary" id="app-int-copy-base">Copier</button>
          </div>
        </div>`;
      document.getElementById("app-int-copy-slug")?.addEventListener("click", (e) => {
        copyText(tech.slug, /** @type {HTMLButtonElement} */ (e.currentTarget));
      });
      document.getElementById("app-int-copy-base")?.addEventListener("click", (e) => {
        copyText(tech.baseUrl, /** @type {HTMLButtonElement} */ (e.currentTarget));
      });
      return;
    }

    bodyEl.innerHTML = `
      <div class="app-int-step-block">
        <p class="app-int-lead">À destination du <strong>développeur / intégrateur</strong> : requête type et documentation.</p>
        <p class="app-int-step-text">Le QR carte client contient l’<strong>UUID membre</strong> à envoyer en <code>barcode</code>. Le montant en euros permet de créditer des points selon vos règles.</p>
        <label class="app-int-field-label">Exemple cURL (scan + crédit)</label>
        <pre class="app-integration-curl app-int-sheet-curl" id="app-int-sheet-curl-display">${esc(tech.curl)}</pre>
        <div class="app-int-step-actions app-int-step-actions--row">
          <button type="button" class="app-btn app-btn-secondary" id="app-int-copy-curl-sheet">Copier l’exemple</button>
          <a class="app-btn app-btn-primary" href="${DOC_HREF}" target="_blank" rel="noopener">Documentation complète</a>
        </div>
        ${isComing ? `<p class="app-int-hint-muted">Connecteur nommé « ${esc(item.name)} » : feuille de route — l’API ci-dessus fonctionne déjà pour un branchement sur mesure.</p>` : ""}
      </div>`;
    document.getElementById("app-int-copy-curl-sheet")?.addEventListener("click", (e) => {
      copyText(tech.curl, /** @type {HTMLButtonElement} */ (e.currentTarget));
    });
  }

  function updateFooter() {
    prevBtn.classList.toggle("hidden", stepIndex === 0);
    nextBtn.textContent = stepIndex >= STEP_LABELS.length - 1 ? "Terminé" : "Suivant";
  }

  function paint() {
    if (!current) return;
    if (kickerEl) kickerEl.textContent = `Étape ${stepIndex + 1} / ${STEP_LABELS.length}`;
    titleEl.textContent = current.name;
    if (badgeWrap)
      badgeWrap.innerHTML = `<span class="${badgeClass(current.status)}">${esc(STATUS_LABEL[current.status] || current.status)}</span>`;
    renderProgress();
    renderBody();
    updateFooter();
  }

  function open(item) {
    current = item;
    stepIndex = 0;
    catalogView?.classList.add("hidden");
    guideView.classList.remove("hidden");
    guideView.setAttribute("aria-hidden", "false");
    paint();
    document.getElementById("integration")?.scrollIntoView({ behavior: "smooth", block: "start" });
    backBtn?.focus();
  }

  prevBtn.addEventListener("click", () => {
    if (stepIndex > 0) {
      stepIndex -= 1;
      paint();
    }
  });

  nextBtn.addEventListener("click", () => {
    if (stepIndex < STEP_LABELS.length - 1) {
      stepIndex += 1;
      paint();
    } else {
      close();
    }
  });

  backBtn?.addEventListener("click", close);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !guideView.classList.contains("hidden")) {
      e.preventDefault();
      close();
    }
  });

  return { open, close };
}
