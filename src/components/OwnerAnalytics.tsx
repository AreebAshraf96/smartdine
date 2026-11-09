"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type Dish = { name: string; units: number; revenue: number; avgRating: number | null; ratingCount: number; comments: { rating: number; comment: string; createdAt: string }[] };
type Datum = { date: string; orders: number; revenue: number };
type Report = {
  restaurantId: string; restaurantIds: string[]; days: number; timezone: string; partialData: boolean;
  from:string|null;to:string|null;method:string;
  paymentTotals:{cardCount:number;cashCount:number;cardAmount:number;cashAmount:number;cardTips:number;cashTips:number};
  dailyPayments:{date:string;cardCount:number;cashCount:number;cardAmount:number;cashAmount:number;cardTips:number;cashTips:number;foodRevenue:number;totalCollected:number;orders:number}[];
  kpis: { revenue: number; tips: number; totalCollected: number; confirmedOrders: number; unitsSold: number; avgOrderValue: number; avgRating: number | null; feedbackCount: number; pendingCash: number };
  topHour: {hour:number;count:number}|null; topDay: {day:string;count:number}|null;
  hourly: {hour:number;count:number}[]; weekdays:{day:string;count:number}[];
  heatmap:{day:string;hours:number[]}[]; daily:Datum[];
  dishes:Dish[]; paymentBreakdown:{card:number;cash:number};
  feedback:{order_id:string;rating:number;comment:string|null;created_at:string}[];
};
const money = (n:number) => `PKR ${Number(n||0).toLocaleString("en-PK", {maximumFractionDigits:0})}`;
const number = (n:number) => Number(n||0).toLocaleString("en-PK");
const hours = (h:number) => `${String(h).padStart(2,"0")}:00`;

