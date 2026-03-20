import { describe, it, expect, beforeEach } from "vitest";
import { updatePersonnaliserGroupStatusIndicators } from "./app-personnaliser-groups-status.js";

function buildDoc() {
  document.body.innerHTML = `
    <div id="app-personnaliser-accordion">
      <section data-personnaliser-step="colors">
        <button type="button" class="app-personnaliser-group-toggle">
          <span class="app-personnaliser-group-status is-status-pending" aria-label="À compléter"></span>
        </button>
      </section>
      <section data-personnaliser-step="share">
        <button type="button" class="app-personnaliser-group-toggle">
          <span class="app-personnaliser-group-status is-status-pending"></span>
        </button>
      </section>
    </div>
    <input id="app-personnaliser-bg-hex" value="#1e3a8a" />
    <input id="app-personnaliser-fg-hex" value="#ffffff" />
    <input id="app-personnaliser-label-hex" value="#dbeafe" />
    <img id="app-personnaliser-card-bg-preview" class="hidden" src="" alt="" />
    <input id="app-share-slug-input" value="ab" />
  `;
  return document;
}

describe("updatePersonnaliserGroupStatusIndicators", () => {
  beforeEach(() => {
    buildDoc();
  });

  it("couleurs : défauts seuls → à compléter", () => {
    updatePersonnaliserGroupStatusIndicators(document);
    const st = document.querySelector("[data-personnaliser-step=\"colors\"] .app-personnaliser-group-status");
    expect(st.classList.contains("is-status-pending")).toBe(true);
    expect(st.classList.contains("is-status-complete")).toBe(false);
  });

  it("couleurs : couleur personnalisée → complété", () => {
    document.getElementById("app-personnaliser-bg-hex").value = "#112233";
    updatePersonnaliserGroupStatusIndicators(document);
    const st = document.querySelector("[data-personnaliser-step=\"colors\"] .app-personnaliser-group-status");
    expect(st.classList.contains("is-status-complete")).toBe(true);
  });

  it("partage : slug court → à compléter", () => {
    document.getElementById("app-share-slug-input").value = "a";
    updatePersonnaliserGroupStatusIndicators(document);
    const st = document.querySelector("[data-personnaliser-step=\"share\"] .app-personnaliser-group-status");
    expect(st.classList.contains("is-status-pending")).toBe(true);
  });
});
