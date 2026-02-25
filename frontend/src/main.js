const API_BASE = typeof import.meta.env?.VITE_API_URL === "string" ? import.meta.env.VITE_API_URL : "";
const AUTH_TOKEN_KEY = "fidpass_token";

const landingEl = document.getElementById("landing");
const fidelityAppEl = document.getElementById("fidelity-app");
const dashboardAppEl = document.getElementById("dashboard-app");
const authAppEl = document.getElementById("auth-app");
const appAppEl = document.getElementById("app-app");

function getAuthToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch (_) {
    return null;
  }
}

function setAuthToken(token) {
  try {
    if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
    else localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch (_) {}
}

function clearAuthToken() {
  setAuthToken(null);
}

function getAuthHeaders() {
  const token = getAuthToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

/**
 * Route : / → landing, /dashboard → tableau de bord, /app → espace connecté, /login, /register, etc.
 */
function getRoute() {
  const path = window.location.pathname.replace(/\/$/, "");
  const match = path.match(/^\/fidelity\/([^/]+)$/);
  if (match) return { type: "fidelity", slug: match[1] };
  if (path === "/dashboard") return { type: "dashboard" };
  if (path === "/app") return { type: "app" };
  if (path === "/login") return { type: "auth", tab: "login" };
  if (path === "/register") return { type: "auth", tab: "register" };
  if (path === "/creer-ma-carte") return { type: "templates" };
  if (path === "/mentions-legales") return { type: "legal", page: "mentions" };
  if (path === "/politique-confidentialite") return { type: "legal", page: "politique" };
  return { type: "landing" };
}

function initRouting() {
  const route = getRoute();

  if (route.type === "fidelity") {
    landingEl.classList.add("hidden");
    if (dashboardAppEl) dashboardAppEl.classList.add("hidden");
    if (authAppEl) authAppEl.classList.add("hidden");
    if (appAppEl) appAppEl.classList.add("hidden");
    fidelityAppEl.classList.remove("hidden");
    return route.slug;
  }

  if (route.type === "app") {
    if (!getAuthToken()) {
      window.location.replace("/login?redirect=/app");
      return null;
    }
    landingEl.classList.add("hidden");
    fidelityAppEl.classList.add("hidden");
    if (dashboardAppEl) dashboardAppEl.classList.add("hidden");
    if (authAppEl) authAppEl.classList.add("hidden");
    if (appAppEl) appAppEl.classList.remove("hidden");
    initAppPage();
    return null;
  }

  if (route.type === "auth") {
    landingEl.classList.add("hidden");
    fidelityAppEl.classList.add("hidden");
    if (dashboardAppEl) dashboardAppEl.classList.add("hidden");
    if (appAppEl) appAppEl.classList.add("hidden");
    if (authAppEl) authAppEl.classList.remove("hidden");
    initAuthPage(route.tab || "login");
    return null;
  }

  if (route.type === "dashboard") {
    fidelityAppEl.classList.add("hidden");
    landingEl.classList.add("hidden");
    if (authAppEl) authAppEl.classList.add("hidden");
    if (appAppEl) appAppEl.classList.add("hidden");
    if (dashboardAppEl) {
      dashboardAppEl.classList.remove("hidden");
      initDashboardPage();
    }
    return null;
  }

  landingEl.classList.remove("hidden");
  fidelityAppEl.classList.add("hidden");
  if (dashboardAppEl) dashboardAppEl.classList.add("hidden");
  if (authAppEl) authAppEl.classList.add("hidden");
  if (appAppEl) appAppEl.classList.add("hidden");
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

function initAuthPage(initialTab) {
  const tabLogin = document.querySelector('#auth-tabs [data-tab="login"]');
  const tabRegister = document.querySelector('#auth-tabs [data-tab="register"]');
  const formLogin = document.getElementById("auth-form-login");
  const formRegister = document.getElementById("auth-form-register");
  const loginError = document.getElementById("auth-login-error");
  const registerError = document.getElementById("auth-register-error");

  function showTab(tab) {
    const isLogin = tab === "login";
    if (tabLogin) tabLogin.classList.toggle("active", isLogin);
    if (tabRegister) tabRegister.classList.toggle("active", !isLogin);
    if (formLogin) formLogin.classList.toggle("hidden", !isLogin);
    if (formRegister) formRegister.classList.toggle("hidden", isLogin);
    if (loginError) { loginError.classList.add("hidden"); loginError.textContent = ""; }
    if (registerError) { registerError.classList.add("hidden"); registerError.textContent = ""; }
    const path = isLogin ? "/login" : "/register";
    if (window.location.pathname !== path) history.replaceState(null, "", path);
  }

  tabLogin?.addEventListener("click", () => showTab("login"));
  tabRegister?.addEventListener("click", () => showTab("register"));
  showTab(initialTab === "register" ? "register" : "login");

  const params = new URLSearchParams(window.location.search);
  const sessionCode = params.get("session");
  if (sessionCode === "expired" && loginError) {
    loginError.textContent = "Votre session a expiré. Reconnectez-vous avec votre email et mot de passe.";
    loginError.classList.remove("hidden");
  } else if (sessionCode === "user_not_found" && loginError) {
    loginError.textContent = "Votre compte n’est plus reconnu (serveur réinitialisé). Recréez un compte avec le même email si besoin.";
    loginError.classList.remove("hidden");
  }
  if (sessionCode) {
    history.replaceState(null, "", window.location.pathname + "?redirect=" + (params.get("redirect") || "/app"));
  }

  document.getElementById("auth-login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("auth-login-email")?.value?.trim();
    const password = document.getElementById("auth-login-password")?.value;
    if (!email || !password) return;
    if (loginError) { loginError.classList.add("hidden"); loginError.textContent = ""; }
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (loginError) {
          let msg = data.error || "Erreur de connexion";
          if (res.status === 401) {
            msg += " Si vous aviez déjà un compte et que la connexion ne marche plus, l’hébergeur a peut‑être été réinitialisé : vous pouvez recréer un compte avec le même email.";
          }
          loginError.textContent = msg;
          loginError.classList.remove("hidden");
        }
        return;
      }
      setAuthToken(data.token);
      const redirectParams = new URLSearchParams(window.location.search);
      const redirect = redirectParams.get("redirect") || "/app";
      window.location.replace(redirect);
    } catch (err) {
      if (loginError) {
        loginError.textContent = "Erreur réseau. Réessayez.";
        loginError.classList.remove("hidden");
      }
    }
  });

  document.getElementById("auth-register-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("auth-register-name")?.value?.trim();
    const email = document.getElementById("auth-register-email")?.value?.trim();
    const password = document.getElementById("auth-register-password")?.value;
    if (!email || !password) return;
    if (password.length < 8) {
      if (registerError) {
        registerError.textContent = "Le mot de passe doit faire au moins 8 caractères.";
        registerError.classList.remove("hidden");
      }
      return;
    }
    if (registerError) { registerError.classList.add("hidden"); registerError.textContent = ""; }
    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name: name || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (registerError) {
          registerError.textContent = data.error || `Erreur serveur (${res.status}). Réessayez ou testez sur myfidpass.fr si vous êtes en local.`;
          registerError.classList.remove("hidden");
        }
        return;
      }
      setAuthToken(data.token);
      window.location.replace("/app");
    } catch (err) {
      if (registerError) {
        registerError.textContent = "Impossible de joindre l'API. En local : démarrez le backend (port 3001). Sinon testez sur myfidpass.fr.";
        registerError.classList.remove("hidden");
      }
    }
  });
}

