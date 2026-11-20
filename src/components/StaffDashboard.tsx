
"use client";

import {
  useCallback,
  useEffect,
  useState,
  useRef,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import ManagerMenu from "@/components/ManagerMenu";
import StaffPayments from "@/components/StaffPayments";
import StaffReceipts from "@/components/StaffReceipts";
import StaffOrderExceptions from "@/components/StaffOrderExceptions";
import StaffReconciliation from "@/components/StaffReconciliation";
import ManagerQrCodes from "@/components/ManagerQrCodes";

type Tab = "orders" | "calls" | "stock" | "menu" | "payments" | "qr" | "receipts" | "exceptions" | "reconciliation";

type Order = {
  id: string;
  status: string;
  restaurant_id: string;
  table_number: string;
  total_amount: number;
  special_instructions: string | null;
  created_at: string;
  items: {
    name: string;
    quantity: number;
    unit_price: number;
  }[];
};

type WaiterCall = {
  id: string;
  restaurant_id: string;
  table_number: string;
  created_at: string;
};

type StockItem = {
  id: string;
  restaurant_id: string;
  name: string;
  is_available: boolean;
};

type Props = {
  view?: "kitchen" | "manager";
};

export default function StaffDashboard({
  view = "kitchen",
}: Props) {
  const [session, setSession] =
    useState<Session | null>(null);

  const [ready, setReady] = useState(false);


  const [tab, setTab] =
    useState<Tab>("orders");

  const [orders, setOrders] =
    useState<Order[]>([]);

  const [calls, setCalls] =
    useState<WaiterCall[]>([]);

  const [stock, setStock] =
    useState<StockItem[]>([]);

  const [error, setError] = useState("");

  const [updating, setUpdating] =
    useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [managerAccess, setManagerAccess] = useState(false);
  const [ownerAccess, setOwnerAccess] = useState(false);
  const [accessLoaded, setAccessLoaded] = useState(false);
  const lastOrderIds = useRef<Set<string> | null>(null);
  const lastCallIds = useRef<Set<string> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  async function enableSound() {
    try {
      const ctx = audioContextRef.current ?? new AudioContext();
      audioContextRef.current = ctx;
      await ctx.resume();
      setSoundEnabled(true);
    } catch (e) { setError("Audio could not be enabled. Check browser permissions."); }
  }
  const ring = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!soundEnabled || !ctx || ctx.state !== "running") return;
    const start = ctx.currentTime;
    for (const offset of [0, 0.22]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.12, start + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.16);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(start + offset); osc.stop(start + offset + 0.17);
    }
  }, [soundEnabled]);


  const formatPrice = (value: number) =>
    `PKR ${value.toLocaleString("en-PK")}`;

  // Authentication initialization
  useEffect(() => {
    let active = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;

        setSession(data.session);
        setReady(true);
      });

    const { data: listener } =
      supabase.auth.onAuthStateChange(
        (_event, nextSession) => {
          setSession(nextSession);

          if (!nextSession) {
            setOrders([]);
            setCalls([]);
            setStock([]);
          }
        }
      );

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  // Authorized API helper
  const api = useCallback(
    async (
      url: string,
      token: string,
      options: RequestInit = {}
    ) => {
      const response = await fetch(url, {
        ...options,
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(options.headers ?? {}),
        },
      });

      const responseText =
        await response.text();

      let result: Record<string, unknown> = {};

      if (responseText.trim()) {
        try {
          result = JSON.parse(
            responseText
          ) as Record<string, unknown>;
        } catch {
          throw new Error(
            `Invalid API response (HTTP ${response.status})`
          );
        }
      }

      if (!response.ok) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : `Request failed (HTTP ${response.status})`
        );
      }

      return result;
    },
    []
  );

  // Fetch dashboard data
  const loadData = useCallback(
    async (
      token: string,
      selectedTab: Tab
    ) => {
      try {
        // Orders
        if (true) {
          const result = await api(
            "/api/staff/orders?view=kitchen",
            token
          );

          const nextOrders = (result.orders ?? []) as Order[];
          const nextIds = new Set(nextOrders.map(o => o.id));
          if (lastOrderIds.current && nextOrders.some(o => !lastOrderIds.current!.has(o.id))) ring();
          lastOrderIds.current = nextIds;
          setOrders(nextOrders);
        }

        // Waiter calls are fetched when viewing
        // either Orders or Waiter Calls.
        // This keeps the call notification current.
        if (true) {
          const result = await api(
            "/api/staff/waiter-calls",
            token
          );

          const nextCalls = (result.calls ?? []) as WaiterCall[];
          const nextIds = new Set(nextCalls.map(c => c.id));
          if (lastCallIds.current && nextCalls.some(c => !lastCallIds.current!.has(c.id))) ring();
          lastCallIds.current = nextIds;
          setCalls(nextCalls);
        }

        // Stock availability
        if (selectedTab === "stock") {
          const result = await api(
            "/api/staff/stock",
            token
          );

          setStock(
            (result.items ?? []) as StockItem[]
          );
        }

        setError("");
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load kitchen data"
        );
      }
    },
    [api, ring]
  );

  // Refresh automatically every 5 seconds
  useEffect(() => {
    if (!session) return;

    let active = true;

    async function refresh() {
      const { data } =
        await supabase.auth.getSession();

      if (
        active &&
        data.session?.access_token
      ) {
        await loadData(
          data.session.access_token,
          tab
        );
      }
    }

    void refresh();

    const interval = setInterval(() => {
      void refresh();
    }, 5000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [session, tab, loadData]);

  // Check manager role via server; never rely on client-side tab visibility for authorization.
  useEffect(() => {
    if (!session) { setAccessLoaded(false); setManagerAccess(false);setOwnerAccess(false); return; }
    let active = true;
    void api("/api/staff/access", session.access_token)
      .then(d => {if(active) {setManagerAccess(Boolean(d.canManageMenu));setOwnerAccess(Boolean(d.isOwner));setAccessLoaded(true);}})
      .catch(e => {if(active) {setManagerAccess(false);setAccessLoaded(true);setError(String(e));}});
    return () => {active=false;};
  }, [session, api]);

  // Perform authenticated update
  async function performAction(
    url: string,
    body: Record<string, unknown>,
    actionId: string
  ) {
    setUpdating(actionId);
    setError("");

    try {
      const { data } =
        await supabase.auth.getSession();

      if (!data.session) {
        throw new Error(
          "Please sign in again."
        );
      }

      await api(
        url,
        data.session.access_token,
        {
          method: "PATCH",
          body: JSON.stringify(body),
        }
      );

      await loadData(
        data.session.access_token,
        tab
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to complete action"
      );
    } finally {
      setUpdating(null);
    }
  }

  // Update order
  function changeStatus(
    order: Order,
    status: "preparing" | "ready" | "served"
  ) {
    return performAction(
      `/api/staff/orders/${order.id}/status`,
      { status },
      order.id
    );
  }

  // Resolve waiter call
  function resolveCall(call: WaiterCall) {
    return performAction(
      "/api/staff/waiter-calls",
      { id: call.id },
      call.id
    );
  }

  // Change stock availability
  function toggleStock(item: StockItem) {
    return performAction(
      "/api/staff/stock",
      {
        id: item.id,
        is_available: !item.is_available,
      },
      item.id
    );
  }

  // Loading authentication
  if (!ready) {
    return (
      <main className="min-h-screen bg-gray-50 p-8 text-gray-900">
        Loading kitchen session...
      </main>
    );
  }

  if (!session) {
    return <main className="p-8"><a href="/staff/login" className="underline">Sign in to SmartDine</a></main>;
  }

  if (accessLoaded && !managerAccess) {
    return <main className="p-8"><p>Manager or owner access required.</p><button onClick={() => void supabase.auth.signOut()} className="mt-4 rounded border px-4 py-2">Sign out</button></main>;
  }
  if (!accessLoaded) {
    return <main className="p-8">Checking manager permissions...</main>;
  }

  // Main kitchen dashboard
  return (
    <main className="min-h-screen bg-gray-50 p-4 text-gray-900 md:p-6">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div>
            <h1 className="text-2xl font-bold">
              SmartDine Restaurant Operations
            </h1>

            <p className="mt-1 text-sm text-gray-600">
              Live orders, waiter requests
              and menu stock
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                void loadData(
                  session.access_token,
                  tab
                )
              }
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-100"
            >
              Refresh
            </button>

            <button
              type="button"
              onClick={() => void enableSound()}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium"
            >
              {soundEnabled ? "🔔 Sound enabled" : "🔕 Enable sound alerts"}
            </button>

            <button
              type="button"
              onClick={() =>
                void supabase.auth.signOut()
              }
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-100"
            >
              Sign Out
            </button>
          </div>
        </header>

        {/* Navigation */}
        <nav className="mb-6 flex flex-wrap gap-2 print:hidden">
          <button
            type="button"
            onClick={() => {
              setTab("orders");
              setError("");
            }}
            className={`rounded-lg px-5 py-3 text-sm font-semibold ${
              tab === "orders"
                ? "bg-black text-white"
                : "border bg-white"
            }`}
          >
            Orders
            {orders.length > 0
              ? ` (${orders.length})`
              : ""}
          </button>

          <button
            type="button"
            onClick={() => {
              setTab("calls");
              setError("");
            }}
            className={`rounded-lg px-5 py-3 text-sm font-semibold ${
              tab === "calls"
                ? "bg-black text-white"
                : "border bg-white"
            }`}
          >
            Waiter Calls
            {calls.length > 0
              ? ` (${calls.length})`
              : ""}
          </button>

          <button
            type="button"
            onClick={() => {
              setTab("stock");
              setError("");
            }}
            className={`rounded-lg px-5 py-3 text-sm font-semibold ${
              tab === "stock"
                ? "bg-black text-white"
                : "border bg-white"
            }`}
          >
            Stock
          </button>
        </nav>

        {ownerAccess && <p className="mb-3 print:hidden"><a href="/staff/owner" className="inline-flex rounded-lg border bg-white px-4 py-2 text-sm font-semibold">Owner analytics & reports</a></p>}
        <nav className="mb-4 flex flex-wrap gap-2 print:hidden">
          <button className={`rounded-lg px-4 py-2 ${tab === "payments" ? "bg-black text-white" : "border bg-white"}`} onClick={() => setTab("payments")}>Payments</button>
          {managerAccess && <button className={`rounded-lg px-4 py-2 ${tab === "menu" ? "bg-black text-white" : "border bg-white"}`} onClick={() => setTab("menu")}>Manage Menu</button>}
          {managerAccess && <button type="button" className={`rounded-lg px-4 py-2 ${tab === "exceptions" ? "bg-black text-white" : "border bg-white"}`} onClick={() => setTab("exceptions") }>Refunds & cancellations</button>}
          {managerAccess && <button type="button" className={`rounded-lg px-4 py-2 ${tab === "reconciliation" ? "bg-black text-white" : "border bg-white"}`} onClick={() => setTab("reconciliation") }>Reconciliation</button>}
          {managerAccess && <button type="button" className={`rounded-lg px-4 py-2 ${tab === "receipts" ? "bg-black text-white" : "border bg-white"}`} onClick={() => setTab("receipts")}>Receipts</button>}
          {managerAccess && <button className={`rounded-lg px-4 py-2 ${tab === "qr" ? "bg-black text-white" : "border bg-white"}`} onClick={() => setTab("qr")}>QR Codes</button>}

        </nav>

        {/* Error display */}
        {error && (
          <div
            role="alert"
            className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 print:hidden"
          >
            {error}
          </div>
        )}

        {tab === "menu" && managerAccess && <ManagerMenu />}

        {tab === "qr" && managerAccess && <ManagerQrCodes />}

        {tab === "payments" && <StaffPayments />}

        {tab === "receipts" && managerAccess && <StaffReceipts />}
        {tab === "exceptions" && managerAccess && <StaffOrderExceptions />}
        {tab === "reconciliation" && managerAccess && <StaffReconciliation />}

        {/* ORDERS TAB */}
        {tab === "orders" && (
          <section>
            <h2 className="mb-4 text-xl font-semibold">
              Incoming Orders
            </h2>

            {orders.length === 0 && (
              <div className="rounded-xl border bg-white p-8 text-center text-gray-600">
                No orders in the kitchen queue.
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              {orders.map((order) => (
                <article
                  key={order.id}
                  className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xl font-bold">
                      Table {order.table_number}
                    </h3>

                    <span className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-semibold capitalize">
                      {order.status}
                    </span>
                  </div>

                  <p className="mt-2 text-xs text-gray-500">
                    {new Date(
                      order.created_at
                    ).toLocaleString()}
                  </p>

                  <div className="mt-4 space-y-3">
                    {order.items.map(
                      (item, index) => (
                        <div
                          key={`${order.id}-${index}`}
                          className="flex justify-between gap-3 text-sm"
                        >
                          <span>
                            {item.quantity} ×{" "}
                            {item.name}
                          </span>

                          <span className="font-medium">
                            {formatPrice(
                              item.quantity *
                                item.unit_price
                            )}
                          </span>
                        </div>
                      )
                    )}
                  </div>

                  {order.special_instructions && (
                    <div className="mt-4 rounded-lg bg-amber-50 p-3">
                      <p className="text-xs font-semibold">
                        Special Instructions
                      </p>

                      <p className="mt-1 text-sm">
                        {order.special_instructions}
                      </p>
                    </div>
                  )}

                  <div className="mt-4 border-t pt-4">
                    <p className="text-right text-lg font-bold">
                      {formatPrice(
                        order.total_amount
                      )}
                    </p>
                  </div>

                  <div className="mt-4">
                    {order.status === "received" && (
                      <button
                        type="button"
                        disabled={
                          updating === order.id
                        }
                        onClick={() =>
                          void changeStatus(
                            order,
                            "preparing"
                          )
                        }
                        className="rounded-lg bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {updating === order.id
                          ? "Updating..."
                          : "Start Preparing"}
                      </button>
                    )}

                    {order.status === "preparing" && (
                      <button
                        type="button"
                        disabled={
                          updating === order.id
                        }
                        onClick={() =>
                          void changeStatus(
                            order,
                            "ready"
                          )
                        }
                        className="rounded-lg bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {updating === order.id
                          ? "Updating..."
                          : "Mark Ready"}
                      </button>
                    )}

                    {order.status === "ready" && (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="font-semibold text-green-700">
                          Ready for Collection
                        </span>
                        <button
                          type="button"
                          disabled={updating === order.id}
                          onClick={() =>
                            void changeStatus(
                              order,
                              "served"
                            )
                          }
                          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
                        >
                          {updating === order.id
                            ? "Updating..."
                            : "Mark Served ✓"}
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* WAITER CALLS TAB */}
        {tab === "calls" && (
          <section>
            <h2 className="mb-4 text-xl font-semibold">
              Waiter Requests
            </h2>

            {calls.length === 0 && (
              <div className="rounded-xl border bg-white p-8 text-center text-gray-600">
                No pending waiter requests.
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              {calls.map((call) => (
                <article
                  key={call.id}
                  className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold">
                      Table {call.table_number}
                    </h3>

                    <span className="rounded-lg bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                      Assistance Needed
                    </span>
                  </div>

                  <p className="mt-3 text-sm text-gray-600">
                    A customer has requested
                    a waiter at this table.
                  </p>

                  <p className="mt-2 text-xs text-gray-500">
                    {new Date(
                      call.created_at
                    ).toLocaleString()}
                  </p>

                  <button
                    type="button"
                    disabled={
                      updating === call.id
                    }
                    onClick={() =>
                      void resolveCall(call)
                    }
                    className="mt-5 rounded-lg bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {updating === call.id
                      ? "Updating..."
                      : "Mark Resolved"}
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* STOCK TAB */}
        {tab === "stock" && (
          <section>
            <h2 className="mb-2 text-xl font-semibold">
              Menu Availability
            </h2>

            <p className="mb-5 text-sm text-gray-600">
              Mark food as out of stock to prevent
              customers from ordering it.
            </p>

            {stock.length === 0 && (
              <div className="rounded-xl border bg-white p-8 text-center text-gray-600">
                No menu items found.
              </div>
            )}

            <div className="space-y-3">
              {stock.map((item) => (
                <article
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div>
                    <h3 className="font-semibold">
                      {item.name}
                    </h3>

                    <p
                      className={`mt-1 text-sm font-medium ${
                        item.is_available
                          ? "text-green-700"
                          : "text-red-600"
                      }`}
                    >
                      {item.is_available
                        ? "Available"
                        : "Out of Stock"}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={
                      updating === item.id
                    }
                    onClick={() =>
                      void toggleStock(item)
                    }
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-100 disabled:opacity-50"
                  >
                    {updating === item.id
                      ? "Updating..."
                      : item.is_available
                        ? "Mark Out of Stock"
                        : "Mark Available"}
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
