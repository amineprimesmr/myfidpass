/**
 * Même id que `RevenueCatConfig.premiumEntitlementId` côté app iOS (`myfidpass_premium`).
 * Surcharge : env `REVENUECAT_ENTITLEMENT_ID` sur Railway.
 */
export function getRevenueCatEntitlementId() {
  const v = (process.env.REVENUECAT_ENTITLEMENT_ID || "myfidpass_premium").trim();
  return v || "myfidpass_premium";
}
