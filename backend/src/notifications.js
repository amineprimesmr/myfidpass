import webPush from "web-push";

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

/**
 * Envoie une notification Web Push à une subscription.
 * @param {{ endpoint: string, keys: { p256dh: string, auth: string } }} subscription
 * @param {{ title?: string, body: string }} payload
 * @returns Promise<void> — rejet en cas d'erreur (subscription expirée, etc.)
 */
export async function sendWebPush(subscription, payload) {
  const payloadStr = JSON.stringify({
    title: payload.title || "Fidpass",
    body: payload.body,
  });
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
