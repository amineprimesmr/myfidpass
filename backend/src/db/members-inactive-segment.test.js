import { describe, it, expect } from "vitest";
import { sqlInactiveMembersSinceDays } from "./member-segment-sql.js";

describe("sqlInactiveMembersSinceDays", () => {
  it("exige une visite enregistrée (pas last_visit_at NULL)", () => {
    const sql = sqlInactiveMembersSinceDays(14);
    expect(sql).toContain("last_visit_at IS NOT NULL");
    expect(sql).not.toContain("last_visit_at IS NULL OR");
  });

  it("filtre sur la fenêtre demandée", () => {
    expect(sqlInactiveMembersSinceDays(14)).toContain("-14 days");
    expect(sqlInactiveMembersSinceDays(30)).toContain("-30 days");
  });
});
