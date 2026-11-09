
"use client";

import { useEffect, useState } from "react";

type Props = {
  orderId: string;
  qrId?: string;
  subtotal: number;
  served: boolean;
};

type PaymentInfo = {
  method: "card" | "pay_waiter";
  status: string;
  total_amount: number;
  tip_amount: number;
};

export default function CustomerExtras({
  orderId,
  qrId,
  subtotal,
  served,
}: Props) {
  const [tipPct, setTipPct] = useState(0);
  const [customTip, setCustomTip] = useState("");

  const [payment, setPayment] =
    useState<PaymentInfo | null>(null);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackBusy, setFeedbackBusy] = useState(false);

  const tipAmount =
    customTip.trim() !== ""
      ? Number(customTip)
      : Math.round(subtotal * tipPct) / 100;

  const format = (amount: number) =>
    `PKR ${amount.toLocaleString("en-PK")}`;

  const isPaid = payment?.status === "paid";
  const isWaitingCash =
    payment?.method === "pay_waiter" &&
    payment.status === "pending";

  // Check payment state on load and every 5 seconds.
  useEffect(() => {
    if (!qrId) return;

    let active = true;

    async function refresh() {
      const url =
        `/api/customer/payment-choice?orderId=${encodeURIComponent(orderId)}` +
        `&qrId=${encodeURIComponent(qrId!)}`;

      try {
        const response = await fetch(url, {
          cache: "no-store",
        });

        if (!response.ok) return;

        const data = await response.json();

        if (active) {
          setPayment(data.payment ?? null);
        }
      } catch {
        // The next poll can retry.
      }
    }

    void refresh();

    const timer = setInterval(() => {
      void refresh();
    }, 5000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [orderId, qrId]);

  async function choosePayment(
    method: "card" | "pay_waiter"
  ) {
    if (!qrId) {
      setError("Please scan a valid table QR code.");
      return;
    }

    if (
      !Number.isFinite(tipAmount) ||
      tipAmount < 0 ||
      tipAmount > 100000
    ) {
      setError("Please enter a valid tip amount.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        "/api/customer/payment-choice",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            orderId,
            qrId,
            method,
            tipAmount: Math.round(tipAmount * 100) / 100,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ?? "Unable to process payment"
        );
      }

      setPayment(data.payment);
      setMessage(data.message ?? "Payment updated.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Payment request failed"
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitFeedback() {
    if (!qrId) return;

    setFeedbackBusy(true);
    setFeedbackMessage("");

    try {
      const response = await fetch(
        "/api/customer/feedback",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            orderId,
            qrId,
            rating,
            comment,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ?? "Feedback failed"
        );
      }

      setFeedbackMessage("Thank you for your feedback!");
    } catch (err) {
      setFeedbackMessage(
        err instanceof Error ? err.message : "Feedback failed"
      );
    } finally {
      setFeedbackBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-5">
      <section className="space-y-4 rounded-2xl border bg-white p-5">
        <div>
          <h2 className="text-lg font-bold">
            Payment & Order Confirmation
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Your order goes to the kitchen only after
            payment is approved.
          </p>
        </div>

        {isPaid ? (
          <div className="rounded-xl border border-green-200 bg-green-50 p-4">
            <p className="font-bold text-green-800">
              Payment Approved ✓
            </p>
            <p className="mt-1 text-sm text-green-700">
              Your order is now confirmed and has been
              sent to the kitchen.
            </p>
            {payment.method === "card" && (
              <p className="mt-2 text-xs font-semibold text-green-800">
                DEMO CARD PAYMENT — No actual charge.
              </p>
            )}
          </div>
        ) : isWaitingCash ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="font-bold text-amber-900">
              Waiting for Cash Approval
            </p>

            <p className="mt-2 text-sm text-amber-800">
              Please notify the waiter that you selected cash.
              Kitchen staff must approve the payment before
              your order is confirmed.
            </p>

            <p className="mt-2 font-bold text-amber-900">
              Amount: {format(Number(payment.total_amount))}
            </p>

            <p className="mt-2 text-xs text-amber-800">
              This demo does not collect real money.
            </p>
          </div>
        ) : (
          <>
            <div>
              <p className="mb-2 text-sm font-semibold">
                Add a tip (optional)
              </p>

              <div className="flex flex-wrap gap-2">
                {[0, 5, 10, 15].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => {
                      setTipPct(pct);
                      setCustomTip("");
                    }}
                    className={`rounded-lg border px-4 py-2 text-sm ${
                      tipPct === pct && !customTip
                        ? "bg-black text-white"
                        : "bg-white"
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            <label className="block text-sm">
              Custom tip (PKR)
              <input
                type="number"
                min="0"
                max="100000"
                step="0.01"
                value={customTip}
                onChange={(event) =>
                  setCustomTip(event.target.value)
                }
                placeholder="Optional"
                className="mt-1 w-full rounded-lg border p-3"
              />
            </label>

            <div className="space-y-2 rounded-lg bg-gray-50 p-4">
              <div className="flex justify-between text-sm">
                <span>Order subtotal</span>
                <span>{format(subtotal)}</span>
              </div>

              <div className="flex justify-between text-sm">
                <span>Tip</span>
                <span>
                  {Number.isFinite(tipAmount)
                    ? format(tipAmount)
                    : "Invalid"}
                </span>
              </div>

              <div className="flex justify-between border-t pt-2 font-bold">
                <span>Total</span>
                <span>
                  {Number.isFinite(tipAmount)
                    ? format(subtotal + tipAmount)
                    : "Invalid"}
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void choosePayment("pay_waiter")
                }
                className="rounded-xl bg-black px-4 py-3 font-semibold text-white disabled:opacity-50"
              >
                Pay Cash — Request Approval
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void choosePayment("card")
                }
                className="rounded-xl border border-gray-300 bg-white px-4 py-3 font-semibold disabled:opacity-50"
              >
                Pay by Card (Demo)
              </button>
            </div>

            <p className="text-xs text-gray-500">
              Card demo immediately simulates approval.
              Cash requires manual approval in the
              kitchen dashboard. Neither collects money.
            </p>
          </>
        )}

        {message && (
          <p role="status" className="text-sm text-green-700">
            {message}
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </section>

      {served && (
        <section className="space-y-3 rounded-2xl border bg-white p-5">
          <h2 className="text-lg font-bold">
            How was your experience?
          </h2>

          <label className="block text-sm">
            Rating
            <select
              value={rating}
              onChange={(event) =>
                setRating(Number(event.target.value))
              }
              className="mt-1 block rounded-lg border p-2"
            >
              {[5, 4, 3, 2, 1].map((value) => (
                <option key={value} value={value}>
                  {value} star{value === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            Comments
            <textarea
              value={comment}
              maxLength={1000}
              onChange={(event) =>
                setComment(event.target.value)
              }
              placeholder="Tell us about your experience"
              className="mt-1 w-full rounded-lg border p-3"
            />
          </label>

          <button
            type="button"
            disabled={
              feedbackBusy ||
              feedbackMessage === "Thank you for your feedback!"
            }
            onClick={() => void submitFeedback()}
            className="rounded-lg bg-black px-4 py-3 text-white disabled:opacity-50"
          >
            Submit Feedback
          </button>

          {feedbackMessage && (
            <p role="status" className="text-sm">
              {feedbackMessage}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
