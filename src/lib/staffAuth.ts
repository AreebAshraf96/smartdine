import "server-only";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// SmartDine supports exactly two active staff roles: manager and owner.
export type StaffRole = "manager" | "owner";
export type StaffMembership = { restaurant_id: string; role: StaffRole };

export async function authenticateStaff(request: Request): Promise<
  | { ok: true; memberships: StaffMembership[]; userId: string }
  | { ok: false; status: number; error: string }
> {
  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!bearer) return { ok: false, status: 401, error: "Please sign in" };

  const admin = getSupabaseAdmin();
  const { data: result, error: authError } = await admin.auth.getUser(bearer[1]);
  if (authError || !result.user) return { ok: false, status: 401, error: "Session expired. Sign in again" };

  const { data, error } = await admin.from("restaurant_staff")
    .select("restaurant_id,role")
    .eq("user_id", result.user.id).eq("is_active", true);
  if (error) throw new Error("Unable to verify staff membership");
  const memberships = (data ?? []).filter((record): record is StaffMembership =>
    typeof record.restaurant_id === "string" &&
    (record.role === "owner" || record.role === "manager")
  );
  if (!memberships.length) return { ok: false, status: 403, error: "Only manager and owner accounts may access SmartDine staff" };
  return { ok: true, memberships, userId: result.user.id };
}

// Old callers may pass 'waiter' or 'kitchen' views; never grant a third role.
export function roleCanView(role: string, _view: "waiter" | "kitchen") {
  return role === "owner" || role === "manager";
}

export function roleCanTransition(role: string, from: string, to: string) {
  if (role !== "owner" && role !== "manager") return false;
  return (from === "received" && to === "preparing") ||
    (from === "preparing" && to === "ready") ||
    (from === "ready" && to === "served");
  // Payment approval must happen via /api/staff/payments, never order PATCH.
}
