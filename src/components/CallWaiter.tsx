
"use client";

import { useState } from "react";

type Props = {
  qrId: string;
};

export default function CallWaiter({ qrId }: Props) {
  const [loading, setLoading] = useState(false);
  const [requested, setRequested] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleCallWaiter() {
    if (loading || requested) return;

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/waiter-calls", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          qrId,
        }),
      });

      const responseText = await response.text();

      let result: {
        success?: boolean;
        message?: string;
        error?: string;
      } = {};

      if (responseText) {
        try {
          result = JSON.parse(responseText);
        } catch {
          throw new Error(
            `Invalid server response (${response.status})`
          );
        }
      }

      if (!response.ok) {
        throw new Error(
          result.error ??
            `Unable to notify staff (${response.status})`
        );
      }

      setRequested(true);
      setMessage(
        result.message ??
          "Restaurant staff have been notified."
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to call waiter."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="border-b border-gray-200 bg-white px-4 py-4 text-gray-900">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold">
              Need Assistance?
            </h2>

            <p className="mt-1 text-sm text-gray-600">
              Call a waiter to your table.
            </p>
          </div>

          <button
            type="button"
            onClick={handleCallWaiter}
            disabled={loading || requested}
            className="rounded-lg bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {loading
              ? "Calling..."
              : requested
                ? "Staff Notified"
                : "Call Waiter"}
          </button>
        </div>

        {message && (
          <div
            role="status"
            className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800"
          >
            {message}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}
      </div>
    </section>
  );
}
