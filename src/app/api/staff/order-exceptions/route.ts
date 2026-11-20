import { connection, NextResponse } from "next/server";
import { authenticateStaff } from "@/lib/staffAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { UUID } from "@/lib/customerOrderAccess";
import { getStripeTestConfig, paymentMinorUnits, STRIPE_TEST_PROVIDER } from "@/lib/stripeTest";

const headers = { "Cache-Control": "private, no-store" };
function reply(data: object, status = 200) { return NextResponse.json(data, { status, headers }); }
type Db = ReturnType<typeof getSupabaseAdmin>;

export async function GET(request: Request) {
  await connection();
  try {
    const auth = await authenticateStaff(request);
    if (!auth.ok) return reply({ error: auth.error }, auth.status);
    const { searchParams } = new URL(request.url);
    const ids = auth.memberships.map(member => member.restaurant_id);
    const searched = searchParams.get("orderId")?.trim();
    if (searched && !UUID.test(searched)) return reply({ error: "Enter the full order ID" }, 400);

    const db = getSupabaseAdmin();
    let query = db.from("orders").select("id,restaurant_id,status,created_at").in("restaurant_id", ids);
    if (searched) query = query.eq("id", searched);
    const { data: orders, error } = await query.order("created_at", { ascending: false }).limit(40);
    if (error) throw error;
    if (!orders?.length) return reply({ orders: [] });

    const orderIds = orders.map(order => order.id);
    const [payments, refunds, restaurants] = await Promise.all([
      db.from("order_payment_choices").select("id,order_id,method,provider,status,total_amount,currency").in("order_id", orderIds).in("restaurant_id", ids),
      db.from("order_refunds").select("order_id,amount,currency,refunded_at,reason").in("order_id", orderIds).in("restaurant_id", ids),
      db.from("restaurants").select("id,name").in("id", ids),
    ]);
    if (payments.error) throw payments.error;
    if (refunds.error) throw refunds.error;
    if (restaurants.error) throw restaurants.error;
    return reply({ orders: orders.map(order => ({
      ...order,
      restaurant: restaurants.data?.find(restaurant => restaurant.id === order.restaurant_id)?.name,
      payment: payments.data?.find(payment => payment.order_id === order.id),
      refund: refunds.data?.find(refund => refund.order_id === order.id),
    })) });
  } catch (error) {
    console.error("Order exceptions GET", error);
    return reply({ error: "Unable to load order exceptions. Check that the operations migration has been applied." }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return reply({ error: "Invalid origin" }, 403);
    const auth = await authenticateStaff(request);
    if (!auth.ok) return reply({ error: auth.error }, auth.status);
    const raw = await request.text();
    if (raw.length > 2000) return reply({ error: "Request too large" }, 413);
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ error: "Invalid order action" }, 400);
    const { orderId, action, reason, cashReturned } = body as Record<string, unknown>;
    if (typeof orderId !== "string" || !UUID.test(orderId) || (action !== "cancel" && action !== "refund")) {
      return reply({ error: "Invalid order action" }, 400);
    }

    const db = getSupabaseAdmin();
    const { data: order, error } = await db.from("orders").select("id,restaurant_id,status")
      .eq("id", orderId).in("restaurant_id", auth.memberships.map(member => member.restaurant_id)).maybeSingle();
    if (error) throw error;
    if (!order) return reply({ error: "Order not found" }, 404);

    const { data: payment, error: paymentError } = await db.from("order_payment_choices")
      .select("id,method,provider,status,total_amount,currency")
      .eq("order_id", order.id).eq("restaurant_id", order.restaurant_id).maybeSingle();
    if (paymentError) throw paymentError;

    if (action === "cancel") {
      if (order.status === "served") return reply({ error: "A served order can be refunded, but cannot be cancelled" }, 409);
      let stripeExpired = false;
      if (payment?.status === "pending" && payment.provider === STRIPE_TEST_PROVIDER) {
        const config = getStripeTestConfig();
        const ref = await lookupStripeRef(db, payment.id);
        if (!config || !ref) return reply({ error: "Wait for the test checkout to expire before cancelling this order" }, 409);
        const session = await config.stripe.checkout.sessions.retrieve(ref.session_id);
        if (session.livemode || session.metadata?.smartdine_payment_id !== payment.id || session.metadata?.smartdine_order_id !== order.id) return reply({ error: "Checkout reference did not match" }, 409);
        stripeExpired = session.status === "expired";
        if (session.status === "open") {
          stripeExpired = (await config.stripe.checkout.sessions.expire(session.id)).status === "expired";
        }
      }
      const result = await db.rpc("cancel_smartdine_order", { target_order: order.id, target_restaurant: order.restaurant_id, stripe_expired: stripeExpired });
      if (result.error) throw result.error;
      if (!result.data) return reply({ error: "This order cannot be cancelled while a payment is open or a paid amount remains unrefunded" }, 409);
      return reply({ success: true });
    }

    if (!payment || payment.status !== "paid") return reply({ error: "Only confirmed payments can be refunded" }, 409);
    if (typeof reason !== "string" || !reason.trim() || reason.trim().length > 200) return reply({ error: "Enter a refund reason (up to 200 characters)" }, 400);
    const prior = await db.from("order_refunds").select("payment_id").eq("payment_id", payment.id).maybeSingle();
    if (prior.error) throw prior.error;
    if (prior.data) return reply({ success: true });

    let stripeRefundId: string | null = null;
    let refundedAt = new Date().toISOString();
    if (payment.method === "pay_waiter") {
      if (cashReturned !== true) return reply({ error: "Confirm the customer already received the cash refund" }, 400);
    } else if (payment.provider === STRIPE_TEST_PROVIDER) {
      const config = getStripeTestConfig();
      const ref = await lookupStripeRef(db, payment.id);
      if (!config || !ref?.payment_intent_id) return reply({ error: "Stripe test payment reference is unavailable" }, 409);
      const intent = await config.stripe.paymentIntents.retrieve(ref.payment_intent_id);
      const amount = paymentMinorUnits(payment.total_amount);
      if (intent.livemode || intent.status !== "succeeded" || intent.currency !== payment.currency.toLowerCase() || intent.amount_received !== amount) {
        return reply({ error: "Stripe test payment did not match the recorded amount or currency" }, 409);
      }

      const existing = await config.stripe.refunds.list({ payment_intent: intent.id, limit: 100 });
      const matching = existing.data.find(refund => refund.amount === amount && refund.status === "succeeded");
      if (!matching && (existing.has_more || existing.data.some(refund => refund.status !== "failed" && refund.status !== "canceled"))) {
        return reply({ error: "Stripe already has a pending or partial refund for this payment. Check Stripe before retrying." }, 409);
      }
      const attempt = existing.data.filter(refund => refund.status === "failed" || refund.status === "canceled").length;
      const refund = matching ?? await config.stripe.refunds.create({
        payment_intent: intent.id, amount,
        metadata: { smartdine_payment_id: payment.id, smartdine_order_id: order.id },
      }, { idempotencyKey: `smartdine-full-refund-${payment.id}-${attempt}` });
      if (refund.status !== "succeeded") return reply({ error: "Stripe has not confirmed this refund yet. Check Stripe and refresh before retrying." }, 409);
      stripeRefundId = refund.id;
      refundedAt = new Date(refund.created * 1000).toISOString();
    } else if (payment.provider !== "demo") {
      return reply({ error: "This provider does not support refunds in SmartDine" }, 409);
    }

    const result = await db.from("order_refunds").upsert({
      payment_id: payment.id, order_id: order.id, restaurant_id: order.restaurant_id,
      amount: payment.total_amount, currency: payment.currency, method: payment.method,
      provider: payment.provider, stripe_refund_id: stripeRefundId,
      reason: reason.trim(), refunded_by: auth.userId, refunded_at: refundedAt,
    }, { onConflict: "payment_id", ignoreDuplicates: true });
    if (result.error) throw result.error;
    return reply({ success: true });
  } catch (error) {
    if (error instanceof SyntaxError) return reply({ error: "Invalid JSON" }, 400);
    console.error("Order exceptions POST", error);
    return reply({ error: "Unable to complete this action. Check the payment status before retrying." }, 500);
  }
}

async function lookupStripeRef(db: Db, paymentId: string) {
  const result = await db.from("stripe_test_checkout_refs").select("session_id,payment_intent_id").eq("payment_id", paymentId).maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}
