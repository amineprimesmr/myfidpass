import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../index.js";

describe("POST /api/businesses/:slug/members/:memberId/profile-complete", () => {
  it("retourne 400 si validation échoue", async () => {
    const create = await request(app)
      .post("/api/businesses/demo/members")
      .set("Content-Type", "application/json")
      .send({ name: "Test", email: `val-${Date.now()}@example.com` });
    expect(create.status).toBe(201);
    const id = create.body.memberId;
    const res = await request(app)
      .post(`/api/businesses/demo/members/${id}/profile-complete`)
      .set("Content-Type", "application/json")
      .send({ phone: "12", city: "A", birth_date: "2010-01-01" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("enregistre téléphone, ville et date pour un membre démo", async () => {
    const create = await request(app)
      .post("/api/businesses/demo/members")
      .set("Content-Type", "application/json")
      .send({ name: "Profil", email: `prof-${Date.now()}@example.com` });
    expect(create.status).toBe(201);
    const id = create.body.memberId;
    const res = await request(app)
      .post(`/api/businesses/demo/members/${id}/profile-complete`)
      .set("Content-Type", "application/json")
      .send({
        phone: "0612345678",
        city: "Lyon",
        birth_date: "1990-06-15",
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.ticket_granted).toBe("number");

    const get = await request(app).get(`/api/businesses/demo/members/${id}`);
    expect(get.status).toBe(200);
    expect(get.body.phone).toBe("0612345678");
    expect(get.body.city).toBe("Lyon");
    expect(get.body.birth_date).toBe("1990-06-15");
  });
});
