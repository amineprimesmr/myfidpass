/**
 * Génération IA du fond flyer — POST /dashboard/flyer/ai-generate.
 * Ordre UX : images de référence d’abord, puis champs préremplis depuis la fiche (modifiables).
 */
import { API_BASE } from "../config.js";
import {
  compressImageBitmapToFlyerBgDataUrl,
  setStoredFlyerCustomBgDataUrl,
} from "./app-flyer-bg-control.js";

const MOODS = [
  { id: "premium", label: "Premium / sobre" },
  { id: "energetic", label: "Énergique / pop" },
  { id: "minimal", label: "Minimal / éditorial" },
  { id: "street", label: "Street / urbain" },
  { id: "gourmet", label: "Gourmand / artisan" },
  { id: "playful", label: "Ludique / friendly" },
];

const SECTOR_CONCEPT_HINT = {
  fastfood: "Restauration rapide, vente à emporter",
  cafe: "Café, salon de thé, boissons",
  beauty: "Institut de beauté, soins",
  coiffure: "Salon de coiffure",
  boulangerie: "Boulangerie — pâtisserie",
  boucherie: "Boucherie — charcuterie",
};

/** @param {string} sectorRaw */
function conceptFromSector(sectorRaw) {
  const s = String(sectorRaw || "").toLowerCase().trim();
  if (!s) return "Commerce de proximité — fidélité et récompenses";
  for (const [k, v] of Object.entries(SECTOR_CONCEPT_HINT)) {
    if (s.includes(k)) return v;
  }
  return `Commerce — secteur « ${sectorRaw.trim()} »`;
}

/** @param {string} sectorRaw */
function moodFromSector(sectorRaw) {
  const s = String(sectorRaw || "").toLowerCase();
  if (s.includes("cafe") || s.includes("coffee") || s.includes("boulanger")) return "gourmet";
  if (s.includes("fast") || s.includes("burger") || s.includes("pizza")) return "energetic";
  if (s.includes("beauty") || s.includes("coiff") || s.includes("spa")) return "premium";
  return "energetic";
}

/** @param {string} c */
function normalizeHex6(c) {
  let s = String(c || "").trim();
  if (!s) return "#fbbf24";
  if (!s.startsWith("#")) s = `#${s}`;
  const m3 = /^#([0-9A-Fa-f]{3})$/i.exec(s);
  if (m3) {
    const x = m3[1];
    s = `#${x[0]}${x[0]}${x[1]}${x[1]}${x[2]}${x[2]}`;
  }
  if (/^#[0-9A-Fa-f]{6}$/i.test(s)) return s.toLowerCase();
  return "#fbbf24";
}

/**
 * @param {File} file
 * @returns {Promise<string>}
 */
function fileToBase64Raw(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const res = String(r.result || "");
      const i = res.indexOf("base64,");
      if (i === -1) {
        reject(new Error("Lecture fichier impossible."));
        return;
      }
      resolve(res.slice(i + 7));
    };
    r.onerror = () => reject(new Error("Lecture fichier impossible."));
    r.readAsDataURL(file);
  });
}

/**
 * @param {string} slug
 * @param {{ dashboardApi?: (path: string, init?: RequestInit) => Promise<Response>; onGeneratedBg: () => void }} opts
 */
