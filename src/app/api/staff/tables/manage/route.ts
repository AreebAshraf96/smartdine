import { NextResponse } from "next/server";
import { authenticateStaff } from "@/lib/staffAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { UUID } from "@/lib/customerOrderAccess";

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    const auth = await authenticateStaff(request);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const raw = await request.text();
    if (raw.length > 2000) return NextResponse.json({ error: "Request too large" }, { status: 413 });
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid table action" }, { status: 400 });
    const { action, restaurantId, tableId, label, active } = body as Record<string, unknown>;
    if (typeof restaurantId !== "string" || !UUID.test(restaurantId) ||
      (action !== "add" && action !== "rename" && action !== "toggle" && action !== "remove") ||
      (action !== "add" && (typeof tableId !== "string" || !UUID.test(tableId))) ||
      ((action === "add" || action === "rename") && (typeof label !== "string" || !label.trim() || label.trim().length > 40)) ||
      (action === "toggle" && typeof active !== "boolean")) {
      return NextResponse.json({ error: "Invalid table action" }, { status: 400 });
    }
    if (!auth.memberships.some(membership => membership.restaurant_id === restaurantId)) {
      return NextResponse.json({ error: "Restaurant not authorized" }, { status: 403 });
    }

    const db = getSupabaseAdmin();
    const table = db.from("restaurant_tables");
    const match = (changes: Record<string, unknown>) => table.update(changes)
      .eq("id", tableId as string).eq("restaurant_id", restaurantId).is("archived_at", null);
    const result = await (action === "add"
      ? table.insert({ restaurant_id: restaurantId, table_number: (label as string).trim(), qr_code_id: crypto.randomUUID(), is_active: true })
      : action === "rename" ? match({ table_number: (label as string).trim() })
      : action === "toggle" ? match({ is_active: active })
      : match({ is_active: false, archived_at: new Date().toISOString() }))
      .select("id").maybeSingle();
    if (result.error?.code === "23505") return NextResponse.json({ error: "That table label is already in use" }, { status: 409 });
    if (result.error) throw result.error;
    if (!result.data) return NextResponse.json({ error: "Table not found" }, { status: 404 });
    return NextResponse.json({ success: true }, { status: action === "add" ? 201 : 200 });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    console.error("Manage table", error);
    return NextResponse.json({ error: "Unable to save table changes" }, { status: 500 });
  }
}
