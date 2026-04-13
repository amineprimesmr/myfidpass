/** Textes de l’espace client selon le type de programme (points vs tampons). */

export function isStampsProgramType(programType) {
  return String(programType || "").toLowerCase() === "stamps";
}

/** Unité courte après les chiffres (ex. « 3 / 10 tampons »). */
export function balanceUnitShort(programType) {
  return isStampsProgramType(programType) ? "tampons" : "pts";
}

/** Badge mission « +1 … ». */
export function missionRewardSnippet(programType) {
  return isStampsProgramType(programType) ? "1 tampon" : "1 point";
}

export function missionsHeroCtaLabel(programType) {
  return isStampsProgramType(programType) ? "Gagner plus de tampons" : "Gagner plus de points";
}

export function missionsSheetSubtext(programType) {
  return isStampsProgramType(programType)
    ? "Complète une action et récupère tes tampons."
    : "Complète une action et récupère tes points.";
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

/** Paragraphe HTML (déjà échappé morceau par morceau). */
export function profileModalBonusParagraphHtml(esc, programType) {
  const bonus = isStampsProgramType(programType) ? "1 tampon bonus" : "1 point bonus";
  return `${esc("Quelques infos pour le commerce — ")}<strong>${esc(bonus)}</strong>${esc(" sur ta carte (une seule fois).")}`;
}

export function profileModalSubmitLabel(programType) {
  return isStampsProgramType(programType) ? "Valider et obtenir mon tampon" : "Valider et obtenir mon point";
}
