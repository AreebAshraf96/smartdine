"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CallWaiter from "@/components/CallWaiter";

export type OrderStatus =
  | "pending_approval"
  | "received"
  | "preparing"
  | "ready"
  | "served"
  | "cancelled";

export type TrackedOrderItem = {
  id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  special_instructions?: string | null;
};

export type TrackedOrder = {
  id: string;
  status: OrderStatus;
  totalAmount: number;
  specialInstructions?: string | null;
  createdAt: string;
  tableNumber?: string | null;
  items: TrackedOrderItem[];
};

type Props = {
  orderId: string;
  qrId?: string;
  restaurantName: string;
  onBackToMenu: () => void;
  onOrderServed?: (order: TrackedOrder) => void;
};

const STAGES: Array<{
  key: OrderStatus;
  title: string;
  description: string;
  icon: string;
}> = [
  {
    key: "received",
    title: "Order Received",
    description: "Your order has reached the kitchen and is queued.",
    icon: "📋",
  },
  {
    key: "preparing",
    title: "Cooking in Kitchen",
    description: "Chefs are actively preparing your dishes.",
    icon: "👨‍🍳",
  },
  {
    key: "ready",
    title: "Ready to Serve",
    description: "Your food is ready! A server is bringing it to your table.",
    icon: "🔔",
  },
  {
    key: "served",
    title: "Served",
    description: "Delivered to your table. Enjoy your meal!",
    icon: "🍽️",
  },
];

const STAGE_ORDER: Record<OrderStatus, number> = {
  pending_approval: 0,
  received: 0,
  preparing: 1,
  ready: 2,
  served: 3,
  cancelled: -1,
};

