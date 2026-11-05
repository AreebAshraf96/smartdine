
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


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

    if (raw.length > 1000) {
      return NextResponse.json(
        { error: "Request too large" },
        { status: 413 }
      );
    }

    let body: unknown;

    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON" },
        { status: 400 }
      );
    }

    const qrId =
      body && typeof body === "object" &&
      !Array.isArray(body)
        ? (body as Record<string, unknown>).qrId
        : null;

    if (typeof qrId !== "string" || !uuid.test(qrId)) {
      return NextResponse.json(
        { error: "Invalid table QR" },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();

    // Verify active restaurant and table.
    const { data: table, error: tableError } = await admin
      .from("restaurant_tables")
      .select("id, restaurant_id, is_active")
      .eq("qr_code_id", qrId)
      .maybeSingle();

    if (tableError) throw tableError;

    if (!table || !table.is_active) {
      return NextResponse.json(
        { error: "Table not found" },
        { status: 404 }
      );
    }

    const { data: restaurant, error: restaurantError } =
      await admin
        .from("restaurants")
        .select("id")
        .eq("id", table.restaurant_id)
        .eq("is_active", true)
        .maybeSingle();

    if (restaurantError) throw restaurantError;

    if (!restaurant) {
      return NextResponse.json(
        { error: "Restaurant unavailable" },
        { status: 404 }
      );
    }

    // One pending request per table.
    const { data: existing, error: existingError } =
      await admin
        .from("waiter_requests")
        .select("id")
        .eq("table_id", table.id)
        .eq("status", "pending")
        .maybeSingle();

    if (existingError) throw existingError;

    if (existing) {
      return NextResponse.json({
        success: true,
        message: "Staff have already been notified.",
      });
    }

    const { error } = await admin
      .from("waiter_requests")
      .insert({
        restaurant_id: table.restaurant_id,
        table_id: table.id,
        status: "pending",
      });

    // Two simultaneous calls might hit the
    // unique pending-request constraint.
    if (error?.code === "23505") {
      return NextResponse.json({
        success: true,
        message: "Staff have already been notified.",
      });
    }

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: "Staff have been notified.",
    });
  } catch (error) {
    console.error("Call waiter error:", error);

    return NextResponse.json(
      { error: "Unable to notify staff" },
      { status: 500 }
    );
  }
}
