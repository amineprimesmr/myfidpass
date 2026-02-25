const API_BASE = typeof import.meta.env?.VITE_API_URL === "string" ? import.meta.env.VITE_API_URL : "";

const landingEl = document.getElementById("landing");
const fidelityAppEl = document.getElementById("fidelity-app");

/**
 * Route : / → landing, /creer-ma-carte → choix template, /fidelity/:slug → app carte, /mentions-legales | /politique-confidentialite → landing légale
 */
function getRoute() {
  const path = window.location.pathname.replace(/\/$/, "");
  const match = path.match(/^\/fidelity\/([^/]+)$/);
  if (match) return { type: "fidelity", slug: match[1] };
  if (path === "/creer-ma-carte") return { type: "templates" };
  if (path === "/mentions-legales") return { type: "legal", page: "mentions" };
  if (path === "/politique-confidentialite") return { type: "legal", page: "politique" };
  return { type: "landing" };
}

function initRouting() {
  const route = getRoute();
  if (route.type === "fidelity") {
    landingEl.classList.add("hidden");
    fidelityAppEl.classList.remove("hidden");
    return route.slug;
  }
  landingEl.classList.remove("hidden");
  fidelityAppEl.classList.add("hidden");
  const landingMain = document.getElementById("landing-main");
  const landingLegal = document.getElementById("landing-legal");
  const landingTemplates = document.getElementById("landing-templates");
  const legalContent = document.getElementById("landing-legal-content");

  if (route.type === "templates") {
    if (landingMain) landingMain.classList.add("hidden");
    if (landingLegal) landingLegal.classList.add("hidden");
    if (landingTemplates) {
      landingTemplates.classList.remove("hidden");
      initBuilderPage();
    }
  } else if (route.type === "legal" && landingMain && landingLegal && legalContent) {
    landingMain.classList.add("hidden");
    if (landingTemplates) landingTemplates.classList.add("hidden");
    landingLegal.classList.remove("hidden");
    legalContent.innerHTML = route.page === "mentions" ? getMentionsLegalesHtml() : getPolitiqueConfidentialiteHtml();
  } else {
    if (landingMain) landingMain.classList.remove("hidden");
    if (landingLegal) landingLegal.classList.add("hidden");
    if (landingTemplates) landingTemplates.classList.add("hidden");
  }
  return null;
}

/** Fallback template (pass sans couleurs business) */
const CARD_TEMPLATES = [{ id: "classic", name: "Classique", bg: "#0a7c42", fg: "#ffffff", label: "#e8f5e9" }];

const BUILDER_DRAFT_KEY = "fidpass_builder_draft";

function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 50) || "ma-carte";
}

