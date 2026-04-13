import {
  profileModalBonusParagraphHtml,
  profileModalFormSectionTitle,
  profileModalFutureIdeas,
  profileModalSubmitLabel,
} from "../lib/program-copy.js";

/**
 * Modale mission « Complète ton profil » (extrait pour limite lignes view.js).
 * @param {(s: string) => string} esc
 * @param {{ name?: string, email?: string, phone?: string, city?: string, birth?: string, programType?: string }} data
 */
export function renderProfileMissionModalMarkup(esc, data) {
  const programType = data.programType ?? "points";
  const joinNameRaw = String(data.name || "").trim();
  const joinNameParts = joinNameRaw.split(/\s+/).filter(Boolean);
  const joinPrenom = esc(joinNameParts[0] || "—");
  const joinNom = joinNameParts.length > 1 ? esc(joinNameParts.slice(1).join(" ")) : "";
  const joinEmailDisplay = esc(String(data.email || "").trim() || "—");
  const profilePhone = esc(data.phone || "");
  const profileCity = esc(data.city || "");
  const profileBirth = esc(data.birth || "");

  const ideas = profileModalFutureIdeas();
  const ideasHtml = ideas
    .map((t) => `<li class="fidelity-profile-mission-modal__idea-item">${esc(t)}</li>`)
    .join("");

  return `
    <div id="fidelity-profile-mission-modal" class="fidelity-profile-mission-modal hidden" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="fidelity-profile-mission-modal-title">
      <button type="button" class="fidelity-profile-mission-modal__backdrop" aria-label="Fermer"></button>
      <div class="fidelity-profile-mission-modal__panel">
        <div class="fidelity-profile-mission-modal__accent" aria-hidden="true"></div>
        <div class="fidelity-profile-mission-modal__head">
          <div class="fidelity-profile-mission-modal__head-text">
            <p class="fidelity-profile-mission-modal__kicker">${esc("Fidélité")}</p>
            <h2 id="fidelity-profile-mission-modal-title" class="fidelity-profile-mission-modal__title">${esc("Complète ton profil")}</h2>
            <p class="fidelity-profile-mission-modal__lead">${esc("3 champs — rapide et sécurisé.")}</p>
          </div>
          <button type="button" class="fidelity-profile-mission-modal__close" aria-label="Fermer">×</button>
        </div>
        <p class="fidelity-profile-mission-modal__desc">${profileModalBonusParagraphHtml(esc, programType)}</p>
        <div class="fidelity-profile-mission-modal__identity">
          <p class="fidelity-profile-mission-modal__identity-kicker">${esc("Déjà enregistré")}</p>
          <dl class="fidelity-profile-mission-modal__identity-dl">
            <div class="fidelity-profile-mission-modal__identity-row">
              <dt>${esc("Prénom")}</dt>
              <dd>${joinPrenom}</dd>
            </div>
            ${joinNom ? `
            <div class="fidelity-profile-mission-modal__identity-row">
              <dt>${esc("Nom")}</dt>
              <dd>${joinNom}</dd>
            </div>
            ` : ""}
            <div class="fidelity-profile-mission-modal__identity-row">
              <dt>${esc("E-mail")}</dt>
              <dd class="fidelity-profile-mission-modal__identity-email">${joinEmailDisplay}</dd>
            </div>
          </dl>
        </div>
        <h3 class="fidelity-profile-mission-modal__form-title">${esc(profileModalFormSectionTitle())}</h3>
        <form id="fidelity-v2-profile-form" class="fidelity-v2-profile-form" novalidate>
          <div class="fidelity-v2-input-group">
            <label class="fidelity-v2-profile-label" for="fidelity-v2-profile-phone">${esc("Téléphone")}</label>
            <p class="fidelity-profile-mission-modal__hint">${esc("Pour te joindre si besoin (offre, réservation…).")}</p>
            <input id="fidelity-v2-profile-phone" class="fidelity-input" type="tel" inputmode="tel" autocomplete="tel" placeholder="06 12 34 56 78" value="${profilePhone}" required />
          </div>
          <div class="fidelity-v2-input-group">
            <label class="fidelity-v2-profile-label" for="fidelity-v2-profile-city">${esc("Ville")}</label>
            <p class="fidelity-profile-mission-modal__hint">${esc("Pour des offres locales et du contexte.")}</p>
            <input id="fidelity-v2-profile-city" class="fidelity-input" type="text" autocomplete="address-level2" placeholder="Paris" value="${profileCity}" required />
          </div>
          <div class="fidelity-v2-input-group">
            <label class="fidelity-v2-profile-label" for="fidelity-v2-profile-birth">${esc("Date de naissance")}</label>
            <p class="fidelity-profile-mission-modal__hint">${esc("Pour respecter les tranches d’âge et l’offre légale (13+).")}</p>
            <input id="fidelity-v2-profile-birth" class="fidelity-input" type="date" autocomplete="bday" value="${profileBirth}" required />
          </div>
          <span class="fidelity-cta-wrap fidelity-cta-wrap--full">
            <button type="submit" class="fidelity-cta-pill" id="fidelity-v2-profile-submit">
              <span class="fidelity-cta-pill-dot" aria-hidden="true"></span>
              <span class="fidelity-cta-pill-label">${esc(profileModalSubmitLabel(programType))}</span>
              <span class="fidelity-cta-pill-chevron" aria-hidden="true">›</span>
            </button>
          </span>
        </form>
        <div class="fidelity-profile-mission-modal__ideas" aria-label="${esc("Évolutions possibles")}">
          <p class="fidelity-profile-mission-modal__ideas-title">${esc("Bientôt, on pourra aussi enrichir avec :")}</p>
          <ul class="fidelity-profile-mission-modal__ideas-list">${ideasHtml}</ul>
        </div>
        <p id="fidelity-v2-profile-feedback" class="fidelity-v2-profile-feedback hidden" role="status"></p>
      </div>
    </div>
  `;
}
