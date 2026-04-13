import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../index.js";

describe("GET /api/businesses/:slug/engagement-actions", () => {
  it("n’expose pas la mission avis Google (réservée au 1er tour de roue)", async () => {
    const res = await request(app).get("/api/businesses/demo/engagement-actions");
    expect(res.status).toBe(200);
    const types = (res.body.actions || []).map((a) => a.action_type);
    expect(types).not.toContain("google_review");
  });
});

describe("GET /api/businesses/:slug (public)", () => {
  it("peut exposer google_review_write_url pour la page jeu", async () => {
    const res = await request(app).get("/api/businesses/demo");
    expect(res.status).toBe(200);
    const url = res.body.google_review_write_url;
    if (url != null) {
      expect(String(url)).toContain("writereview");
    }
  });
});
