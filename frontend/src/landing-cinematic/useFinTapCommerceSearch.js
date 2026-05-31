import { useEffect, useRef, useState } from "react";
import {
  API_BASE,
  checkGooglePlaceAvailable,
  getAuthToken,
  getPendingEstablishment,
  setPendingEstablishment,
} from "../config.js";

/**
 * @param {{ placeId?: string, name?: string }} params
 * @returns {Promise<string | null>}
 */
export async function fetchPlaceCategory({ placeId = "", name = "" } = {}) {
  const qs = new URLSearchParams();
  const pid = String(placeId || "").trim();
  const n = String(name || "").trim();
  if (pid) qs.set("place_id", pid);
  if (n) qs.set("name", n);
  if (!pid && !n) return null;
  try {
    const res = await fetch(`${API_BASE.replace(/\/$/, "")}/api/place-category?${qs}`);
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    const cat = String(data?.suggestedCategory || "").trim();
    return cat || null;
  } catch {
    return null;
  }
}

/**
 * Autocomplete Google Places + détection secteur — réutilisable (hero, simulateur, etc.).
 *
 * @param {{
 *   initialQuery?: string,
 *   initialPlaceId?: string,
 *   syncPending?: boolean,
 *   onCategoryDetected?: (categoryId: string | null) => void,
 *   onCommerceValidated?: (validated: boolean) => void,
 *   enabled?: boolean,
 * }} [options]
 */
