import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../index.js";

describe("Auth API", () => {
  // Mot de passe >= 12 caractères (nouvelle politique)
  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = "password123456"; // 14 chars ✓
  const selectedEstablishment = {
    google_place_id: `place-${Date.now()}`,
    establishment_name: "Test User Shop",
  };

  it("POST /api/auth/register with valid body returns 201 and token", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .set("Content-Type", "application/json")
      .send({
        email: testEmail,
        password: testPassword,
        name: "Test User",
        ...selectedEstablishment,
      });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("token");
    expect(res.body).toHaveProperty("user");
    expect(res.body.user.email).toBe(testEmail);
    expect(Array.isArray(res.body.businesses)).toBe(true);
    expect(res.body.requires_business_setup).toBe(false);
  });

  it("POST /api/auth/check-email returns account_exists for known and unknown emails", async () => {
    const known = await request(app)
      .post("/api/auth/check-email")
      .set("Content-Type", "application/json")
      .send({ email: testEmail });
    expect(known.status).toBe(200);
    expect(known.body.account_exists).toBe(true);

    const unknown = await request(app)
      .post("/api/auth/check-email")
      .set("Content-Type", "application/json")
      .send({ email: `unknown-${Date.now()}@example.com` });
    expect(unknown.status).toBe(200);
    expect(unknown.body.account_exists).toBe(false);
  });

  it("POST /api/auth/register with duplicate email returns 409", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .set("Content-Type", "application/json")
      .send({ email: testEmail, password: testPassword, ...selectedEstablishment });
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
      .send({
        email: `short-pwd-${Date.now()}@example.com`,
        password: "short123",
        google_place_id: `place-short-${Date.now()}`,
        establishment_name: "Short Password Shop",
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation");
    expect(res.body.details?.password).toBeDefined();
  });

  it("POST /api/auth/register without selected establishment returns 400", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .set("Content-Type", "application/json")
      .send({ email: `no-biz-${Date.now()}@example.com`, password: testPassword });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation");
    expect(res.body.details?.google_place_id).toBeDefined();
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

  it("POST /api/auth/phone/send-code then verify creates session (OTP test = 123456)", async () => {
    const phone = `06${String(Date.now()).slice(-8)}`;
    const est = {
      google_place_id: `place-phone-${Date.now()}`,
      establishment_name: "Boutique Téléphone Test",
    };

    const send = await request(app)
      .post("/api/auth/phone/send-code")
      .set("Content-Type", "application/json")
      .send({ phone });
    expect(send.status).toBe(200);
    expect(send.body.ok).toBe(true);

    const verify = await request(app)
      .post("/api/auth/phone/verify")
      .set("Content-Type", "application/json")
      .send({ phone, code: "123456", ...est });
    expect(verify.status).toBe(201);
    expect(verify.body.token).toBeDefined();
    expect(verify.body.user?.phone).toMatch(/^\+33/);
    expect(verify.body.requires_business_setup).toBe(false);
  });

  it("POST /api/auth/phone/verify without establishment returns 400", async () => {
    const phone = `07${String(Date.now() + 1).slice(-8)}`;
    const send = await request(app)
      .post("/api/auth/phone/send-code")
      .set("Content-Type", "application/json")
      .send({ phone });
    expect(send.status).toBe(200);

    const verify = await request(app)
      .post("/api/auth/phone/verify")
      .set("Content-Type", "application/json")
      .send({ phone, code: "123456" });
    expect(verify.status).toBe(400);
    expect(verify.body.code).toBe("missing_establishment");
  });
});
