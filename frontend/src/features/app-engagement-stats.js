const CHANNELS = ["google_review", "instagram_follow", "tiktok_follow", "facebook_follow"];

const CHANNEL_META = {
  google_review: { label: "Google", icon: "/assets/logos/google.png", defaultPoints: 2 },
  instagram_follow: { label: "Instagram", icon: "/assets/logos/instagram.png", defaultPoints: 1 },
  tiktok_follow: { label: "TikTok", icon: "/assets/logos/tiktok.png", defaultPoints: 1 },
  facebook_follow: { label: "Facebook", icon: "/assets/logos/facebook.png", defaultPoints: 1 },
};

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function percent(active, total) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((active / total) * 100)));
}

function prefersReducedMotion() {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function animateNumber(el, target, { duration = 620, formatter = (v) => String(v), decimals = 0 } = {}) {
  if (!el) return;
  const targetSafe = Number(target);
  if (!Number.isFinite(targetSafe)) {
    el.textContent = formatter(target);
    return;
  }
  if (prefersReducedMotion()) {
    el.textContent = formatter(targetSafe);
    return;
  }
  const currentRaw = String(el.textContent || "").replace(/[^\d.,-]/g, "").replace(",", ".");
  const current = Number.parseFloat(currentRaw);
  const from = Number.isFinite(current) ? current : 0;
  const start = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const frame = (now) => {
    const p = Math.min(1, (now - start) / duration);
    const value = from + (targetSafe - from) * ease(p);
    const rounded = decimals > 0
      ? Number(value.toFixed(decimals))
      : Math.round(value);
    el.textContent = formatter(rounded);
    if (p < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function getHiddenRefs(channel) {
  if (channel === "google_review") {
    return {
      enabled: document.getElementById("app-engagement-google-enable"),
      points: document.getElementById("app-engagement-google-points"),
      value: document.getElementById("app-engagement-google-place-id"),
    };
  }
  if (channel === "instagram_follow") {
    return {
      enabled: document.getElementById("app-engagement-instagram-enable"),
      points: document.getElementById("app-engagement-instagram-points"),
      value: document.getElementById("app-engagement-instagram-url"),
    };
  }
  if (channel === "tiktok_follow") {
    return {
      enabled: document.getElementById("app-engagement-tiktok-enable"),
      points: document.getElementById("app-engagement-tiktok-points"),
      value: document.getElementById("app-engagement-tiktok-url"),
    };
  }
  return {
    enabled: document.getElementById("app-engagement-facebook-enable"),
    points: document.getElementById("app-engagement-facebook-points"),
    value: document.getElementById("app-engagement-facebook-url"),
  };
}

function readVisualRows() {
  return CHANNELS.map((channel) => {
    const root = document.querySelector(`[data-engagement-channel="${channel}"]`);
    const enabledEl = root?.querySelector('[data-role="enabled"]');
    const pointsEl = root?.querySelector('[data-role="points"]');
    const valueEl = root?.querySelector('[data-role="value"]');
    return { channel, root, enabledEl, pointsEl, valueEl };
  });
}

function syncRowVisualState(row) {
  const enabled = !!row.enabledEl?.checked;
  row.root?.classList.toggle("app-engagement-stats__network-card--connected", enabled);
}

function computeOverview(latestStats, er) {
  const configuredCount = CHANNELS.reduce((acc, key) => {
    const item = er?.[key];
    const hasValue = key === "google_review"
      ? String(item?.place_id || "").trim().length > 0
      : String(item?.url || "").trim().length > 0;
    return acc + (item?.enabled && hasValue ? 1 : 0);
  }, 0);
  const members = toInt(latestStats?.membersCount, 3920);
  const active = toInt(latestStats?.activeMembersInPeriod, Math.round(members * 0.98));
  const inactive = toInt(latestStats?.inactiveMembers30Days, Math.max(0, members - active));
  const points = toInt(latestStats?.pointsThisMonth, 2200 + configuredCount * 120);
  const scans = toInt(latestStats?.transactionsThisMonth, 734 + configuredCount * 18);
  const newMembers = toInt(latestStats?.newMembersInPeriod, 62 + configuredCount * 2);
  const avgBasket = Number(latestStats?.avgBasketEur);
  const avgBasketSafe = Number.isFinite(avgBasket) ? avgBasket : 22.5;
  const avgVisits = Number(latestStats?.avgVisitsPerActiveMember);
  const avgVisitsSafe = Number.isFinite(avgVisits) ? avgVisits : 2.6;
  const basketDelta = Number(latestStats?.avgBasketDeltaPct);
  const basketDeltaSafe = Number.isFinite(basketDelta) ? basketDelta : 12.5;
  const freqDelta = Number(latestStats?.frequencyDeltaPct);
  const freqDeltaSafe = Number.isFinite(freqDelta) ? freqDelta : 14;
  return {
    members,
    active,
    inactive,
    points,
    scans,
    configuredCount,
    newMembers,
    avgBasket: avgBasketSafe,
    avgVisits: avgVisitsSafe,
    basketDelta: basketDeltaSafe,
    freqDelta: freqDeltaSafe,
  };
}

function renderOverview(overview) {
  const activePct = percent(overview.active, overview.active + overview.inactive);
  const inactivePct = Math.max(0, 100 - activePct);
  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
  };
  setText("app-engagement-stats-active-pct", `${activePct}%`);
  setText("app-engagement-stats-inactive-pct", `${inactivePct}%`);
  animateNumber(
    document.getElementById("app-engagement-stats-active-count"),
    overview.active,
    { formatter: (v) => Number(v).toLocaleString("fr-FR") },
  );
  animateNumber(
    document.getElementById("app-engagement-stats-inactive-count"),
    overview.inactive,
    { formatter: (v) => Number(v).toLocaleString("fr-FR") },
  );
  animateNumber(
    document.getElementById("app-engagement-stats-points"),
    overview.points,
    { formatter: (v) => Number(v).toLocaleString("fr-FR") },
  );
  animateNumber(
    document.getElementById("app-engagement-stats-members"),
    overview.members,
    { formatter: (v) => Number(v).toLocaleString("fr-FR") },
  );
  animateNumber(
    document.getElementById("app-engagement-stats-new-members"),
    Math.max(0, Math.round(overview.newMembers)),
    { formatter: (v) => `+${Number(v).toLocaleString("fr-FR")}` },
  );
  animateNumber(
    document.getElementById("app-engagement-stats-basket"),
    overview.avgBasket,
    {
      decimals: 1,
      formatter: (v) => `${Number(v).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}€`,
    },
  );
  animateNumber(
    document.getElementById("app-engagement-stats-frequency"),
    overview.avgVisits,
    {
      decimals: 1,
      formatter: (v) => Number(v).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    },
  );
  setText("app-engagement-stats-basket-delta", `+${Math.max(0, Math.round(overview.basketDelta * 10) / 10).toLocaleString("fr-FR")}%`);
  setText("app-engagement-stats-frequency-delta", `+${Math.max(0, Math.round(overview.freqDelta * 10) / 10).toLocaleString("fr-FR")}%`);
  animateNumber(
    document.getElementById("app-engagement-stats-reviews"),
    overview.configuredCount + 4,
    { formatter: (v) => `+${Number(v).toLocaleString("fr-FR")}` },
  );
  animateNumber(
    document.getElementById("app-engagement-stats-reviews-total"),
    overview.scans,
    { formatter: (v) => Number(v).toLocaleString("fr-FR") },
  );
  const bar = document.getElementById("app-engagement-stats-active-bar");
  if (bar) bar.style.width = `${activePct}%`;
  const barInactive = document.getElementById("app-engagement-stats-inactive-bar");
  if (barInactive) barInactive.style.width = `${Math.max(4, inactivePct)}%`;
}

function renderRewards(overview) {
  const list = document.getElementById("app-engagement-stats-rewards");
  if (!list) return;
  const base = [
    { label: "Boisson offerte", value: 5 + overview.configuredCount },
    { label: "Dessert au choix", value: 5 + Math.max(0, overview.configuredCount - 1) },
    { label: "Récompense tampons", value: 1 + Math.floor(overview.configuredCount / 2) },
  ];
  list.innerHTML = base
    .map((item) => `<li><strong>${item.value}</strong><span>${item.label}</span></li>`)
    .join("");
}

export function applyEngagementStatsFromSettings(settingsData = {}, latestStats = null) {
  const er = settingsData.engagement_rewards ?? settingsData.engagementRewards ?? {};
  readVisualRows().forEach((row) => {
    if (!row.root) return;
    const item = er?.[row.channel] ?? {};
    const refs = getHiddenRefs(row.channel);
    const currentValue = row.channel === "google_review" ? item.place_id ?? "" : item.url ?? "";
    const points = toInt(item.points, CHANNEL_META[row.channel].defaultPoints);
    if (refs.enabled) refs.enabled.checked = !!item.enabled;
    if (refs.points) refs.points.value = String(points);
    if (refs.value) refs.value.value = currentValue;
    if (row.enabledEl) row.enabledEl.checked = !!item.enabled;
    if (row.pointsEl) row.pointsEl.value = String(points);
    if (row.valueEl) row.valueEl.value = currentValue;
    syncRowVisualState(row);
  });
  const overview = computeOverview(latestStats, er);
  renderOverview(overview);
  renderRewards(overview);
}

export function wireEngagementStatsSection({ markDirty }) {
  const wrapper = document.querySelector(".app-engagement-stats");
  if (wrapper && !wrapper.classList.contains("is-ready")) {
    requestAnimationFrame(() => wrapper.classList.add("is-ready"));
  }
  const rows = readVisualRows();
  const suggest = document.getElementById("app-engagement-auto-suggest");
  rows.forEach((row) => {
    if (!row.root) return;
    const refs = getHiddenRefs(row.channel);
    const sync = () => {
      if (refs.enabled && row.enabledEl) refs.enabled.checked = !!row.enabledEl.checked;
      if (refs.points && row.pointsEl) refs.points.value = String(toInt(row.pointsEl.value, CHANNEL_META[row.channel].defaultPoints));
      if (refs.value && row.valueEl) refs.value.value = String(row.valueEl.value || "").trim();
      syncRowVisualState(row);
      if (typeof markDirty === "function") markDirty("engagement");
    };
    row.enabledEl?.addEventListener("change", sync);
    row.pointsEl?.addEventListener("input", sync);
    row.valueEl?.addEventListener("input", sync);
  });
  suggest?.addEventListener("click", () => {
    setTimeout(() => {
      rows.forEach((row) => {
        const refs = getHiddenRefs(row.channel);
        if (!row.root) return;
        if (row.enabledEl && refs.enabled) row.enabledEl.checked = !!refs.enabled.checked;
        if (row.pointsEl && refs.points) row.pointsEl.value = String(refs.points.value || "");
        if (row.valueEl && refs.value) row.valueEl.value = String(refs.value.value || "");
        syncRowVisualState(row);
      });
    }, 80);
  });
}

