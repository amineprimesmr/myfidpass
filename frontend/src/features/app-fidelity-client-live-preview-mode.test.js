import { describe, it, expect, beforeEach } from "vitest";
import { wireFidelityClientLivePreviewMode } from "./app-fidelity-client-live-preview-mode.js";

function mountDom() {
  document.body.innerHTML = `
    <div id="app-fidelity-client-live-preview-viewport" aria-hidden="true">
      <div id="app-fidelity-client-live-preview-static-wrap"></div>
      <div id="app-fidelity-client-live-preview-live-wrap">
        <iframe id="app-fidelity-client-live-iframe" title="test"></iframe>
      </div>
    </div>
    <button type="button" id="app-fidelity-client-mode-static"></button>
    <button type="button" id="app-fidelity-client-mode-live"></button>
  `;
}

describe("wireFidelityClientLivePreviewMode", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("charge l’iframe avec cache-bust au passage en mode live", () => {
    mountDom();
    const getPublicUrl = () => "https://exemple.fr/fidelity/mon-slug";
    wireFidelityClientLivePreviewMode({ getPublicUrl });
    const viewport = document.getElementById("app-fidelity-client-live-preview-viewport");
    const iframe = document.getElementById("app-fidelity-client-live-iframe");
    document.getElementById("app-fidelity-client-mode-live").click();
    expect(viewport.classList.contains("app-fidelity-client-live-preview-viewport--live")).toBe(true);
    expect(iframe.src).toContain("https://exemple.fr/fidelity/mon-slug");
    expect(iframe.src).toContain("_fp_saas_preview=");
  });

  it("refreshLiveIframeIfLive ne change pas l’iframe en mode statique", () => {
    mountDom();
    const ctl = wireFidelityClientLivePreviewMode({ getPublicUrl: () => "https://x/fidelity/s" });
    const iframe = document.getElementById("app-fidelity-client-live-iframe");
    const before = iframe.getAttribute("src");
    ctl.refreshLiveIframeIfLive();
    expect(iframe.getAttribute("src")).toBe(before);
  });
});
