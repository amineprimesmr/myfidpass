/**
 * Modale mission « Complète ton profil » (extrait pour limite lignes view.js).
 * @param {(s: string) => string} esc
 * @param {{ name?: string, email?: string, phone?: string, city?: string, birth?: string }} data
 */
export function renderProfileMissionModalMarkup(esc, data) {
  const joinNameRaw = String(data.name || "").trim();
  const joinNameParts = joinNameRaw.split(/\s+/).filter(Boolean);
  const joinPrenom = esc(joinNameParts[0] || "—");
  const joinNom = joinNameParts.length > 1 ? esc(joinNameParts.slice(1).join(" ")) : "";
  const joinEmailDisplay = esc(String(data.email || "").trim() || "—");
  const profilePhone = esc(data.phone || "");
  const profileCity = esc(data.city || "");
  const profileBirth = esc(data.birth || "");

  return `
    <div id="fidelity-profile-mission-modal" class="fidelity-profile-mission-modal hidden" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="fidelity-profile-mission-modal-title">
      <button type="button" class="fidelity-profile-mission-modal__backdrop" aria-label="Fermer"></button>
      <div class="fidelity-profile-mission-modal__panel">
        <div class="fidelity-profile-mission-modal__head">
          <h2 id="fidelity-profile-mission-modal-title" class="fidelity-profile-mission-modal__title">Complète ton profil</h2>
          <button type="button" class="fidelity-profile-mission-modal__close" aria-label="Fermer">×</button>
        </div>
        <p class="fidelity-profile-mission-modal__desc">Quelques infos pour le commerce — <strong>1 point bonus</strong> sur ta carte (une seule fois).</p>
        <div class="fidelity-profile-mission-modal__identity">
          <p class="fidelity-profile-mission-modal__identity-kicker">Tes infos d’inscription</p>
          <dl class="fidelity-profile-mission-modal__identity-dl">
            <div class="fidelity-profile-mission-modal__identity-row">
              <dt>Prénom</dt>
              <dd>${joinPrenom}</dd>
            </div>
            ${joinNom ? `
            <div class="fidelity-profile-mission-modal__identity-row">
              <dt>Nom</dt>
              <dd>${joinNom}</dd>
            </div>
            ` : ""}
            <div class="fidelity-profile-mission-modal__identity-row">
              <dt>E-mail</dt>
              <dd class="fidelity-profile-mission-modal__identity-email">${joinEmailDisplay}</dd>
            </div>
          </dl>
        </div>
        <form id="fidelity-v2-profile-form" class="fidelity-v2-profile-form" novalidate>
          <div class="fidelity-v2-input-group">
            <label class="fidelity-v2-profile-label" for="fidelity-v2-profile-phone">Téléphone</label>
            <input id="fidelity-v2-profile-phone" class="fidelity-input" type="tel" inputmode="tel" autocomplete="tel" placeholder="06 12 34 56 78" value="${profilePhone}" required />
          </div>
          <div class="fidelity-v2-input-group">
            <label class="fidelity-v2-profile-label" for="fidelity-v2-profile-city">Ville</label>
            <input id="fidelity-v2-profile-city" class="fidelity-input" type="text" autocomplete="address-level2" placeholder="Paris" value="${profileCity}" required />
          </div>
          <div class="fidelity-v2-input-group">
            <label class="fidelity-v2-profile-label" for="fidelity-v2-profile-birth">Date de naissance</label>
            <input id="fidelity-v2-profile-birth" class="fidelity-input" type="date" autocomplete="bday" value="${profileBirth}" required />
          </div>
          <span class="fidelity-cta-wrap fidelity-cta-wrap--full">
            <button type="submit" class="fidelity-cta-pill" id="fidelity-v2-profile-submit">
              <span class="fidelity-cta-pill-dot" aria-hidden="true"></span>
              <span class="fidelity-cta-pill-label">Valider et obtenir mon point</span>
              <span class="fidelity-cta-pill-chevron" aria-hidden="true">›</span>
            </button>
          </span>
        </form>
        <p id="fidelity-v2-profile-feedback" class="fidelity-v2-profile-feedback hidden" role="status"></p>
      </div>
    </div>
  `;
}
