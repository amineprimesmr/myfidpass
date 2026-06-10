/**
 * Feedback envoi campagne : formatage + polling batch après HTTP 202.
 */

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** @param {Record<string, unknown>} data — réponse POST /send ou summary batch */
export function formatNotificationSendResult(data) {
  const sent = num(data.sent ?? data.summary?.sent);
  const wp = num(data.sentWebPush ?? data.sent_web_push ?? data.summary?.sentWebPush ?? data.summary?.sent_web_push);
  const pk = num(data.sentPassKit ?? data.sent_pass_kit ?? data.summary?.sentPassKit ?? data.summary?.sent_pass_kit);
  const gw = num(data.sentGoogleWallet ?? data.sent_google_wallet ?? data.summary?.sentGoogleWallet ?? data.summary?.sent_google_wallet);
  const failed = num(data.failed ?? data.summary?.failed);

  if (sent === 0) {
    return data.message || "Aucun appareil n'a reçu la notification.";
  }

  let msg =
    pk > 0 && wp > 0
      ? `Notification envoyée à ${sent} appareil(s) (dont ${pk} Apple Wallet, ${wp} navigateur).`
      : pk > 0
        ? `Notification envoyée à ${sent} appareil(s) (Apple Wallet).`
        : gw > 0 && wp === 0
          ? `Notification envoyée à ${sent} appareil(s) (Google Wallet).`
          : `Notification envoyée à ${sent} appareil(s).`;
  if (failed > 0) msg += ` ${failed} échec(s).`;
  return msg;
}

/**
 * Attend le résumé du batch créé juste après un POST /send (202).
 * @param {(path: string, init?: RequestInit) => Promise<Response>} apiFn
 * @param {{ startedAt?: number, maxAttempts?: number, intervalMs?: number }} [opts]
 */
export async function pollLatestNotificationBatch(apiFn, opts = {}) {
  const startedAt = opts.startedAt ?? Date.now();
  const maxAttempts = opts.maxAttempts ?? 24;
  const intervalMs = opts.intervalMs ?? 1500;

  for (let i = 0; i < maxAttempts; i++) {
    await sleep(intervalMs);
    try {
      const res = await apiFn("/notifications/batches?limit=5");
      if (!res.ok) continue;
      const data = await res.json();
      const batch = (data.batches || []).find((b) => {
        const t = Date.parse(String(b.created_at ?? "").replace(" ", "T"));
        return Number.isFinite(t) && t >= startedAt - 3000;
      });
      if (!batch?.summary || typeof batch.summary !== "object") continue;
      const s = batch.summary;
      if (s.sent != null || s.sent_pass_kit != null || s.sentPassKit != null || s.sent_web_push != null) {
        return { batch, summary: s };
      }
    } catch (_) {
      /* retry */
    }
  }
  return null;
}

/** @param {Record<string, unknown>} errBody */
export function notificationSendErrorMessage(errBody) {
  if (errBody?.code === "notification_icon_required") {
    return errBody.error || "Ajoutez une icône de notification dans l’onglet Notifications avant d’envoyer.";
  }
  return errBody?.error || "Erreur lors de l’envoi.";
}
