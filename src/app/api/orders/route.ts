
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");

    if (origin && origin !== new URL(request.url).origin) {
      return fail("Invalid origin", 403);
    }

    const raw = await request.text();

    if (raw.length > 16000) {
      return fail("Request too large", 413);
    }

    let body: Record<string, unknown>;

    try {
      body = JSON.parse(raw);
    } catch {
      return fail("Invalid JSON", 400);
    }

    if (!body || typeof body !== "object" ||
        Array.isArray(body)) {
      return fail("Invalid request", 400);
    }

    const { qrId, idempotencyKey, items } = body;
    const instructions = body.instructions ?? "";

    if (
      typeof qrId !== "string" ||
      !uuid.test(qrId) ||
      typeof idempotencyKey !== "string" ||
      !uuid.test(idempotencyKey) ||
      typeof instructions !== "string" ||
      instructions.length > 500 ||
      !Array.isArray(items) ||
      items.length < 1 ||
      items.length > 20
    ) {
      return fail("Invalid order", 400);
    }

    const seen = new Set<string>();
    const cleanItems: Array<{
      id: string;
      quantity: number;
    }> = [];

    let totalQuantity = 0;

    for (const item of items) {
      if (!item || typeof item !== "object") {
        return fail("Invalid item", 400);
      }

      const record = item as Record<string, unknown>;

      if (
        typeof record.id !== "string" ||
        !uuid.test(record.id) ||
        typeof record.quantity !== "number" ||
        !Number.isInteger(record.quantity) ||
        record.quantity < 1 ||
        record.quantity > 10 ||
        seen.has(record.id.toLowerCase())
      ) {
        return fail("Invalid cart item", 400);
      }

      seen.add(record.id.toLowerCase());
      totalQuantity += record.quantity;

      cleanItems.push({
        id: record.id,
        quantity: record.quantity,
      });
    }

    if (totalQuantity > 50) {
      return fail("Too many items", 400);
    }

    const admin = getSupabaseAdmin();

    const { data, error } = await admin.rpc(
      "place_kitchen_order",
      {
        p_qr_id: qrId,
        p_idempotency_key: idempotencyKey,
        p_items: cleanItems,
        p_instructions: instructions,
      }
    );

    if (error) {
      console.error("Order API:", error.message);

      if (error.message.includes("RATE_LIMIT")) {
        return fail("Too many orders. Try later.", 429);
      }

      if (error.message.includes("ITEM_UNAVAILABLE")) {
        return fail(
          "Item unavailable. Refresh your menu.",
          409
        );
      }

      if (error.message.includes("INVALID_TABLE")) {
        return fail("Invalid table QR code", 404);
      }

      if (error.message.includes("BILL_REQUESTED")) {
        return fail("Please contact staff", 409);
      }

      if (error.message.includes("INVALID_")) {
        return fail("Invalid order details", 400);
      }

      return fail("Unable to place order", 500);
    }

    return NextResponse.json({
      orderId: data.orderId,
      total: Number(data.total),
      status: data.status,
      replayed: Boolean(data.replayed),
    });
  } catch (error) {
    console.error("Unexpected order error:", error);
    return fail("Server error", 500);
  }
}
