/**
 * Page tableau de bord (token slug/token) : stats, membres, points, notifications.
 * Référence : REFONTE-REGLES.md — un module par écran, max 400 lignes.
 */
import { API_BASE } from "../config.js";
import { escapeHtmlForServer } from "../utils/apiError.js";

export function initDashboardPage() {
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
    const mobileStatMembers = document.getElementById("app-mobile-stat-members");
    const mobileStatScans = document.getElementById("app-mobile-stat-scans");
    if (mobileStatMembers) mobileStatMembers.textContent = data.membersCount ?? 0;
    if (mobileStatScans) mobileStatScans.textContent = data.transactionsThisMonth ?? 0;
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

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
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
    const txTypeLabel = (t) => {
      if (t.type === "points_add") return "Points ajoutés";
      if (t.type === "points_correction") return "Correction caisse";
      if (t.type === "reward_redeem") return "Récompense";
      return t.type;
    };
    transactionsTbody.innerHTML = transactions
      .map((t) => {
        const pts = Number(t.points) || 0;
        const signed = (pts > 0 ? "+" : "") + pts;
        return `<tr>
            <td>${escapeHtml(t.member_name)}</td>
            <td>${txTypeLabel(t)}</td>
            <td>${signed}</td>
            <td>${formatDate(t.created_at)}</td>
          </tr>`;
      })
      .join("") || "<tr><td colspan='4'>Aucune opération</td></tr>";
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
      const headers = { "Content-Type": "application/json" };
      if (token) headers["X-Dashboard-Token"] = token;
      const res = await fetch(`${API_BASE}/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(selectedMemberId)}/points`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showCaisseMessage(data.error || "Erreur", true);
        addPointsBtn.disabled = false;
        return;
      }
      const added = data.points_added ?? data.points;
      const total = data.points;
      showCaisseMessage(`${added} point(s) ajouté(s). Total : ${total} pts.`);
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

  async function loadNotificationStats() {
    try {
      const res = await api("/notifications/stats");
      if (!res.ok) return;
      const data = await res.json();
      const el = document.getElementById("dashboard-notifications-stats");
      const diagEl = document.getElementById("dashboard-notifications-diagnostic");
      if (el) {
        const total = data.subscriptionsCount != null ? data.subscriptionsCount : 0;
        const membersCount = data.membersCount != null ? data.membersCount : 0;
        const web = data.webPushCount != null ? data.webPushCount : 0;
        const wallet = data.passKitCount != null ? data.passKitCount : 0;
        if (membersCount > 0 && total === 0) {
          el.textContent = `Tu as ${membersCount} membre(s). Aucun appareil ne nous a encore envoyé son enregistrement — on ne peut pas envoyer de notifications push pour l'instant.`;
        } else if (total === 0) {
          el.textContent = "Aucun appareil enregistré pour l'instant.";
        } else if (membersCount > 0) {
          el.textContent = `Tu as ${membersCount} membre(s). ${total} appareil(s) peuvent recevoir les notifications.`;
        } else if (wallet > 0 && web > 0) {
          el.textContent = `${total} appareil(s) peuvent recevoir les notifications (dont ${wallet} Apple Wallet, ${web} navigateur).`;
        } else if (wallet > 0) {
          el.textContent = `${total} appareil(s) peuvent recevoir les notifications (Apple Wallet).`;
        } else {
          el.textContent = `${total} appareil(s) peuvent recevoir les notifications.`;
        }
        const hintEl = document.getElementById("dashboard-notifications-members-vs-devices-hint");
        if (hintEl) {
          if (membersCount > total && total > 0) {
            hintEl.textContent = "« Envoyer » envoie à tous les appareils enregistrés (" + total + "), pas à tous les " + membersCount + " membres.";
            hintEl.classList.remove("hidden");
          } else if (total > 0) {
            hintEl.textContent = "";
            hintEl.classList.remove("hidden");
          } else {
            hintEl.classList.add("hidden");
            hintEl.textContent = "";
          }
        }
      }
      if (diagEl) {
        const total = data.subscriptionsCount != null ? data.subscriptionsCount : 0;
        const passKitOk = data.passKitUrlConfigured === true;
        if (total === 0 && data.helpWhenNoDevice) {
          let html = data.paradoxExplanation
            ? `<p class="dashboard-notifications-diagnostic-title">J'ai scanné la carte du client mais « 0 appareil » — pourquoi ?</p><p class="dashboard-notifications-diagnostic-text">${escapeHtmlForServer(data.paradoxExplanation)}</p>`
            : (data.membersVsDevicesExplanation ? `<p class="dashboard-notifications-diagnostic-title">Pourquoi des membres mais « 0 appareil » ?</p><p class="dashboard-notifications-diagnostic-text">${escapeHtmlForServer(data.membersVsDevicesExplanation)}</p>` : "");
          html += `<p class="dashboard-notifications-diagnostic-title">Pour enregistrer ton iPhone</p><p class="dashboard-notifications-diagnostic-text">${escapeHtmlForServer(data.helpWhenNoDevice)}</p>`;
          if (data.testPasskitCurl) {
            const curlEscaped = data.testPasskitCurl.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            html += `<p class="dashboard-notifications-diagnostic-text" style="margin-top: 0.75rem;"><strong>Test diagnostic :</strong> exécute cette commande dans un terminal (sur ton ordi). Si tu obtiens <code>HTTP 201</code>, l'API fonctionne et le blocage vient de l'iPhone ou du réseau.</p><pre class="dashboard-notifications-curl">${curlEscaped}</pre>`;
          }
          diagEl.innerHTML = html;
          diagEl.classList.remove("hidden");
        } else if (total === 0 && !passKitOk && data.diagnostic) {
          diagEl.classList.add("hidden");
          diagEl.innerHTML = "";
        } else {
          diagEl.classList.add("hidden");
          diagEl.innerHTML = "";
        }
      }
      await loadDashboardNotificationCategories();
    } catch (_) {}
  }

  async function loadDashboardNotificationCategories() {
    try {
      const res = await api("/dashboard/categories");
      if (!res.ok) return;
      const data = await res.json();
      const categories = data.categories || [];
      const wrap = document.getElementById("dashboard-notif-categories-wrap");
      const listEl = document.getElementById("dashboard-notif-categories-list");
      const targetAll = document.getElementById("dashboard-notif-target-all");
      if (!wrap || !listEl) return;
      if (categories.length === 0) {
        wrap.classList.add("hidden");
        return;
      }
      wrap.classList.remove("hidden");
      listEl.innerHTML = categories
        .map((c) => `<label class="dashboard-checkbox-label"><input type="checkbox" class="dashboard-notif-category-cb" data-id="${escapeHtml(c.id)}" /> ${escapeHtml(c.name)}</label>`)
        .join("");
      listEl.querySelectorAll(".dashboard-notif-category-cb").forEach((cb) => {
        cb.addEventListener("change", () => {
          if (cb.checked && targetAll) targetAll.checked = false;
        });
      });
      if (targetAll && !targetAll.dataset.notifCatListen) {
        targetAll.dataset.notifCatListen = "1";
        targetAll.addEventListener("change", () => {
          if (targetAll.checked) listEl.querySelectorAll(".dashboard-notif-category-cb").forEach((c) => { c.checked = false; });
        });
      }
    } catch (_) {}
  }

  document.getElementById("dashboard-notif-send")?.addEventListener("click", async () => {
    const titleEl = document.getElementById("dashboard-notif-title");
    const messageEl = document.getElementById("dashboard-notif-message");
    const feedbackEl = document.getElementById("dashboard-notif-feedback");
    const btn = document.getElementById("dashboard-notif-send");
    const targetAll = document.getElementById("dashboard-notif-target-all");
    const message = messageEl?.value?.trim();
    if (!message) {
      if (feedbackEl) { feedbackEl.textContent = "Saisissez un message."; feedbackEl.classList.remove("hidden", "success"); feedbackEl.classList.add("error"); }
      return;
    }
    let categoryIds = undefined;
    if (!targetAll?.checked) {
      const checked = document.querySelectorAll(".dashboard-notif-category-cb:checked");
      if (checked.length > 0) categoryIds = Array.from(checked).map((c) => c.dataset.id).filter(Boolean);
    }
    if (btn) btn.disabled = true;
    if (feedbackEl) feedbackEl.classList.add("hidden");
    try {
      const res = await fetch(`${API_BASE}/api/businesses/${encodeURIComponent(slug)}/notifications/send?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: titleEl?.value?.trim() || undefined, message, ...(categoryIds && categoryIds.length > 0 ? { category_ids: categoryIds } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (feedbackEl) {
        feedbackEl.classList.remove("hidden");
        if (res.ok) {
          const sent = data.sent != null ? data.sent : 0;
          const wp = data.sentWebPush != null ? data.sentWebPush : 0;
          const pk = data.sentPassKit != null ? data.sentPassKit : 0;
          if (sent === 0) feedbackEl.textContent = data.message || "Aucun appareil n'a reçu la notification.";
          else {
            let msg = pk > 0 && wp > 0 ? `Notification envoyée à ${sent} appareil(s) (dont ${pk} Apple Wallet, ${wp} navigateur).` : pk > 0 ? `Notification envoyée à ${sent} appareil(s) (Apple Wallet).` : `Notification envoyée à ${sent} appareil(s).`;
            if (data.failed > 0 && data.errors?.length) msg += ` ${data.failed} échec(s).`;
            feedbackEl.textContent = msg;
            const prevTip = feedbackEl.nextElementSibling?.classList?.contains("dashboard-notif-feedback-tip") ? feedbackEl.nextElementSibling : null;
            if (prevTip) prevTip.remove();
            if (pk > 0) {
              const tip = document.createElement("p");
              tip.className = "dashboard-notif-feedback-tip";
              tip.textContent = "";
              feedbackEl.after(tip);
            }
          }
          feedbackEl.classList.remove("error");
          feedbackEl.classList.add("success");
        } else {
          feedbackEl.textContent = data.error || "Erreur";
          feedbackEl.classList.add("error");
        }
      }
      if (res.ok) loadNotificationStats();
    } catch (e) {
      if (feedbackEl) { feedbackEl.textContent = "Erreur réseau."; feedbackEl.classList.remove("hidden", "success"); feedbackEl.classList.add("error"); }
    }
    if (btn) btn.disabled = false;
  });

  refresh();
  loadNotificationStats();
}
