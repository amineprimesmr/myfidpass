/**
 * Classification des appareils Wallet/Web Push d'un commerce en fonction du membre lié :
 *  - deliverable : vrais clients (ce que la campagne touche réellement),
 *  - preview     : carte d'aperçu du commerçant (`wallet-apercu.*`), testable en auto-test,
 *  - guest       : invités QR (`@guest.invalid`), exclus des campagnes.
 *
 * Aligne le COMPTAGE readiness sur le FILTRE de `dispatch.js` (`isTechnicalMemberEmail`),
 * pour ne plus annoncer "Prêt" alors que l'envoi ne touche personne.
 */
import { getMemberForBusiness, isWalletPreviewEmail, isGuestPlaceholderEmail } from "../db.js";
import { getMemberForBusinessOrGroup } from "./loyalty-group-resolve.js";

function resolveRowMember(serialOrMemberId, business) {
  const id = String(serialOrMemberId ?? "").trim();
  if (!id) return null;
  return getMemberForBusinessOrGroup(id, business) ?? getMemberForBusiness(id, business.id);
}

function classifyEmail(email) {
  if (isWalletPreviewEmail(email)) return "preview";
  if (isGuestPlaceholderEmail(email)) return "guest";
  return "deliverable";
}

/**
 * @param {import("../db/businesses.js").BusinessRow} business
 * @param {{ passKitTokens?: Array<{push_token?: string, serial_number?: string}>, webSubscriptions?: Array<{member_id?: string}> }} channels
 */
export function classifyDeliveryDevices(business, { passKitTokens = [], webSubscriptions = [] } = {}) {
  let deliverablePassKit = 0;
  let previewPassKit = 0;
  let guestPassKit = 0;
  const seenTokens = new Set();
  for (const row of passKitTokens) {
    const token = String(row?.push_token ?? "").trim();
    if (token) {
      if (seenTokens.has(token)) continue;
      seenTokens.add(token);
    }
    const member = resolveRowMember(row?.serial_number, business);
    switch (classifyEmail(member?.email)) {
      case "preview":
        previewPassKit++;
        break;
      case "guest":
        guestPassKit++;
        break;
      default:
        deliverablePassKit++;
    }
  }

  let deliverableWeb = 0;
  let previewWeb = 0;
  for (const sub of webSubscriptions) {
    const member = resolveRowMember(sub?.member_id, business);
    switch (classifyEmail(member?.email)) {
      case "preview":
        previewWeb++;
        break;
      case "guest":
        break;
      default:
        deliverableWeb++;
    }
  }

  const deliverableDevices = deliverablePassKit + deliverableWeb;
  const previewDevices = previewPassKit + previewWeb;
  return {
    totalDevices: passKitTokens.length + webSubscriptions.length,
    deliverableDevices,
    previewDevices,
    guestDevices: guestPassKit,
    deliverablePassKit,
    deliverableWeb,
    previewPassKit,
    previewWeb,
  };
}
