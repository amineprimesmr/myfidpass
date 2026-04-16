/**
 * Envoi SMS via Twilio REST (production).
 * Variables : TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, et TWILIO_FROM_NUMBER ou TWILIO_MESSAGING_SERVICE_SID.
 */

function basicAuthHeader() {
  const sid = process.env.TWILIO_ACCOUNT_SID || "";
  const token = process.env.TWILIO_AUTH_TOKEN || "";
  if (!sid || !token) return null;
  const b64 = Buffer.from(`${sid}:${token}`, "utf8").toString("base64");
  return `Basic ${b64}`;
}

export function isTwilioConfigured() {
  const sid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
  const token = (process.env.TWILIO_AUTH_TOKEN || "").trim();
  const from = (process.env.TWILIO_FROM_NUMBER || "").trim();
  const msid = (process.env.TWILIO_MESSAGING_SERVICE_SID || "").trim();
  return !!(sid && token && (from || msid));
}

/**
 * @param {string} toE164 ex. +33612345678
 * @param {string} body
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function sendSmsViaTwilio(toE164, body) {
  const sid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
  const auth = basicAuthHeader();
  const from = (process.env.TWILIO_FROM_NUMBER || "").trim();
  const msid = (process.env.TWILIO_MESSAGING_SERVICE_SID || "").trim();
  if (!sid || !auth || (!from && !msid)) {
    return { ok: false, error: "SMS non configuré (Twilio)." };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;
  const params = new URLSearchParams();
  params.set("To", toE164);
  params.set("Body", body);
  if (msid) {
    params.set("MessagingServiceSid", msid);
  } else {
    params.set("From", from);
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: text.slice(0, 2000) || `Twilio HTTP ${res.status}` };
  }
  return { ok: true };
}

/**
 * Messages lisibles pour l’app / les logs (codes Twilio courants).
 * @param {string} rawBody — corps JSON ou texte renvoyé par Twilio en cas d’erreur
 */
export function friendlyTwilioSendError(rawBody) {
  const raw = String(rawBody || "").trim();
  try {
    const j = JSON.parse(raw);
    const code = j.code != null ? Number(j.code) : NaN;
    if (code === 21608 || code === 21614) {
      return {
        message:
          "Compte Twilio en essai : vous ne pouvez envoyer des SMS qu’aux numéros ajoutés comme « numéros vérifiés » dans la console Twilio, ou passez à un compte payant.",
        twilioCode: code,
      };
    }
    if (code === 21211) {
      return {
        message: "Numéro de téléphone invalide ou non pris en charge pour l’envoi SMS.",
        twilioCode: code,
      };
    }
    if (code === 21610) {
      return {
        message: "Ce numéro est sur la liste d’exclusion SMS (STOP) ou ne peut pas recevoir ce message.",
        twilioCode: code,
      };
    }
    const msg = String(j.message || "").trim();
    if (msg) {
      return { message: msg.length > 280 ? `${msg.slice(0, 277)}…` : msg, twilioCode: Number.isNaN(code) ? undefined : code };
    }
  } catch (_) {
    /* ignore */
  }
  if (raw.length > 0 && raw.length < 400) {
    return { message: raw };
  }
  return { message: "L’envoi du SMS a échoué (Twilio). Vérifiez le numéro « From », le pays et les logs Twilio." };
}
