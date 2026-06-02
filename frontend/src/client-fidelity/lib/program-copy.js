/** Textes de l’espace client selon le type de programme (points vs tampons). */

export const PROFILE_COMPLETE_BONUS = 5;

export function isStampsProgramType(programType) {
  return String(programType || "").toLowerCase() === "stamps";
}

/** Unité courte après les chiffres (ex. « 3 / 10 tampons »). */
export function balanceUnitShort(programType) {
  return isStampsProgramType(programType) ? "tampons" : "pts";
}

/**
 * Badge mission « +N … » (N = points configurés par le commerçant).
 * @param {string} programType
 * @param {number} [amount]
 */
export function missionRewardSnippet(programType, amount = 1) {
  const n = Math.max(1, Math.min(200, Math.floor(Number(amount) || 1)));
  if (isStampsProgramType(programType)) {
    return n === 1 ? "1 tampon" : `${n} tampons`;
  }
  return n === 1 ? "1 point" : `${n} points`;
}

export function missionsHeroCtaLabel(programType) {
  return isStampsProgramType(programType) ? "Gagner plus de tampons" : "Gagner plus de points";
}

export function missionsSheetSubtext() {
  return "";
}

/** Titre carte mission « profil » (une seule ligne). */
export function profileMissionCardLines() {
  return { line1: "Ton profil", line2: "" };
}

export function profileModalSubmitLabel() {
  return "Valider";
}

export function deliveryReceiptStickyCtaLabel(programType) {
  return isStampsProgramType(programType) ? "Réclamer mes tampons" : "Réclamer mes points";
}

export function deliveryReceiptFabAriaLabel(programType) {
  return isStampsProgramType(programType)
    ? "Réclamation livraison — tampons sur ticket"
    : "Réclamation livraison — points sur ticket";
}

export function deliveryReceiptIntroModalTitle() {
  return "Ticket de livraison";
}

export function deliveryReceiptIntroModalBody(programType) {
  const unit = isStampsProgramType(programType) ? "tampons" : "points";
  return `Photographie le ticket de caisse collé sur le sac ou le carton de ta commande (livraison à domicile). Le montant et la date doivent être lisibles. Ensuite, nous créditons tes ${unit} sur ta carte.`;
}

export function deliveryReceiptSuccessMessage(programType) {
  return isStampsProgramType(programType) ? "Tampons mis à jour." : "Points mis à jour.";
}

export function engagementClaimSuccessMessage(programType) {
  return isStampsProgramType(programType) ? "Tampons ajoutés à ta carte." : "Points ajoutés à ta carte.";
}

export function stampsStepSectionTitle() {
  return "Tampons & récompenses";
}
