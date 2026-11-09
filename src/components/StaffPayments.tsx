
"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Payment = {
  id: string;
  order_id: string;
  restaurant_id: string;
  method: string;
  status: string;
  subtotal: number;
  tip_amount: number;
  total_amount: number;
  created_at: string;
};

export default function StaffPayments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) return;

    const response = await fetch("/api/staff/payments", {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ?? "Unable to load cash approvals"
      );
    }

    setPayments(data.payments ?? []);
    setError("");
  }, []);

  useEffect(() => {
    void load().catch((err) =>
      setError(String(err))
    );

    const timer = setInterval(() => {
      void load().catch((err) =>
        setError(String(err))
      );
    }, 5000);

    return () => clearInterval(timer);
  }, [load]);

  async function approveCash(payment: Payment) {
    const confirmed = window.confirm(
      `Approve cash payment of PKR ${Number(
        payment.total_amount
      ).toLocaleString("en-PK")} for order #${payment.order_id.slice(0, 8)}?\n\nIn this demo, approval simulates collecting cash.`
    );

    if (!confirmed) return;

    setBusy(payment.id);
    setError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("Please sign in again.");
      }

      const response = await fetch(
        "/api/staff/payments",
        {
          method: "PATCH",
          headers: {
            Authorization:
              `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: payment.id,
            status: "paid",
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ?? "Unable to approve cash payment"
        );
      }

      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Approval failed"
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-bold">
          Pending Cash Approvals
        </h2>

        <p className="mt-1 text-sm text-gray-600">
          Orders remain outside the kitchen queue until
          you approve their cash payment.
        </p>
      </header>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Demo mode: approving a request simulates
        receiving cash. No money is collected by SmartDine.
      </div>

      {error && (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {payments.length === 0 && (
        <div className="rounded-xl border bg-white p-6 text-gray-600">
          No pending cash approvals.
        </div>
      )}

      {payments.map((payment) => (
        <article
          key={payment.id}
          className="space-y-3 rounded-xl border bg-white p-5 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-bold">
              Order #{payment.order_id.slice(0, 8)}
            </h3>

            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
              Awaiting Approval
            </span>
          </div>

          <p className="text-xs text-gray-500">
            {new Date(payment.created_at).toLocaleString()}
          </p>

          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Order</span>
              <span>
                PKR {Number(payment.subtotal).toLocaleString("en-PK")}
              </span>
            </div>

            <div className="flex justify-between">
              <span>Tip</span>
              <span>
                PKR {Number(payment.tip_amount).toLocaleString("en-PK")}
              </span>
            </div>

            <div className="flex justify-between border-t pt-2 text-lg font-bold">
              <span>Total</span>
              <span>
                PKR {Number(payment.total_amount).toLocaleString("en-PK")}
              </span>
            </div>
          </div>

          <button
            type="button"
            disabled={busy === payment.id}
            onClick={() => void approveCash(payment)}
            className="w-full rounded-lg bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy === payment.id
              ? "Approving..."
              : "Approve Cash & Send to Kitchen"}
          </button>
        </article>
      ))}
    </section>
  );
}
