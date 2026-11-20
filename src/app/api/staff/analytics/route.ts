import { connection, NextResponse } from "next/server";
import { authenticateStaff } from "@/lib/staffAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { analyticsCalendar, shiftCalendarDate } from "@/lib/analyticsCalendar";

const UUID = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
const PAGE_SIZE = 500;
const DAYS = [1, 7, 30, 90] as const;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Order = { id: string; status: string; created_at: string; total_amount: number | string };
type Item = { id: string; order_id: string; item_name: string; quantity: number; unit_price: number | string };
type Payment = { order_id: string; method: string; status: string; subtotal: number | string; tip_amount: number | string; total_amount: number | string };
type Feedback = { order_id: string; rating: number; comment: string | null; created_at: string };
type DishReview = { order_id: string; order_item_id: string; rating: number; comment: string | null; created_at: string };

export async function GET(request: Request) {
  await connection();
  try {
    const auth = await authenticateStaff(request);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const owners = [...new Set(auth.memberships.filter(m => m.role === "owner").map(m => m.restaurant_id))];
    if (!owners.length) return NextResponse.json({ error: "Owner access required" }, { status: 403 });

    const query = new URL(request.url).searchParams;
    const requested = query.get("restaurantId");
    const restaurantId = requested ?? owners[0];
    if (!UUID.test(restaurantId) || !owners.includes(restaurantId)) return NextResponse.json({ error: "Restaurant not authorized" }, { status: 403 });
    const days = Number(query.get("days") ?? 30);
    if (!DAYS.includes(days as 1 | 7 | 30 | 90)) return NextResponse.json({ error: "Choose 1, 7, 30 or 90 days" }, { status: 400 });
    const method = query.get("method") ?? "all";
    if (!["all", "card", "pay_waiter"].includes(method)) return NextResponse.json({error:"Invalid payment filter"},{status:400});
    const from = query.get("from") || null;
    const to = query.get("to") || null;
    const DATE = /^\d{4}-\d{2}-\d{2}$/;
    if ((from && !DATE.test(from)) || (to && !DATE.test(to))) return NextResponse.json({error:"Invalid dates"},{status:400});
    if (Boolean(from) !== Boolean(to)) return NextResponse.json({error:"Supply both from and to"},{status:400});
    if (from && to && (from > to || (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 > 365 || !Number.isFinite(Date.parse(`${from}T00:00:00Z`)) || !Number.isFinite(Date.parse(`${to}T00:00:00Z`)))) return NextResponse.json({error:"Choose a valid period of up to 366 days"},{status:400});
    if (from && to && (shiftCalendarDate(from, 0) !== from || shiftCalendarDate(to, 0) !== to)) {
      return NextResponse.json({ error: "Choose valid calendar dates" }, { status: 400 });
    }
    const { timeZone, timeParts, localDayStart } = analyticsCalendar(restaurantId);
    const today = timeParts(Date.now()).date;
    const since = localDayStart(from ?? shiftCalendarDate(today, 1 - days));
    const until = localDayStart(shiftCalendarDate(to ?? today, 1));
    const db = getSupabaseAdmin();
    const orders: Order[] = [];
    let lastOrderId: string | undefined;
    while (true) {
      let ordersQuery = db.from("orders")
        .select("id,status,created_at,total_amount")
        .eq("restaurant_id", restaurantId).gte("created_at", since);
      ordersQuery = ordersQuery.lt("created_at", until);
      if (lastOrderId) ordersQuery = ordersQuery.gt("id", lastOrderId);
      const { data, error } = await ordersQuery
        .order("id").limit(PAGE_SIZE);
      if (error) throw error;
      const chunk = (data ?? []) as Order[];
      orders.push(...chunk);
      if (chunk.length === 0) break;
      lastOrderId = chunk.at(-1)?.id;
    }
    const activeOrders = orders.filter(o => o.status !== "cancelled" && o.status !== "pending_approval");
    const ids = activeOrders.map(o => o.id);
    const items: Item[] = [];
    const payments: Payment[] = [];
    const feedback: Feedback[] = [];
    const dishReviews: DishReview[] = [];
    for (let i = 0; i < ids.length; i += 100) {
      const part = ids.slice(i, i + 100);
      const [a,b,c,d] = await Promise.all([
        db.from("order_items").select("id,order_id,item_name,quantity,unit_price").in("order_id",part),
        db.from("order_payment_choices").select("order_id,method,status,subtotal,tip_amount,total_amount").in("order_id",part),
        db.from("order_feedback").select("order_id,rating,comment,created_at").in("order_id",part),
        db.from("dish_reviews").select("order_id,order_item_id,rating,comment,created_at").in("order_id",part),
      ]);
      if (a.error) throw a.error;
      if (b.error) throw b.error;
      if (c.error) throw c.error;
      if (d.error) throw d.error;
      items.push(...((a.data ?? []) as Item[]));
      payments.push(...((b.data ?? []) as Payment[]));
      feedback.push(...((c.data ?? []) as Feedback[]));
      dishReviews.push(...((d.data ?? []) as DishReview[]));
    }

    // Only confirmed paid orders count as sales. Tips are reported separately.
    const paid = new Map(payments.filter(p => p.status === "paid").map(p => [p.order_id,p]));
    const confirmedAll = activeOrders.filter(o => paid.has(o.id));
    const confirmed = confirmedAll.filter(o => method === "all" || paid.get(o.id)?.method === method);
    const confirmedIds = new Set(confirmed.map(o => o.id));
    const revenue = confirmed.reduce((sum,o) => sum + Number(paid.get(o.id)!.subtotal), 0);
    const tips = confirmed.reduce((sum,o) => sum + Number(paid.get(o.id)!.tip_amount), 0);
    // Include unpaid cash approvals even though their orders are not in the cooking queue.
    const countPendingCash = (relation: string) => db.from(relation)
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId).eq("method", "pay_waiter").eq("status", "pending");
    const pendingCashResult = await countPendingCash("smartdine_pending_cash_payments");
    const { count: pendingCashCount, error: cashError } = pendingCashResult.error?.code === "PGRST205" || pendingCashResult.error?.code === "42P01"
      ? await countPendingCash("order_payment_choices") : pendingCashResult;
    if (cashError) throw cashError;
    const pendingCash = pendingCashCount ?? 0;
    // Reconciled cash/card register uses the payment confirmation time (paid_at).
    // It is independent of the order creation date used for demand charts.
    type PaidPayment = {
      id:string; order_id:string; method:string; status:string;
      subtotal:number|string; tip_amount:number|string;total_amount:number|string;paid_at:string;
    };
    const settled:PaidPayment[]=[];
    let lastPaymentId: string | undefined;
    while (true) {
      let q=db.from("order_payment_choices")
        .select("id,order_id,method,status,subtotal,tip_amount,total_amount,paid_at")
        .eq("restaurant_id",restaurantId).eq("status","paid")
        .gte("paid_at",since);
      q = q.lt("paid_at", until);
      if (lastPaymentId) q = q.gt("id", lastPaymentId);
      if(method!=="all")q=q.eq("method",method);
      const {data,error}=await q.order("id").limit(PAGE_SIZE);
      if(error)throw error;
      const chunk = (data ?? []) as PaidPayment[];
      settled.push(...chunk);
      if (chunk.length === 0) break;
      lastPaymentId = chunk.at(-1)?.id;
    }
    const dailyPayments = new Map<string, {
      date:string; cardCount:number;cashCount:number;
      cardAmount:number;cashAmount:number;cardTips:number;cashTips:number;
      foodRevenue:number;totalCollected:number;orders:number;
    }>();
    for (const payment of settled) {
      if(!payment.paid_at)continue;
      const date = timeParts(payment.paid_at).date;
      const record = dailyPayments.get(date) ?? {date,cardCount:0,cashCount:0,cardAmount:0,cashAmount:0,cardTips:0,cashTips:0,foodRevenue:0,totalCollected:0,orders:0};
      const total = Number(payment.total_amount);
      const tip = Number(payment.tip_amount);
      record.orders += 1;
      record.foodRevenue += Number(payment.subtotal);
      record.totalCollected += total;
      if (payment.method === "card") {record.cardCount++;record.cardAmount+=total;record.cardTips+=tip;}
      else if (payment.method === "pay_waiter") {record.cashCount++;record.cashAmount+=total;record.cashTips+=tip;}
      dailyPayments.set(date,record);
    }
    const dailyPaymentSummary = [...dailyPayments.values()].sort((a,b)=>a.date.localeCompare(b.date));
    const totals = dailyPaymentSummary.reduce((r,d)=>({
      cardCount:r.cardCount+d.cardCount, cashCount:r.cashCount+d.cashCount,
      cardAmount:r.cardAmount+d.cardAmount,cashAmount:r.cashAmount+d.cashAmount,
      cardTips:r.cardTips+d.cardTips,cashTips:r.cashTips+d.cashTips,
    }), {cardCount:0,cashCount:0,cardAmount:0,cashAmount:0,cardTips:0,cashTips:0});
    const sold = items.filter(i => confirmedIds.has(i.order_id));
    const byDish = new Map<string,{ name:string; units:number; revenue:number; ratings:number[]; comments:{rating:number;comment:string;createdAt:string}[] }>();
    const getDish = (name:string) => {
      const key = name.trim().toLocaleLowerCase("en");
      let d = byDish.get(key);
      if (!d) { d = {name,units:0,revenue:0,ratings:[],comments:[]};byDish.set(key,d); }
      return d;
    };
    const itemMap = new Map(items.map(i => [i.id,i]));
    for (const item of sold) {
      const dish = getDish(item.item_name);
      dish.units += Number(item.quantity);
      dish.revenue += Number(item.quantity) * Number(item.unit_price);
    }
    for (const review of dishReviews) {
      if (!confirmedIds.has(review.order_id)) continue;
      const item = itemMap.get(review.order_item_id);
      if (!item) continue;
      const dish = getDish(item.item_name);
      dish.ratings.push(review.rating);
      if (review.comment?.trim()) dish.comments.push({ rating:review.rating, comment:review.comment, createdAt:review.created_at });
    }
    const dishes = [...byDish.values()].map(d => ({
      name:d.name,units:d.units,revenue:d.revenue,
      ratingCount:d.ratings.length,
      avgRating:d.ratings.length ? Math.round(d.ratings.reduce((a,b)=>a+b,0)/d.ratings.length*10)/10 : null,
      comments:d.comments.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,15),
    })).sort((a,b)=>b.units-a.units);

    const hourly = Array.from({length:24}, (_,hour) => ({hour,count:0}));
    const weekdays = WEEKDAYS.map(day => ({day,count:0}));
    const grid = WEEKDAYS.map(day => ({day,hours:Array(24).fill(0) as number[]}));
    const daily = new Map<string,{date:string;orders:number;revenue:number}>();
    for (const o of confirmed) {
      const p = timeParts(o.created_at);
      hourly[p.hour].count++;
      const wi = WEEKDAYS.indexOf(p.day);
      if(wi>=0) {weekdays[wi].count++;grid[wi].hours[p.hour]++;}
      const existing = daily.get(p.date) ?? {date:p.date,orders:0,revenue:0};
      existing.orders++;
      existing.revenue += Number(paid.get(o.id)!.subtotal);
      daily.set(p.date,existing);
    }
    const avgRating = feedback.length ? feedback.reduce((sum,f)=>sum+f.rating,0)/feedback.length : null;
    const paymentBreakdown = {card:0,cash:0};
    for (const o of confirmed) {
      const p = paid.get(o.id)!;
      if(p.method==="card") paymentBreakdown.card++;
      if(p.method==="pay_waiter") paymentBreakdown.cash++;
    }
    const topHour = [...hourly].sort((a,b)=>b.count-a.count)[0];
    const topDay = [...weekdays].sort((a,b)=>b.count-a.count)[0];

    return NextResponse.json({
      restaurantId,restaurantIds:owners,days,from:from??null,to:to??null,method,timezone:timeZone,partialData:false,
      paymentTotals:totals,dailyPayments:dailyPaymentSummary,
      kpis:{revenue,tips,totalCollected:revenue+tips,confirmedOrders:confirmed.length,unitsSold:sold.reduce((s,i)=>s+Number(i.quantity),0),
        avgOrderValue:confirmed.length?revenue/confirmed.length:0,avgRating:avgRating===null?null:Math.round(avgRating*10)/10,
        feedbackCount:feedback.length,pendingCash},
      topHour:confirmed.length?topHour:null,topDay:confirmed.length?topDay:null,
      hourly,weekdays,heatmap:grid,daily:[...daily.values()].sort((a,b)=>a.date.localeCompare(b.date)),
      dishes,paymentBreakdown,
      feedback:feedback.sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,40),
    },{headers:{"Cache-Control":"private, no-store"}});
  } catch (error) {
    console.error("Owner analytics error:", error);
    return NextResponse.json({ error: "Unable to load analytics" }, { status: 500 });
  }
}
