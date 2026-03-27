import webPush from "web-push";
import sharp from "sharp";

let VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
let VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webPush.setVapidDetails("mailto:contact@myfidpass.fr", VAPID_PUBLIC, VAPID_PRIVATE);
} else {
  const { publicKey, privateKey } = webPush.generateVAPIDKeys();
  VAPID_PUBLIC = publicKey;
  webPush.setVapidDetails("mailto:contact@myfidpass.fr", publicKey, privateKey);
  if (process.env.NODE_ENV === "production") {
    console.error("[notifications] CRITIQUE : VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY non configurées. Des clés éphémères ont été générées — toutes les subscriptions web push existantes sont maintenant invalides et échoueront silencieusement jusqu'au prochain redémarrage. Définissez ces variables sur Railway de façon permanente (voir web-push generate-vapid-keys).");
  } else {
    console.warn("[notifications] Clés VAPID générées pour ce démarrage. Pour les réutiliser, ajoutez à .env :");
    console.warn("VAPID_PUBLIC_KEY=" + publicKey);
    console.warn("VAPID_PRIVATE_KEY=" + privateKey);
  }
}

export function getVapidPublicKey() {
  return VAPID_PUBLIC || null;
}

/** Taille de l’icône pour les notifications (carré). Utiliser une URL plutôt qu’une data URL pour rester sous la limite de payload (ex. 4 Ko FCM). */
export const NOTIFICATION_ICON_SIZE = 96;

/**
 * Produit le buffer PNG de l’icône notification (logo redimensionné).
 * Utilisé par l’endpoint GET .../notification-icon et pour la data URL de fallback.
 * @param {string|null|undefined} logoBase64 - data:image/...;base64,... ou null
 * @returns {Promise<Buffer|null>}
 */
export async function getLogoIconBuffer(logoBase64) {
  if (!logoBase64 || typeof logoBase64 !== "string") return null;
  const base64Data = String(logoBase64).replace(/^data:image\/\w+;base64,/, "");
  if (!base64Data) return null;
  try {
    const buf = Buffer.from(base64Data, "base64");
    if (buf.length === 0) return null;
    return await sharp(buf)
      .resize(NOTIFICATION_ICON_SIZE, NOTIFICATION_ICON_SIZE, { fit: "cover" })
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch (_) {
    return null;
  }
}

/**
 * Produit une data URL d’icône (fallback si on ne peut pas utiliser l’URL).
 * @param {string|null|undefined} logoBase64
 * @returns {Promise<string|null>}
 */
export async function getLogoIconDataUrl(logoBase64) {
  const buffer = await getLogoIconBuffer(logoBase64);
  return buffer ? "data:image/png;base64," + buffer.toString("base64") : null;
}

/**
 * Envoie une notification Web Push à une subscription.
 * @param {{ endpoint: string, keys: { p256dh: string, auth: string } }} subscription
 * @param {{ title?: string, body: string, icon?: string }} payload - icon: data URL ou URL de l’icône (ex. logo établissement)
 * @returns Promise<void> — rejet en cas d'erreur (subscription expirée, etc.)
 */
export async function sendWebPush(subscription, payload) {
  const payloadObj = {
    title: payload.title || "Myfidpass",
    body: payload.body,
  };
  if (payload.icon) payloadObj.icon = payload.icon;
  const payloadStr = JSON.stringify(payloadObj);
  await webPush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    },
    payloadStr,
    { TTL: 86400 }
  );
}
