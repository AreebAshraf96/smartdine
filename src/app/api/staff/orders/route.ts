
import { NextResponse } from "next/server";
import {
  authenticateStaff,
  roleCanView,
} from "@/lib/staffAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
  try {
    const auth = await authenticateStaff(request);

    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.status }
      );
    }

    const view = new URL(request.url).searchParams.get(
      "view"
    );

    if (view !== "waiter" && view !== "kitchen") {
      return NextResponse.json(
        { error: "Invalid dashboard" },
        { status: 400 }
      );
    }

    const restaurants = [
      ...new Set(
        auth.memberships
          .filter((membership) =>
            roleCanView(membership.role, view)
          )
          .map((membership) => membership.restaurant_id)
      ),
    ];

    if (!restaurants.length) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    const admin = getSupabaseAdmin();

    const statuses =
      view === "waiter"
        ? ["pending_approval", "ready"]
        : ["received", "preparing", "ready"];

    const { data: orders, error } = await admin
      .from("orders")
      .select(
        "id, restaurant_id, table_session_id, status, total_amount, special_instructions, created_at"
      )
      .in("restaurant_id", restaurants)
      .in("status", statuses)
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) {
      throw error;
    }

    if (!orders?.length) {
      return NextResponse.json({ orders: [] });
    }

    const sessionIds = [
      ...new Set(
        orders.map((order) => order.table_session_id)
      ),
    ];

    const orderIds = orders.map((order) => order.id);

    const [sessionsResult, itemsResult] =
      await Promise.all([
        admin
          .from("table_sessions")
          .select("id, table_id")
          .in("id", sessionIds),

        admin
          .from("order_items")
          .select(
            "order_id, item_name, quantity, unit_price"
          )
          .in("order_id", orderIds),
      ]);

    if (sessionsResult.error) {
      throw sessionsResult.error;
    }

    if (itemsResult.error) {
      throw itemsResult.error;
    }

    const sessionMap = new Map(
      (sessionsResult.data ?? []).map((session) => [
        session.id,
        session.table_id,
      ])
    );

    const tableIds = [
      ...new Set(
        [...sessionMap.values()].filter(
          (id): id is string => Boolean(id)
        )
      ),
    ];

    const { data: tables, error: tablesError } =
      tableIds.length
        ? await admin
            .from("restaurant_tables")
            .select("id, table_number")
            .in("id", tableIds)
        : { data: [], error: null };

    if (tablesError) {
      throw tablesError;
    }

    const tableMap = new Map(
      (tables ?? []).map((table) => [
        table.id,
        table.table_number,
      ])
    );

    const itemsByOrder = new Map<
      string,
      Array<{
        name: string;
        quantity: number;
        unit_price: number;
      }>
    >();

    for (const row of itemsResult.data ?? []) {
      const list = itemsByOrder.get(row.order_id) ?? [];

      list.push({
        name: row.item_name,
        quantity: row.quantity,
        unit_price: Number(row.unit_price),
      });

      itemsByOrder.set(row.order_id, list);
    }

    const response = orders.map((order) => ({
      id: order.id,
      status: order.status,
      restaurant_id: order.restaurant_id,
      table_number:
        tableMap.get(
          sessionMap.get(order.table_session_id) ?? ""
        ) ?? "Unknown",
      total_amount: Number(order.total_amount),
      special_instructions: order.special_instructions,
      created_at: order.created_at,
      items: itemsByOrder.get(order.id) ?? [],
    }));

    return NextResponse.json(
      { orders: response },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error(
      "SmartDine staff orders error",
      error
    );

    return NextResponse.json(
      { error: "Unable to load orders" },
      { status: 500 }
    );
  }
}
