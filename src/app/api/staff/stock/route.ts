
import { NextResponse } from "next/server";
import { authenticateStaff } from "@/lib/staffAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { connection } from "next/server";

const permitted = ["owner", "manager", "kitchen"];

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

    const restaurants = auth.memberships
      .filter((m) => permitted.includes(m.role))
      .map((m) => m.restaurant_id);

    if (!restaurants.length) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    const admin = getSupabaseAdmin();

    const { data, error } = await admin
      .from("menu_items")
      .select(
        "id, restaurant_id, name, is_available"
      )
      .in("restaurant_id", restaurants)
      .eq("is_active", true)
      .order("name");

    if (error) throw error;

    return NextResponse.json(
      { items: data ?? [] },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Unable to load stock" },
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

    const auth = await authenticateStaff(request);

    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.status }
      );
    }

    const body = await request.json();

    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (
      typeof body?.id !== "string" ||
      !uuid.test(body.id) ||
      typeof body?.is_available !== "boolean"
    ) {
      return NextResponse.json(
        { error: "Invalid stock update" },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();

    const { data: item, error } = await admin
      .from("menu_items")
      .select("id, restaurant_id")
      .eq("id", body.id)
      .maybeSingle();

    if (error) throw error;

    if (!item) {
      return NextResponse.json(
        { error: "Item not found" },
        { status: 404 }
      );
    }

    const authorized = auth.memberships.some(
      (m) =>
        m.restaurant_id === item.restaurant_id &&
        permitted.includes(m.role)
    );

    if (!authorized) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    const { error: updateError } = await admin
      .from("menu_items")
      .update({ is_available: body.is_available })
      .eq("id", body.id)
      .eq("restaurant_id", item.restaurant_id);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Unable to update availability" },
      { status: 500 }
    );
  }
}
