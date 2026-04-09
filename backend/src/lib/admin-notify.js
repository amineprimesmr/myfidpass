/**
 * Notifications opérateur (emails + journal admin_events) lors des paiements Stripe.
 */
import { sendMail } from "../email.js";
import { insertAdminEvent } from "../db/admin-events.js";
import { getUserById } from "../db/users.js";
import { getBusinessById } from "../db/businesses.js";

function notificationRecipientEmails() {
  const raw = (process.env.ADMIN_NOTIFICATION_EMAILS || process.env.ADMIN_EMAILS || "").trim();
  return [...new Set(raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

/**
 * @param {{
 *   eventType: string,
 *   stripeEventId?: string|null,
 *   description: string,
 *   userId?: string|null,
 *   businessId?: string|null,
 *   amountEur?: number|null,
 *   currency?: string|null,
 *   extra?: Record<string, unknown>,
 * }} p
 */
export async function notifyAdminsPlatformEvent(p) {
  const payload = {
    event_type: p.eventType,
    user_id: p.userId ?? null,
    business_id: p.businessId ?? null,
    amount_eur: p.amountEur ?? null,
    currency: p.currency ?? "eur",
    description: p.description,
    stripe_event_id: p.stripeEventId ?? null,
    ...(p.extra || {}),
    at: new Date().toISOString(),
  };
  let ownerEmail = null;
  let bizLabel = null;
  if (p.userId) {
    const u = getUserById(String(p.userId));
    ownerEmail = u?.email || null;
  }
  if (p.businessId) {
    const b = getBusinessById(String(p.businessId));
    bizLabel = b ? `${b.organization_name || b.name} (${b.slug})` : null;
  }
  payload.owner_email = ownerEmail;
  payload.business_label = bizLabel;

  insertAdminEvent({
    eventType: p.eventType,
    payloadJson: payload,
    stripeEventId: p.stripeEventId || null,
  });

  const emails = notificationRecipientEmails();
  if (emails.length === 0) {
    return { emailed: false, reason: "no_admin_notification_emails" };
  }

  const lines = [
    p.description,
    "",
    `Type : ${p.eventType}`,
    p.userId ? `Compte commerçant : ${ownerEmail || p.userId}` : null,
    bizLabel ? `Commerce : ${bizLabel}` : null,
    p.amountEur != null ? `Montant : ${p.amountEur} ${(p.currency || "EUR").toUpperCase()}` : null,
    p.stripeEventId ? `Stripe event : ${p.stripeEventId}` : null,
  ].filter(Boolean);

  const subject = `[MyFidpass] ${p.description.slice(0, 80)}`;
  let sent = 0;
  for (const to of emails) {
    try {
      await sendMail({ to, subject, text: lines.join("\n") });
      sent++;
    } catch (err) {
      console.error("[admin-notify] sendMail failed:", err?.message || err);
    }
  }
  return { emailed: sent > 0, sent };
}
