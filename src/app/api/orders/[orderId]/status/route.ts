import { NextResponse } from "next/server";
import { authenticateStaff, roleCanTransition } from "@/lib/staffAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type Props = { params: Promise<{ orderId: string }> };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const allowed = ["received", "cancelled", "preparing", "ready", "served"];

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
