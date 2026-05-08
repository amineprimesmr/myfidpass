/**
 * Badge « Propulsé par Myfidpass » — lien vers le site officiel.
 */

export const MYFIDPASS_SITE_URL = "https://www.myfidpass.fr/";

/**
 * @param {(s: string) => string} esc
 * @param {string} [extraClasses] — classes additionnelles sur le conteneur
 * @param {"footer"|"div"} [wrapperTag]
 */
export function renderPoweredByMyfidpassMarkup(esc, extraClasses = "", wrapperTag = "footer") {
  const tag = wrapperTag === "div" ? "div" : "footer";
  const cls = `fidelity-powered-by${extraClasses ? ` ${extraClasses}` : ""}`;
  const role = tag === "footer" ? ' role="contentinfo"' : "";
  return `<${tag} class="${cls.trim()}"${role}>
  <a class="fidelity-powered-by__link" href="${esc(MYFIDPASS_SITE_URL)}" target="_blank" rel="noopener noreferrer" aria-label="Myfidpass — ouvrir le site officiel">
    <img class="fidelity-powered-by__logo" src="/assets/icone.png?v=20260416" alt="" width="20" height="20" decoding="async" />
    <span class="fidelity-powered-by__text">Propulsé par <span class="fidelity-powered-by__brand">Myfidpass</span></span>
  </a>
</${tag}>`;
}
