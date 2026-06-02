import { missionRewardSnippet, profileModalSubmitLabel, PROFILE_COMPLETE_BONUS } from "../lib/program-copy.js";

/**
 * Modale mission « Complète ton profil » (extrait pour limite lignes view.js).
 * @param {(s: string) => string} esc
 * @param {{ phone?: string, city?: string, birth?: string, programType?: string }} data
 */
export function renderProfileMissionModalMarkup(esc, data) {
  const programType = data.programType ?? "points";
  const profilePhone = esc(data.phone || "");
  const profileCity = esc(data.city || "");
  const profileBirth = esc(data.birth || "");
  const reward = esc(missionRewardSnippet(programType, PROFILE_COMPLETE_BONUS));

  return `
    <div id="fidelity-profile-mission-modal" class="fidelity-profile-mission-modal hidden" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="fidelity-profile-mission-modal-title">
      <button type="button" class="fidelity-profile-mission-modal__backdrop" aria-label="Fermer"></button>
      <div class="fidelity-profile-mission-modal__panel">
        <div class="fidelity-profile-mission-modal__head">
          <div class="fidelity-profile-mission-modal__head-text">
            <h2 id="fidelity-profile-mission-modal-title" class="fidelity-profile-mission-modal__title">${esc("Complète ton profil")}</h2>
            <p class="fidelity-profile-mission-modal__reward">+${reward}</p>
          </div>
          <button type="button" class="fidelity-profile-mission-modal__close" aria-label="Fermer">×</button>
        </div>
        <form id="fidelity-v2-profile-form" class="fidelity-v2-profile-form" novalidate>
          <div class="fidelity-v2-input-group">
            <label class="fidelity-v2-profile-label" for="fidelity-v2-profile-phone">${esc("Téléphone")}</label>
            <input id="fidelity-v2-profile-phone" class="fidelity-input" type="tel" inputmode="tel" autocomplete="tel" placeholder="06 12 34 56 78" value="${profilePhone}" required />
          </div>
          <div class="fidelity-v2-input-group">
            <label class="fidelity-v2-profile-label" for="fidelity-v2-profile-city">${esc("Ville")}</label>
            <input id="fidelity-v2-profile-city" class="fidelity-input" type="text" autocomplete="address-level2" placeholder="Paris" value="${profileCity}" required />
          </div>
          <div class="fidelity-v2-input-group">
            <label class="fidelity-v2-profile-label" for="fidelity-v2-profile-birth">${esc("Date de naissance")}</label>
            <input id="fidelity-v2-profile-birth" class="fidelity-input" type="date" autocomplete="bday" value="${profileBirth}" required />
          </div>
          <span class="fidelity-cta-wrap fidelity-cta-wrap--full">
            <button type="submit" class="fidelity-cta-pill" id="fidelity-v2-profile-submit">
              <span class="fidelity-cta-pill-dot" aria-hidden="true"></span>
              <span class="fidelity-cta-pill-label">${esc(profileModalSubmitLabel())}</span>
              <span class="fidelity-cta-pill-chevron" aria-hidden="true">›</span>
            </button>
          </span>
        </form>
        <p id="fidelity-v2-profile-feedback" class="fidelity-v2-profile-feedback hidden" role="status"></p>
      </div>
    </div>
  `;
}
