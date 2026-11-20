
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { findOrderAtQr } from "@/lib/customerOrderAccess";
import { getStripeTestConfig, ORDER_CURRENCY, paymentMinorUnits, STRIPE_TEST_PROVIDER } from "@/lib/stripeTest";

const PAYMENT_FIELDS = "id, method, status, total_amount, tip_amount, provider, updated_at";

const demoMode =
  process.env.NODE_ENV !== "production" &&
  process.env.SMARTDINE_DEMO_PAYMENTS === "true";

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");

    if (origin && origin !== new URL(request.url).origin) {
      return NextResponse.json(
        { error: "Invalid origin" },
        { status: 403 }
      );
    }

    const raw = await request.text();

    if (raw.length > 1500) {
      return NextResponse.json(
        { error: "Request too large" },
        { status: 413 }
      );
    }

    let body: Record<string, unknown>;

    try {
      const parsed: unknown = JSON.parse(raw);

      if (!parsed || typeof parsed !== "object" ||
          Array.isArray(parsed)) {
        throw new Error("Invalid body");
      }

      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON" },
        { status: 400 }
      );
    }

    const { orderId, qrId, method, tipAmount } = body;

    if (
      typeof orderId !== "string" ||
      typeof qrId !== "string" ||
      (method !== "card" && method !== "pay_waiter") ||
      typeof tipAmount !== "number" ||
      !Number.isFinite(tipAmount) ||
      tipAmount < 0 ||
      tipAmount > 100000 ||
      Math.abs(tipAmount * 100 -
        Math.round(tipAmount * 100)) > 0.00001
    ) {
      return NextResponse.json(
        { error: "Invalid payment choice" },
        { status: 400 }
      );
    }

    const order = await findOrderAtQr(orderId, qrId);

    if (!order) {
      return NextResponse.json(
        { error: "Order or table not found" },
        { status: 404 }
      );
    }

    const db = getSupabaseAdmin();
    const { data: existing, error: lookupError } = await db
      .from("order_payment_choices")
      .select(PAYMENT_FIELDS)
      .eq("order_id", order.id)
      .maybeSingle();

    if (lookupError) throw lookupError;

    if (order.status !== "pending_approval" || existing?.status === "paid" || existing?.status === "processing") {
      return NextResponse.json({ error: "Order is no longer awaiting a payment choice" }, { status: 409 });
    }

    const stripe = method === "card" ? getStripeTestConfig() : null;
    if (existing?.provider === STRIPE_TEST_PROVIDER && !stripe) {
      return NextResponse.json({ error: "This order already has a Stripe test checkout" }, { status: 409 });
    }
    if (method === "card" && !stripe && !demoMode) {
      return NextResponse.json({ error: "Card test checkout is unavailable" }, { status: 503 });
    }

    if (stripe && new URL(request.url).origin !== stripe.origin) {
      return NextResponse.json({ error: "Open the table menu on the Stripe test site to pay by card" }, { status: 409 });
    }
    if (stripe) paymentMinorUnits(Number(order.total_amount) + tipAmount);

    const choice = {
      order_id: order.id,
      restaurant_id: order.restaurant_id,
      method,
      status: "pending",
      subtotal: Number(order.total_amount),
      tip_amount: tipAmount,
      currency: ORDER_CURRENCY.toUpperCase(),
      provider: stripe ? STRIPE_TEST_PROVIDER : method === "card" ? "demo" : null,
      updated_at: new Date().toISOString(),
    };

    // Freeze Stripe's amount and payment method before opening a hosted session.
    // Conditional writes also protect a payment approved in another request.
    let payment = existing;
    if (existing?.provider !== STRIPE_TEST_PROVIDER) {
      const table = db.from("order_payment_choices");
      const write = existing
        ? table.update(choice).eq("id", existing.id).eq("status", existing.status)
          .or("provider.is.null,provider.neq.stripe_test")
        : table.upsert(choice, { onConflict: "order_id", ignoreDuplicates: true });
      const result = await write.select(PAYMENT_FIELDS).maybeSingle();
      if (result.error) throw result.error;
      payment = result.data;
    }
    if (!payment) {
      return NextResponse.json({ error: "Payment changed. Please try again." }, { status: 409 });
    }

    if (stripe) {
      const expiresAt = Math.floor(Date.parse(payment.updated_at) / 1000) + 23 * 60 * 60;
      if (expiresAt - Math.floor(Date.now() / 1000) < 30 * 60) {
        return NextResponse.json({ error: "This test checkout can no longer be opened. Please start a new order." }, { status: 409 });
      }

      const returnUrl = new URL(`/r/${encodeURIComponent(qrId)}`, stripe.origin).href;
      const session = await stripe.stripe.checkout.sessions.create({
        mode: "payment",
        allowed_payment_method_types: ["card"],
        success_url: returnUrl,
        cancel_url: returnUrl,
        expires_at: expiresAt,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: ORDER_CURRENCY,
            unit_amount: paymentMinorUnits(payment.total_amount),
            product_data: { name: "SmartDine restaurant order (test)" },
          },
        }],
        metadata: { smartdine_order_id: order.id, smartdine_payment_id: payment.id },
      }, { idempotencyKey: `smartdine-test-checkout-${payment.id}` });

      if (session.livemode || !session.url) {
        return NextResponse.json({ error: "This test checkout is closed. Check the order status or start a new order." }, { status: 409 });
      }
      const reference = await db.from("stripe_test_checkout_refs").upsert({
        payment_id: payment.id, session_id: session.id,
      }, { onConflict: "payment_id", ignoreDuplicates: true });
      if (reference.error) throw reference.error;
      return NextResponse.json({ confirmed: false, payment, checkoutUrl: session.url });
    }

    // CASH: Wait for explicit kitchen approval.
    if (method === "pay_waiter") {
      return NextResponse.json({
        confirmed: false,
        payment,
        message:
          "Cash request sent. Your order will be confirmed after kitchen staff approve payment.",
      });
    }

    // CARD DEMO: Simulate successful payment locally.
    // NO external payment provider is called.
    const { data: confirmation, error: confirmError } =
      await db.rpc("confirm_payment_and_release", {
        p_payment_id: payment.id,
        p_expected_method: "card",
      });

    if (confirmError) throw confirmError;

    return NextResponse.json({
      confirmed: true,
      demo: true,
      payment: {
        ...payment,
        status: "paid",
      },
      order: confirmation,
      message:
        "Demo card payment approved. No money was charged. Your order has been sent to the kitchen.",
    });
  } catch (error) {
    console.error("Payment choice error:", error);

    return NextResponse.json(
      { error: "Unable to process payment selection" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    const orderId = url.searchParams.get("orderId") ?? "";
    const qrId = url.searchParams.get("qrId") ?? "";

    const order = await findOrderAtQr(orderId, qrId);

    if (!order) {
      return NextResponse.json(
        { error: "Order or table not found" },
        { status: 404 }
      );
    }

    const db = getSupabaseAdmin();

    const { data: payment, error } = await db
      .from("order_payment_choices")
      .select(
        "id, method, status, tip_amount, total_amount, provider"
      )
      .eq("order_id", order.id)
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json(
      {
        payment: payment ?? null,
        orderStatus: order.status,
      },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("Payment lookup error:", error);

    return NextResponse.json(
      { error: "Unable to load payment" },
      { status: 500 }
    );
  }
}