function initAppPage() {
  const emptyEl = document.getElementById("app-empty");
  const contentEl = document.getElementById("app-dashboard-content");
  const businessNameEl = document.getElementById("app-business-name");
  const userEmailEl = document.getElementById("app-user-email");
  const logoutBtn = document.getElementById("app-logout");

  logoutBtn?.addEventListener("click", () => {
    clearAuthToken();
    window.location.replace("/");
  });

  (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, { headers: getAuthHeaders() });
      if (res.status === 401) {
        const body = await res.json().catch(() => ({}));
        clearAuthToken();
        const code = body.code || "invalid";
        window.location.replace("/login?redirect=/app&session=" + code);
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      const user = data.user;
      const businesses = data.businesses || [];
      if (userEmailEl) userEmailEl.textContent = user?.email || "";

      if (businesses.length === 0) {
        if (emptyEl) emptyEl.classList.remove("hidden");
        if (contentEl) contentEl.classList.add("hidden");
        if (businessNameEl) businessNameEl.textContent = "Mon espace";
        return;
      }
      if (emptyEl) emptyEl.classList.add("hidden");
      if (contentEl) contentEl.classList.remove("hidden");
      const business = businesses[0];
      if (businessNameEl) businessNameEl.textContent = business.organization_name || business.name || business.slug;
      initAppSidebar();
      initAppDashboard(business.slug);
    } catch (_) {
      if (emptyEl) emptyEl.classList.remove("hidden");
      if (contentEl) contentEl.classList.add("hidden");
    }
  })();
}

