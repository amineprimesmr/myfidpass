import webPush from "web-push";
import sharp from "sharp";

let VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
let VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webPush.setVapidDetails("mailto:contact@myfidpass.fr", VAPID_PUBLIC, VAPID_PRIVATE);
} else {
  const { publicKey, privateKey } = webPush.generateVAPIDKeys();
  VAPID_PUBLIC = publicKey;
  VAPID_PRIVATE = privateKey;
  webPush.setVapidDetails("mailto:contact@myfidpass.fr", publicKey, privateKey);
  if (process.env.NODE_ENV === "production") {
    console.warn("[notifications] VAPID non configuré : définir VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY (voir web-push generate-vapid-keys).");
  } else {
    console.warn("[notifications] Clés VAPID générées pour ce démarrage. Pour les réutiliser, ajoutez à .env :");
    console.warn("VAPID_PUBLIC_KEY=" + publicKey);
    console.warn("VAPID_PRIVATE_KEY=" + privateKey);
  }
}

export function getVapidPublicKey() {
  return VAPID_PUBLIC || null;
}

/** Taille max de l’icône pour les notifications (carré). Garder petit pour rester sous 4 Ko de payload (limite Web Push). */
const NOTIFICATION_ICON_SIZE = 64;

/**
 * Produit une data URL d’icône à partir du logo base64 du commerce (redimensionnée).
 * Pour utiliser comme icône de notification (établissement).
 * @param {string|null|undefined} logoBase64 - data:image/...;base64,... ou null
 * @returns {Promise<string|null>} - data:image/png;base64,... ou null
 */
export async function getLogoIconDataUrl(logoBase64) {
  if (!logoBase64 || typeof logoBase64 !== "string") return null;
  const base64Data = String(logoBase64).replace(/^data:image\/\w+;base64,/, "");
  if (!base64Data) return null;
  try {
    const buf = Buffer.from(base64Data, "base64");
    if (buf.length === 0) return null;
    const small = await sharp(buf)
      .resize(NOTIFICATION_ICON_SIZE, NOTIFICATION_ICON_SIZE, { fit: "cover" })
      .png({ compressionLevel: 9 })
      .toBuffer();
    return "data:image/png;base64," + small.toString("base64");
  } catch (_) {
    return null;
  }
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
