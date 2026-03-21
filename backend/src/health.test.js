import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "./index.js";

describe("Health API", () => {
  it("GET /api/health returns 200 and fidelity-api", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, service: "fidelity-api" });
  });
});