function initAppSidebar() {
  const links = document.querySelectorAll("#app-app .app-sidebar-link[data-section]");
  const main = document.querySelector("#app-app .app-main");
  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const id = link.getAttribute("data-section");
      const section = document.getElementById(id);
      if (section && main) {
        section.scrollIntoView({ behavior: "smooth", block: "start" });
        links.forEach((l) => l.classList.remove("app-sidebar-link-active"));
        link.classList.add("app-sidebar-link-active");
      }
    });
  });
}

function initAppDashboard(slug) {
  const api = (path, opts = {}) => {
    const url = `${API_BASE}/api/businesses/${encodeURIComponent(slug)}${path}`;
    return fetch(url, { ...opts, headers: { ...opts.headers, ...getAuthHeaders() } });
  };

  const statMembers = document.getElementById("app-stat-members");
  const statPoints = document.getElementById("app-stat-points");
  const statTransactions = document.getElementById("app-stat-transactions");
  const memberSearchInput = document.getElementById("app-member-search");
  const memberListEl = document.getElementById("app-member-list");
  const amountInput = document.getElementById("app-amount");
  const oneVisitBtn = document.getElementById("app-one-visit");
  const addPointsBtn = document.getElementById("app-add-points");
  const caisseMessage = document.getElementById("app-caisse-message");
  const membersSearchInput = document.getElementById("app-members-search");
  const membersTbody = document.getElementById("app-members-tbody");
  const transactionsTbody = document.getElementById("app-transactions-tbody");

  const shareLinkEl = document.getElementById("app-share-link");
  const shareQrEl = document.getElementById("app-share-qr");
  const shareCopyBtn = document.getElementById("app-share-copy");

  const fullShareLink = (typeof window !== "undefined" && window.location.origin ? window.location.origin.replace(/\/$/, "") : "") + "/fidelity/" + slug;
  if (shareLinkEl) shareLinkEl.value = fullShareLink;
  if (shareQrEl) shareQrEl.src = "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=" + encodeURIComponent(fullShareLink);
  if (shareCopyBtn) {
    shareCopyBtn.addEventListener("click", () => {
      if (!shareLinkEl) return;
      shareLinkEl.select();
      navigator.clipboard.writeText(shareLinkEl.value).then(() => {
        shareCopyBtn.textContent = "Copié !";
        setTimeout(() => { shareCopyBtn.textContent = "Copier"; }, 2000);
      });
    });
  }

  let allMembers = [];
  let selectedMemberId = null;
  let addPointsVisitOnly = false;

  function showCaisseMessage(text, isError = false) {
    if (!caisseMessage) return;
    caisseMessage.textContent = text;
    caisseMessage.classList.remove("hidden", "success", "error");
    caisseMessage.classList.add(isError ? "error" : "success");
  }

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }
  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  async function loadStats() {
    const res = await api("/dashboard/stats");
    if (res.status === 401) throw new Error("Unauthorized");
    if (!res.ok) return;
    const data = await res.json();
    if (statMembers) statMembers.textContent = data.membersCount ?? 0;
    if (statPoints) statPoints.textContent = data.pointsThisMonth ?? 0;
    if (statTransactions) statTransactions.textContent = data.transactionsThisMonth ?? 0;
  }

  async function loadMembers(search = "") {
    const q = search ? `&search=${encodeURIComponent(search)}` : "";
    const res = await api(`/dashboard/members?limit=100${q}`);
    if (!res.ok) return { members: [], total: 0 };
    return res.json();
  }

  async function loadTransactions() {
    const res = await api("/dashboard/transactions?limit=20");
    if (!res.ok) return { transactions: [], total: 0 };
    return res.json();
  }

  function renderMembers(members) {
    if (!membersTbody) return;
    membersTbody.innerHTML = (members || [])
      .map((m) =>
        `<tr><td>${escapeHtml(m.name)}</td><td>${escapeHtml(m.email)}</td><td>${m.points}</td><td>${m.last_visit_at ? formatDate(m.last_visit_at) : "—"}</td></tr>`
      )
      .join("") || "<tr><td colspan='4'>Aucun membre</td></tr>";
  }

  function renderTransactions(transactions) {
    if (!transactionsTbody) return;
    transactionsTbody.innerHTML = (transactions || [])
      .map((t) =>
        `<tr><td>${escapeHtml(t.member_name)}</td><td>${t.type === "points_add" ? "Points ajoutés" : t.type}</td><td>+${t.points}</td><td>${formatDate(t.created_at)}</td></tr>`
      )
      .join("") || "<tr><td colspan='4'>Aucune opération</td></tr>";
  }

  async function refresh() {
    try {
      await loadStats();
    } catch (_) { return; }
    const membersData = await loadMembers(membersSearchInput?.value || "");
    allMembers = membersData.members || [];
    renderMembers(allMembers);
    const txData = await loadTransactions();
    renderTransactions(txData.transactions || []);
  }

  memberSearchInput?.addEventListener("input", async () => {
    const q = memberSearchInput.value.trim();
    if (q.length < 2) {
      memberListEl?.classList.add("hidden");
      if (memberListEl) memberListEl.innerHTML = "";
      selectedMemberId = null;
      if (addPointsBtn) addPointsBtn.disabled = true;
      return;
    }
    const data = await loadMembers(q);
    const members = data.members || [];
    if (!memberListEl) return;
    memberListEl.innerHTML = members
      .map((m) => `<div class="app-member-item" data-id="${m.id}">${escapeHtml(m.name)} — ${escapeHtml(m.email)} (${m.points} pts)</div>`)
      .join("");
    memberListEl.classList.remove("hidden");
    memberListEl.querySelectorAll(".app-member-item").forEach((el) => {
      el.addEventListener("click", () => {
        selectedMemberId = el.dataset.id;
        const m = members.find((x) => x.id === selectedMemberId);
        memberSearchInput.value = m ? `${m.name} (${m.email})` : "";
        memberListEl.classList.add("hidden");
        if (addPointsBtn) addPointsBtn.disabled = false;
      });
    });
  });

  oneVisitBtn?.addEventListener("click", () => {
    addPointsVisitOnly = true;
    if (amountInput) amountInput.value = "";
  });
  amountInput?.addEventListener("input", () => { addPointsVisitOnly = false; });

  addPointsBtn?.addEventListener("click", async () => {
    if (!selectedMemberId) return;
    addPointsBtn.disabled = true;
    caisseMessage?.classList.add("hidden");
    try {
      const body = addPointsVisitOnly ? { visit: true } : { amount_eur: parseFloat(amountInput?.value) || 0 };
      if (!addPointsVisitOnly && !body.amount_eur) {
        showCaisseMessage("Indiquez un montant (€) ou cliquez sur « 1 passage ».", true);
        addPointsBtn.disabled = false;
        return;
      }
      const res = await fetch(`${API_BASE}/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(selectedMemberId)}/points`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showCaisseMessage(data.error || "Erreur", true);
        addPointsBtn.disabled = false;
        return;
      }
      showCaisseMessage(`${data.points} point(s) ajouté(s). Total : ${data.points} pts.`);
      if (amountInput) amountInput.value = "";
      selectedMemberId = null;
      if (memberSearchInput) memberSearchInput.value = "";
      addPointsVisitOnly = false;
      await refresh();
    } catch (_) {
      showCaisseMessage("Erreur réseau.", true);
    }
    addPointsBtn.disabled = false;
  });

  membersSearchInput?.addEventListener("input", () => {
    const q = membersSearchInput.value.trim();
    loadMembers(q).then((data) => renderMembers(data.members || []));
  });

  refresh();
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

      const apiUrl = `${API_BASE}/api/businesses`;
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data.error || `Erreur ${res.status} lors de la création`;
        if (res.status === 409) throw new Error("Ce lien est déjà pris. Choisissez un autre « lien » (slug) pour votre établissement.");
        if (res.status === 400) throw new Error(data.error || "Vérifiez le nom et le lien de l'établissement.");
        throw new Error(msg);
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
      const isNetwork = err.message === "Failed to fetch" || err.name === "TypeError";
      const message = isNetwork
        ? "Impossible de joindre le serveur. En production, l’API doit être déployée (ex. api.myfidpass.fr) et la variable VITE_API_URL doit être définie sur Vercel. Voir docs/PRODUCTION.md"
        : (err.message || "Une erreur est survenue. Réessayez.");
      alert(message);
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

  if (data.dashboardUrl) {
    successBlock.querySelectorAll('a[href*="dashboard"]').forEach((el) => el.remove());
    const dashboardLink = document.createElement("a");
    dashboardLink.href = data.dashboardUrl;
    dashboardLink.className = "landing-btn landing-btn-secondary";
    dashboardLink.style.marginTop = "1rem";
    dashboardLink.style.display = "inline-block";
    dashboardLink.textContent = "Ouvrir le tableau de bord";
    successBlock.appendChild(dashboardLink);
  }
  if (getAuthToken()) {
    const appLink = document.createElement("a");
    appLink.href = "/app";
    appLink.className = "landing-btn landing-btn-primary";
    appLink.style.marginTop = "0.5rem";
    appLink.style.display = "inline-block";
    appLink.style.marginLeft = "0.5rem";
    appLink.textContent = "Accéder à mon espace";
    successBlock.appendChild(appLink);
  }
}

