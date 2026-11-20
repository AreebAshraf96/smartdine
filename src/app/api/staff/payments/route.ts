
import { NextResponse } from "next/server";
import { authenticateStaff } from "@/lib/staffAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { connection } from "next/server";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getAccess(request: Request) {
    await connection();
  const auth = await authenticateStaff(request);

  if (!auth.ok) {
    return {
      ids: [] as string[],
      error: NextResponse.json(
        { error: auth.error },
        { status: auth.status }
      ),
    };
  }

  const ids = [
    ...new Set(
      auth.memberships
        .filter((m) =>
          ["owner", "manager", "kitchen"].includes(m.role)
        )
        .map((m) => m.restaurant_id)
    ),
  ];

  if (ids.length === 0) {
    return {
      ids,
      error: NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      ),
    };
  }

  return { ids, error: null };
}

export async function GET(request: Request) {
  try {
    const access = await getAccess(request);

    if (access.error) return access.error;

    const db = getSupabaseAdmin();

    const load = (relation: string) => db.from(relation)
      .select("id, order_id, restaurant_id, method, status, subtotal, tip_amount, total_amount, created_at")
      .in("restaurant_id", access.ids)
      .eq("method", "pay_waiter")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(100);
    const pending = await load("smartdine_pending_cash_payments");
    const { data, error } = pending.error?.code === "PGRST205" || pending.error?.code === "42P01"
      ? await load("order_payment_choices") : pending;
    if (error) throw error;

    return NextResponse.json(
      { payments: data ?? [] },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Staff payments GET:", error);

    return NextResponse.json(
      { error: "Unable to load cash approvals" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const origin = request.headers.get("origin");

    if (origin && origin !== new URL(request.url).origin) {
      return NextResponse.json(
        { error: "Invalid origin" },
        { status: 403 }
      );
    }

    const access = await getAccess(request);

    if (access.error) return access.error;

    const raw = await request.text();

    if (raw.length > 1000) {
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
        throw new Error("Invalid JSON");
      }

      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON" },
        { status: 400 }
      );
    }

    const paymentId = body.id;

    if (
      typeof paymentId !== "string" ||
      !UUID.test(paymentId) ||
      body.status !== "paid"
    ) {
      return NextResponse.json(
        { error: "Invalid cash approval request" },
        { status: 400 }
      );
    }

    const db = getSupabaseAdmin();

    // Verify that this specific payment belongs
    // to a restaurant the staff member manages.
    const { data: payment, error: lookupError } = await db
      .from("order_payment_choices")
      .select("id, restaurant_id, method, status")
      .eq("id", paymentId)
      .in("restaurant_id", access.ids)
      .maybeSingle();

    if (lookupError) throw lookupError;

    if (!payment) {
      return NextResponse.json(
        { error: "Payment not found or access denied" },
        { status: 404 }
      );
    }

    if (
      payment.method !== "pay_waiter" ||
      payment.status !== "pending"
    ) {
      return NextResponse.json(
        { error: "Cash approval is no longer pending" },
        { status: 409 }
      );
    }

    // Atomically marks payment paid and sends
    // the order to the kitchen.
    const { data, error } = await db.rpc(
      "confirm_payment_and_release",
      {
        p_payment_id: paymentId,
        p_expected_method: "pay_waiter",
      }
    );

    if (error) {
      console.error("Cash approval failed:", error);

      return NextResponse.json(
        { error: "Unable to approve cash payment" },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      confirmation: data,
      message: "Cash approved. Order sent to kitchen.",
    });
  } catch (error) {
    console.error("Staff payments PATCH:", error);

    return NextResponse.json(
      { error: "Unable to approve cash payment" },
      { status: 500 }
    );
  }
}
