import { connection, NextResponse } from "next/server";
import { authenticateStaff } from "@/lib/staffAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const PAGE_SIZE = 25;
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  await connection();
  try {
    const auth = await authenticateStaff(request);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers });

    const page = Number(new URL(request.url).searchParams.get("page") ?? "0");
    if (!Number.isSafeInteger(page) || page < 0 || page > Math.floor(2147483647 / PAGE_SIZE) - 1) {
      return NextResponse.json({ error: "Invalid page" }, { status: 400, headers });
    }

    const restaurantIds = [...new Set(auth.memberships.map(membership => membership.restaurant_id))];
    const offset = page * PAGE_SIZE;
    const { data, error } = await getSupabaseAdmin().from("order_receipts")
      .select("payment_id, order_id, restaurant_name, table_number, method, provider, currency, subtotal, tip_amount, total_amount, items, paid_at, expires_at")
      .in("restaurant_id", restaurantIds)
      .gt("expires_at", new Date().toISOString())
      .order("paid_at", { ascending: false })
      .order("payment_id", { ascending: false })
      .range(offset, offset + PAGE_SIZE);

    if (error?.code === "PGRST205" || error?.code === "42P01") {
      return NextResponse.json({ error: "The receipts migration has not been applied to this database." }, { status: 503, headers });
    }
    if (error) throw error;
    const receipts = data ?? [];
    return NextResponse.json({ receipts: receipts.slice(0, PAGE_SIZE), hasMore: receipts.length > PAGE_SIZE }, { headers });
  } catch (error) {
    console.error("Staff receipts GET", error);
    return NextResponse.json({ error: "Unable to load receipts" }, { status: 500, headers });
  }
}
