/**
 * Génération IA du fond flyer — POST /dashboard/flyer/ai-generate.
 * Ordre UX : images de référence d’abord, puis champs préremplis depuis la fiche (modifiables).
 */
import { API_BASE } from "../config.js";
import {
  compressImageBitmapToFlyerBgDataUrl,
  setStoredFlyerCustomBgDataUrl,
} from "./app-flyer-bg-control.js";
import { setStoredFlyerCustomLogoDataUrl, compressFileToFlyerLogoDataUrl } from "./app-flyer-logo-control.js";

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
 * Échantillonne la couleur moyenne d'une bande horizontale d'un ImageBitmap.
 * Retourne un hex #rrggbb représentatif de la zone.
 * @param {ImageBitmap} bitmap
 * @param {number} yFrac  début de la bande (0–1)
 * @param {number} hFrac  hauteur de la bande (0–1)
 * @returns {string} couleur #rrggbb
 */
function sampleBitmapBandColor(bitmap, yFrac, hFrac) {
  const fallback = "#f8fafc";
  try {
    const sW = 80;
    const sH = 40;
    const c = document.createElement("canvas");
    c.width = sW;
    c.height = sH;
    const ctx = c.getContext("2d");
    if (!ctx) return fallback;
    const srcY = Math.round(bitmap.height * yFrac);
    const srcH = Math.max(1, Math.round(bitmap.height * hFrac));
    ctx.drawImage(bitmap, 0, srcY, bitmap.width, srcH, 0, 0, sW, sH);
    const data = ctx.getImageData(0, 0, sW, sH).data;
    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      r += data[i]; g += data[i + 1]; b += data[i + 2];
      count++;
    }
    if (!count) return fallback;
    r = Math.round(r / count);
    g = Math.round(g / count);
    b = Math.round(b / count);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  } catch (_) {
    return fallback;
  }
}

/**
 * @param {string} slug
 * @param {{
 *   dashboardApi?: (path: string, init?: RequestInit) => Promise<Response>;
 *   onGeneratedBg: () => void;
 *   onLogoApplied?: () => void;
 *   onFlyerAiWheelTintsSynced?: (wheelColorOdd: string, wheelColorEven: string) => void;
 *   onFlyerAiBgColorsSynced?: (colorBgTop: string, colorBgBottom: string) => void;
 * }} opts — callbacks pour synchroniser le formulaire après génération IA.
 */
export function initFlyerAiGenerate(slug, opts) {
  const btn = document.getElementById("app-flyer-ai-generate-btn");
  const statusEl = document.getElementById("app-flyer-ai-status");
  const quotaEl = document.getElementById("app-flyer-ai-quota");
  const logoInput = document.getElementById("app-flyer-ai-logo-file");
  const refInput = document.getElementById("app-flyer-ai-ref-files");
  const brandEl = document.getElementById("app-flyer-ai-brand");
  const conceptEl = document.getElementById("app-flyer-ai-concept");
  const accentEl = document.getElementById("app-flyer-ai-accent");
  const secondaryEl = document.getElementById("app-flyer-ai-secondary");
  const tertiaryEl = document.getElementById("app-flyer-ai-tertiary");
  const extraEl = document.getElementById("app-flyer-ai-extra");

  if (!btn || !opts.dashboardApi) {
    if (btn) btn.disabled = true;
    return;
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
      prefillDone = true;
    } catch (_) {
      /* réseau */
    }
  }

  function markTouched(el) {
    if (el) el.dataset.userTouched = "1";
  }

  [brandEl, conceptEl, accentEl, secondaryEl, tertiaryEl, extraEl, logoInput, refInput].forEach((el) => {
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
        quotaEl.textContent = "Générations IA : illimitées sur votre formule.";
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
      const terRaw = (tertiaryEl?.value || "").trim();
      const tertiary_color_hex = terRaw ? normalizeHex6(terRaw) : "";

      if (!brand_name || !cuisine_or_concept) {
        setStatus("Renseignez au minimum le nom de marque et le descriptif activité / visuels.", true);
        return;
      }

      /** @type {string[]} */
      const palette_colors_hex = [accent_color_hex];
      if (secondary_color_hex && secondary_color_hex.toLowerCase() !== accent_color_hex.toLowerCase()) {
        palette_colors_hex.push(secondary_color_hex);
      }
      if (
        tertiary_color_hex &&
        tertiary_color_hex.toLowerCase() !== accent_color_hex.toLowerCase() &&
        tertiary_color_hex.toLowerCase() !== (secondary_color_hex || "").toLowerCase()
      ) {
        palette_colors_hex.push(tertiary_color_hex);
      }

      /** @type {Record<string, unknown>} */
      const body = {
        brand_name,
        cuisine_or_concept,
        accent_color_hex,
        secondary_color_hex: secondary_color_hex || "",
        palette_colors_hex,
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
        let data = await res.json().catch(() => ({}));
        if (res.status === 202 && data.job_id) {
          const jobId = String(data.job_id);
          setStatus("Génération lancée sur le serveur…", false);
          const deadline = Date.now() + 6 * 60 * 1000;
          while (Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 2000));
            const st = await opts.dashboardApi(`/dashboard/flyer/ai-generate/jobs/${encodeURIComponent(jobId)}`, {
              method: "GET",
            });
            data = await st.json().catch(() => ({}));
            if (!st.ok) {
              setStatus(data.error || `Erreur ${st.status}`, true);
              return;
            }
            if (data.status === "done" && data.image_base64) break;
            if (data.status === "failed") {
              setStatus(data.error || "Échec de la génération.", true);
              return;
            }
            setStatus("Génération en cours sur le serveur…", false);
          }
          if (!data.image_base64) {
            setStatus("Délai dépassé. Réessayez ou rouvrez le flyer pour reprendre le suivi.", true);
            return;
          }
        } else if (!res.ok) {
          setStatus(data.error || `Erreur ${res.status}`, true);
          return;
        }
        const b64 = data.image_base64;
        if (!b64 || typeof b64 !== "string") {
          setStatus("Réponse serveur inattendue.", true);
          return;
        }
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
          // Appliquer aussi le logo IA comme logo d'affichage du flyer (cohérence iOS / web)
          if (logoFile) {
            try {
              const logoDataUrl = await compressFileToFlyerLogoDataUrl(logoFile);
              setStoredFlyerCustomLogoDataUrl(logoDataUrl);
              opts.onLogoApplied?.();
            } catch (_) {
              // Non bloquant — le canvas continuera à charger le logo serveur
            }
          }
          const accentRaw = accentEl?.value?.trim() || "#fbbf24";
          const secRaw = secondaryEl?.value?.trim() || "";
          const oddHex = /^#[0-9A-Fa-f]{6}$/i.test(accentRaw) ? accentRaw : "#fbbf24";
          const evenHex = /^#[0-9A-Fa-f]{6}$/i.test(secRaw) ? secRaw : "#fef3c7";
          opts.onFlyerAiWheelTintsSynced?.(oddHex, evenHex);
          // Synchroniser les couleurs de fond du formulaire avec les couleurs extraites de l'image générée.
          // On échantillonne le haut (zone logo/titre) et le bas (zone footer) du bitmap.
          const bgTop = sampleBitmapBandColor(bitmap, 0.0, 0.18);
          const bgBottom = sampleBitmapBandColor(bitmap, 0.82, 0.18);
          opts.onFlyerAiBgColorsSynced?.(bgTop, bgBottom);
          opts.onGeneratedBg();
          setStatus("Fond flyer appliqué. Vous pouvez télécharger le PNG.", false);
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
