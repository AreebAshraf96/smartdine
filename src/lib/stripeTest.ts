import "server-only";
import Stripe from "stripe";

export const STRIPE_TEST_PROVIDER = "stripe_test";
export const ORDER_CURRENCY = "pkr";

export function getStripeTestConfig() {
  const key = process.env.STRIPE_TEST_SECRET_KEY?.trim();
  const webhookSecret = process.env.STRIPE_TEST_WEBHOOK_SECRET?.trim();
  const origin = process.env.STRIPE_TEST_RETURN_ORIGIN?.trim();
  if (!key && !webhookSecret && !origin) return null;
  if (!key?.startsWith("sk_test_") || !webhookSecret?.startsWith("whsec_") || !origin) {
    throw new Error("Stripe test mode requires a test key, webhook secret and return origin");
  }
  const url = new URL(origin);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
    throw new Error("Stripe test return origin must use HTTPS or HTTP loopback");
  }
  return { stripe: new Stripe(key, { maxNetworkRetries: 2 }), webhookSecret, origin: url.origin };
}

export function paymentMinorUnits(value: number | string) {
  const amount = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Invalid card payment amount");
  return amount;
}
