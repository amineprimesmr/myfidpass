import { describe, it, expect } from "vitest";
import { validateMemberProfilePayload } from "./member-profile-validation.js";

describe("validateMemberProfilePayload", () => {
  it("accepte un payload valide", () => {
    const r = validateMemberProfilePayload({
      phone: "06 12 34 56 78",
      city: "Paris",
      birth_date: "1995-03-20",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.phone).toBe("0612345678");
      expect(r.city).toBe("Paris");
      expect(r.birth_date).toBe("1995-03-20");
    }
  });

  it("refuse un téléphone trop court", () => {
    const r = validateMemberProfilePayload({ phone: "123", city: "Paris", birth_date: "1995-03-20" });
    expect(r.ok).toBe(false);
  });

  it("refuse une date invalide", () => {
    const r = validateMemberProfilePayload({ phone: "0612345678", city: "Paris", birth_date: "1995-02-30" });
    expect(r.ok).toBe(false);
  });
});
