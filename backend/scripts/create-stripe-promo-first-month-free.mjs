#!/usr/bin/env node
/**
 * Crée un coupon « 1er mois à 0 € » (remise 49,99 €, une fois) + code promo client.
 *
 * Usage (clé secrète Stripe requise — sk_live_… en prod) :
 *   STRIPE_SECRET_KEY=sk_live_… node scripts/create-stripe-promo-first-month-free.mjs --code FREEDAF352
 *
 * Railway :
 *   railway run --service fidpass-api node backend/scripts/create-stripe-promo-first-month-free.mjs --code FREEDAF352
 */
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import Stripe from "stripe";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env") });

const MONTHLY_CENTS = 4999;

function parseArgs(argv) {
  /** @type {Record<string, string>} */
  const out = { code: "FREEDAF352" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--code" && argv[i + 1]) out.code = String(argv[++i]).trim().toUpperCase();
    if (a === "--name" && argv[i + 1]) out.name = String(argv[++i]).trim();
  }
  return out;
}

async function findPromotionCode(stripe, code) {
  const list = await stripe.promotionCodes.list({ code, limit: 1 });
  return list.data[0] || null;
}

async function main() {
  const { code, name } = parseArgs(process.argv.slice(2));
  const secret = String(process.env.STRIPE_SECRET_KEY || "").trim();
  if (!secret.startsWith("sk_")) {
    console.error("STRIPE_SECRET_KEY manquante ou invalide (sk_live_… ou sk_test_…).");
    process.exit(1);
  }

  const stripe = new Stripe(secret, { maxNetworkRetries: 0, timeout: 15000 });
  const livemode = secret.startsWith("sk_live_");
  const couponName = name || `Premier mois gratuit (${code})`;

  const existing = await findPromotionCode(stripe, code);
  if (existing?.active) {
    const couponId =
      existing.promotion?.type === "coupon" ? existing.promotion.coupon : existing.coupon?.id;
    console.log(JSON.stringify({ ok: true, livemode, existing: true, code, couponId, id: existing.id }, null, 2));
    return;
  }

  const coupon = await stripe.coupons.create({
    amount_off: MONTHLY_CENTS,
    currency: "eur",
    duration: "once",
    name: couponName,
    metadata: { purpose: "first_month_free", promo_code: code },
  });

  const promo = await stripe.promotionCodes.create({
    promotion: { type: "coupon", coupon: coupon.id },
    code,
    metadata: { purpose: "first_month_free" },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        livemode,
        code: promo.code,
        promotionCodeId: promo.id,
        couponId: coupon.id,
        amountOffCents: MONTHLY_CENTS,
        checkoutExample: `https://buy.stripe.com/7sYcN53Z72N88et4Cr8Zq01?prefilled_promo_code=${encodeURIComponent(code)}`,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
