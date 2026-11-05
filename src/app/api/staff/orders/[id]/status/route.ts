
import { NextResponse } from "next/server";
import {
  authenticateStaff,
  roleCanTransition,
} from "@/lib/staffAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type Props = {
  params: Promise<{ id: string }>;
};

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: Request,
  { params }: Props
) {
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

    const { id } = await params;

    if (!uuid.test(id)) {
      return NextResponse.json(
        { error: "Invalid order ID" },
        { status: 400 }
      );
    }

    const body = await request.json();

    const nextStatus = body?.status;

    if (
      nextStatus !== "preparing" &&
      nextStatus !== "ready"
    ) {
      return NextResponse.json(
        { error: "Invalid kitchen status" },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();

    const { data: order, error } = await admin
      .from("orders")
      .select("id, restaurant_id, status")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;

    if (!order) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    const authorized = auth.memberships.some(
      (m) =>
        m.restaurant_id === order.restaurant_id &&
        ["owner", "manager", "kitchen"].includes(m.role) &&
        roleCanTransition(
          m.role,
          order.status,
          nextStatus
        )
    );

    if (!authorized) {
      return NextResponse.json(
        { error: "Not authorized for this action" },
        { status: 403 }
      );
    }

    const { data: updated, error: updateError } =
      await admin
        .from("orders")
        .update({ status: nextStatus })
        .eq("id", id)
        .eq("status", order.status)
        .select("id, status")
        .maybeSingle();

    if (updateError) throw updateError;

    if (!updated) {
      return NextResponse.json(
        { error: "Order changed. Refresh and retry." },
        { status: 409 }
      );
    }

    return NextResponse.json({ order: updated });
  } catch (error) {
    console.error("Order status error:", error);

    return NextResponse.json(
      { error: "Unable to update order" },
      { status: 500 }
    );
  }
}
