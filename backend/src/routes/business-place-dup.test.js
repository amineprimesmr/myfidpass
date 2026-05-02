/**
 * Un même lieu Google ne peut pas être ajouté deux fois comme commerce **propriétaire** du même compte.
 */
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../index.js";
import { createOrUpdateSubscription } from "../db.js";

describe("Doublon place_id / create-from-place", () => {
  let authToken;
  const placeA = `place-dup-a-${Date.now()}`;
  const placeB = `place-dup-b-${Date.now()}`;

  beforeAll(async () => {
    const email = `dup-place-test-${Date.now()}@example.com`;
    const register = await request(app)
      .post("/api/auth/register")
      .send({
        email,
        password: "testpassword12345",
        name: "Dup Place Test",
        google_place_id: placeA,
        establishment_name: "Shop A",
      });
    expect(register.status).toBe(201);
    authToken = register.body.token;
    const userId = register.body.user?.id;
    expect(userId).toBeDefined();
    createOrUpdateSubscription({
      userId,
      stripeCustomerId: "cus_test_dup_place",
      stripeSubscriptionId: "sub_test_dup_place",
      planId: "pro",
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
  });

  it("refuse POST /from-place avec le même place_id qu’un commerce déjà lié (409)", async () => {
    const res = await request(app)
      .post("/api/businesses/from-place")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        establishment_name: "Shop A bis",
        google_place_id: placeA,
      });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("business_place_already_linked");
  });

  it("accepte un autre place_id puis refuse le doublon sur ce second commerce", async () => {
    const ok = await request(app)
      .post("/api/businesses/from-place")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        establishment_name: "Shop B",
        google_place_id: placeB,
      });
    expect(ok.status).toBe(201);

    const again = await request(app)
      .post("/api/businesses/from-place")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        establishment_name: "Shop B bis",
        google_place_id: placeB,
      });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("business_place_already_linked");
  });
});
