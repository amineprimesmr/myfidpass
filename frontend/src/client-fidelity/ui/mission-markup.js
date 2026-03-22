/**
 * Cartes missions fidélité client — design par type d’action.
 */

function missionTheme(actionType) {
  const map = {
    profile_complete: "profile",
    google_review: "google",
    instagram_follow: "instagram",
    facebook_follow: "facebook",
    tiktok_follow: "tiktok",
    twitter_follow: "twitter",
    trustpilot_review: "trustpilot",
    tripadvisor_review: "tripadvisor",
  };
  return map[actionType] || "generic";
}

function missionIconSvg(theme, uid) {
  const common = 'class="fidelity-mission-card__svg" width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"';
  switch (theme) {
    case "google":
      return `<svg ${common}><path d="M20 18v4h6.8c-.3 1.6-1.9 4.7-6.8 4.7-4.1 0-7.4-3.4-7.4-7.6s3.3-7.6 7.4-7.6c2.3 0 3.9 1 4.8 1.9l3.3-3.2C25.5 9.3 23 8 20 8c-5.5 0-10 4.5-10 10s4.5 10 10 10c5.7 0 9.5-4 9.5-9.6 0-.6-.1-1.1-.2-1.6H20z" fill="#4285F4"/><path d="M11.1 14.7l3.4 2.5c.9-2.4 3.2-4.1 5.9-4.1 2.3 0 3.9 1 4.8 1.9l3.3-3.2C25.5 9.3 23 8 20 8c-3.5 0-6.5 1.8-8.3 4.5l-.6 2.2z" fill="#EA4335" opacity=".95"/><path d="M11.1 25.3c1.8 2.7 4.8 4.5 8.3 4.5 3 0 5.5-1.3 7.1-3.4l-3.3-2.6c-1 .8-2.4 1.4-3.8 1.4-2.9 0-5.4-2-6.3-4.7l-3.4 2.5-.6 2.3z" fill="#34A853"/><path d="M29.4 26.8c.2-.6.3-1.3.3-2 0-.6-.1-1.1-.2-1.6H20v4h5.5c-.3.9-.7 1.6-1.2 2.2l3.1-2.6z" fill="#FBBC05"/></svg>`;
    case "instagram":
      return `<svg ${common}><defs><linearGradient id="ig-${uid}" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stop-color="#F58529"/><stop offset="50%" stop-color="#DD2A7B"/><stop offset="100%" stop-color="#8134AF"/></linearGradient></defs><rect x="2" y="2" width="36" height="36" rx="10" fill="url(#ig-${uid})"/><rect x="9" y="9" width="22" height="22" rx="6" stroke="#fff" stroke-width="2.2" fill="none"/><circle cx="20" cy="20" r="5.5" stroke="#fff" stroke-width="2.2" fill="none"/><circle cx="28.5" cy="11.5" r="2" fill="#fff"/></svg>`;
    case "facebook":
      return `<svg ${common}><defs><linearGradient id="fb-${uid}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#1877F2"/><stop offset="100%" stop-color="#0C4A9C"/></linearGradient></defs><rect x="2" y="2" width="36" height="36" rx="10" fill="url(#fb-${uid})"/><path d="M22.8 31V21.2h3.3l.5-3.8h-3.8v-2.4c0-1.1.3-1.8 1.9-1.8h2V9.2c-.3 0-1.5-.1-2.9-.1-2.9 0-4.8 1.8-4.8 5v2.3h-3.2v3.8h3.2V31h3.8z" fill="#fff"/></svg>`;
    case "tiktok":
      return `<svg ${common}><rect x="2" y="2" width="36" height="36" rx="10" fill="#000"/><path d="M25.2 12.4c.8 1.4 2.3 2.4 4 2.5v3.4c-1.4 0-2.7-.5-3.7-1.3v6.1c0 3.9-3.2 7.1-7.1 7.1-1.5 0-2.9-.5-4-1.3 1.3-1.5 2.1-3.5 2.1-5.7v-.7h3.2v.7c0 1.9 1.5 3.4 3.4 3.4s3.4-1.5 3.4-3.4V12.4h2.7z" fill="#25F4EE"/><path d="M25.2 13.8c.8 1.3 2.2 2.2 3.8 2.4v3.2c-1.2 0-2.4-.4-3.4-1.1v5.9c0 3.6-2.9 6.5-6.5 6.5-.9 0-1.8-.2-2.6-.5 1.1-1.2 1.8-2.8 1.8-4.5v-1.2h2.2v1.2c0 1.4 1.1 2.5 2.5 2.5s2.5-1.1 2.5-2.5V13.8h2.7z" fill="#FE2C55" opacity=".9"/></svg>`;
    case "twitter":
      return `<svg ${common}><rect x="2" y="2" width="36" height="36" rx="10" fill="#000"/><path d="M11 12.5h4.2l5.5 7.4 6.8-7.4h3.2l-8.4 9.1L28 29.5h-4.1l-6-8-6.9 8H8l9.3-10.5L11 12.5z" fill="#fff"/></svg>`;
    case "trustpilot":
      return `<svg ${common}><defs><linearGradient id="tp-${uid}" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stop-color="#00B67A"/><stop offset="100%" stop-color="#058A61"/></linearGradient></defs><rect x="2" y="2" width="36" height="36" rx="10" fill="url(#tp-${uid})"/><path d="M20 11l2.2 6.8h7.1l-5.7 4.1 2.2 6.8L20 24.6l-5.8 4.1 2.2-6.8-5.7-4.1h7.1L20 11z" fill="#fff"/></svg>`;
    case "tripadvisor":
      return `<svg ${common}><defs><linearGradient id="ta-${uid}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#00AF87"/><stop offset="100%" stop-color="#007E6A"/></linearGradient></defs><rect x="2" y="2" width="36" height="36" rx="10" fill="url(#ta-${uid})"/><circle cx="14" cy="18" r="4" fill="#fff"/><circle cx="26" cy="18" r="4" fill="#fff"/><ellipse cx="20" cy="24" rx="8" ry="5" fill="#fff" opacity=".35"/><circle cx="14" cy="18" r="1.8" fill="#00AF87"/><circle cx="26" cy="18" r="1.8" fill="#00AF87"/></svg>`;
    case "profile":
      return `<svg ${common}><defs><linearGradient id="pr-${uid}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fda4af"/><stop offset="50%" stop-color="#fb7185"/><stop offset="100%" stop-color="#e11d48"/></linearGradient></defs><rect x="2" y="2" width="36" height="36" rx="10" fill="url(#pr-${uid})"/><rect x="7" y="11" width="26" height="16" rx="2.5" fill="#fff" opacity=".95"/><path d="M7 17h26M7 21h26" stroke="#fda4af" stroke-width="1.2"/><circle cx="20" cy="19" r="2.2" fill="#fb7185"/></svg>`;
    default:
      return `<svg ${common}><defs><linearGradient id="gn-${uid}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#64748B"/><stop offset="100%" stop-color="#334155"/></linearGradient></defs><rect x="2" y="2" width="36" height="36" rx="10" fill="url(#gn-${uid})"/><path d="M14 12h12v2.5H14V12zm0 6.5h12v2.5H14v-2.5zm-4-6.5v15l4-3.5h12v-11.5H10z" fill="#fff" fill-opacity=".95"/></svg>`;
  }
}

