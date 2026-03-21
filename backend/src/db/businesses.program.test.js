import { describe, it, expect } from "vitest";
import { resolveBusinessProgramType } from "./businesses.js";

describe("resolveBusinessProgramType", () => {
  it("retourne points par défaut", () => {
    expect(resolveBusinessProgramType(null)).toBe("points");
    expect(resolveBusinessProgramType({})).toBe("points");
  });

  it("normalise stamps / tampons", () => {
    expect(resolveBusinessProgramType({ program_type: "stamps" })).toBe("stamps");
    expect(resolveBusinessProgramType({ program_type: "  STAMPS " })).toBe("stamps");
    expect(resolveBusinessProgramType({ program_type: "tampons" })).toBe("stamps");
  });

  it("infère stamps si required_stamps > 0 et type inconnu", () => {
    expect(resolveBusinessProgramType({ program_type: "", required_stamps: 10 })).toBe("stamps");
    expect(resolveBusinessProgramType({ program_type: "weird", required_stamps: 10 })).toBe("stamps");
  });
});
