import "server-only";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type StaffRole = "owner" | "manager" | "waiter" | "kitchen";
export type StaffMembership = { restaurant_id: string; role: StaffRole };

export async function authenticateStaff(request: Request): Promise<
  | { ok: true; memberships: StaffMembership[] }
  | { ok: false; status: number; error: string }
> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return { ok: false, status: 401, error: "Please sign in" };

  const admin = getSupabaseAdmin();
  const { data: auth, error: authError } = await admin.auth.getUser(match[1]);
  if (authError || !auth.user) {
    return { ok: false, status: 401, error: "Session expired. Sign in again" };
  }

  const { data, error } = await admin
    .from("restaurant_staff")
    .select("restaurant_id, role")
    .eq("user_id", auth.user.id)
    .eq("is_active", true);
  if (error) throw new Error("Unable to read staff membership");
  if (!data?.length) return { ok: false, status: 403, error: "No active restaurant staff access" };
  const memberships = data.filter((row): row is StaffMembership =>
    typeof row.restaurant_id === "string" &&
    ["owner", "manager", "waiter", "kitchen"].includes(row.role)
  );
  if (!memberships.length) return { ok: false, status: 403, error: "No permitted staff role" };
  return { ok: true, memberships };
}

export function roleCanView(role: StaffRole, view: "waiter" | "kitchen") {
  return ["owner", "manager", view === "waiter" ? "waiter" : "kitchen"].includes(role);
}

export function roleCanTransition(role: StaffRole, from: string, to: string) {
  if (role === "owner" || role === "manager") {
    return (
      (from === "pending_approval" && ["received", "cancelled"].includes(to)) ||
      (from === "received" && to === "preparing") ||
      (from === "preparing" && to === "ready") ||
      (from === "ready" && to === "served")
    );
  }
  if (role === "waiter") {
    return (from === "pending_approval" && ["received", "cancelled"].includes(to)) ||
      (from === "ready" && to === "served");
  }
  if (role === "kitchen") {
    return (from === "received" && to === "preparing") ||
      (from === "preparing" && to === "ready");
  }
  return false;
}
