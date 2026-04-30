/**
 * Gestion des assets logo/fond du flyer (dirty flags, revisions, reload safe).
 */

/**
 * @typedef {{
 *  logoBitmap: ImageBitmap | HTMLImageElement | null;
 *  logoObjectUrl: string | null;
 *  logoDirty: boolean;
 *  logoRev: number;
 *  bgBitmap: ImageBitmap | HTMLImageElement | null;
 *  bgObjectUrl: string | null;
 *  bgDirty: boolean;
 *  bgRev: number;
 * }} FlyerAssetState
 */

/** @returns {FlyerAssetState} */
export function createFlyerAssetState() {
  return {
    logoBitmap: null,
    logoObjectUrl: null,
    logoDirty: true,
    logoRev: 0,
    bgBitmap: null,
    bgObjectUrl: null,
    bgDirty: true,
    bgRev: 0,
  };
}

/** @param {FlyerAssetState} st */
export function markLogoDirty(st) {
  st.logoDirty = true;
  st.logoRev++;
}

/** @param {FlyerAssetState} st */
export function markBgDirty(st) {
  st.bgDirty = true;
  st.bgRev++;
}

/**
 * @param {FlyerAssetState} st
 * @param {string} logoApiUrl
 * @param {() => string | null} getStoredLogoDataUrl
 */
export async function refreshLogoAsset(st, logoApiUrl, getStoredLogoDataUrl) {
  if (!st.logoDirty) return;
  const revAtStart = st.logoRev;
  if (st.logoBitmap && typeof ImageBitmap !== "undefined" && st.logoBitmap instanceof ImageBitmap) {
    try {
      st.logoBitmap.close();
    } catch (_) {}
  }
  st.logoBitmap = null;
  if (st.logoObjectUrl) {
    try {
      if (st.logoObjectUrl.startsWith("blob:")) URL.revokeObjectURL(st.logoObjectUrl);
    } catch (_) {}
    st.logoObjectUrl = null;
  }

  const localLogo = getStoredLogoDataUrl();
  if (localLogo) {
    st.logoObjectUrl = localLogo;
  } else {
    try {
      const res = await fetch(logoApiUrl, { mode: "cors", credentials: "omit" });
      if (res.ok) {
        const blob = await res.blob();
        if (typeof createImageBitmap === "function") {
          try {
            st.logoBitmap = await createImageBitmap(blob);
          } catch (_) {
            st.logoObjectUrl = URL.createObjectURL(blob);
          }
        } else {
          st.logoObjectUrl = URL.createObjectURL(blob);
        }
      }
    } catch (_) {
      /* pas de logo */
    }
  }
  if (revAtStart === st.logoRev) st.logoDirty = false;
}

/**
 * @param {FlyerAssetState} st
 * @param {() => string | null} getStoredBgDataUrl
 */
export async function refreshBgAsset(st, getStoredBgDataUrl) {
  if (!st.bgDirty) return;
  const revAtStart = st.bgRev;
  if (st.bgBitmap && typeof ImageBitmap !== "undefined" && st.bgBitmap instanceof ImageBitmap) {
    try {
      st.bgBitmap.close();
    } catch (_) {}
  }
  st.bgBitmap = null;
  if (st.bgObjectUrl) {
    try {
      URL.revokeObjectURL(st.bgObjectUrl);
    } catch (_) {}
    st.bgObjectUrl = null;
  }
  const bgData = getStoredBgDataUrl();
  if (bgData) {
    try {
      const imgEl = await new Promise((resolve) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => resolve(null);
        im.src = bgData;
      });
      if (imgEl) {
        st.bgBitmap = /** @type {HTMLImageElement} */ (imgEl);
      } else if (bgData.startsWith("data:image/")) {
        const comma = bgData.indexOf(",");
        if (comma > 0) {
          const mimeM = /data:([^;]+)/.exec(bgData.slice(0, comma));
          const mime = mimeM ? mimeM[1] : "image/png";
          const bin = atob(bgData.slice(comma + 1));
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const blob = new Blob([bytes], { type: mime });
          const objUrl = URL.createObjectURL(blob);
          const imgBlob = await new Promise((resolve) => {
            const im = new Image();
            im.onload = () => resolve(im);
            im.onerror = () => resolve(null);
            im.src = objUrl;
          });
          URL.revokeObjectURL(objUrl);
          if (imgBlob) st.bgBitmap = /** @type {HTMLImageElement} */ (imgBlob);
        }
      }
    } catch (_) {}
  }
  if (revAtStart === st.bgRev) st.bgDirty = false;
}
