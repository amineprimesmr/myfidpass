import { describe, it, expect } from "vitest";
import catalog from "./integrations-catalog.json";

describe("integrations-catalog.json", () => {
  it("a des catégories et des intégrations", () => {
    expect(Array.isArray(catalog.categories)).toBe(true);
    expect(catalog.categories.length).toBeGreaterThan(0);
    expect(Array.isArray(catalog.integrations)).toBe(true);
    expect(catalog.integrations.length).toBeGreaterThan(0);
  });

  it("chaque intégration référence une catégorie existante avec champs requis", () => {
    const catIds = new Set(catalog.categories.map((c) => c.id));
    const allowed = new Set(["kit", "beta", "coming", "partner"]);

    for (const item of catalog.integrations) {
      expect(catIds.has(item.categoryId)).toBe(true);
      expect(typeof item.id).toBe("string");
      expect(item.id.length).toBeGreaterThan(0);
      expect(typeof item.name).toBe("string");
      expect(typeof item.description).toBe("string");
      expect(allowed.has(item.status)).toBe(true);
      if (item.bullets) {
        expect(Array.isArray(item.bullets)).toBe(true);
      }
    }
  });

  it("les ids d’intégration sont uniques", () => {
    const ids = catalog.integrations.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
