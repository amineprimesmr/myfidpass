import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../index.js";

describe("Auth API", () => {
  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = "password123";

  it("POST /api/auth/register with valid body returns 201 and token", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .set("Content-Type", "application/json")
      .send({ email: testEmail, password: testPassword, name: "Test User" });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("token");
    expect(res.body).toHaveProperty("user");
    expect(res.body.user.email).toBe(testEmail);
  });

  it("POST /api/auth/register with duplicate email returns 409", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .set("Content-Type", "application/json")
      .send({ email: testEmail, password: testPassword });
    expect(res.status).toBe(409);
    expect(res.body.error).toBeDefined();
  });

  it("POST /api/auth/login with wrong password returns 401", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send({ email: testEmail, password: "wrongpassword" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it("POST /api/auth/login with correct credentials returns 200 and token", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send({ email: testEmail, password: testPassword });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(res.body.user.email).toBe(testEmail);
  });

  it("POST /api/auth/login with missing email returns 400", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send({ password: testPassword });
    expect(res.status).toBe(400);
  });
});
