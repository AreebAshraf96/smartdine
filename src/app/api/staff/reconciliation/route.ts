import { connection, NextResponse } from "next/server";
import { authenticateStaff } from "@/lib/staffAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { UUID } from "@/lib/customerOrderAccess";
import { analyticsCalendar, shiftCalendarDate } from "@/lib/analyticsCalendar";

const headers = { "Cache-Control": "private, no-store" };
const currency = "PKR";
const dateFormat = /^\d{4}-\d{2}-\d{2}$/;
function reply(data: object, status = 200) { return NextResponse.json(data, { status, headers }); }

function isMoney(value: unknown): value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1000000000) return false;
  return Math.abs(value * 100 - Math.round(value * 100)) < 0.0001;
}

async function reconciliation(request: Request, save: boolean) {
  await connection();
  try {
    const origin = request.headers.get("origin");
    if (save && origin && origin !== new URL(request.url).origin) return reply({ error: "Invalid origin" }, 403);
    const auth = await authenticateStaff(request);
    if (!auth.ok) return reply({ error: auth.error }, auth.status);
    const ids = [...new Set(auth.memberships.map(member => member.restaurant_id))];
    const db = getSupabaseAdmin();
    const query = new URL(request.url).searchParams;

    let body: Record<string, unknown> = {};
    if (save) {
      const raw = await request.text();
      if (raw.length > 2000) return reply({ error: "Request too large" }, 413);
      const value: unknown = JSON.parse(raw);
      if (!value || typeof value !== "object" || Array.isArray(value)) return reply({ error: "Invalid reconciliation" }, 400);
      body = value as Record<string, unknown>;
    }
    const restaurant = save ? body.restaurantId : query.get("restaurantId") ?? ids[0];
    if (typeof restaurant !== "string" || !UUID.test(restaurant) || !ids.includes(restaurant)) {
      return reply({ error: "Restaurant not authorized" }, 403);
    }
    const { timeZone, timeParts, localDayStart } = analyticsCalendar(restaurant);
    const today = timeParts(Date.now()).date;
    const date = save ? body.date : query.get("date") ?? today;
    if (typeof date !== "string" || !dateFormat.test(date) || !Number.isFinite(Date.parse(date)) ||
      shiftCalendarDate(date, 0) !== date || date > today) {
      return reply({ error: "Pick a valid date up to today" }, 400);
    }

    const { data: summary, error } = await db.rpc("smartdine_reconciliation_totals", {
      target_restaurant: restaurant, target_currency: currency,
      starts_at: localDayStart(date), ends_at: localDayStart(shiftCalendarDate(date, 1)),
    }).single();
    if (error) throw error;
    const totals = summary as { expected_cash: number; expected_card: number; simulated_card: number };
    const countedCash = body.countedCash;
    const reportedCard = body.reportedCard;
    if (save) {
      if (!isMoney(countedCash) || !isMoney(reportedCard)) return reply({ error: "Enter cash and card amounts with no more than two decimal places" }, 400);
      const saved = await db.from("daily_reconciliations").upsert({
        restaurant_id: restaurant, business_date: date, currency,
        expected_cash: totals.expected_cash, expected_card: totals.expected_card,
        counted_cash: countedCash, reported_card: reportedCard,
        closed_by: auth.userId, closed_at: new Date().toISOString(),
      }, { onConflict: "restaurant_id,business_date,currency" });
      if (saved.error) throw saved.error;
    }
    const [record, restaurants] = await Promise.all([
      db.from("daily_reconciliations").select("counted_cash,reported_card,expected_cash,expected_card,closed_at")
        .eq("restaurant_id", restaurant).eq("business_date", date).eq("currency", currency).maybeSingle(),
      db.from("restaurants").select("id,name").in("id", ids).order("name"),
    ]);
    if (record.error) throw record.error;
    if (restaurants.error) throw restaurants.error;
    return reply({ restaurant, restaurants: restaurants.data ?? [], date, today, timeZone, currency, totals, record: record.data });
  } catch (error) {
    if (error instanceof SyntaxError) return reply({ error: "Invalid JSON" }, 400);
    console.error("Reconciliation error", error);
    return reply({ error: "Unable to reconcile this day. Check that the operations migration has been applied." }, 500);
  }
}

export function GET(request: Request) { return reconciliation(request, false); }
export function POST(request: Request) { return reconciliation(request, true); }