function initBuilderPage() {
  const params = new URLSearchParams(window.location.search);
  const etablissementFromUrl = params.get("etablissement") || "";

  const formBlock = document.getElementById("builder-form-block");
  const successBlock = document.getElementById("builder-success-block");
  const previewCard = document.getElementById("builder-preview-card");
  const previewHeader = document.getElementById("builder-preview-header");
  const previewBody = document.getElementById("builder-preview-body");
  const previewOrg = document.getElementById("builder-preview-org");
  const previewLogo = document.getElementById("builder-preview-logo");
  const previewPoints = document.getElementById("builder-preview-points");
  const previewLevel = document.getElementById("builder-preview-level");

  const inputName = document.getElementById("builder-name");
  const inputSlug = document.getElementById("builder-slug");
  const slugPreview = document.getElementById("builder-slug-preview");
  const inputBg = document.getElementById("builder-bg");
  const inputBgHex = document.getElementById("builder-bg-hex");
  const inputFg = document.getElementById("builder-fg");
  const inputFgHex = document.getElementById("builder-fg-hex");
  const inputLabel = document.getElementById("builder-label");
  const inputLabelHex = document.getElementById("builder-label-hex");
  const inputLogo = document.getElementById("builder-logo");
  const logoPlaceholder = document.getElementById("builder-logo-placeholder");
  const logoPreviewImg = document.getElementById("builder-logo-preview");
  const inputBackTerms = document.getElementById("builder-back-terms");
  const inputBackContact = document.getElementById("builder-back-contact");
  const btnSubmit = document.getElementById("builder-submit");
  const successLinkInput = document.getElementById("builder-success-link");
  const btnCopyLink = document.getElementById("builder-copy-link");
  const successQrImg = document.getElementById("builder-success-qr");
  const successPageLink = document.getElementById("builder-success-page-link");

  let logoDataUrl = "";

  const state = {
    name: etablissementFromUrl || "",
    slug: slugify(etablissementFromUrl) || "ma-carte",
    backgroundColor: "#0a7c42",
    foregroundColor: "#ffffff",
    labelColor: "#e8f5e9",
    backTerms: "",
    backContact: "",
  };

  function loadDraft() {
    try {
      const raw = localStorage.getItem(BUILDER_DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d.name !== undefined) state.name = d.name;
        if (d.slug !== undefined) state.slug = d.slug;
        if (d.backgroundColor !== undefined) state.backgroundColor = d.backgroundColor;
        if (d.foregroundColor !== undefined) state.foregroundColor = d.foregroundColor;
        if (d.labelColor !== undefined) state.labelColor = d.labelColor;
        if (d.backTerms !== undefined) state.backTerms = d.backTerms;
        if (d.backContact !== undefined) state.backContact = d.backContact;
      }
    } catch (_) {}
  }

  function saveDraft() {
    try {
      localStorage.setItem(
        BUILDER_DRAFT_KEY,
        JSON.stringify({
          name: state.name,
          slug: state.slug,
          backgroundColor: state.backgroundColor,
          foregroundColor: state.foregroundColor,
          labelColor: state.labelColor,
          backTerms: state.backTerms,
          backContact: state.backContact,
        })
      );
    } catch (_) {}
  }

  function updatePreview() {
    previewOrg.textContent = state.name || "Nom du commerce";
    previewHeader.style.backgroundColor = state.backgroundColor;
    previewHeader.style.color = state.foregroundColor;
    previewBody.style.backgroundColor = state.backgroundColor;
    previewBody.style.color = state.foregroundColor;
    previewCard.querySelectorAll(".builder-preview-label").forEach((el) => {
      el.style.color = state.labelColor;
    });
    if (slugPreview) slugPreview.textContent = state.slug || "votre-lien";
  }

  function syncInputsFromState() {
    inputName.value = state.name;
    inputSlug.value = state.slug;
    inputBg.value = state.backgroundColor;
    inputBgHex.value = state.backgroundColor;
    inputFg.value = state.foregroundColor;
    inputFgHex.value = state.foregroundColor;
    inputLabel.value = state.labelColor;
    inputLabelHex.value = state.labelColor;
    inputBackTerms.value = state.backTerms;
    inputBackContact.value = state.backContact;
  }

  loadDraft();
  if (etablissementFromUrl && !state.name) state.name = etablissementFromUrl;
  if (etablissementFromUrl && state.slug === "ma-carte") state.slug = slugify(etablissementFromUrl);
  syncInputsFromState();
  updatePreview();

  inputName.addEventListener("input", () => {
    state.name = inputName.value.trim();
    if (!inputSlug.dataset.manual) state.slug = slugify(state.name) || "ma-carte";
    inputSlug.value = state.slug;
    updatePreview();
    saveDraft();
  });

  inputSlug.addEventListener("input", () => {
    inputSlug.dataset.manual = "1";
    state.slug = slugify(inputSlug.value) || "ma-carte";
    inputSlug.value = state.slug;
    if (slugPreview) slugPreview.textContent = state.slug;
    saveDraft();
  });

  function bindColor(inputColor, inputHex, key) {
    inputColor.addEventListener("input", () => {
      state[key] = inputColor.value;
      inputHex.value = state[key];
      updatePreview();
      saveDraft();
    });
    inputHex.addEventListener("input", () => {
      const v = inputHex.value.trim();
      if (/^#[0-9A-Fa-f]{6}$/.test(v) || /^[0-9A-Fa-f]{6}$/.test(v)) {
        state[key] = v.startsWith("#") ? v : `#${v}`;
        inputColor.value = state[key];
        updatePreview();
        saveDraft();
      }
    });
  }
  bindColor(inputBg, inputBgHex, "backgroundColor");
  bindColor(inputFg, inputFgHex, "foregroundColor");
  bindColor(inputLabel, inputLabelHex, "labelColor");

  inputLogo.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      logoDataUrl = r.result;
      logoPreviewImg.src = logoDataUrl;
      logoPreviewImg.classList.remove("hidden");
      logoPlaceholder.classList.add("hidden");
      if (previewLogo) {
        previewLogo.src = logoDataUrl;
        previewLogo.classList.add("visible");
      }
    };
    r.readAsDataURL(file);
  });

  inputBackTerms.addEventListener("input", () => {
    state.backTerms = inputBackTerms.value.trim();
    saveDraft();
  });
  inputBackContact.addEventListener("input", () => {
    state.backContact = inputBackContact.value.trim();
    saveDraft();
  });

  btnSubmit.addEventListener("click", async () => {
    const name = state.name.trim();
    if (!name) {
      inputName.focus();
      return;
    }
    const slug = state.slug || slugify(name);
    if (!slug) {
      inputSlug.focus();
      return;
    }

    btnSubmit.disabled = true;
    btnSubmit.textContent = "Création…";
    try {
      const body = {
        name,
        slug,
        organizationName: name,
        backgroundColor: state.backgroundColor,
        foregroundColor: state.foregroundColor,
        labelColor: state.labelColor,
        backTerms: state.backTerms || undefined,
        backContact: state.backContact || undefined,
      };
      if (logoDataUrl) body.logoBase64 = logoDataUrl;

      const res = await fetch(`${API_BASE}/api/businesses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erreur lors de la création");
      }

      const data = await res.json();
      const fidelityPath = `/fidelity/${data.slug}`;
      const fullLink = window.location.origin.replace(/\/$/, "") + fidelityPath;

      formBlock.classList.add("hidden");
      successBlock.classList.remove("hidden");
      successLinkInput.value = fullLink;
      successPageLink.href = fidelityPath;
      successQrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(fullLink)}`;

      try {
        localStorage.removeItem(BUILDER_DRAFT_KEY);
      } catch (_) {}
    } catch (err) {
      alert(err.message || "Une erreur est survenue. Réessayez.");
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = "Créer ma carte et obtenir mon lien";
    }
  });

  btnCopyLink.addEventListener("click", () => {
    successLinkInput.select();
    navigator.clipboard.writeText(successLinkInput.value).then(() => {
      btnCopyLink.textContent = "Copié !";
      setTimeout(() => (btnCopyLink.textContent = "Copier"), 2000);
    });
  });
}