export function initFlyerAiGenerate(slug, opts) {
  const btn = document.getElementById("app-flyer-ai-generate-btn");
  const statusEl = document.getElementById("app-flyer-ai-status");
  const quotaEl = document.getElementById("app-flyer-ai-quota");
  const moodSel = document.getElementById("app-flyer-ai-mood");
  const logoInput = document.getElementById("app-flyer-ai-logo-file");
  const refInput = document.getElementById("app-flyer-ai-ref-files");
  const brandEl = document.getElementById("app-flyer-ai-brand");
  const conceptEl = document.getElementById("app-flyer-ai-concept");
  const accentEl = document.getElementById("app-flyer-ai-accent");
  const secondaryEl = document.getElementById("app-flyer-ai-secondary");
  const extraEl = document.getElementById("app-flyer-ai-extra");

  if (!btn || !opts.dashboardApi) {
    if (btn) btn.disabled = true;
    return;
  }

  if (moodSel && moodSel.options.length === 0) {
    MOODS.forEach((m) => {
      const o = document.createElement("option");
      o.value = m.id;
      o.textContent = m.label;
      moodSel.appendChild(o);
    });
    moodSel.value = "energetic";
  }

  let prefillDone = false;

  async function prefillFromPublicCommerce() {
    if (prefillDone) return;
    const base = (API_BASE || "").replace(/\/$/, "");
    try {
      const r = await fetch(`${base}/api/businesses/${encodeURIComponent(slug)}`, {
        cache: "no-store",
        credentials: "omit",
      });
      if (!r.ok) return;
      const j = await r.json();
      const org = String(j.organizationName || j.name || "").trim();
      const sectorRaw = String(j.sector || "").trim();

      if (brandEl && !(brandEl.dataset.userTouched === "1")) {
        brandEl.value = org || brandEl.value;
      }
      if (conceptEl && !(conceptEl.dataset.userTouched === "1")) {
        conceptEl.value = conceptFromSector(sectorRaw);
      }
      if (accentEl && !(accentEl.dataset.userTouched === "1")) {
        accentEl.value = normalizeHex6(j.labelColor || j.foregroundColor || "#fbbf24");
      }
      if (secondaryEl && !(secondaryEl.dataset.userTouched === "1")) {
        secondaryEl.value = normalizeHex6(j.backgroundColor || "#1e293b");
      }
      if (moodSel && !(moodSel.dataset.userTouched === "1")) {
        moodSel.value = moodFromSector(sectorRaw);
      }
      prefillDone = true;
    } catch (_) {
      /* réseau */
    }
  }

  function markTouched(el) {
    if (el) el.dataset.userTouched = "1";
  }

  [brandEl, conceptEl, accentEl, secondaryEl, extraEl, moodSel, logoInput, refInput].forEach((el) => {
    el?.addEventListener("input", () => markTouched(el));
    el?.addEventListener("change", () => markTouched(el));
  });

  async function refreshQuota() {
    if (!quotaEl || !opts.dashboardApi) return;
    try {
      const r = await opts.dashboardApi("/dashboard/flyer", { method: "GET" });
      if (!r.ok) return;
      const j = await r.json();
      const rem = j.flyer_ai_generations_remaining;
      const unl = j.flyer_ai_unlimited;
      if (unl) {
        quotaEl.textContent = "Générations IA : illimitées (mode équipe).";
      } else if (rem != null) {
        quotaEl.textContent = `Générations IA ce mois-ci : ${rem} restante(s) sur ${3}.`;
      }
    } catch (_) {
      quotaEl.textContent = "";
    }
  }

  function setStatus(msg, isError) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.classList.toggle("hidden", !msg);
    statusEl.classList.toggle("error", !!isError);
  }

  window.addEventListener("app-section-change", (e) => {
    if (e.detail?.sectionId === "flyer-qr") {
      void prefillFromPublicCommerce();
      void refreshQuota();
    }
  });

  void prefillFromPublicCommerce();
  void refreshQuota();

  btn.addEventListener("click", () => {
    void (async () => {
      const brand_name = (brandEl?.value || "").trim();
      const cuisine_or_concept = (conceptEl?.value || "").trim();
      const accent_color_hex = normalizeHex6(accentEl?.value || "#fbbf24");
      const secRaw = (secondaryEl?.value || "").trim();
      const secondary_color_hex = secRaw ? normalizeHex6(secRaw) : "";

      if (!brand_name || !cuisine_or_concept) {
        setStatus("Renseignez au minimum le nom de marque et le descriptif activité / visuels.", true);
        return;
      }

      const visual_mood = moodSel?.value || "energetic";
      /** @type {Record<string, unknown>} */
      const body = {
        brand_name,
        cuisine_or_concept,
        accent_color_hex,
        secondary_color_hex: secondary_color_hex || "",
        visual_mood,
        extra_context: (extraEl?.value || "").trim() || undefined,
      };

      const logoFile = logoInput?.files?.[0];
      if (logoFile) {
        try {
          body.logo_base64 = await fileToBase64Raw(logoFile);
        } catch (e) {
          setStatus(e instanceof Error ? e.message : "Import du logo impossible.", true);
          return;
        }
      }

      const refs = refInput?.files ? Array.from(refInput.files).slice(0, 3) : [];
      if (refs.length) {
        try {
          body.style_reference_images_base64 = await Promise.all(refs.map((f) => fileToBase64Raw(f)));
        } catch (e) {
          setStatus(e instanceof Error ? e.message : "Import des images impossible.", true);
          return;
        }
      }

      btn.disabled = true;
      setStatus("Génération en cours (peut prendre 30–60 s)…", false);
      try {
        const res = await opts.dashboardApi("/dashboard/flyer/ai-generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setStatus(data.error || `Erreur ${res.status}`, true);
          return;
        }
        const b64 = data.image_base64;
        if (!b64 || typeof b64 !== "string") {
          setStatus("Réponse serveur inattendue.", true);
          return;
        }
        const fidSaved = data.fidelity_page_background_saved === true;
        const fidErr =
          typeof data.fidelity_page_background_error === "string" && data.fidelity_page_background_error.trim()
            ? data.fidelity_page_background_error.trim()
            : "";
        const tmp = new Image();
        tmp.crossOrigin = "anonymous";
        await new Promise((resolve, reject) => {
          tmp.onload = () => resolve(undefined);
          tmp.onerror = () => reject(new Error("Image invalide."));
          tmp.src = `data:image/png;base64,${b64}`;
        });
        const bitmap = await createImageBitmap(tmp);
        try {
          const dataUrl = compressImageBitmapToFlyerBgDataUrl(bitmap);
          setStoredFlyerCustomBgDataUrl(dataUrl);
          opts.onGeneratedBg();
          let okMsg = "Fond flyer appliqué. Vous pouvez télécharger le PNG.";
          if (fidSaved) {
            okMsg +=
              " Le fond de la page fidélité (jeu QR) a été mis à jour : vérifiez l’onglet « Page fidélité » ou le lien public.";
          } else if (fidErr) {
            okMsg += ` Fond page fidélité : échec (${fidErr}). Réessayez ou importez une image dans « Page fidélité ».`;
          }
          setStatus(okMsg, false);
          void refreshQuota();
        } finally {
          try {
            bitmap.close();
          } catch (_) {}
        }
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "Échec de la génération.", true);
      } finally {
        btn.disabled = false;
      }
    })();
  });
}
