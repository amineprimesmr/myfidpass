/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { applySaaSFrcMessaging, syncSaaSWelcomeChrome } from "./app-saas-welcome-shell.js";

function mockHead() {
  document.body.innerHTML = `
    <div id="app-app">
      <main class="app-main">
        <div id="app-saas-frc-cluster" class="hidden"></div>
        <div id="app-empty" class="hidden">
          <div id="app-empty-welcome"></div>
          <div id="app-empty-fatal" class="hidden"></div>
        </div>
        <div id="app-dashboard-content" class="hidden">
          <section id="dashboard">
            <div id="app-dashboard-ready-splash" class="hidden"></div>
            <div id="app-dashboard-onboarding-gate" class="hidden"></div>
          </section>
        </div>
      </main>
    </div>`;
}

describe("app-saas-welcome-shell", () => {
  const originalMatchMedia = globalThis.matchMedia;

  beforeEach(() => {
    globalThis.matchMedia = (query) => ({
      matches: query.includes("max-width: 900px"),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
    mockHead();
    const hero = document.createElement("div");
    hero.innerHTML = `
      <button id="app-saas-frc-cta" class="hidden"></button>
      <div id="app-saas-frc-strip" class="hidden"></div>
      <span id="app-saas-frc-strip-status"></span>
    `;
    document.getElementById("app-saas-frc-cluster")?.appendChild(hero);
    document.getElementById("app-saas-frc-cluster")?.insertAdjacentHTML(
      "afterbegin",
      '<h2 id="app-saas-frc-title"></h2><p id="app-saas-frc-subtitle"></p>'
    );
  });

  afterEach(() => {
    globalThis.matchMedia = originalMatchMedia;
    document.body.innerHTML = "";
  });

  it("applySaaSFrcMessaging affiche le mode essai actif", () => {
    const future = new Date(Date.now() + 864e5 * 3).toISOString();
    applySaaSFrcMessaging({
      paid: false,
      trialHero: true,
      showSubscribeStrip: true,
      trialEndRaw: future,
      formatEndingHeadline: () => "L’essai prend fin dans 3 jours",
    });
    const cta = document.getElementById("app-saas-frc-cta");
    expect(cta?.classList.contains("hidden")).toBe(false);
    expect(document.getElementById("app-saas-frc-strip-status")?.textContent).toContain("3 jours");
    expect(document.getElementById("app-app")?.classList.contains("app-saas-trial-chrome-active")).toBe(true);
  });

  it("syncSaaSWelcomeChrome active le cluster quand l’accueil sans établissement est visible", () => {
    const empty = document.getElementById("app-empty");
    const welcome = document.getElementById("app-empty-welcome");
    const fatal = document.getElementById("app-empty-fatal");
    empty?.classList.remove("hidden");
    welcome?.classList.remove("hidden");
    fatal?.classList.add("hidden");
    syncSaaSWelcomeChrome();
    const cluster = document.getElementById("app-saas-frc-cluster");
    expect(cluster?.classList.contains("hidden")).toBe(false);
    expect(document.getElementById("app-app")?.classList.contains("app-saas-welcome-active")).toBe(true);
  });

  it("syncSaaSWelcomeChrome active le cluster quand le splash pré-onboarding dashboard est visible", () => {
    const empty = document.getElementById("app-empty");
    const welcome = document.getElementById("app-empty-welcome");
    const fatal = document.getElementById("app-empty-fatal");
    empty?.classList.add("hidden");
    welcome?.classList.remove("hidden");
    fatal?.classList.add("hidden");
    const splash = document.getElementById("app-dashboard-ready-splash");
    splash?.classList.remove("hidden");
    syncSaaSWelcomeChrome();
    const cluster = document.getElementById("app-saas-frc-cluster");
    expect(cluster?.classList.contains("hidden")).toBe(false);
    expect(document.getElementById("app-app")?.classList.contains("app-saas-welcome-active")).toBe(true);
  });

  it("syncSaaSWelcomeChrome garde le cluster actif quand le chrome trial est forcé", () => {
    const root = document.getElementById("app-app");
    root?.classList.add("app-saas-trial-chrome-active");
    syncSaaSWelcomeChrome();
    const cluster = document.getElementById("app-saas-frc-cluster");
    expect(cluster?.classList.contains("hidden")).toBe(false);
    expect(root?.classList.contains("app-saas-welcome-active")).toBe(true);
  });
});