export default function OwnerAnalytics() {
  const [session,setSession] = useState<Session|null>(null);
  const [authReady,setAuthReady] = useState(false);
  const [email,setEmail] = useState(""); const [password,setPassword] = useState("");
  const [days,setDays] = useState(30);
  const [method,setMethod] = useState("all");
  const [custom,setCustom] = useState(false);
  const [from,setFrom] = useState("");
  const [to,setTo] = useState("");
  const [restaurantId,setRestaurantId] = useState("");
  const [report,setReport] = useState<Report|null>(null);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState("");
  const [selectedDish,setSelectedDish] = useState("");
  const [search,setSearch] = useState("");
  const [busy,setBusy] = useState(false);

  useEffect(()=>{
    let active=true;
    void supabase.auth.getSession().then(({data})=>{ if(active){setSession(data.session);setAuthReady(true);} }).catch(()=>{if(active)setAuthReady(true);});
    const {data:listener}=supabase.auth.onAuthStateChange((_event,s)=>setSession(s));
    return ()=>{active=false;listener.subscription.unsubscribe();};
  },[]);

  const load=useCallback(async()=>{
    if(!session) return;
    setLoading(true);
    try {
      const q=new URLSearchParams({days:String(days)});
      if(restaurantId)q.set("restaurantId",restaurantId);
      q.set("method",method);
      if(custom && from && to){q.set("from",from);q.set("to",to);}
      const response=await fetch(`/api/staff/analytics?${q}`,{
        cache:"no-store",headers:{Authorization:`Bearer ${session.access_token}`},
      });
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"Could not load report");
      setReport(data as Report);setError("");
    }catch(e){setError(e instanceof Error?e.message:"Unable to load report");}
    finally{setLoading(false);}
  },[session,days,restaurantId,method,custom,from,to]);
  useEffect(()=>{void load();},[load]);

  const chosen=useMemo(()=>report?.dishes.find(d=>d.name===selectedDish)??null,[report,selectedDish]);
  const matched=useMemo(()=>report?.dishes.filter(d=>d.name.toLowerCase().includes(search.toLowerCase()))??[],[report,search]);
  const dailyMax=Math.max(1,...(report?.daily.map(d=>d.revenue)??[]));
  const hourlyMax=Math.max(1,...(report?.hourly.map(d=>d.count)??[]));
  const weekdayMax=Math.max(1,...(report?.weekdays.map(d=>d.count)??[]));
  const heatMax=Math.max(1,...(report?.heatmap.flatMap(r=>r.hours)??[]));
  function downloadCsv(){
    if(!report)return;
    const csv=["Dish,Units Sold,Sales PKR,Average Dish Rating,Dish Reviews",...report.dishes.map(d=>
      [d.name,d.units,d.revenue,d.avgRating??"",d.ratingCount].map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")
    )].join("\r\n");
    const url=URL.createObjectURL(new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"}));
    const a=document.createElement("a");a.href=url;a.download=`smartdine-items-${report.days}d.csv`;a.click();URL.revokeObjectURL(url);
  }

  async function signIn(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError("");
    const {error:e}=await supabase.auth.signInWithPassword({email,password});
    if(e)setError(e.message);else setPassword("");setBusy(false);
  }
  if(!authReady)return <main className="p-8 text-gray-700">Loading owner session...</main>;
  if(!session)return <main className="min-h-screen bg-slate-50 p-5 text-slate-900"><form onSubmit={e=>void signIn(e)} className="mx-auto mt-20 max-w-sm space-y-4 rounded-2xl border bg-white p-7 shadow-sm">
    <h1 className="text-2xl font-extrabold">SmartDine Owner Analytics</h1><p className="text-sm text-slate-600">Sign in with an account assigned the owner role.</p>
    <input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" className="w-full rounded-lg border p-3" />
    <input required type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" className="w-full rounded-lg border p-3" />
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    <button disabled={busy} className="w-full rounded-lg bg-slate-900 p-3 font-bold text-white">{busy?"Signing in...":"Sign In"}</button>
  </form></main>;
  const k=report?.kpis;
  return <main className="min-h-screen bg-slate-50 px-4 py-7 text-slate-900 md:px-8">
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">SmartDine / Owner</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Restaurant Intelligence</h1>
          <p className="mt-1 text-sm text-slate-600">Orders, revenue, peak times and actual customer opinions • Pakistan time</p></div>
        <div className="flex flex-wrap gap-2">
          <a href="/staff/manager" className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold">Manage Restaurant</a>
          <button onClick={()=>void load()} disabled={loading} className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold">{loading?"Refreshing...":"Refresh"}</button>
          <button onClick={()=>void supabase.auth.signOut()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Sign Out</button>
        </div>
      </header>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4">
        <label className="text-sm font-semibold">Period</label>
        <select value={days} onChange={e=>setDays(Number(e.target.value))} className="rounded-lg border p-2 text-sm">
          <option value={1}>Today (Pakistan time)</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
        </select>
        <label className="text-sm font-semibold">Method</label>
        <select value={method} onChange={e=>setMethod(e.target.value)} className="rounded-lg border p-2 text-sm">
          <option value="all">All payments</option><option value="card">Card / Demo card</option><option value="pay_waiter">Cash / Pay waiter</option>
        </select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={custom} onChange={e=>setCustom(e.target.checked)}/> Custom dates</label>
        {custom&&<><label className="text-xs">From (PKT)<input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="ml-2 rounded border p-2"/></label>
          <label className="text-xs">To (PKT)<input type="date" value={to} onChange={e=>setTo(e.target.value)} className="ml-2 rounded border p-2"/></label></>}
        {report && report.restaurantIds.length>1 && <><label className="text-sm font-semibold">Restaurant</label>
          <select value={restaurantId||report.restaurantId} onChange={e=>setRestaurantId(e.target.value)} className="max-w-60 rounded-lg border p-2 text-sm">
            {report.restaurantIds.map(id=><option key={id} value={id}>{id.slice(0,8)}</option>)}
          </select></>}
        <p className="text-xs text-slate-500">Confirmed paid orders only • {report?.timezone??"Asia/Karachi"}</p>
      </div>
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {report?.partialData && <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">Large dataset: showing the most recent 5,000 orders only. Use a shorter date range for a more complete picture.</div>}
      {report && k && <>
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Daily payment totals">
          {[
            ["Card orders",number(report.paymentTotals.cardCount),"Paid card / demo transactions"],
            ["Card amount",money(report.paymentTotals.cardAmount),"Includes card tips"],
            ["Cash orders",number(report.paymentTotals.cashCount),"Kitchen-approved cash transactions"],
            ["Cash amount",money(report.paymentTotals.cashAmount),"Includes cash tips"],
            ["Card tips",money(report.paymentTotals.cardTips),"Shown within card amount"],
            ["Cash tips",money(report.paymentTotals.cashTips),"Shown within cash amount"],
          ].map(([title,value,detail])=><article key={title} className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">{title}</p><p className="mt-2 text-xl font-extrabold">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></article>)}
        </section>
        <section className="rounded-2xl border bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Daily cash & card register</h2>
          <p className="text-sm text-slate-500">Every day in Pakistan time • amounts include tips • paid records only</p></div>
          <button type="button" className="rounded-lg border px-3 py-2 text-sm font-semibold" onClick={()=>{
            const lines=[["Date","Card orders","Card amount PKR","Card tips PKR","Cash orders","Cash amount PKR","Cash tips PKR","Food revenue PKR","Total received PKR"],
              ...report.dailyPayments.map(p=>[p.date,p.cardCount,p.cardAmount,p.cardTips,p.cashCount,p.cashAmount,p.cashTips,p.foodRevenue,p.totalCollected])];
            const csv=lines.map(row=>row.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\r\n");
            const href=URL.createObjectURL(new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"}));
            const link=document.createElement("a");link.href=href;link.download="smartdine-daily-payments.csv";link.click();URL.revokeObjectURL(href);
          }}>Export daily CSV</button></div>
          <div className="mt-4 overflow-x-auto"><table className="min-w-[900px] w-full text-left text-sm"><thead><tr className="border-b bg-slate-50">
            {["Date","Card #","Card PKR","Card tips","Cash #","Cash PKR","Cash tips","Food PKR","All collected"].map(h=><th key={h} className="p-3">{h}</th>)}
          </tr></thead><tbody>{report.dailyPayments.map(p=><tr key={p.date} className="border-b">
            <td className="p-3 font-semibold">{p.date}</td><td className="p-3">{p.cardCount}</td><td className="p-3">{money(p.cardAmount)}</td>
            <td className="p-3">{money(p.cardTips)}</td><td className="p-3">{p.cashCount}</td><td className="p-3">{money(p.cashAmount)}</td>
            <td className="p-3">{money(p.cashTips)}</td><td className="p-3">{money(p.foodRevenue)}</td><td className="p-3 font-bold">{money(p.totalCollected)}</td>
          </tr>)}</tbody></table>{!report.dailyPayments.length&&<p className="p-4 text-sm text-slate-500">No paid transactions for the selected filters.</p>}</div>
        </section>
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Key performance indicators">
          {[
            ["Food revenue",money(k.revenue),"Paid order subtotals"],
            ["Confirmed orders",number(k.confirmedOrders),"Paid, non-cancelled"],
            ["Average ticket",money(k.avgOrderValue),"Excludes tips"],
            ["Units sold",number(k.unitsSold),"Across all dishes"],
            ["Tips collected",money(k.tips),"Reported separately"],
            ["Total collected",money(k.totalCollected),"Food + tips"],
            ["Overall rating",k.avgRating===null?"No ratings":`${k.avgRating.toFixed(1)} / 5`,`${k.feedbackCount} order review(s)`],
            ["Pending cash",number(k.pendingCash),"Awaiting staff approval"],
          ].map(([title,value,sub])=><article key={title} className="rounded-2xl border bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500">{title}</p><p className="mt-2 text-xl font-extrabold md:text-2xl">{value}</p><p className="mt-1 text-xs text-slate-500">{sub}</p>
          </article>)}
        </section>
        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">Daily sales trend</h2><p className="text-xs text-slate-500">Daily food revenue in PKR • paid orders</p>
            <div className="mt-5 flex h-44 items-end gap-1 overflow-x-auto border-b pb-1">
              {report.daily.map(d=><div key={d.date} className="group flex min-w-2 flex-1 flex-col justify-end" title={`${d.date}: ${money(d.revenue)} (${d.orders} orders)`}>
                <div className="min-h-0.5 rounded-t bg-indigo-600 transition-colors hover:bg-indigo-400" style={{height:`${Math.max(2,100*d.revenue/dailyMax)}%`}} /></div>)}
              {!report.daily.length&&<p className="self-center text-sm text-slate-500">No paid orders in this period</p>}
            </div>
            <p className="mt-2 text-xs text-slate-500">Hover over a bar to see the date and sales amount.</p>
          </article>
          <article className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">Most popular dishes</h2><p className="text-xs text-slate-500">Ranked by number of units sold</p>
            <div className="mt-4 space-y-3">{report.dishes.slice(0,7).map((d,i)=><div key={d.name}>
              <div className="flex justify-between gap-3 text-sm"><span className="truncate"><strong>{i+1}.</strong> {d.name}</span><span className="font-semibold">{d.units} sold</span></div>
              <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-indigo-600" style={{width:`${Math.max(2,100*d.units/Math.max(1,report.dishes[0]?.units??1))}%`}}/></div>
            </div>)}{!report.dishes.length&&<p className="text-sm text-slate-500">No sold items yet</p>}</div>
          </article>
          <article className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">Busiest hours</h2><p className="text-xs text-slate-500">When confirmed orders were placed • 24-hour PKT</p>
            <div className="mt-5 flex h-36 items-end gap-1 border-b">{report.hourly.map(({hour,count})=><div key={hour} title={`${hours(hour)}: ${count} orders`} className="flex flex-1 justify-end self-stretch flex-col">
              <div className="min-h-0.5 rounded-t bg-teal-600" style={{height:`${Math.max(2,100*count/hourlyMax)}%`}} /></div>)}</div>
            <div className="mt-1 flex justify-between text-xs text-slate-500"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span></div>
            <p className="mt-4 text-sm font-semibold">Peak: {report.topHour?`${hours(report.topHour.hour)} • ${report.topHour.count} orders`:"No orders yet"}</p>
          </article>
          <article className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">Busiest weekdays</h2><p className="text-xs text-slate-500">Number of confirmed orders by weekday</p>
            <div className="mt-4 space-y-2">{report.weekdays.map(d=><div key={d.day} className="flex items-center gap-3 text-sm">
              <span className="w-9 text-slate-600">{d.day}</span><div className="h-4 flex-1 rounded bg-slate-100"><div className="h-4 rounded bg-amber-500" style={{width:`${100*d.count/weekdayMax}%`}}/></div><span className="w-10 text-right font-semibold">{d.count}</span>
            </div>)}</div>
            <p className="mt-4 text-sm font-semibold">Busiest weekday: {report.topDay?`${report.topDay.day} • ${report.topDay.count} orders`:"No orders yet"}</p>
          </article>
        </section>
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">Weekly demand heatmap</h2><p className="mt-1 text-xs text-slate-500">Darker blocks = more orders • each cell is a weekday / hour in Pakistan time</p>
          <div className="mt-4 overflow-x-auto"><div className="min-w-[720px] space-y-1">
            <div className="flex gap-1 pl-12 text-[10px] text-slate-500">{Array.from({length:24},(_,h)=><span key={h} className="flex-1 text-center">{h%3===0?h:""}</span>)}</div>
            {report.heatmap.map(row=><div key={row.day} className="flex items-center gap-1"><span className="w-11 text-xs font-semibold text-slate-500">{row.day}</span>{row.hours.map((n,h)=><div key={h} title={`${row.day} ${hours(h)}: ${n} orders`}
              className="h-5 flex-1 rounded-sm" style={{backgroundColor:n===0?"#e2e8f0":`rgba(79,70,229,${Math.max(0.18,n/heatMax)})`}} />)}</div>)}
          </div></div>
        </section>
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Dish performance and customer opinions</h2>
            <p className="text-xs text-slate-500">Dish ratings are collected separately; overall order reviews are not attributed to individual dishes.</p></div>
            <button type="button" onClick={downloadCsv} className="rounded-lg border px-4 py-2 text-sm font-semibold">Export items CSV</button></div>
          <input value={search} onChange={e=>setSearch(e.target.value)} className="mt-4 w-full max-w-sm rounded-lg border p-2 text-sm" placeholder="Search dishes..." />
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead><tr className="border-b bg-slate-50 text-xs text-slate-600">
            <th className="p-3">Dish</th><th className="p-3">Units</th><th className="p-3">Food sales</th><th className="p-3">Dish rating</th><th className="p-3">Feedback</th></tr></thead>
            <tbody>{matched.map(d=><tr key={d.name} className="border-b hover:bg-slate-50"><td className="p-3 font-semibold">{d.name}</td><td className="p-3">{d.units}</td>
              <td className="p-3">{money(d.revenue)}</td><td className="p-3">{d.avgRating===null?"Not rated":`${d.avgRating} ★ (${d.ratingCount})`}</td>
              <td className="p-3"><button onClick={()=>setSelectedDish(d.name)} className="rounded border px-3 py-1 font-semibold">View opinions</button></td></tr>)}</tbody></table>
            {!matched.length&&<p className="p-4 text-sm text-slate-500">No matching dishes</p>}</div>
          {chosen&&<div className="mt-5 rounded-xl border bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3"><h3 className="font-bold">What customers said about {chosen.name}</h3>
              <button onClick={()=>setSelectedDish("")} className="rounded border px-3 py-1 text-sm">Close</button></div>
            <p className="mt-1 text-sm text-slate-600">{chosen.ratingCount} dish-specific rating(s) • Average {chosen.avgRating??"N/A"}/5</p>
            {!chosen.comments.length&&<p className="mt-3 text-sm text-slate-500">No written feedback for this dish yet.</p>}
            <div className="mt-3 grid gap-2 md:grid-cols-2">{chosen.comments.map((c,i)=><article key={`${c.createdAt}-${i}`} className="rounded-lg bg-white p-3 text-sm">
              <p className="font-bold">{c.rating} ★ <span className="font-normal text-slate-500">• {new Date(c.createdAt).toLocaleDateString("en-PK")}</span></p>
              <p className="mt-1 whitespace-pre-wrap">{c.comment}</p></article>)}</div>
          </div>}
        </section>
        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border bg-white p-5"><h2 className="text-lg font-bold">Customer experience feedback</h2><p className="text-xs text-slate-500">Overall restaurant/order ratings</p>
            <div className="mt-4 max-h-80 space-y-3 overflow-y-auto">{report.feedback.filter(f=>f.comment?.trim()).slice(0,20).map((f,i)=><article key={f.order_id+i} className="border-b pb-3 text-sm">
              <span className="font-bold">{f.rating} ★</span><span className="ml-2 text-xs text-slate-500">{new Date(f.created_at).toLocaleDateString("en-PK")}</span>
              <p className="mt-1 whitespace-pre-wrap">{f.comment}</p></article>)}
              {!report.feedback.some(f=>f.comment?.trim())&&<p className="text-sm text-slate-500">No written reviews in this period</p>}
            </div></article>
          <article className="rounded-2xl border bg-white p-5"><h2 className="text-lg font-bold">Payment mix</h2><p className="text-xs text-slate-500">Confirmed paid orders by selected payment method</p>
            <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-100 p-5"><p className="text-xs text-slate-600">Card / demo card</p><p className="mt-2 text-2xl font-black">{report.paymentBreakdown.card}</p></div>
              <div className="rounded-xl bg-slate-100 p-5"><p className="text-xs text-slate-600">Cash / waiter</p><p className="mt-2 text-2xl font-black">{report.paymentBreakdown.cash}</p></div></div>
            <p className="mt-3 text-xs text-slate-500">Includes demo transactions. These are operational figures, not independently verified bank receipts or accounting profit.</p>
          </article>
        </section>
      </>}
      {!report&&!error&&<p className="text-sm text-slate-500">Loading analytics...</p>}
    </div>
  </main>;
}