export default function OrderTracker({
  orderId,
  qrId,
  restaurantName,
  onBackToMenu,
  onOrderServed,
}: Props) {
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationCountdown, setCelebrationCountdown] = useState(4);
  const [showDetails, setShowDetails] = useState(false);

  const formatPrice = (price: number) =>
    `PKR ${price.toLocaleString("en-PK")}`;

  // Fetch current order status from API
  const fetchStatus = useCallback(
    async (isManual = false) => {
      if (isManual) setIsRefreshing(true);
      try {
        const url = `/api/orders/${orderId}/status${
          qrId ? `?qrId=${encodeURIComponent(qrId)}` : ""
        }`;
        const res = await fetch(url, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        const data = await res.json();
        if (data.order) {
          setOrder((prev) => {
            // Trigger celebration on transition to 'served'
            if (
              data.order.status === "served" &&
              (!prev || prev.status !== "served")
            ) {
              setShowCelebration(true);
            }
            return data.order as TrackedOrder;
          });
          setError(null);
        }
      } catch (err) {
        console.error("Order status refresh failed:", err);
        setError("Unable to update order status. Tap refresh to retry.");
      } finally {
        setLoading(false);
        setIsRefreshing(false);
        setLastRefreshedAt(new Date());
      }
    },
    [orderId, qrId]
  );

  // Initial load
  useEffect(() => {
    void fetchStatus(false);
  }, [fetchStatus]);

  // 1-minute polling interval (as requested by user)
  useEffect(() => {
    // If order is served or cancelled, polling stops
    if (order?.status === "served" || order?.status === "cancelled") {
      return;
    }

    const intervalId = setInterval(() => {
      void fetchStatus(false);
    }, 60000); // 1 minute (60s)

    return () => clearInterval(intervalId);
  }, [fetchStatus, order?.status]);

  // Handle celebration countdown when order becomes "served"
  useEffect(() => {
    if (!showCelebration) return;

    if (celebrationCountdown <= 0) {
      setShowCelebration(false);
      if (order && onOrderServed) {
        onOrderServed(order);
      }
      onBackToMenu();
      return;
    }

    const timer = setTimeout(() => {
      setCelebrationCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [showCelebration, celebrationCountdown, order, onOrderServed, onBackToMenu]);

  // Compute active stage index
  const activeStageIndex = useMemo(() => {
    if (!order) return 0;
    return STAGE_ORDER[order.status] ?? 0;
  }, [order]);

  // Time elapsed since order was created
  const timeElapsed = useMemo(() => {
    if (!order?.createdAt) return "";
    const created = new Date(order.createdAt).getTime();
    const now = lastRefreshedAt.getTime();
    const diffMins = Math.max(0, Math.floor((now - created) / 60000));
    if (diffMins === 0) return "Just now";
    if (diffMins === 1) return "1 min ago";
    return `${diffMins} mins ago`;
  }, [order?.createdAt, lastRefreshedAt]);

  const shortOrderId = orderId.slice(0, 8);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* CELEBRATION MODAL OVERLAY */}
      {showCelebration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-300">
          <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-5xl animate-bounce">
              🎉
            </div>
            <h2 className="mt-5 text-2xl font-black text-gray-900">
              Your Food Has Arrived!
            </h2>
            <p className="mt-2 text-gray-600">
              The kitchen has marked your order as delivered. Enjoy your meal!
            </p>

            <div className="mt-6 rounded-xl bg-gray-50 p-4 text-xs text-gray-500">
              Returning to menu in{" "}
              <span className="font-bold text-gray-900">
                {celebrationCountdown}s
              </span>{" "}
              so you can order more drinks or desserts anytime.
            </div>

            <button
              type="button"
              onClick={() => {
                setShowCelebration(false);
                if (order && onOrderServed) onOrderServed(order);
                onBackToMenu();
              }}
              className="mt-6 w-full rounded-xl bg-black py-3.5 text-sm font-bold text-white shadow-md hover:bg-gray-800 transition"
            >
              Order More / Back to Menu Now →
            </button>
          </div>
        </div>
      )}

      {/* TOP NAVIGATION / HEADER */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-4">
        <div>
          <button
            type="button"
            onClick={onBackToMenu}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-black transition"
          >
            ← Back to Menu
          </button>
          <h1 className="mt-1 text-xl font-black text-gray-900">
            {restaurantName}
          </h1>
        </div>

        {order?.tableNumber && (
          <span className="inline-flex items-center rounded-full bg-black px-3.5 py-1 text-xs font-bold text-white shadow-xs">
            Table {order.tableNumber}
          </span>
        )}
      </div>

      {/* ORDER META CARD */}
      <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-wider text-gray-400 uppercase">
                Order Reference
              </span>
              <span className="font-mono text-sm font-bold text-gray-800">
                #{shortOrderId}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Placed {timeElapsed}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isRefreshing}
              onClick={() => void fetchStatus(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition"
              title="Poll interval is 1 minute. Click to refresh immediately."
            >
              <span
                className={`inline-block text-xs ${
                  isRefreshing ? "animate-spin" : ""
                }`}
              >
                🔄
              </span>
              {isRefreshing ? "Checking..." : "Refresh"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
            {error}
          </div>
        )}
      </div>

      {/* TIMELINE / STEPPER */}
      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">
            Order Progress
          </h2>
          <span className="text-xs text-gray-400">
            Auto-checks every 60s
          </span>
        </div>

        {order?.status === "cancelled" ? (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-center">
            <span className="text-3xl">⚠️</span>
            <h3 className="mt-2 text-base font-bold text-red-800">
              Order Cancelled
            </h3>
            <p className="mt-1 text-xs text-red-600">
              This order was cancelled by the staff. Please speak with your
              waiter for details.
            </p>
          </div>
        ) : (
          <div className="mt-6 relative">
            <div className="space-y-6">
              {STAGES.map((stage, idx) => {
                const isCompleted = activeStageIndex > idx;
                const isCurrent = activeStageIndex === idx;
                const isPending = activeStageIndex < idx;

                return (
                  <div key={stage.key} className="relative flex items-start gap-4">
                    {/* Connecting line */}
                    {idx < STAGES.length - 1 && (
                      <div
                        className={`absolute left-5 top-10 -ml-px h-full w-0.5 transition-colors duration-500 ${
                          isCompleted ? "bg-emerald-500" : "bg-gray-200"
                        }`}
                        style={{ height: "calc(100% - 10px)" }}
                      />
                    )}

                    {/* Step Icon / Indicator */}
                    <div
                      className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-bold transition-all duration-300 ${
                        isCompleted
                          ? "bg-emerald-500 text-white shadow-sm ring-4 ring-emerald-50"
                          : isCurrent
                          ? "bg-black text-white ring-4 ring-gray-100 animate-pulse"
                          : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      {isCompleted ? "✓" : stage.icon}
                    </div>

                    {/* Step Details */}
                    <div className="min-w-0 flex-1 pt-1">
                      <div className="flex items-center gap-2">
                        <p
                          className={`text-sm font-bold ${
                            isCurrent
                              ? "text-black"
                              : isCompleted
                              ? "text-emerald-700"
                              : "text-gray-400"
                          }`}
                        >
                          {stage.title}
                        </p>
                        {isCurrent && (
                          <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                            Current Stage
                          </span>
                        )}
                      </div>
                      <p
                        className={`mt-0.5 text-xs leading-relaxed ${
                          isCurrent
                            ? "text-gray-700 font-medium"
                            : isCompleted
                            ? "text-gray-500"
                            : "text-gray-400"
                        }`}
                      >
                        {stage.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ORDER SUMMARY (ACCORDION / CARD) */}
      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <button
          type="button"
          onClick={() => setShowDetails((prev) => !prev)}
          className="flex w-full items-center justify-between text-left"
        >
          <div>
            <h3 className="text-sm font-bold text-gray-900">
              Receipt & Items Ordered
            </h3>
            <p className="mt-0.5 text-xs text-gray-500">
              {order?.items.length ?? 0} item
              {(order?.items.length ?? 0) === 1 ? "" : "s"} •{" "}
              {order ? formatPrice(order.totalAmount) : "..."}
            </p>
          </div>
          <span className="text-sm font-bold text-gray-400">
            {showDetails ? "▲ Hide" : "▼ View"}
          </span>
        </button>

        {showDetails && order && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <div className="space-y-3">
              {order.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between text-xs"
                >
                  <div>
                    <span className="font-semibold text-gray-900">
                      {item.item_name}
                    </span>
                    <span className="ml-1.5 text-gray-500">
                      × {item.quantity}
                    </span>
                    {item.special_instructions && (
                      <p className="text-[11px] text-gray-400 italic">
                        &quot;{item.special_instructions}&quot;
                      </p>
                    )}
                  </div>
                  <span className="font-medium text-gray-700">
                    {formatPrice(item.unit_price * item.quantity)}
                  </span>
                </div>
              ))}
            </div>

            {order.specialInstructions && (
              <div className="mt-4 rounded-lg bg-gray-50 p-2.5 text-xs text-gray-600">
                <span className="font-bold text-gray-800">
                  Kitchen Note:
                </span>{" "}
                {order.specialInstructions}
              </div>
            )}

            <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 text-sm font-bold text-gray-900">
              <span>Total Paid / Due</span>
              <span>{formatPrice(order.totalAmount)}</span>
            </div>
          </div>
        )}
      </div>

      {/* QUICK ACTIONS FOOTER */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onBackToMenu}
          className="flex-1 rounded-xl bg-black py-3.5 text-center text-sm font-bold text-white shadow-sm hover:bg-gray-800 transition"
        >
          + Order More Items
        </button>

        {qrId && (
          <div className="flex-1">
            <CallWaiter qrId={qrId} />
          </div>
        )}
      </div>
    </div>
  );
}

