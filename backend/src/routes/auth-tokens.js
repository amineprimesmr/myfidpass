/**
 * Helpers auth exportés pour les flux post-paiement (sans importer tout auth.js).
 */
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import {
  getMerchantBusinessEntitlements,
  getSubscriptionByUserId,
  hasPaidMerchantSubscription,
  isOnlyTeamUser,
  getFirstTeamBusinessOwnerId,
} from "../db.js";
import { createRefreshToken } from "../db/refresh-tokens.js";
import { getJwtSecret } from "../lib/config.js";

const ACCESS_TOKEN_TTL_SECONDS = Math.max(
  60,
  parseInt(String(process.env.ACCESS_TOKEN_TTL_SECONDS || "900"), 10) || 900,
);
const REFRESH_TOKEN_TTL_DAYS = Math.max(
  1,
  parseInt(String(process.env.REFRESH_TOKEN_TTL_DAYS || "60"), 10) || 60,
);

function computeRefreshTokenExpiresAtIso() {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 3600 * 1000).toISOString();
}

function subscriptionPayloadForAuth(userId, subscriptionRow) {
  if (!subscriptionRow) return null;
  if (hasPaidMerchantSubscription(userId)) {
    return { status: subscriptionRow.status, plan_id: subscriptionRow.plan_id };
  }
  return { status: "inactive", plan_id: subscriptionRow.plan_id };
}

export function issueAuthTokensForUser(userId) {
  const uid = userId != null && userId !== "" ? String(userId) : userId;
  const accessToken = jwt.sign({ userId: uid }, getJwtSecret(), {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
  const refreshToken = randomUUID() + "-" + randomUUID();
  createRefreshToken(uid, refreshToken, computeRefreshTokenExpiresAtIso());
  return { accessToken, refreshToken };
}

export function getAuthPayloadForUser(user) {
  const userId = String(user.id);
  const subscription = getSubscriptionByUserId(userId);
  const subPayload = subscriptionPayloadForAuth(userId, subscription);
  const entitlements = getMerchantBusinessEntitlements(userId);
  const paying = hasPaidMerchantSubscription(userId);

  if (isOnlyTeamUser(userId)) {
    const ownerId = getFirstTeamBusinessOwnerId(userId);
    if (ownerId) {
      const ownerSubRow = getSubscriptionByUserId(ownerId);
      const ownerPaying = hasPaidMerchantSubscription(ownerId);
      return {
        user: { id: user.id, email: user.email, name: user.name, is_admin: !!user.is_admin },
        subscription: subscriptionPayloadForAuth(ownerId, ownerSubRow),
        has_active_subscription: ownerPaying,
        has_paid_merchant_subscription: ownerPaying,
        entitlements,
      };
    }
  }

  return {
    user: { id: user.id, email: user.email, name: user.name, is_admin: !!user.is_admin },
    subscription: subPayload,
    has_active_subscription: paying,
    has_paid_merchant_subscription: paying,
    entitlements,
  };
}