export function useFinTapCommerceSearch(options = {}) {
  const {
    initialQuery = "",
    initialPlaceId = "",
    syncPending = true,
    onCategoryDetected,
    onCommerceValidated,
    enabled = true,
  } = options;

  const pendingInit =
    typeof window !== "undefined" && !initialQuery && !initialPlaceId
      ? getPendingEstablishment()
      : null;

  const [shopQuery, setShopQuery] = useState(() =>
    String(initialQuery || pendingInit?.establishment_name || "").trim()
  );
  const [shopPlaceId, setShopPlaceId] = useState(() =>
    String(initialPlaceId || pendingInit?.google_place_id || "").trim()
  );
  const [placePredictions, setPlacePredictions] = useState([]);
  const [predictionsOpen, setPredictionsOpen] = useState(false);
  const [placesSearching, setPlacesSearching] = useState(false);
  const [noSuggestionsVisible, setNoSuggestionsVisible] = useState(false);
  const [placeProbeBusy, setPlaceProbeBusy] = useState(false);
  const [placeConflictError, setPlaceConflictError] = useState("");

  const searchInputRef = useRef(null);
  const searchWrapRef = useRef(null);
  const emptyHintTimerRef = useRef(0);
  const onCategoryDetectedRef = useRef(onCategoryDetected);
  onCategoryDetectedRef.current = onCategoryDetected;
  const onCommerceValidatedRef = useRef(onCommerceValidated);
  onCommerceValidatedRef.current = onCommerceValidated;

  const initialPlaceIdRef = useRef(
    String(initialPlaceId || pendingInit?.google_place_id || "").trim()
  );
  const initialNameRef = useRef(
    String(initialQuery || pendingInit?.establishment_name || "").trim()
  );

  useEffect(() => {
    const pid = initialPlaceIdRef.current;
    const name = initialNameRef.current;
    if (pid && name) {
      onCommerceValidatedRef.current?.(true);
      void runCategoryDetection({ placeId: pid, name });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restauration pending au montage
  }, []);

  const runCategoryDetection = async ({ placeId = "", name = "" } = {}) => {
    const category = await fetchPlaceCategory({ placeId, name });
    onCategoryDetectedRef.current?.(category);
    return category;
  };

  useEffect(() => {
    if (!enabled) {
      setPlacesSearching(false);
      return;
    }
    const query = shopQuery.trim();
    if (shopPlaceId && query.length >= 2) {
      setPredictionsOpen(false);
      setPlacePredictions([]);
      setPlacesSearching(false);
      setNoSuggestionsVisible(false);
      if (emptyHintTimerRef.current) {
        window.clearTimeout(emptyHintTimerRef.current);
        emptyHintTimerRef.current = 0;
      }
      return;
    }
    if (query.length < 2) {
      setPlacePredictions([]);
      setPredictionsOpen(false);
      setPlacesSearching(false);
      setNoSuggestionsVisible(false);
      if (emptyHintTimerRef.current) {
        window.clearTimeout(emptyHintTimerRef.current);
        emptyHintTimerRef.current = 0;
      }
      return;
    }

    let cancelled = false;
    if (emptyHintTimerRef.current) {
      window.clearTimeout(emptyHintTimerRef.current);
      emptyHintTimerRef.current = 0;
    }
    setNoSuggestionsVisible(false);
    setPlacesSearching(true);

    const debounce = window.setTimeout(async () => {
      if (cancelled) return;
      try {
        const url = `${API_BASE}/api/places/autocomplete?input=${encodeURIComponent(query)}`;
        const headers = {};
        const t = getAuthToken();
        if (t) headers.Authorization = `Bearer ${t}`;
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error("autocomplete_failed");
        const data = await res.json();
        if (cancelled) return;
        const list = Array.isArray(data?.predictions) ? data.predictions.slice(0, 8) : [];
        setPlacePredictions(list);
        setPredictionsOpen(list.length > 0);
        if (list.length > 0) {
          setNoSuggestionsVisible(false);
        } else {
          emptyHintTimerRef.current = window.setTimeout(() => {
            if (cancelled) return;
            const still = String(searchInputRef.current?.value || "").trim() === query;
            if (still) setNoSuggestionsVisible(true);
            emptyHintTimerRef.current = 0;
          }, 2000);
        }
      } catch {
        if (cancelled) return;
        setPlacePredictions([]);
        setPredictionsOpen(false);
        emptyHintTimerRef.current = window.setTimeout(() => {
          if (cancelled) return;
          const still = String(searchInputRef.current?.value || "").trim() === query;
          if (still) setNoSuggestionsVisible(true);
          emptyHintTimerRef.current = 0;
        }, 2000);
      } finally {
        if (!cancelled) {
          const still = String(searchInputRef.current?.value || "").trim() === query;
          if (still) setPlacesSearching(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(debounce);
      if (emptyHintTimerRef.current) {
        window.clearTimeout(emptyHintTimerRef.current);
        emptyHintTimerRef.current = 0;
      }
    };
  }, [shopQuery, shopPlaceId, enabled]);

  useEffect(() => {
    const onClickOutside = (event) => {
      const root = searchWrapRef.current;
      if (!root?.contains(event.target)) setPredictionsOpen(false);
    };
    document.addEventListener("click", onClickOutside);
    return () => document.removeEventListener("click", onClickOutside);
  }, []);

  const applyPrediction = async (pred) => {
    const name = String(pred?.main_text || pred?.description || "").trim();
    const pid = String(pred?.place_id || "").trim();
    if (!name || !pid) return;
    setPlaceConflictError("");
    setPlaceProbeBusy(true);
    try {
      const res = await checkGooglePlaceAvailable(pid);
      if (!res.ok) {
        setPlaceConflictError(res.message);
        return;
      }
      setShopQuery(name);
      setShopPlaceId(pid);
      if (syncPending) {
        setPendingEstablishment({ establishment_name: name, google_place_id: pid });
      }
      setPredictionsOpen(false);
      setPlacePredictions([]);
      setNoSuggestionsVisible(false);
      onCommerceValidatedRef.current?.(true);
      await runCategoryDetection({ placeId: pid, name });
    } catch {
      setPlaceConflictError("Impossible de vérifier ce commerce. Réessayez.");
    } finally {
      setPlaceProbeBusy(false);
    }
  };

  const onQueryChange = (value) => {
    const hadPlace = Boolean(shopPlaceId);
    setShopQuery(value);
    setShopPlaceId("");
    setPlaceConflictError("");
    if (hadPlace) onCommerceValidatedRef.current?.(false);
  };

  const detectCategoryFromQuery = async () => {
    const name = shopQuery.trim();
    if (!name || name.length < 2) return null;
    if (shopPlaceId) {
      return runCategoryDetection({ placeId: shopPlaceId, name });
    }
    return runCategoryDetection({ name });
  };

  return {
    shopQuery,
    setShopQuery: onQueryChange,
    shopPlaceId,
    placePredictions,
    predictionsOpen,
    setPredictionsOpen,
    placesSearching,
    noSuggestionsVisible,
    placeProbeBusy,
    placeConflictError,
    searchInputRef,
    searchWrapRef,
    applyPrediction,
    detectCategoryFromQuery,
  };
}
