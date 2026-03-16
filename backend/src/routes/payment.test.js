import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../index.js";

describe("Payment API", () => {
  it("POST /api/payment/webhook without signature returns 400", async () => {
    const res = await request(app)
      .post("/api/payment/webhook")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ type: "checkout.session.completed" }));
    expect(res.status).toBe(400);
  });

  it("POST /api/payment/webhook with invalid signature returns 400", async () => {
    const res = await request(app)
      .post("/api/payment/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", "invalid")
      .send(JSON.stringify({ type: "checkout.session.completed" }));
    expect(res.status).toBe(400);
  });
});
