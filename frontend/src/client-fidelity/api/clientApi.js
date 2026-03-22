function safeJson(res) {
  return res.json().catch(() => ({}));
}

export function createClientFidelityApi(apiBase) {
  const withBase = (path) => `${apiBase}${path}`;

  async function getBusiness(slug) {
    const res = await fetch(withBase(`/api/businesses/${encodeURIComponent(slug)}`), { cache: "no-store" });
    if (!res.ok) throw new Error("Entreprise introuvable");
    return safeJson(res);
  }

  async function createMember(slug, payload) {
    const res = await fetch(withBase(`/api/businesses/${encodeURIComponent(slug)}/members`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data.error || "Erreur création membre");
    return data;
  }

  async function getMember(slug, memberId) {
    const res = await fetch(withBase(`/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(memberId)}`), { cache: "no-store" });
    if (!res.ok) throw new Error("Membre introuvable");
    return safeJson(res);
  }

  async function getGames(slug) {
    const res = await fetch(withBase(`/api/businesses/${encodeURIComponent(slug)}/games`), { cache: "no-store" });
    if (!res.ok) return { games: [], roulette_segments: [] };
    return safeJson(res);
  }

  async function getTickets(slug, memberId) {
    const res = await fetch(withBase(`/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(memberId)}/tickets`), { cache: "no-store" });
    if (!res.ok) throw new Error("Tickets indisponibles");
    return safeJson(res);
  }

  async function convertTickets(slug, memberId, pointsToConvert, idempotencyKey) {
    const res = await fetch(withBase(`/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(memberId)}/tickets/convert`), {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey || "" },
      body: JSON.stringify({ points_to_convert: pointsToConvert }),
    });
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data.error || "Conversion impossible");
    return data;
  }

  async function spin(slug, gameCode, memberId, clientFingerprint, idempotencyKey) {
    const res = await fetch(withBase(`/api/businesses/${encodeURIComponent(slug)}/games/${encodeURIComponent(gameCode)}/spins`), {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey || "" },
      body: JSON.stringify({ memberId, client_fingerprint: clientFingerprint }),
    });
    const data = await safeJson(res);
    if (!res.ok) {
      const fallback = res.status >= 500 ? "Erreur serveur. Réessaie dans un instant." : "Spin impossible";
      const msg = data.error || fallback;
      const code = data.code ? ` (${data.code})` : "";
      const detail = data.detail ? ` — ${data.detail}` : "";
      throw new Error(msg + code + detail);
    }
    return data;
  }

  async function getRewards(slug, memberId) {
    const res = await fetch(withBase(`/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(memberId)}/rewards`), { cache: "no-store" });
    if (!res.ok) return { rewards: [] };
    return safeJson(res);
  }

  async function getWalletUrls(slug, memberId) {
    const [googleRes] = await Promise.all([
      fetch(withBase(`/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(memberId)}/google-wallet-url`), { cache: "no-store" }),
    ]);
    const googleData = await safeJson(googleRes);
    return {
      apple: withBase(`/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(memberId)}/pass`),
      google: googleRes.ok ? (googleData.url || "") : "",
    };
  }

  async function getEngagementActions(slug) {
    const res = await fetch(withBase(`/api/businesses/${encodeURIComponent(slug)}/engagement-actions?_=${Date.now()}`), { cache: "no-store" });
    if (!res.ok) return { actions: [] };
    return safeJson(res);
  }

  async function claimEngagement(slug, memberId, actionType) {
    const res = await fetch(withBase(`/api/businesses/${encodeURIComponent(slug)}/engagement/claim`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId, action_type: actionType }),
    });
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data.error || "Réclamation impossible");
    return data;
  }

  async function submitProfileForTicket(slug, memberId, payload) {
    const res = await fetch(
      withBase(`/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(memberId)}/profile-complete`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: payload.phone,
          city: payload.city,
          birth_date: payload.birth_date,
        }),
      }
    );
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data.error || "Enregistrement impossible");
    return data;
  }

  return {
    getBusiness,
    createMember,
    getMember,
    getGames,
    getTickets,
    convertTickets,
    spin,
    getRewards,
    getWalletUrls,
    getEngagementActions,
    claimEngagement,
    submitProfileForTicket,
  };
}
