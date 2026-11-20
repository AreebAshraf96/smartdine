import { NextResponse } from "next/server";
import { UUID } from "@/lib/customerOrderAccess";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getStripeTestConfig, ORDER_CURRENCY, paymentMinorUnits, STRIPE_TEST_PROVIDER } from "@/lib/stripeTest";

export async function POST(request: Request) {
  try {
    const config = getStripeTestConfig();
    if (!config) return NextResponse.json({ error: "Stripe test mode is disabled" }, { status: 503 });

    const signature = request.headers.get("stripe-signature");
    if (!signature) return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });

    const raw = await request.text();
    let event;
    try {
      event = config.stripe.webhooks.constructEvent(raw, signature, config.webhookSecret);
    } catch {
      return NextResponse.json({ error: "Invalid Stripe webhook" }, { status: 400 });
    }

    if (event.livemode || (event.type !== "checkout.session.completed" && event.type !== "checkout.session.expired")) {
      return NextResponse.json({ received: true });
    }

    const session = event.data.object;
    const paymentId = session.metadata?.smartdine_payment_id;
    const orderId = session.metadata?.smartdine_order_id;
    if (
      session.livemode || session.mode !== "payment" ||
      !paymentId || !UUID.test(paymentId) || !orderId || !UUID.test(orderId)
    ) {
      return NextResponse.json({ received: true });
    }

    const db = getSupabaseAdmin();
    const { data: payment, error } = await db
      .from("order_payment_choices")
      .select("id, status, total_amount, currency, restaurant_id")
      .eq("id", paymentId)
      .eq("order_id", orderId)
      .eq("method", "card")
      .eq("provider", STRIPE_TEST_PROVIDER)
      .maybeSingle();

    if (error) throw error;
    if (
      !payment || session.currency !== ORDER_CURRENCY ||
      payment.currency.toLowerCase() !== ORDER_CURRENCY ||
      session.amount_total !== paymentMinorUnits(payment.total_amount)
    ) {
      console.error("Stripe test Checkout Session does not match payment", session.id);
      return NextResponse.json({ error: "Payment details did not match" }, { status: 409 });
    }

    if (payment.status === "paid") return NextResponse.json({ received: true });
    if (event.type === "checkout.session.expired") {
      if (session.status !== "expired") return NextResponse.json({ received: true });
      const cancelled = await db.rpc("cancel_smartdine_order", {
        target_order: orderId, target_restaurant: payment.restaurant_id, stripe_expired: true,
      });
      if (cancelled.error) throw cancelled.error;
      return NextResponse.json({ received: true });
    }
    if (session.payment_status !== "paid") return NextResponse.json({ received: true });
    const intentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    if (!intentId) return NextResponse.json({ error: "Missing Stripe payment reference" }, { status: 409 });
    const reference = await db.from("stripe_test_checkout_refs").upsert({
      payment_id: payment.id, session_id: session.id, payment_intent_id: intentId,
    }, { onConflict: "payment_id" });
    if (reference.error) throw reference.error;

    const { error: releaseError } = await db.rpc("confirm_payment_and_release", {
      p_payment_id: payment.id,
      p_expected_method: "card",
    });

    // Another delivery may have completed the atomic release first.
    if (releaseError) {
      const { data: current } = await db.from("order_payment_choices")
        .select("status").eq("id", payment.id).maybeSingle();
      if (current?.status !== "paid") throw releaseError;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Stripe test webhook processing failed", error);
    return NextResponse.json({ error: "Unable to confirm Stripe test payment" }, { status: 500 });
  }
}
