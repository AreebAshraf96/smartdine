
import { NextResponse } from "next/server";
import { authenticateStaff } from "@/lib/staffAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { connection } from "next/server";


// Correct UUID format: 8-4-4-4-12
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Roles allowed to manage kitchen waiter requests
const allowedRoles = ["owner", "manager", "kitchen"];

function canAccess(role: string): boolean {
  return allowedRoles.includes(role);
}

// --------------------------------------------------
// GET: Retrieve pending waiter calls for the kitchen
// --------------------------------------------------

export async function GET(request: Request) {
  await connection();
  try {
    const auth = await authenticateStaff(request);

    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.status }
      );
    }

    // Get restaurants assigned to this staff member
    const restaurantIds = [
      ...new Set(
        auth.memberships
          .filter((membership) =>
            canAccess(membership.role)
          )
          .map((membership) => membership.restaurant_id)
      ),
    ];

    if (restaurantIds.length === 0) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    const admin = getSupabaseAdmin();

    // Get pending waiter requests
    const { data: requests, error: requestsError } =
      await admin
        .from("waiter_requests")
        .select(
          "id, restaurant_id, table_id, status, created_at"
        )
        .in("restaurant_id", restaurantIds)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(100);

    if (requestsError) {
      console.error(
        "Failed to fetch waiter requests:",
        requestsError
      );

      throw requestsError;
    }

    if (!requests || requests.length === 0) {
      return NextResponse.json(
        { calls: [] },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    }

    // Get table IDs from pending requests
    const tableIds = [
      ...new Set(
        requests.map((request) => request.table_id)
      ),
    ];

    // Retrieve table numbers
    const { data: tables, error: tablesError } =
      await admin
        .from("restaurant_tables")
        .select("id, table_number")
        .in("id", tableIds);

    if (tablesError) {
      console.error(
        "Failed to fetch restaurant tables:",
        tablesError
      );

      throw tablesError;
    }

    // Map table IDs to table numbers
    const tableMap = new Map(
      (tables ?? []).map((table) => [
        table.id,
        table.table_number,
      ])
    );

    // Prepare response for kitchen dashboard
    const calls = requests.map((request) => ({
      id: request.id,
      restaurant_id: request.restaurant_id,
      table_number: String(
        tableMap.get(request.table_id) ?? "Unknown"
      ),
      created_at: request.created_at,
    }));

    return NextResponse.json(
      { calls },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error(
      "SmartDine GET waiter calls error:",
      error
    );

    return NextResponse.json(
      { error: "Unable to load waiter calls" },
      { status: 500 }
    );
  }
}

// --------------------------------------------------
// PATCH: Mark a waiter request as resolved
// --------------------------------------------------

export async function PATCH(request: Request) {
  try {
    // Reject requests from another browser origin
    const origin = request.headers.get("origin");

    if (
      origin &&
      origin !== new URL(request.url).origin
    ) {
      return NextResponse.json(
        { error: "Invalid origin" },
        { status: 403 }
      );
    }

    // Verify authenticated restaurant staff
    const auth = await authenticateStaff(request);

    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.status }
      );
    }

    // Limit request body size
    const rawBody = await request.text();

    if (rawBody.length > 1000) {
      return NextResponse.json(
        { error: "Request too large" },
        { status: 413 }
      );
    }

    // Parse JSON safely
    let body: unknown;

    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON" },
        { status: 400 }
      );
    }

    // Extract request ID exactly once
    const id =
      body &&
      typeof body === "object" &&
      !Array.isArray(body)
        ? (body as Record<string, unknown>).id
        : undefined;

    // Validate the waiter request UUID
    if (
      typeof id !== "string" ||
      !uuidPattern.test(id)
    ) {
      console.error(
        "Invalid waiter request ID:",
        id
      );

      return NextResponse.json(
        { error: "Invalid request ID" },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();

    // Find the pending request
    const { data: waiterCall, error: lookupError } =
      await admin
        .from("waiter_requests")
        .select("id, restaurant_id, status")
        .eq("id", id)
        .eq("status", "pending")
        .maybeSingle();

    if (lookupError) {
      console.error(
        "Waiter request lookup failed:",
        lookupError
      );

      throw lookupError;
    }

    if (!waiterCall) {
      return NextResponse.json(
        {
          error:
            "Request not found or already resolved",
        },
        { status: 404 }
      );
    }

    // Verify staff belongs to the same restaurant
    // and has permission to resolve waiter calls.
    const authorized = auth.memberships.some(
      (membership) =>
        membership.restaurant_id ===
          waiterCall.restaurant_id &&
        canAccess(membership.role)
    );

    if (!authorized) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Resolve the request only if still pending
    const { data: updated, error: updateError } =
      await admin
        .from("waiter_requests")
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("restaurant_id", waiterCall.restaurant_id)
        .eq("status", "pending")
        .select("id, status, resolved_at")
        .maybeSingle();

    if (updateError) {
      console.error(
        "Failed to resolve waiter request:",
        updateError
      );

      throw updateError;
    }

    if (!updated) {
      return NextResponse.json(
        {
          error:
            "Request was already handled. Refresh the dashboard.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Waiter request resolved successfully",
      request: updated,
    });
  } catch (error) {
    console.error(
      "SmartDine PATCH waiter calls error:",
      error
    );

    return NextResponse.json(
      { error: "Unable to resolve waiter request" },
      { status: 500 }
    );
  }
}