/**
 * @param {Array<{ action_type: string, label: string, url: string }>} actions
 * @param {(s: string) => string} esc
 */
export function renderEngagementActionsMarkup(actions, esc) {
  return actions
    .map((a, i) => {
      const theme = missionTheme(a.action_type);
      const uid = `m${i}`;
      const icon = missionIconSvg(theme, uid);
      const inner = `
              <div class="fidelity-mission-card__icon" aria-hidden="true">${icon}</div>
              <div class="fidelity-mission-card__main">
                <span class="fidelity-mission-card__label">${esc(a.label)}</span>
                <span class="fidelity-mission-card__reward"><span class="fidelity-mission-card__reward-plus">+</span>1 ticket</span>
              </div>
              <span class="fidelity-mission-card__cta">
                <span class="fidelity-mission-card__cta-text">${a.action_type === "profile_complete" ? "Remplir" : "Ouvrir"}</span>
                <span class="fidelity-mission-card__cta-arrow" aria-hidden="true">›</span>
              </span>`;
      if (a.action_type === "profile_complete") {
        return `
            <button type="button" class="fidelity-mission-card fidelity-mission-card--${theme} fidelity-profile-mission-open" data-action-type="${esc(a.action_type)}">
              ${inner}
            </button>`;
      }
      return `
            <a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer" class="fidelity-mission-card fidelity-mission-card--${theme} fidelity-engagement-open-link" data-action-type="${esc(a.action_type)}">
              ${inner}
            </a>`;
    })
    .join("");
}
