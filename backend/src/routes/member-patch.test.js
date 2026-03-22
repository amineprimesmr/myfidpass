import { describe, it, expect } from "vitest";
import request from "supertest";
import { randomUUID } from "crypto";
import { app } from "../index.js";

describe("PATCH membre (coordonnées)", () => {
  it("dashboard : sans auth renvoie 401", async () => {
    const res = await request(app)
      .patch(`/api/businesses/demo/dashboard/members/${randomUUID()}`)
      .set("Content-Type", "application/json")
      .send({ name: "Test" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
    expect(res.body.error).not.toBe("Not found");
  });

  it("members : sans auth renvoie 401", async () => {
    const res = await request(app)
      .patch(`/api/businesses/demo/members/${randomUUID()}`)
      .set("Content-Type", "application/json")
      .send({ name: "Test" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });
});
