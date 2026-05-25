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

  async function getMatchPredictions(slug, memberId) {
    try {
      const res = await fetchFidelity(
        withBase(`/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(memberId)}/match-predictions`),
        { cache: "no-store" },
        "Pronostics indisponibles pour le moment.",
      );
      if (!res.ok) return { enabled: false, matches: [] };
      return safeJson(res);
    } catch {
      return { enabled: false, matches: [] };
    }
  }

  async function submitMatchPrediction(slug, memberId, matchId, choice) {
    const res = await fetchFidelity(
      withBase(`/api/businesses/${encodeURIComponent(slug)}/games/match_predictions/matches/${encodeURIComponent(matchId)}/predictions`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, choice }),
      },
      "Impossible d’enregistrer ton pronostic. Vérifie ta connexion.",
    );
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data.error || "Pronostic impossible");
    return data;
  }

  async function getTickets(slug, memberId) {
    const res = await fetchFidelity(
      withBase(`/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(memberId)}/tickets`),
      { cache: "no-store" },
      "Solde indisponible. Vérifie ta connexion.",
    );
    if (!res.ok) throw new Error("Solde indisponible");
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
    const googleUrlPath = `/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(memberId)}/google-wallet-url`;
    /** Deux essais : échec transitoire réseau trop fréquent sur mobile. */
    for (let attempt = 0; attempt < 2 && googleRes == null; attempt += 1) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 380));
      }
      try {
        googleRes = await fetchFidelity(withBase(googleUrlPath), { cache: "no-store" }, "");
      } catch {
        googleRes = null;
      }
    }
    const googleData = googleRes ? await safeJson(googleRes) : {};
    return {
      apple: withBase(`/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(memberId)}/pass`),
      google: googleRes && googleRes.ok ? (googleData.url || "") : "",
    };
  }

  /**
   * À l’appui sur « Google Wallet » : récupère l’URL de save (ou le motif d’échec).
   * @returns {Promise<{ ok: true, url: string } | { ok: false, code?: string, error: string }>}
   */
  async function getGoogleWalletSaveLink(slug, memberId) {
    try {
      const res = await fetchFidelity(
        withBase(`/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(memberId)}/google-wallet-url`),
        { cache: "no-store" },
        "Impossible de joindre le serveur. Vérifie ta connexion.",
      );
      const data = await safeJson(res);
      if (res.ok && data.url) return { ok: true, url: String(data.url) };
      return {
        ok: false,
        code: data.code ? String(data.code) : "",
        error: data.error ? String(data.error) : "Impossible d’ouvrir Google Wallet.",
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur réseau.";
      return { ok: false, code: "", error: msg };
    }
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

  async function claimGuestIdentity(slug, memberId, payload) {
    const res = await fetchFidelity(
      withBase(`/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(memberId)}/claim-identity`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: payload.name, email: payload.email }),
      },
      "Impossible d’enregistrer tes coordonnées. Réessaie.",
    );
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data.error || "Enregistrement impossible");
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

  async function listDeliveryReceiptClaims(slug, memberId) {
    const res = await fetchFidelity(
      withBase(
        `/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(memberId)}/delivery-receipt-claims`,
      ),
      { cache: "no-store" },
      "Historique des réclamations indisponible.",
    );
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data.error || "Historique indisponible");
    return data;
  }

  /**
   * @param {{ image_base64: string, mime_type?: string, idempotency_key?: string }} payload
   */
  async function submitDeliveryReceiptClaim(slug, memberId, payload) {
    const headers = { "Content-Type": "application/json" };
    if (payload.idempotency_key) headers["Idempotency-Key"] = payload.idempotency_key;
    const res = await fetchFidelity(
      withBase(`/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(memberId)}/delivery-receipt-claims`),
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          image_base64: payload.image_base64,
          mime_type: payload.mime_type,
        }),
      },
      "Envoi du ticket impossible. Vérifie ta connexion.",
    );
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data.error || "Envoi impossible");
    return data;
  }

  return {
    getBusiness,
    createMember,
    getMember,
    getGames,
    getMatchPredictions,
    submitMatchPrediction,
    getTickets,
    convertTickets,
    spin,
    getWalletUrls,
    getGoogleWalletSaveLink,
    getEngagementActions,
    claimEngagement,
    claimGuestIdentity,
    submitProfileForTicket,
    listDeliveryReceiptClaims,
    submitDeliveryReceiptClaim,
  };
}
