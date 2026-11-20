"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Receipt = {
  payment_id: string;
  order_id: string;
  restaurant_name: string;
  table_number: string | null;
  method: string;
  provider: string | null;
  currency: string;
  subtotal: number;
  tip_amount: number;
  total_amount: number;
  paid_at: string;
  expires_at: string;
  items: { name: string; quantity: number; unit_price: number }[];
};

type ReceiptPage = { receipts: Receipt[]; hasMore: boolean };

export default function StaffReceipts() {
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<ReceiptPage | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in again.");
      const response = await fetch(`/api/staff/receipts?page=${page}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load receipts");
      if (!controller.signal.aborted) setResult(body);
    }

    void load().catch(error => {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Unable to load receipts");
    });
    return () => controller.abort();
  }, [page]);

  function changePage(next: number) {
    setError("");
    setResult(null);
    setPage(next);
  }

  return <section className="space-y-4">
    <h2 className="text-xl font-semibold">Order receipts</h2>
    <p className="text-sm text-gray-600">Receipts are available for seven days after payment.</p>
    {error ? <p role="alert" className="text-red-700">{error}</p>
      : !result ? <p role="status">Loading receipts…</p>
      : result.receipts.length === 0 ? <p>No receipts on this page.</p>
      : <div className="space-y-3">
        {result.receipts.map(receipt => {
          const money = new Intl.NumberFormat(undefined, { style: "currency", currency: receipt.currency });
          const method = receipt.provider === "stripe_test" ? "Stripe test" : receipt.provider === "demo" ? "Simulated card" : receipt.method === "pay_waiter" ? "Cash" : "Card";
          return <details key={receipt.payment_id} className="rounded-xl border bg-white p-4">
            <summary className="cursor-pointer font-semibold">
              {receipt.restaurant_name} · {receipt.table_number ? `Table ${receipt.table_number}` : "Order"} · #{receipt.order_id.slice(0, 8)} · {money.format(receipt.total_amount)}
            </summary>
            <div className="mt-3 space-y-2 text-sm">
              <p>{method} · Paid {new Date(receipt.paid_at).toLocaleString()}</p>
              <ul className="space-y-1">
                {receipt.items.map((item, index) => <li key={index} className="flex justify-between gap-4">
                  <span>{item.quantity} × {item.name}</span>
                  <span>{money.format(item.quantity * item.unit_price)}</span>
                </li>)}
              </ul>
              <p>Subtotal {money.format(receipt.subtotal)} · Tip {money.format(receipt.tip_amount)}</p>
              <p className="text-gray-600">Expires {new Date(receipt.expires_at).toLocaleString()}</p>
            </div>
          </details>;
        })}
      </div>}
    {(page > 0 || result?.hasMore) && <div className="flex gap-3">
      <button type="button" disabled={page === 0} onClick={() => changePage(page - 1)} className="rounded border bg-white px-4 py-2 disabled:opacity-50">Previous</button>
      <button type="button" disabled={!result?.hasMore} onClick={() => changePage(page + 1)} className="rounded border bg-white px-4 py-2 disabled:opacity-50">Next</button>
    </div>}
  </section>;
}
