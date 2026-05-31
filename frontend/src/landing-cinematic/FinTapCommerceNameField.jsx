import { useFinTapCommerceSearch } from "./useFinTapCommerceSearch.js";
import "./fintap-commerce-name-field.css";

/**
 * Champ nom de commerce avec autocomplete Google — composant autonome réutilisable.
 *
 * @param {object} props
 * @param {string} [props.id]
 * @param {string} [props.label]
 * @param {string} [props.placeholder]
 * @param {string} [props.className]
 * @param {boolean} [props.syncPending]
 * @param {(categoryId: string | null) => void} [props.onCategoryDetected]
 * @param {(validated: boolean) => void} [props.onCommerceValidated]
 * @param {() => void} [props.onBlurDetect]
 */
export function FinTapCommerceNameField({
  id = "fintap-commerce-name",
  label = "Nom de votre commerce",
  placeholder = "Ex. Boulangerie Martin, Salon Élégance…",
  className = "",
  syncPending = true,
  onCategoryDetected,
  onCommerceValidated,
  onBlurDetect,
}) {
  const search = useFinTapCommerceSearch({ syncPending, onCategoryDetected, onCommerceValidated });

  const handleBlur = () => {
    search.detectCategoryFromQuery();
    onBlurDetect?.();
  };

  return (
    <div className={`fintap-commerce-field ${className}`.trim()}>
      <label className="fintap-commerce-field__label" htmlFor={id}>
        {label}
      </label>
      <div className="fintap-commerce-field__search" ref={search.searchWrapRef}>
        <span className="fintap-commerce-field__search-icon" aria-hidden="true">
          <img src="/assets/logos/google.png" alt="" width="18" height="18" loading="lazy" />
        </span>
        <input
          ref={search.searchInputRef}
          id={id}
          type="text"
          className="fintap-commerce-field__search-input"
          placeholder={placeholder}
          value={search.shopQuery}
          onChange={(e) => search.setShopQuery(e.target.value)}
          onFocus={() => {
            if (search.placePredictions.length) search.setPredictionsOpen(true);
          }}
          onBlur={handleBlur}
          autoComplete="off"
          spellCheck={false}
        />
        {search.placesSearching ? (
          <span className="fintap-commerce-field__spinner" aria-hidden="true" />
        ) : null}
        {search.predictionsOpen && search.placePredictions.length > 0 ? (
          <ul className="fintap-commerce-field__predictions" role="listbox">
            {search.placePredictions.map((pred) => (
              <li key={pred.place_id || pred.description}>
                <button
                  type="button"
                  className="fintap-commerce-field__prediction"
                  role="option"
                  disabled={search.placeProbeBusy}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => search.applyPrediction(pred)}
                >
                  <span className="fintap-commerce-field__prediction-main">
                    {pred.main_text || pred.description}
                  </span>
                  {pred.secondary_text ? (
                    <span className="fintap-commerce-field__prediction-sub">
                      {pred.secondary_text}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {search.noSuggestionsVisible ? (
        <p className="fintap-commerce-field__hint">
          Aucune suggestion — vous pouvez saisir le nom manuellement.
        </p>
      ) : null}
      {search.placeConflictError ? (
        <p className="fintap-commerce-field__error" role="alert">
          {search.placeConflictError}
        </p>
      ) : null}
    </div>
  );
}

/** Hook exposé pour intégrations custom (section copiée ailleurs). */
export { useFinTapCommerceSearch };
