
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// Correct UUID format: 8-4-4-4-12
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status }
  );
}

export async function POST(request: Request) {
  try {
    // Validate request origin
    const origin = request.headers.get("origin");

    if (
      origin &&
      origin !== new URL(request.url).origin
    ) {
      return fail("Invalid request origin", 403);
    }

    // Prevent excessively large requests
    const raw = await request.text();

    if (raw.length > 16000) {
      return fail("Request too large", 413);
    }

    // Parse JSON safely
    let body: Record<string, unknown>;

    try {
      const parsed: unknown = JSON.parse(raw);

      if (
        !parsed ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        return fail("Invalid request body", 400);
      }

      body = parsed as Record<string, unknown>;
    } catch {
      return fail("Invalid JSON", 400);
    }

    const { qrId, idempotencyKey, items } = body;
    const instructions = body.instructions ?? "";

    // --------------------------------------------
    // Validate order request
    // --------------------------------------------

    const validationErrors: string[] = [];

    if (
      typeof qrId !== "string" ||
      !uuid.test(qrId)
    ) {
      validationErrors.push("Invalid table QR ID");
    }

    if (
      typeof idempotencyKey !== "string" ||
      !uuid.test(idempotencyKey)
    ) {
      validationErrors.push("Invalid idempotency key");
    }

    if (
      typeof instructions !== "string" ||
      instructions.length > 500
    ) {
      validationErrors.push("Invalid instructions");
    }

    if (
      !Array.isArray(items) ||
      items.length < 1 ||
      items.length > 20
    ) {
      validationErrors.push("Invalid items array");
    }

    if (validationErrors.length > 0) {
      console.error(
        "SmartDine order validation failed:",
        {
          errors: validationErrors,
          qrId,
          idempotencyKey,
          itemCount: Array.isArray(items)
            ? items.length
            : "not an array",
          instructionsType: typeof instructions,
        }
      );

      return fail(validationErrors.join(", "), 400);
    }

    // TypeScript now knows items is an array
    const submittedItems = items as unknown[];

    // --------------------------------------------
    // Validate individual cart items
    // --------------------------------------------

    const seen = new Set<string>();

    const cleanItems: Array<{
      id: string;
      quantity: number;
    }> = [];

    let totalQuantity = 0;

    for (let index = 0; index < submittedItems.length; index++) {
      const item = submittedItems[index];

      if (
        !item ||
        typeof item !== "object" ||
        Array.isArray(item)
      ) {
        return fail(
          `Invalid item at position ${index + 1}`,
          400
        );
      }

      const record = item as Record<string, unknown>;

      if (
        typeof record.id !== "string" ||
        !uuid.test(record.id)
      ) {
        return fail(
          `Invalid menu item ID at position ${index + 1}`,
          400
        );
      }

      if (
        typeof record.quantity !== "number" ||
        !Number.isInteger(record.quantity) ||
        record.quantity < 1 ||
        record.quantity > 10
      ) {
        return fail(
          `Invalid quantity at position ${index + 1}`,
          400
        );
      }

      if (seen.has(record.id.toLowerCase())) {
        return fail(
          "Duplicate menu item detected",
          400
        );
      }

      seen.add(record.id.toLowerCase());

      totalQuantity += record.quantity;

      cleanItems.push({
        id: record.id,
        quantity: record.quantity,
      });
    }

    if (totalQuantity > 50) {
      return fail(
        "Maximum 50 items are allowed per order",
        400
      );
    }

    // --------------------------------------------
    // Create a pending order
    // --------------------------------------------

    const admin = getSupabaseAdmin();

    // IMPORTANT:
    // place_pending_order creates an order that
    // has NOT yet been released to the kitchen.
    //
    // Do not use place_kitchen_order here.
    const { data, error } = await admin.rpc(
      "place_pending_order",
      {
        p_qr_id: qrId,
        p_idempotency_key: idempotencyKey,
        p_items: cleanItems,
        p_instructions: instructions,
      }
    );

    if (error) {
      console.error(
        "SmartDine order creation failed:",
        {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        }
      );

      if (error.message.includes("RATE_LIMIT")) {
        return fail(
          "Too many orders. Please try again later.",
          429
        );
      }

      if (error.message.includes("ITEM_UNAVAILABLE")) {
        return fail(
          "An item is unavailable. Please refresh the menu.",
          409
        );
      }

      if (error.message.includes("INVALID_TABLE")) {
        return fail(
          "Invalid or inactive table QR code",
          404
        );
      }

      if (error.message.includes("BILL_REQUESTED")) {
        return fail(
          "Please contact restaurant staff.",
          409
        );
      }

      if (error.message.includes("INVALID_")) {
        return fail(
          "The database rejected the order details.",
          400
        );
      }

      return fail(
        "Unable to create pending order",
        500
      );
    }

    // --------------------------------------------
    // Verify the database response
    // --------------------------------------------

    const result = data as
      | {
          orderId?: unknown;
          total?: unknown;
          status?: unknown;
          replayed?: unknown;
        }
      | null;

    if (
      !result ||
      typeof result.orderId !== "string" ||
      !uuid.test(result.orderId)
    ) {
      console.error(
        "Invalid database response:",
        data
      );

      return fail(
        "Database did not return a valid order ID",
        500
      );
    }

    const { data: order, error: lookupError } =
      await admin
        .from("orders")
        .select("id, status, total_amount")
        .eq("id", result.orderId)
        .maybeSingle();

    if (lookupError) {
      console.error(
        "Order verification failed:",
        lookupError
      );

      return fail(
        "Unable to verify the new order",
        500
      );
    }

    if (!order) {
      return fail(
        "The new order was not found",
        500
      );
    }

    // Existing idempotency keys can replay an
    // already-confirmed order. Never silently
    // change its status back to pending.
    return NextResponse.json({
      orderId: order.id,
      total: Number(order.total_amount),
      status: order.status,
      replayed: Boolean(result.replayed),
    });
  } catch (error) {
    console.error(
      "Unexpected SmartDine order error:",
      error
    );

    return fail(
      "Unexpected server error",
      500
    );
  }
}
