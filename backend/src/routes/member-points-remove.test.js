import { describe, it, expect } from "vitest";
import request from "supertest";
import { randomUUID } from "crypto";
import { app } from "../index.js";

describe("POST retrait points (correction caisse)", () => {
  it("dashboard : sans auth renvoie 401 (route enregistrée, pas 404 globale)", async () => {
    const res = await request(app)
      .post(`/api/businesses/demo/dashboard/members/${randomUUID()}/points/remove`)
      .set("Content-Type", "application/json")
      .send({ points: 1 });
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
    expect(res.body.error).not.toBe("Not found");
  });

  it("members : sans auth renvoie 401 (route enregistrée)", async () => {
    const res = await request(app)
      .post(`/api/businesses/demo/members/${randomUUID()}/points/remove`)
      .set("Content-Type", "application/json")
      .send({ points: 1 });
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
    expect(res.body.error).not.toBe("Not found");
  });
});
