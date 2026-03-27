/**
 * Tests d'idempotence pour l'ajout de points.
 * Vérifie qu'un double-envoi avec la même Idempotency-Key ne crédite
 * les points qu'une seule fois.
 */

import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../index.js";

describe("Idempotence addPoints", () => {
  let authToken;
  let businessSlug;
  let memberId;

  beforeAll(async () => {
    // Créer un compte commerçant de test
    const email = `idempotency-test-${Date.now()}@example.com`;
    const password = "testpassword12345";
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email, password, name: "Idempotency Test" });
    expect(register.status).toBe(201);
    authToken = register.body.token;

    // Créer un commerce
    const biz = await request(app)
      .post("/api/businesses")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ name: "Test Café Idempotency", slug: `test-cafe-idempotency-${Date.now()}` });
    expect(biz.status).toBe(201);
    businessSlug = biz.body.slug;

    // Créer un membre
    const member = await request(app)
      .post(`/api/businesses/${businessSlug}/members`)
      .send({ email: `member-${Date.now()}@test.com`, name: "Test Member" });
    expect(member.status).toBe(201);
    memberId = member.body.memberId;
  });

  it("Double POST /points avec même Idempotency-Key ne crédite qu'une fois", async () => {
    const idempotencyKey = `test-key-${Date.now()}`;

    // Premier envoi
    const res1 = await request(app)
      .post(`/api/businesses/${businessSlug}/members/${memberId}/points`)
      .set("Authorization", `Bearer ${authToken}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ points: 10 });
    expect(res1.status).toBe(200);
    const pointsAfterFirst = res1.body.points;

    // Deuxième envoi identique (double-clic, retry réseau)
    const res2 = await request(app)
      .post(`/api/businesses/${businessSlug}/members/${memberId}/points`)
      .set("Authorization", `Bearer ${authToken}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ points: 10 });
    expect(res2.status).toBe(200);
    expect(res2.body.idempotent).toBe(true);

    // Les points ne doivent pas avoir augmenté une deuxième fois
    expect(res2.body.points).toBe(pointsAfterFirst);
  });

  it("Deux POST /points avec des clés différentes créditent deux fois", async () => {
    const key1 = `test-key-A-${Date.now()}`;
    const key2 = `test-key-B-${Date.now()}`;

    const res1 = await request(app)
      .post(`/api/businesses/${businessSlug}/members/${memberId}/points`)
      .set("Authorization", `Bearer ${authToken}`)
      .set("Idempotency-Key", key1)
      .send({ points: 5 });
    expect(res1.status).toBe(200);
    const pointsAfterFirst = res1.body.points;

    const res2 = await request(app)
      .post(`/api/businesses/${businessSlug}/members/${memberId}/points`)
      .set("Authorization", `Bearer ${authToken}`)
      .set("Idempotency-Key", key2)
      .send({ points: 5 });
    expect(res2.status).toBe(200);
    // Points doivent avoir augmenté de 5 supplémentaires
    expect(res2.body.points).toBe(pointsAfterFirst + 5);
    expect(res2.body.idempotent).toBeUndefined();
  });

  it("POST /points sans Idempotency-Key fonctionne normalement", async () => {
    const res = await request(app)
      .post(`/api/businesses/${businessSlug}/members/${memberId}/points`)
      .set("Authorization", `Bearer ${authToken}`)
      .send({ points: 3 });
    expect(res.status).toBe(200);
    expect(res.body.points_added).toBe(3);
  });
});
