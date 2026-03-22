import { messageUtilisateurPourErreur } from "../lib/client-error-fr.js";
import { isUnlimitedTicketsDemo } from "../lib/unlimited-tickets-demo.js";

function safeJson(res) {
  return res.json().catch(() => ({}));
}

/**
 * @param {string} url
 * @param {RequestInit} [init]
 * @param {string} networkFallback
 */
async function fetchFidelity(url, init, networkFallback) {
  try {
    return await fetch(url, init);
  } catch (e) {
    const msg = messageUtilisateurPourErreur(e, networkFallback);
    throw new Error(msg, { cause: e });
  }
}

export function createClientFidelityApi(apiBase) {
  const withBase = (path) => `${apiBase}${path}`;

  async function getBusiness(slug) {
    const res = await fetchFidelity(
      withBase(`/api/businesses/${encodeURIComponent(slug)}`),
      { cache: "no-store" },
      "Impossible de charger ce commerce. Vérifie ta connexion.",
    );
    if (!res.ok) throw new Error("Entreprise introuvable");
    return safeJson(res);
  }

  async function createMember(slug, payload) {
    const res = await fetchFidelity(
      withBase(`/api/businesses/${encodeURIComponent(slug)}/members`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      "Impossible de créer ta carte. Vérifie ta connexion.",
    );
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data.error || "Erreur création membre");
    return data;
  }

  async function getMember(slug, memberId) {
    const res = await fetchFidelity(
      withBase(`/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(memberId)}`),
      { cache: "no-store" },
      "Impossible de charger ton profil. Vérifie ta connexion.",
    );
    if (!res.ok) throw new Error("Membre introuvable");
    return safeJson(res);
  }

  async function getGames(slug) {
    try {
      const res = await fetchFidelity(
        withBase(`/api/businesses/${encodeURIComponent(slug)}/games`),
        { cache: "no-store" },
        "Jeux indisponibles pour le moment.",
      );
      if (!res.ok) return { games: [], roulette_segments: [] };
      return safeJson(res);
    } catch {
      return { games: [], roulette_segments: [] };
    }
  }

  async function getTickets(slug, memberId) {
    const res = await fetchFidelity(
      withBase(`/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(memberId)}/tickets`),
      { cache: "no-store" },
      "Tickets indisponibles. Vérifie ta connexion.",
    );
    if (!res.ok) throw new Error("Tickets indisponibles");
    return safeJson(res);
  }

  async function convertTickets(slug, memberId, pointsToConvert, idempotencyKey) {
    const res = await fetchFidelity(
      withBase(`/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(memberId)}/tickets/convert`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey || "" },
        body: JSON.stringify({ points_to_convert: pointsToConvert }),
      },
      "Conversion impossible : problème de connexion.",
    );
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data.error || "Conversion impossible");
    return data;
  }

  async function spin(slug, gameCode, memberId, clientFingerprint, idempotencyKey) {
    const demoHeaders = isUnlimitedTicketsDemo() ? { "X-Fidpass-Unlimited-Tickets-Demo": "1" } : {};
    const res = await fetchFidelity(
      withBase(`/api/businesses/${encodeURIComponent(slug)}/games/${encodeURIComponent(gameCode)}/spins`),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey || "",
          ...demoHeaders,
        },
        body: JSON.stringify({ memberId, client_fingerprint: clientFingerprint }),
      },
      "La roue n’a pas pu joindre le serveur. Réessaie.",
    );
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

  async function getWalletUrls(slug, memberId) {
    let googleRes = null;
    try {
      googleRes = await fetchFidelity(
        withBase(`/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(memberId)}/google-wallet-url`),
        { cache: "no-store" },
        "Wallet Google indisponible pour le moment.",
      );
    } catch {
      /* Apple reste disponible ; Google seulement si OK */
    }
    const googleData = googleRes ? await safeJson(googleRes) : {};
    return {
      apple: withBase(`/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(memberId)}/pass`),
      google: googleRes && googleRes.ok ? (googleData.url || "") : "",
    };
  }

  async function getEngagementActions(slug) {
    try {
      const res = await fetchFidelity(
        withBase(`/api/businesses/${encodeURIComponent(slug)}/engagement-actions?_=${Date.now()}`),
        { cache: "no-store" },
        "Missions indisponibles pour le moment.",
      );
      if (!res.ok) return { actions: [] };
      return safeJson(res);
    } catch {
      return { actions: [] };
    }
  }

  async function claimEngagement(slug, memberId, actionType) {
    const res = await fetchFidelity(
      withBase(`/api/businesses/${encodeURIComponent(slug)}/engagement/claim`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, action_type: actionType }),
      },
      "Impossible d’enregistrer la mission. Vérifie ta connexion.",
    );
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data.error || "Réclamation impossible");
    return data;
  }

  async function submitProfileForTicket(slug, memberId, payload) {
    const res = await fetchFidelity(
      withBase(`/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(memberId)}/profile-complete`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: payload.phone,
          city: payload.city,
          birth_date: payload.birth_date,
        }),
      },
      "Enregistrement impossible : problème de connexion.",
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
    getWalletUrls,
    getEngagementActions,
    claimEngagement,
    submitProfileForTicket,
  };
}
