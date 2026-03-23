import { describe, it, expect } from "vitest";
import { parseFlyerBgManifest, parseFlyerBgManifestJson } from "./app-flyer-bg-gallery.js";

describe("parseFlyerBgManifest", () => {
  it("ignore les entrées invalides et les chemins", () => {
    expect(
      parseFlyerBgManifest([
        { file: "ok.jpg", label: "A" },
        { file: "../x.jpg" },
        { file: "sub/nope.png" },
        { file: "hack.exe" },
        null,
        "x",
      ]),
    ).toEqual([{ file: "ok.jpg", label: "A" }]);
  });

  it("déduit un label depuis le nom de fichier", () => {
    expect(parseFlyerBgManifest([{ file: "plage-ete.webp" }])).toEqual([
      { file: "plage-ete.webp", label: "plage ete" },
    ]);
  });
});

describe("parseFlyerBgManifestJson", () => {
  it("retourne vide si JSON invalide", () => {
    expect(parseFlyerBgManifestJson("not json")).toEqual([]);
  });

  it("parse un tableau valide", () => {
    expect(parseFlyerBgManifestJson('[{"file":"a.png"}]')).toEqual([{ file: "a.png", label: "a" }]);
  });
});
