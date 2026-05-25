import { randomUUID } from "crypto";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../../index.js";
import { createOrUpdateSubscription, getMember } from "../../db.js";
import { getDb } from "../../db/connection.js";

describe("match predictions", () => {
  let authToken;
  let businessSlug;
  let userId;
  let matchId;
  let memberA;
  let memberB;

  beforeAll(async () => {
    const email = `match-predictions-${Date.now()}@example.com`;
    const register = await request(app)
      .post("/api/auth/register")
      .send({
        email,
        password: "testpassword12345",
        name: "Match Predictions",
        google_place_id: `place-match-predictions-${Date.now()}`,
        establishment_name: "Match Predictions Shop",
      });
    expect(register.status).toBe(201);
    authToken = register.body.token;
    userId = register.body.user?.id;
    businessSlug = register.body.businesses?.[0]?.slug;
    createOrUpdateSubscription({
      userId,
      stripeCustomerId: "cus_match_predictions",
      stripeSubscriptionId: "sub_match_predictions",
      planId: "starter",
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 7 * 86400000).toISOString(),
    });

    const cfg = await request(app)
      .patch(`/api/businesses/${businessSlug}/dashboard/match-predictions/config`)
      .set("Authorization", `Bearer ${authToken}`)
      .send({ enabled: true, points_per_correct_prediction: 12 });
    expect(cfg.status).toBe(200);

    const db = getDb();
    matchId = randomUUID();
    db.prepare(
      `INSERT INTO match_prediction_matches
       (id, code, title, team_home, team_away, starts_at, cutoff_at, sort_order, active)
       VALUES (?, ?, 'Match test futur', 'Bleus', 'Verts', datetime('now', '+10 days'), datetime('now', '+9 days'), 998, 1)`,
    ).run(matchId, `future-${Date.now()}`);

    const a = await request(app)
      .post(`/api/businesses/${businessSlug}/members`)
      .send({ email: `a-${Date.now()}@example.com`, name: "Client A" });
    const b = await request(app)
      .post(`/api/businesses/${businessSlug}/members`)
      .send({ email: `b-${Date.now()}@example.com`, name: "Client B" });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    memberA = a.body.memberId;
    memberB = b.body.memberId;
  });

  it("accepte puis remplace un pronostic avant le cutoff", async () => {
    const first = await request(app)
      .post(`/api/businesses/${businessSlug}/games/match_predictions/matches/${matchId}/predictions`)
      .send({ memberId: memberA, choice: "home" });
    expect(first.status).toBe(200);
    expect(first.body.match.prediction.predicted_choice).toBe("home");

    const second = await request(app)
      .post(`/api/businesses/${businessSlug}/games/match_predictions/matches/${matchId}/predictions`)
      .send({ memberId: memberA, choice: "draw" });
    expect(second.status).toBe(200);
    expect(second.body.match.prediction.predicted_choice).toBe("draw");
  });

  it("refuse un pronostic après cutoff", async () => {
    const db = getDb();
    const lockedId = randomUUID();
    db.prepare(
      `INSERT INTO match_prediction_matches
       (id, code, title, team_home, team_away, starts_at, cutoff_at, sort_order, active)
       VALUES (?, ?, 'Match verrouillé', 'Bleus', 'Rouges', datetime('now', '-1 hour'), datetime('now', '-2 hours'), 999, 1)`,
    ).run(lockedId, `locked-${Date.now()}`);

    const res = await request(app)
      .post(`/api/businesses/${businessSlug}/games/match_predictions/matches/${lockedId}/predictions`)
      .send({ memberId: memberA, choice: "home" });
    expect(res.status).toBe(423);
  });

  it("crédite uniquement les bons pronostics et reste idempotent", async () => {
    await request(app)
      .post(`/api/businesses/${businessSlug}/games/match_predictions/matches/${matchId}/predictions`)
      .send({ memberId: memberA, choice: "home" });
    await request(app)
      .post(`/api/businesses/${businessSlug}/games/match_predictions/matches/${matchId}/predictions`)
      .send({ memberId: memberB, choice: "away" });

    const beforeA = Number(getMember(memberA).points) || 0;
    const beforeB = Number(getMember(memberB).points) || 0;
    const score1 = await request(app)
      .post(`/api/businesses/${businessSlug}/dashboard/match-predictions/matches/${matchId}/result`)
      .set("Authorization", `Bearer ${authToken}`)
      .send({ result_choice: "home" });
    expect(score1.status).toBe(200);
    expect(score1.body.correct_count).toBe(1);

    expect(Number(getMember(memberA).points)).toBe(beforeA + 12);
    expect(Number(getMember(memberB).points)).toBe(beforeB);

    const score2 = await request(app)
      .post(`/api/businesses/${businessSlug}/dashboard/match-predictions/matches/${matchId}/result`)
      .set("Authorization", `Bearer ${authToken}`)
      .send({ result_choice: "home" });
    expect(score2.status).toBe(200);
    expect(Number(getMember(memberA).points)).toBe(beforeA + 12);
  });
});
