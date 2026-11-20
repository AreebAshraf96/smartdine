"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Totals = { expected_cash: number; expected_card: number; simulated_card: number };
type Close = Totals & { counted_cash: number; reported_card: number; closed_at: string };
type Report = {
  restaurants: { id: string; name: string }[];
  restaurant: string; date: string; today: string; timeZone: string; currency: string;
  totals: Totals; record: Close | null;
};

async function request(query: string, data?: object): Promise<Report> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Sign in again");
  const result = await fetch(`/api/staff/reconciliation${query}`, {
    method: data ? "POST" : "GET",
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: data ? JSON.stringify(data) : undefined,
    cache: "no-store",
  });
  const body = await result.json();
  if (!result.ok) throw new Error(body.error ?? "Unable to load reconciliation");
  return body;
}

export default function StaffReconciliation() {
  const [restaurant, setRestaurant] = useState("");
  const [date, setDate] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [cash, setCash] = useState("");
  const [card, setCard] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const query = new URLSearchParams();
    if (restaurant) query.set("restaurantId", restaurant);
    if (date) query.set("date", date);
    let active = true;
    void request(`?${query}`).then(result => {
      if (!active) return;
      setReport(result);
      setCash(result.record ? String(result.record.counted_cash) : "");
      setCard(result.record ? String(result.record.reported_card) : "");
    }).catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [restaurant, date]);

  async function save() {
    if (!report || !cash.trim() || !card.trim()) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const updated = await request("", { restaurantId: report.restaurant, date: report.date, countedCash: Number(cash), reportedCard: Number(card) });
      setReport(updated);
      setMessage("Close saved.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to save the close");
    } finally { setBusy(false); }
  }

  const money = new Intl.NumberFormat(undefined, { style: "currency", currency: report?.currency ?? "PKR" });
  const current = report && (!restaurant || restaurant === report.restaurant) && (!date || date === report.date);
  return <section className="space-y-4">
    <h2 className="text-xl font-semibold">End-of-day reconciliation</h2>
    {report && <div className="flex flex-wrap gap-4">
      <label>Restaurant
        <select className="ml-2 rounded border p-2" value={restaurant || report.restaurant} disabled={busy} onChange={event => {
          setError(""); setMessage(""); setDate(""); setRestaurant(event.target.value);
        }}>
          {report.restaurants.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <label>Business date
        <input type="date" className="ml-2 rounded border p-2" max={report.today} value={date || report.date} disabled={busy} onChange={event => {
          setError(""); setMessage(""); setDate(event.target.value);
        }} />
      </label>
    </div>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {message && <p role="status" className="text-green-700">{message}</p>}
    {!current && !error && <p role="status">Loading reconciliation…</p>}
    {report && current && <form className="space-y-4 rounded-xl border bg-white p-4" onSubmit={event => { event.preventDefault(); void save(); }}>
      <p className="text-sm">Amounts are net of recorded refunds for the business day in {report.timeZone}. Enter the actual cash counted and the card processor’s net transaction total in the same currency before fees.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1">Cash counted
          <input required type="number" step=".01" value={cash} onChange={event => setCash(event.target.value)} className="block w-full rounded border p-2" />
          <span className="block text-sm">Expected {money.format(report.totals.expected_cash)}{cash.trim() ? ` · Difference ${money.format(Number(cash) - Number(report.totals.expected_cash))}` : ""}</span>
        </label>
        <label className="space-y-1">Card processor total
          <input required type="number" step=".01" value={card} onChange={event => setCard(event.target.value)} className="block w-full rounded border p-2" />
          <span className="block text-sm">Expected {money.format(report.totals.expected_card)}{card.trim() ? ` · Difference ${money.format(Number(card) - Number(report.totals.expected_card))}` : ""}</span>
        </label>
      </div>
      <p className="text-sm">Test and simulated cards {money.format(report.totals.simulated_card)}</p>
      {report.record && <p className="text-sm">Last saved {new Date(report.record.closed_at).toLocaleString()} · At close cash difference {money.format(Number(report.record.counted_cash) - Number(report.record.expected_cash))}, card difference {money.format(Number(report.record.reported_card) - Number(report.record.expected_card))}</p>}
      <button disabled={busy} type="submit" className="rounded bg-black px-4 py-2 text-white disabled:opacity-50">{busy ? "Saving…" : "Save close"}</button>
    </form>}
  </section>;
}
