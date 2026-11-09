
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { findOrderAtQr } from "@/lib/customerOrderAccess";

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
      .select("id, method, status")
      .eq("order_id", order.id)
      .maybeSingle();

    if (lookupError) throw lookupError;

    if (existing?.status === "paid") {
      return NextResponse.json(
        { error: "This order is already confirmed" },
        { status: 409 }
      );
    }

    if (existing?.status === "processing") {
      return NextResponse.json(
        { error: "Payment is processing" },
        { status: 409 }
      );
    }

    if (order.status !== "pending_approval") {
      return NextResponse.json(
        { error: "Order is not awaiting payment" },
        { status: 409 }
      );
    }

    // No real card provider is connected.
    if (method === "card" && !demoMode) {
      return NextResponse.json(
        {
          error:
            "Card payment demo is disabled. Connect a real gateway before accepting cards.",
        },
        { status: 501 }
      );
    }

    // Insert or update the customer's selected method.
    const { data: payment, error: paymentError } = await db
      .from("order_payment_choices")
      .upsert(
        {
          order_id: order.id,
          restaurant_id: order.restaurant_id,
          method,
          status: "pending",
          subtotal: Number(order.total_amount),
          tip_amount: tipAmount,
          currency: "PKR",
          provider: method === "card" ? "demo" : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "order_id" }
      )
      .select("id, method, status, total_amount, tip_amount")
      .single();

    if (paymentError) throw paymentError;

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
        "id, method, status, tip_amount, total_amount"
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
