/**
 * Active le bouton / endpoint « reset » des réclamations livraison (tests uniquement).
 * Production : laisser vide ; pour retester les mêmes tickets, mettre DELIVERY_RECEIPT_DEV_RESET=1 sur l’API.
 */
export function isDeliveryReceiptDevResetEnabled() {
  const v = String(process.env.DELIVERY_RECEIPT_DEV_RESET || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}
