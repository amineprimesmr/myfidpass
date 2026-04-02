import request from "supertest";
import { describe, it, expect } from "vitest";
import { app } from "../../index.js";

describe("POST /api/businesses/:slug/members/:memberId/claim-identity", () => {
  it("finalise un compte invité (email @guest.invalid)", async () => {
    const guestEmail = `guest-${Date.now()}@guest.invalid`;
    const create = await request(app)
      .post("/api/businesses/demo/members")
      .set("Content-Type", "application/json")
      .send({ name: "Invité", email: guestEmail });
    expect(create.status).toBe(201);
    const id = create.body.memberId;

    const finalEmail = `user-${Date.now()}@example.com`;
    const res = await request(app)
      .post(`/api/businesses/demo/members/${id}/claim-identity`)
      .set("Content-Type", "application/json")
      .send({ name: "Marie", email: finalEmail });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.member.email).toBe(finalEmail.toLowerCase());
    expect(res.body.member.name).toBe("Marie");

    const get = await request(app).get(`/api/businesses/demo/members/${id}`);
    expect(get.status).toBe(200);
    expect(get.body.email).toBe(finalEmail.toLowerCase());
  });

  it("refuse de finaliser deux fois", async () => {
    const guestEmail = `guest-${Date.now()}@guest.invalid`;
    const create = await request(app)
      .post("/api/businesses/demo/members")
      .set("Content-Type", "application/json")
      .send({ name: "Invité", email: guestEmail });
    expect(create.status).toBe(201);
    const id = create.body.memberId;

    const r1 = await request(app)
      .post(`/api/businesses/demo/members/${id}/claim-identity`)
      .set("Content-Type", "application/json")
      .send({ name: "A", email: `a-${Date.now()}@example.com` });
    expect(r1.status).toBe(200);

    const r2 = await request(app)
      .post(`/api/businesses/demo/members/${id}/claim-identity`)
      .set("Content-Type", "application/json")
      .send({ name: "B", email: `b-${Date.now()}@example.com` });
    expect(r2.status).toBe(409);
    expect(r2.body.code).toBe("NOT_GUEST");
  });
});
