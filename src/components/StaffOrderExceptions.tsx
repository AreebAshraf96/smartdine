"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Payment = { method: string; provider: string | null; status: string; total_amount: number; currency: string };
type Order = {
  id: string; restaurant: string; status: string; created_at: string;
  payment?: Payment; refund?: { amount: number; currency: string; reason: string; refunded_at: string };
};

async function request(path = "", body?: object) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Sign in again");
  const response = await fetch(`/api/staff/order-exceptions${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Unable to complete the request");
  return result;
}

export default function StaffOrderExceptions() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState("");
  const [lookup, setLookup] = useState("");
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let live = true;
    void request(lookup ? `?orderId=${encodeURIComponent(lookup)}` : "")
      .then(result => { if (live) setOrders(result.orders); })
      .catch(error => { if (live) setError(error.message); });
    return () => { live = false; };
  }, [lookup, reload]);

  async function change(order: Order, action: "refund" | "cancel") {
    const isCash = order.payment?.method === "pay_waiter";
    const reason = action === "refund" ? window.prompt("Reason for full refund")?.trim() : undefined;
    if (action === "refund" && !reason) return;
    if (!window.confirm(action === "cancel" ? "Cancel this order?"
      : isCash ? "Confirm you have returned the full amount in cash." : "Issue a full refund for this payment?")) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await request("", { orderId: order.id, action, reason, cashReturned: isCash });
      setMessage(action === "cancel" ? "Order cancelled." : "Full refund recorded.");
      setReload(value => value + 1);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to update the order");
    } finally { setBusy(false); }
  }

  return <section className="space-y-4">
    <h2 className="text-xl font-semibold">Refunds and cancellations</h2>
    <form className="flex flex-wrap gap-2" onSubmit={event => {
      event.preventDefault();
      setError("");
      setLookup(search.trim());
      setReload(value => value + 1);
    }}>
      <input aria-label="Full order ID" placeholder="Full order ID" value={search} onChange={event => setSearch(event.target.value)} className="rounded border p-2" />
      <button className="rounded border bg-white px-4">Find order</button>
    </form>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {message && <p role="status" className="text-green-700">{message}</p>}
    {!orders.length && !error && <p>No orders to show.</p>}
    {orders.map(order => {
      const money = order.payment ? new Intl.NumberFormat(undefined, { style: "currency", currency: order.payment.currency }) : null;
      const paid = order.payment?.status === "paid";
      const canCancel = ["pending_approval", "received", "preparing", "ready"].includes(order.status) && (!paid || !!order.refund);
      return <article className="space-y-2 rounded-lg border bg-white p-4" key={order.id}>
        <p className="font-semibold">{order.restaurant} · #{order.id.slice(0, 8)} · {order.status.replaceAll("_", " ")}</p>
        <p className="break-all text-xs">{order.id}</p>
        <p className="text-sm">{new Date(order.created_at).toLocaleString()}{order.payment && money ? ` · ${money.format(order.payment.total_amount)} · ${order.payment.method === "pay_waiter" ? "Cash" : "Card"} ${order.payment.status}` : ""}</p>
        {order.refund && <p className="text-sm">Refunded {money?.format(order.refund.amount)} · {order.refund.reason}</p>}
        <div className="flex gap-2">
          {paid && !order.refund && <button type="button" disabled={busy} className="rounded border px-3 py-1" onClick={() => void change(order, "refund")}>Full refund</button>}
          {canCancel && <button type="button" disabled={busy} className="rounded border px-3 py-1" onClick={() => void change(order, "cancel")}>Cancel order</button>}
        </div>
      </article>;
    })}
  </section>;
}
