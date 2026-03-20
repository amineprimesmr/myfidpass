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

const STEP_LABELS = ["Contexte", "Aide publique", "Identifiants", "Appel API"];

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
  const prestataire = document.getElementById("app-integration-prestataire-link")?.value?.trim() || "";
  const curl = document.getElementById("app-integration-curl")?.textContent || "";
  const linkEl = document.getElementById("app-integration-open-page");
  /* Même URL que app.js : le champ input est la source fiable ; l’ancre peut encore être href="#" avant init. */
  const openPage = prestataire || linkEl?.href || "";
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
          <p class="app-int-lead">Vous êtes sur cette page en tant qu’<strong>intégrateur / prestataire technique</strong>. Voici ce que couvre cette fiche pour le commerce que vous branchez.</p>
          <p class="app-int-step-text">${esc(item.description)}</p>
          ${bullets ? `<ul class="app-int-step-list">${bullets}</ul>` : ""}
          ${warn}
          <p class="app-int-hint-muted">Ensuite : une <strong>page d’aide publique</strong> (à partager au commerçant si besoin), les <strong>identifiants</strong> à utiliser pour l’API, puis l’<strong>exemple d’appel</strong>.</p>
        </div>`;
      return;
    }

    if (stepIndex === 1) {
      bodyEl.innerHTML = `
        <div class="app-int-step-block">
          <p class="app-int-lead"><strong>Page d’aide publique</strong> (même contenu que <code>/integration</code> sur le site) : utile pour expliquer le contexte au <strong>commerçant</strong>, pas pour votre intégration technique.</p>
          <p class="app-int-step-text">Vous n’êtes pas censé « ouvrir une page prestataire » : <strong>vous êtes déjà l’intégrateur</strong>. Copiez ce lien seulement si le commerçant veut lire l’aide grand public. Votre travail, c’est l’API (étapes 3 et 4).</p>
          <label class="app-int-field-label" for="app-int-sheet-fake-link">URL à transmettre au commerçant (optionnel)</label>
          <div class="app-int-copy-row">
            <input type="text" id="app-int-sheet-fake-link" class="app-input app-int-copy-input" readonly value="${esc(tech.prestataire)}" />
            <button type="button" class="app-btn app-btn-primary" id="app-int-copy-presta">Copier le lien</button>
          </div>
          <p class="app-int-step-actions">
            <a class="app-btn app-btn-secondary" href="${esc(tech.openPage)}" target="_blank" rel="noopener">Prévisualiser la page d’aide (nouvel onglet)</a>
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
          <p class="app-int-lead">Pour appeler l’API, vous avez besoin du <strong>token</strong> et du <strong>slug</strong> du commerce. Les valeurs ci-dessous correspondent à la session / au compte avec lequel cet espace est ouvert.</p>
          <div class="app-int-info-card">
            <p class="app-int-info-title">1. Token d’accès (<code>X-Dashboard-Token</code>)</p>
            <p class="app-int-step-text">Secret à passer dans le header HTTP. Le <strong>commerçant</strong> le voit dans l’URL de son tableau de bord lorsqu’il se connecte via le lien reçu par e-mail (<code>?token=…</code>) : demandez-le lui si vous n’êtes pas connecté à son espace. Ne jamais l’exposer côté client public ni dans un dépôt.</p>
          </div>
          <label class="app-int-field-label" for="app-int-sheet-slug">2. Identifiant commerce (slug)</label>
          <div class="app-int-copy-row">
            <input type="text" id="app-int-sheet-slug" class="app-input app-int-copy-input" readonly value="${esc(tech.slug)}" />
            <button type="button" class="app-btn app-btn-primary" id="app-int-copy-slug">Copier</button>
          </div>
          <label class="app-int-field-label" for="app-int-sheet-base">3. URL de base de l’API Myfidpass</label>
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
        <p class="app-int-lead"><strong>Implémentation</strong> : intégrez cet appel dans votre caisse, borne ou middleware.</p>
        <p class="app-int-step-text">Le QR code (ou la valeur lue) côté client correspond à l’<strong>UUID membre</strong> Myfidpass : envoyez-le dans le corps JSON en <code>barcode</code>. Le montant en euros sert au crédit de points selon les règles du commerce.</p>
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
