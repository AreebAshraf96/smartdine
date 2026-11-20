import { connection, NextResponse } from "next/server";
import { authenticateStaff } from "@/lib/staffAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } });
}

// Lists the tables (and their QR identifiers) for every restaurant the
// signed-in owner/manager belongs to. Used by the QR code generator.
export async function GET(request: Request) {
  await connection();
  try {
    const auth = await authenticateStaff(request);
    if (!auth.ok) return fail(auth.error, auth.status);

    const ids = [...new Set(
      auth.memberships
        .filter(m => m.role === "owner" || m.role === "manager")
        .map(m => m.restaurant_id)
    )];
    if (!ids.length) return fail("Manager access required", 403);

    const db = getSupabaseAdmin();
    const [restaurantsResult, tablesResult] = await Promise.all([
      db.from("restaurants").select("id,name").in("id", ids).order("name"),
      db.from("restaurant_tables")
        .select("id,restaurant_id,table_number,qr_code_id,is_active")
        .in("restaurant_id", ids),
    ]);
    if (restaurantsResult.error) throw restaurantsResult.error;
    if (tablesResult.error) throw tablesResult.error;

    return NextResponse.json(
      { restaurants: restaurantsResult.data ?? [], tables: tablesResult.data ?? [] },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (e) {
    console.error("Staff tables GET", e);
    return fail("Unable to load tables", 500);
  }
}