function initDashboardPage() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("slug");
  const token = params.get("token");
  const errorEl = document.getElementById("dashboard-error");
  const contentEl = document.getElementById("dashboard-content");

  if (!slug || !token) {
    if (errorEl) errorEl.classList.remove("hidden");
    if (contentEl) contentEl.classList.add("hidden");
    return;
  }
  if (errorEl) errorEl.classList.add("hidden");
  if (contentEl) contentEl.classList.remove("hidden");

  const api = (path, opts = {}) => {
    const url = `${API_BASE}/api/businesses/${encodeURIComponent(slug)}${path}?token=${encodeURIComponent(token)}`;
    return fetch(url, { ...opts });
  };

  let allMembers = [];
  let selectedMemberId = null;
  let addPointsVisitOnly = false;

  const statMembers = document.getElementById("stat-members");
  const statPoints = document.getElementById("stat-points");
  const statTransactions = document.getElementById("stat-transactions");
  const businessNameEl = document.getElementById("dashboard-business-name");
  const memberSearchInput = document.getElementById("dashboard-member-search");
  const memberListEl = document.getElementById("dashboard-member-list");
  const amountInput = document.getElementById("dashboard-amount");
  const oneVisitBtn = document.getElementById("dashboard-one-visit");
  const addPointsBtn = document.getElementById("dashboard-add-points");
  const caisseMessage = document.getElementById("dashboard-caisse-message");
  const membersSearchInput = document.getElementById("dashboard-members-search");
  const membersTbody = document.getElementById("dashboard-members-tbody");
  const transactionsTbody = document.getElementById("dashboard-transactions-tbody");

  function showCaisseMessage(text, isError = false) {
    caisseMessage.textContent = text;
    caisseMessage.classList.remove("hidden", "success", "error");
    caisseMessage.classList.add(isError ? "error" : "success");
  }

  async function loadStats() {
    const res = await api("/dashboard/stats");
    if (res.status === 401) throw new Error("Unauthorized");
    if (!res.ok) return;
    const data = await res.json();
    if (statMembers) statMembers.textContent = data.membersCount ?? 0;
    if (statPoints) statPoints.textContent = data.pointsThisMonth ?? 0;
    if (statTransactions) statTransactions.textContent = data.transactionsThisMonth ?? 0;
    if (businessNameEl) businessNameEl.textContent = data.businessName || slug;
  }

  async function loadMembers(search = "") {
    const q = search ? `&search=${encodeURIComponent(search)}` : "";
    const res = await api(`/dashboard/members?limit=100${q}`);
    if (!res.ok) return { members: [], total: 0 };
    return res.json();
  }

  async function loadTransactions() {
    const res = await api("/dashboard/transactions?limit=20");
    if (!res.ok) return { transactions: [], total: 0 };
    return res.json();
  }

  function renderMembers(members) {
    if (!membersTbody) return;
    membersTbody.innerHTML = members
      .map(
        (m) =>
          `<tr>
            <td>${escapeHtml(m.name)}</td>
            <td>${escapeHtml(m.email)}</td>
            <td>${m.points}</td>
            <td>${m.last_visit_at ? formatDate(m.last_visit_at) : "—"}</td>
          </tr>`
      )
      .join("") || "<tr><td colspan='4'>Aucun membre</td></tr>";
  }

  function renderTransactions(transactions) {
    if (!transactionsTbody) return;
    transactionsTbody.innerHTML = transactions
      .map(
        (t) =>
          `<tr>
            <td>${escapeHtml(t.member_name)}</td>
            <td>${t.type === "points_add" ? "Points ajoutés" : t.type}</td>
            <td>+${t.points}</td>
            <td>${formatDate(t.created_at)}</td>
          </tr>`
      )
      .join("") || "<tr><td colspan='4'>Aucune opération</td></tr>";
  }

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  async function refresh() {
    try {
      await loadStats();
    } catch (e) {
      if (e.message === "Unauthorized") {
        if (errorEl) errorEl.classList.remove("hidden");
        if (contentEl) contentEl.classList.add("hidden");
      }
      return;
    }
    const membersData = await loadMembers(membersSearchInput?.value || "");
    allMembers = membersData.members || [];
    renderMembers(allMembers);
    const txData = await loadTransactions();
    renderTransactions(txData.transactions || []);
  }

  memberSearchInput?.addEventListener("input", async () => {
    const q = memberSearchInput.value.trim();
    if (q.length < 2) {
      memberListEl.classList.add("hidden");
      memberListEl.innerHTML = "";
      selectedMemberId = null;
      addPointsBtn.disabled = true;
      return;
    }
    const data = await loadMembers(q);
    const members = data.members || [];
    memberListEl.innerHTML = members
      .map(
        (m) =>
          `<div class="dashboard-member-item" data-id="${m.id}">${escapeHtml(m.name)} — ${escapeHtml(m.email)} (${m.points} pts)</div>`
      )
      .join("");
    memberListEl.classList.remove("hidden");
    memberListEl.querySelectorAll(".dashboard-member-item").forEach((el) => {
      el.addEventListener("click", () => {
        selectedMemberId = el.dataset.id;
        const m = members.find((x) => x.id === selectedMemberId);
        memberSearchInput.value = m ? `${m.name} (${m.email})` : "";
        memberListEl.classList.add("hidden");
        addPointsBtn.disabled = false;
      });
    });
  });

  oneVisitBtn?.addEventListener("click", () => {
    addPointsVisitOnly = true;
    amountInput.value = "";
  });

  amountInput?.addEventListener("input", () => {
    addPointsVisitOnly = false;
  });

  addPointsBtn?.addEventListener("click", async () => {
    if (!selectedMemberId) return;
    addPointsBtn.disabled = true;
    caisseMessage.classList.add("hidden");
    try {
      const body = addPointsVisitOnly ? { visit: true } : { amount_eur: parseFloat(amountInput.value) || 0 };
      if (!addPointsVisitOnly && !body.amount_eur) {
        showCaisseMessage("Indiquez un montant (€) ou cliquez sur « 1 passage ».", true);
        addPointsBtn.disabled = false;
        return;
      }
      const res = await fetch(`${API_BASE}/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(selectedMemberId)}/points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showCaisseMessage(data.error || "Erreur", true);
        addPointsBtn.disabled = false;
        return;
      }
      showCaisseMessage(`${data.points} point(s) ajouté(s). Total : ${data.points} pts.`);
      amountInput.value = "";
      selectedMemberId = null;
      memberSearchInput.value = "";
      addPointsVisitOnly = false;
      await refresh();
    } catch (e) {
      showCaisseMessage("Erreur réseau.", true);
    }
    addPointsBtn.disabled = false;
  });

  membersSearchInput?.addEventListener("input", () => {
    const q = membersSearchInput.value.trim();
    loadMembers(q).then((data) => renderMembers(data.members || []));
  });

  refresh();
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
  // Si le visiteur est le propriétaire du commerce, le renvoyer vers son espace (pas la page client).
  const token = getAuthToken();
  if (token) {
    fetch(`${API_BASE}/api/auth/me`, { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => {
        const businesses = data.businesses || [];
        if (businesses.some((b) => b.slug === slug)) {
          window.location.replace("/app");
          return;
        }
        runFidelityApp(slug);
      })
      .catch(() => runFidelityApp(slug));
    return;
  }
  runFidelityApp(slug);
}

function runFidelityApp(slug) {
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
