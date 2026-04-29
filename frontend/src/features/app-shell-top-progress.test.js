/**
 * Tests — barre de chargement haute du shell /app.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { startAppLoadingProgress, finishAppLoadingProgress } from "./app-shell-top-progress.js";

describe("app-shell-top-progress", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="app-main-loading">
        <div class="app-main-loading__track"><div class="app-main-loading__fill"></div></div>
      </div>`;
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("finishAppLoadingProgress masque immédiatement avec immediate", () => {
    const el = document.getElementById("app-main-loading");
    finishAppLoadingProgress(el, { immediate: true });
    expect(el?.classList.contains("hidden")).toBe(true);
    expect(el?.hasAttribute("aria-busy")).toBe(false);
  });

  it("startAppLoadingProgress garde le conteneur visible", () => {
    const el = document.getElementById("app-main-loading");
    startAppLoadingProgress(el);
    expect(el?.classList.contains("hidden")).toBe(false);
    expect(el?.getAttribute("aria-busy")).toBe("true");
    finishAppLoadingProgress(el, { immediate: true });
  });
});
