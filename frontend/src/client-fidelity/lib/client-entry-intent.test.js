import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  buildFidelityClientUrl,
  isQrGameEntryIntent,
  markQrGameSession,
  qrGameSessionStorageKey,
} from "./client-entry-intent.js";

describe("client-entry-intent", () => {
  const slug = "demo-shop";

  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("buildFidelityClientUrl ajoute ?qr=1 pour le jeu", () => {
    expect(buildFidelityClientUrl("https://myfidpass.fr", slug, { qrGame: true })).toBe(
      "https://myfidpass.fr/fidelity/demo-shop?qr=1",
    );
    expect(buildFidelityClientUrl("https://myfidpass.fr", slug)).toBe(
      "https://myfidpass.fr/fidelity/demo-shop",
    );
  });

  it("isQrGameEntryIntent lit ?qr=1", () => {
    window.history.replaceState({}, "", `/fidelity/${slug}?qr=1`);
    expect(isQrGameEntryIntent(slug)).toBe(true);
    expect(sessionStorage.getItem(qrGameSessionStorageKey(slug))).toBe("1");
  });

  it("isQrGameEntryIntent lit la session stockée", () => {
    markQrGameSession(slug);
    expect(isQrGameEntryIntent(slug)).toBe(true);
  });
});