function getMentionsLegalesHtml() {
  return `
    <h1>Mentions légales</h1>
    <p><strong>Éditeur</strong><br>Fidpass – [Adresse à compléter]</p>
    <p><strong>Hébergement</strong><br>[Hébergeur à compléter]</p>
    <p><strong>Contact</strong><br>contact@fidpass.fr</p>
    <p>Conformément à la loi « Informatique et Libertés » et au RGPD, vous disposez d’un droit d’accès, de rectification et de suppression de vos données. Voir notre <a href="/politique-confidentialite">Politique de confidentialité</a>.</p>
  `;
}

function getPolitiqueConfidentialiteHtml() {
  return `
    <h1>Politique de confidentialité</h1>
    <p>Fidpass s’engage à protéger vos données personnelles.</p>
    <h2>Données collectées</h2>
    <p>Lors de la création d’une carte fidélité (nom, adresse email), ces informations sont utilisées uniquement pour générer et associer la carte à votre appareil. Nous ne les revendons pas à des tiers.</p>
    <h2>Utilisation</h2>
    <p>Les données servent à la gestion de votre carte dans Apple Wallet et à l’identification en caisse. Le commerce partenaire peut consulter les informations liées à votre carte pour son programme de fidélité.</p>
    <h2>Vos droits</h2>
    <p>Vous pouvez demander l’accès, la rectification ou la suppression de vos données en nous contactant à contact@fidpass.fr.</p>
    <p><a href="/">Retour à l’accueil</a></p>
  `;
}

// ——— App Carte (uniquement sur /fidelity/:slug) ———

const form = document.getElementById("card-form");
const walletBlock = document.getElementById("wallet-block");
const inputName = document.getElementById("input-name");
const inputEmail = document.getElementById("input-email");
const btnSubmit = document.getElementById("btn-submit");
const btnAddWallet = document.getElementById("btn-add-wallet");
const heroTitle = document.querySelector("#fidelity-app .hero-title");
const heroSubtitle = document.querySelector("#fidelity-app .hero-subtitle");
const pageLogo = document.querySelector("#fidelity-app .header .logo");

function getSlugFromPath() {
  const route = getRoute();
  return route.type === "fidelity" ? route.slug : null;
}

/** Template choisi (depuis l’URL) pour le pass. */
function getTemplateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const t = params.get("template");
  if (t && CARD_TEMPLATES.some((x) => x.id === t)) return t;
  return "classic";
}

