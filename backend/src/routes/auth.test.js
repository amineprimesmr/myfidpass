import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../index.js";

describe("Auth API", () => {
  // Mot de passe >= 12 caractères (nouvelle politique)
  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = "password123456"; // 14 chars ✓

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

  it("POST /api/auth/register with invalid email returns 400", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .set("Content-Type", "application/json")
      .send({ email: "not-an-email", password: testPassword });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation");
    expect(res.body.details?.email).toBeDefined();
  });

  it("POST /api/auth/register with short password (< 12 chars) returns 400", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .set("Content-Type", "application/json")
      .send({ email: `short-pwd-${Date.now()}@example.com`, password: "short123" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation");
    expect(res.body.details?.password).toBeDefined();
  });

  it("POST /api/auth/login with wrong password returns 401", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send({ email: testEmail, password: "wrongpasswordXXX" });
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

  it("GET /api/auth/me with Bearer token returns 200 and user", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send({ email: testEmail, password: testPassword });
    expect(login.status).toBe(200);
    const token = login.body.token;
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user?.email).toBe(testEmail);
    expect(Array.isArray(res.body.businesses)).toBe(true);
  });

  it("GET /api/auth/me without token returns 401", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("GET /api/auth/me with invalid token returns 401 with code", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer invalid.token.here");
    expect(res.status).toBe(401);
    expect(res.body.code).toBeDefined();
  });

  it("POST /api/auth/login with missing email returns 400", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send({ password: testPassword });
    expect(res.status).toBe(400);
  });

  it("POST /api/auth/login with invalid email format returns 400", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send({ email: "notvalid", password: testPassword });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation");
  });
});
