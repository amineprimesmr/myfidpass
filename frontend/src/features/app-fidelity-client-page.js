/**
 * SaaS — section « Page fidélité » : fond d’écran page publique /fidelity/:slug.
 */

function setupImageDropZone(zoneEl, onFile) {
  if (!zoneEl) return;
  zoneEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    zoneEl.classList.add("app-drop-zone-active");
  });
  zoneEl.addEventListener("dragleave", (e) => {
    if (!zoneEl.contains(e.relatedTarget)) zoneEl.classList.remove("app-drop-zone-active");
  });
  zoneEl.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    zoneEl.classList.remove("app-drop-zone-active");
    const file = e.dataTransfer?.files?.[0];
    if (file) onFile(file);
  });
  zoneEl.addEventListener("paste", (e) => {
    const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith("image/"));
    const file = item?.getAsFile?.();
    if (file) {
      e.preventDefault();
      onFile(file);
    }
  });
}

/**
 * @param {{ api: (path: string, opts?: RequestInit) => Promise<Response>, setupImageDropZone?: typeof setupImageDropZone }} ctx
 */
export function initFidelityClientPageSection(ctx) {
  const { api } = ctx;
  const dropSetup = ctx.setupImageDropZone || setupImageDropZone;
  const input = document.getElementById("app-fidelity-client-bg-input");
  const drop = document.getElementById("app-fidelity-client-bg-drop");
  const previewWrap = document.getElementById("app-fidelity-client-preview-wrap");
  const previewImg = document.getElementById("app-fidelity-client-preview-img");
  const removeBtn = document.getElementById("app-fidelity-client-remove");
  const statusEl = document.getElementById("app-fidelity-client-status");
  if (!input || !drop) return;

  function setStatus(msg, isErr) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.classList.toggle("hidden", !msg);
    statusEl.classList.toggle("error", Boolean(isErr));
    statusEl.classList.toggle("success", Boolean(msg) && !isErr);
  }

  function syncPreviewFromUrl(url) {
    if (previewImg && previewWrap) {
      if (url) {
        previewImg.src = `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
        previewWrap.classList.remove("hidden");
        if (removeBtn) removeBtn.classList.remove("hidden");
      } else {
        previewImg.removeAttribute("src");
        previewWrap.classList.add("hidden");
        if (removeBtn) removeBtn.classList.add("hidden");
      }
    }
  }

  async function loadSettings() {
    try {
      const res = await api("/dashboard/settings");
      if (!res.ok) return;
      const data = await res.json();
      const url = data.fidelity_page_background_url || data.fidelityPageBackgroundUrl;
      syncPreviewFromUrl(url || "");
    } catch (_) {}
  }

  async function uploadDataUrl(dataUrl) {
    setStatus("");
    try {
      const res = await api("/dashboard/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fidelity_page_background_base64: dataUrl }),
      });
      if (res.ok) {
        setStatus("Image enregistrée. Elle apparaît sur la page fidélité client après rafraîchissement.");
        await loadSettings();
      } else {
        const err = await res.json().catch(() => ({}));
        setStatus(err.error || "Enregistrement impossible.", true);
      }
    } catch {
      setStatus("Erreur réseau.", true);
    }
    input.value = "";
  }

  async function removeImage() {
    setStatus("");
    try {
      const res = await api("/dashboard/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fidelity_page_background_base64: null }),
      });
      if (res.ok) {
        setStatus("Fond retiré. La page utilise à nouveau le fond par défaut.");
        syncPreviewFromUrl("");
      } else {
        const err = await res.json().catch(() => ({}));
        setStatus(err.error || "Action impossible.", true);
      }
    } catch {
      setStatus("Erreur réseau.", true);
    }
  }

  drop.addEventListener("click", (e) => {
    if (e.target === input) return;
    input.click();
  });

  input.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) return;
      await uploadDataUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  });

  dropSetup(drop, (file) => {
    input.files = null;
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  removeBtn?.addEventListener("click", () => void removeImage());

  window.addEventListener("app-section-change", (e) => {
    if (e.detail?.sectionId === "fidelity-client") loadSettings();
  });

  void loadSettings();
}