function ensureFidelityPath(slug) {
  const path = window.location.pathname.replace(/\/$/, "");
  if (path === "" || path === "/" || path === "/fidelity") {
    history.replaceState(null, "", `/fidelity/${slug}`);
  }
}

async function fetchBusiness(slug) {
  const res = await fetch(`${API_BASE}/api/businesses/${encodeURIComponent(slug)}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error("Entreprise introuvable");
    throw new Error("Erreur serveur");
  }
  return res.json();
}

async function createMember(slug, name, email) {
  const res = await fetch(`${API_BASE}/api/businesses/${encodeURIComponent(slug)}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Erreur lors de la création");
  }
  return res.json();
}

function showWalletBlock(memberId) {
  if (form) form.classList.add("hidden");
  if (walletBlock) {
    walletBlock.classList.remove("hidden");
    btnAddWallet.dataset.memberId = memberId;
  }
}

function showError(message) {
  if (!form) return;
  const existing = form.querySelector(".error-message");
  if (existing) existing.remove();
  const p = document.createElement("p");
  p.className = "error-message";
  p.textContent = message;
  form.appendChild(p);
}

function setLoading(loading) {
  if (btnSubmit) {
    btnSubmit.disabled = loading;
    btnSubmit.textContent = loading ? "Création…" : "Créer ma carte";
  }
}

function setPageBusiness(business) {
  const params = new URLSearchParams(window.location.search);
  const etablissement = params.get("etablissement");
  const displayName = etablissement || business?.name;
  if (displayName && pageLogo) pageLogo.textContent = displayName;
  const orgName = etablissement || business?.organizationName;
  if (heroSubtitle) {
    heroSubtitle.textContent = orgName
      ? `Carte de fidélité ${orgName}. Un double-clic sur le bouton latéral de ton iPhone : ta carte s'affiche.`
      : "Un double-clic sur le bouton latéral de ton iPhone : ta carte s'affiche.";
  }
}

function showSlugError(message) {
  if (!fidelityAppEl) return;
  fidelityAppEl.innerHTML = `
    <header class="header"><div class="header-inner"><a href="/" class="logo">Fidpass</a></div></header>
    <main class="main" style="text-align: center; padding: 3rem 1.5rem;">
      <p class="error-message" style="font-size: 1.1rem;">${message}</p>
      <p style="color: var(--text-muted); margin-top: 1rem;">Ex. : <a href="/fidelity/demo" style="color: var(--accent);">/fidelity/demo</a></p>
    </main>
  `;
}

function initFidelityApp(slug) {
  fetchBusiness(slug)
    .then((business) => {
      ensureFidelityPath(slug);
      setPageBusiness(business);
    })
    .catch(() => {
      showSlugError(`Entreprise « ${slug} » introuvable.`);
    });

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const s = getSlugFromPath();
      if (!s) return;

      const name = inputName?.value?.trim();
      const email = inputEmail?.value?.trim();
      if (!name || !email) {
        showError("Renseigne ton nom et ton email.");
        return;
      }

      setLoading(true);
      showError("");
      try {
        const data = await createMember(s, name, email);
        const memberId = data.memberId || data.member?.id;
        if (!memberId) throw new Error("Réponse serveur invalide");
        showWalletBlock(memberId);
      } catch (err) {
        const isNetworkError = err.message === "Failed to fetch" || err.name === "TypeError";
        showError(
          isNetworkError
            ? "Le serveur ne répond pas. Lance le backend : npm run backend"
            : (err.message || "Une erreur est survenue. Réessaie.")
        );
      } finally {
        setLoading(false);
      }
    });
  }

  if (btnAddWallet) {
    btnAddWallet.addEventListener("click", () => {
      const s = getSlugFromPath();
      const memberId = btnAddWallet.dataset.memberId;
      if (!s || !memberId) return;
      const template = getTemplateFromUrl();
      const url = `${API_BASE}/api/businesses/${encodeURIComponent(s)}/members/${encodeURIComponent(memberId)}/pass?template=${encodeURIComponent(template)}`;
      window.location.href = url;
    });
  }
}

// Landing hero : redirection vers page choix de templates
const landingHeroForm = document.getElementById("landing-hero-form");
if (landingHeroForm) {
  landingHeroForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("landing-etablissement");
    const name = input?.value?.trim();
    const url = name
      ? `/creer-ma-carte?etablissement=${encodeURIComponent(name)}`
      : "/creer-ma-carte";
    window.location.href = url;
  });
}

// Bootstrap
const slug = initRouting();
if (slug) initFidelityApp(slug);
