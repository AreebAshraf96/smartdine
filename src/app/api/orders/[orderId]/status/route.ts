import { NextResponse } from "next/server";
import { authenticateStaff, roleCanTransition } from "@/lib/staffAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type Props = { params: Promise<{ orderId: string }> };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const allowed = ["received", "cancelled", "preparing", "ready", "served"];

export async function GET(request: Request, { params }: Props) {
  try {
    const { orderId } = await params;
    if (!uuidPattern.test(orderId)) {
      return NextResponse.json({ error: "Invalid order ID" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const qrId = searchParams.get("qrId");
    if (!qrId || !uuidPattern.test(qrId)) {
      return NextResponse.json({error: "Valid table QR required"}, {status: 400});
    }

    const admin = getSupabaseAdmin();

    const { data: order, error } = await admin
      .from("orders")
      .select("id, restaurant_id, table_session_id, status, total_amount, special_instructions, created_at")
      .eq("id", orderId)
      .maybeSingle();

    if (error) throw error;
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Verify QR code if provided to ensure table isolation
    let tableNumber: string | null = null;
    if (order.table_session_id) {
      const { data: session } = await admin
        .from("table_sessions")
        .select("id, table_id")
        .eq("id", order.table_session_id)
        .maybeSingle();

      if (session?.table_id) {
        const { data: table } = await admin
          .from("restaurant_tables")
          .select("table_number, qr_code_id")
          .eq("id", session.table_id)
          .maybeSingle();

        if (table) {
          tableNumber = table.table_number;
          if (table.qr_code_id !== qrId) {
            return NextResponse.json(
              { error: "Order does not belong to this table" },
              { status: 403 }
            );
          }
        } else {
          return NextResponse.json({error:"Table not found"},{status:404});
        }
      } else {
        return NextResponse.json({error:"Order session invalid"},{status:404});
      }
    } else {
      return NextResponse.json({error:"Order session missing"},{status:404});
    }

    const { data: items, error: itemsError } = await admin
      .from("order_items")
      .select("id, item_name, quantity, unit_price, special_instructions")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });

    if (itemsError) throw itemsError;

    return NextResponse.json(
      {
        order: {
          id: order.id,
          status: order.status,
          totalAmount: Number(order.total_amount),
          specialInstructions: order.special_instructions,
          createdAt: order.created_at,
          tableNumber,
          items: items ?? [],
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("SmartDine order status fetch error:", error);
    return NextResponse.json({ error: "Unable to load order status" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: Props) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) {
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    }
    const auth = await authenticateStaff(request);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { orderId } = await params;
    if (!uuidPattern.test(orderId)) return NextResponse.json({ error: "Invalid order ID" }, { status: 400 });
    const raw = await request.text();
    if (raw.length > 1000) return NextResponse.json({ error: "Request too large" }, { status: 413 });
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
    const target = body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).status : undefined;
    if (typeof target !== "string" || !allowed.includes(target)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    const admin = getSupabaseAdmin();
    const { data: order, error } = await admin
      .from("orders")
      .select("id, restaurant_id, status")
      .eq("id", orderId).maybeSingle();
    if (error) throw error;
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    const authorized = auth.memberships.some((m) =>
      m.restaurant_id === order.restaurant_id && roleCanTransition(m.role, order.status, target));
    if (!authorized) return NextResponse.json({ error: "Not authorized for this action" }, { status: 403 });

    // Compare-and-swap prevents approval/status races between staff devices.
    const { data: updated, error: updateError } = await admin
      .from("orders")
      .update({ status: target })
      .eq("id", orderId)
      .eq("status", order.status)
      .select("id, status")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return NextResponse.json({ error: "Order changed; refresh and try again" }, { status: 409 });
    return NextResponse.json({ order: updated });
  } catch (error) {
    console.error("SmartDine status update error", error);
    return NextResponse.json({ error: "Unable to update order" }, { status: 500 });
  }
}
