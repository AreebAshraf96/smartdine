import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { findOrderAtQr } from "@/lib/customerOrderAccess";

const UUID = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) {
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    }
    const raw = await request.text();
    if (raw.length > 4000) return NextResponse.json({ error: "Request too large" }, { status: 413 });
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    const { orderId, qrId, reviews } = body as Record<string, unknown>;
    if (typeof orderId !== "string" || !UUID.test(orderId) || typeof qrId !== "string" || !UUID.test(qrId) ||
        !Array.isArray(reviews) || reviews.length === 0 || reviews.length > 30) {
      return NextResponse.json({ error: "Invalid reviews" }, { status: 400 });
    }
    const order = await findOrderAtQr(orderId, qrId);
    if (!order) return NextResponse.json({ error: "Order not found for table" }, { status: 404 });
    if (order.status !== "served") return NextResponse.json({ error: "Review dishes after service" }, { status: 409 });

    const cleaned: { order_item_id: string; rating: number; comment: string | null }[] = [];
    const ids = new Set<string>();
    for (const candidate of reviews) {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return NextResponse.json({ error: "Invalid review" }, { status: 400 });
      const r = candidate as Record<string, unknown>;
      if (typeof r.orderItemId !== "string" || !UUID.test(r.orderItemId) ||
          !Number.isInteger(r.rating) || typeof r.rating !== "number" || r.rating < 1 || r.rating > 5 ||
          (r.comment !== undefined && (typeof r.comment !== "string" || r.comment.length > 500)) || ids.has(r.orderItemId)) {
        return NextResponse.json({ error: "Invalid dish rating" }, { status: 400 });
      }
      ids.add(r.orderItemId);
      cleaned.push({ order_item_id: r.orderItemId, rating: r.rating, comment: typeof r.comment === "string" ? r.comment.trim() : null });
    }
    const db = getSupabaseAdmin();
    const { data: items, error: itemError } = await db.from("order_items").select("id").eq("order_id", order.id).in("id", [...ids]);
    if (itemError) throw itemError;
    if (!items || items.length !== ids.size) return NextResponse.json({ error: "Dish does not belong to this order" }, { status: 403 });
    const { error } = await db.from("dish_reviews").upsert(cleaned.map(r => ({
      ...r, order_id: order.id, restaurant_id: order.restaurant_id, updated_at: new Date().toISOString(),
    })), { onConflict: "order_item_id" });
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Dish review submission:", error);
    return NextResponse.json({ error: "Unable to save dish review" }, { status: 500 });
  }
}
