
"use client";

import { useEffect, useMemo, useState } from "react";
import OrderTracker from "@/components/OrderTracker";

type Category = {
  id: string;
  name: string;
  sort_order?: number | null;
};

type MenuItem = {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  is_available: boolean;
};

type Props = {
  restaurantName: string;
  categories: Category[];
  items: MenuItem[];
  qrId?: string;
};

type Screen = "menu" | "cart" | "checkout" | "success" | "tracker";

type OrderResult = {
  orderId: string;
  total: number;
  status: string;
  replayed?: boolean;
};

export default function CustomerMenu({
  restaurantName,
  categories,
  items,
  qrId,
}: Props) {
  const [screen, setScreen] = useState<Screen>("menu");
  const [selectedCategory, setSelectedCategory] =
    useState("all");

  const [cart, setCart] = useState<Record<string, number>>(
    {}
  );

  const [instructions, setInstructions] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [orderResult, setOrderResult] =
    useState<OrderResult | null>(null);

  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [activeOrderStatus, setActiveOrderStatus] = useState<string | null>(null);

  const [idempotencyKey, setIdempotencyKey] =
    useState<string | null>(null);

  // Restore active order from localStorage if customer returns or reloads
  useEffect(() => {
    if (!qrId || typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(`smartdine_active_order_${qrId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          parsed.orderId &&
          typeof parsed.orderId === "string" &&
          Date.now() - (parsed.savedAt || 0) < 6 * 60 * 60 * 1000
        ) {
          setActiveOrderId(parsed.orderId);
          if (parsed.status) setActiveOrderStatus(parsed.status);

          // Always verify latest live status from server
          fetch(
            `/api/orders/${parsed.orderId}/status?qrId=${encodeURIComponent(
              qrId
            )}`
          )
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
              if (data?.order?.status) {
                setActiveOrderStatus(data.order.status);
                try {
                  localStorage.setItem(
                    `smartdine_active_order_${qrId}`,
                    JSON.stringify({
                      orderId: parsed.orderId,
                      status: data.order.status,
                      savedAt: parsed.savedAt || Date.now(),
                    })
                  );
                } catch {}
              }
            })
            .catch(() => {});
        }
      }
    } catch (e) {
      console.warn("Unable to restore active order from localStorage", e);
    }
  }, [qrId]);

  const formatPrice = (price: number) =>
    `PKR ${price.toLocaleString("en-PK")}`;

  // Sort categories
  const sortedCategories = useMemo(() => {
    return [...categories].sort(
      (a, b) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0)
    );
  }, [categories]);

  // Filter menu by selected category
  const visibleItems = useMemo(() => {
    if (selectedCategory === "all") {
      return items;
    }

    return items.filter(
      (item) => item.category_id === selectedCategory
    );
  }, [items, selectedCategory]);

  // Read cart items from current menu data
  const cartItems = useMemo(() => {
    return items
      .filter((item) => (cart[item.id] ?? 0) > 0)
      .map((item) => ({
        ...item,
        quantity: cart[item.id],
      }));
  }, [items, cart]);

  const totalQuantity = cartItems.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  const subtotal = cartItems.reduce(
    (sum, item) =>
      sum + item.price * item.quantity,
    0
  );

  const unavailableItems = cartItems.filter(
    (item) => !item.is_available
  );

  // Update cart safely
  function updateQuantity(
    item: MenuItem,
    change: number
  ) {
    if (!item.is_available && change > 0) {
      return;
    }

    if (submitting) return;

    setCart((previous) => {
      const current = previous[item.id] ?? 0;
      const next = Math.max(
        0,
        Math.min(10, current + change)
      );

      const updated = { ...previous };

      if (next === 0) {
        delete updated[item.id];
      } else {
        updated[item.id] = next;
      }

      return updated;
    });

    setIdempotencyKey(null);
    setError("");
  }

  function removeItem(itemId: string) {
    if (submitting) return;

    setCart((previous) => {
      const updated = { ...previous };
      delete updated[itemId];
      return updated;
    });

    setIdempotencyKey(null);
    setError("");
  }

  function goTo(nextScreen: Screen) {
    setError("");
    setScreen(nextScreen);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Reusable quantity buttons
  function quantityControls(item: MenuItem) {
    const quantity = cart[item.id] ?? 0;

    if (!item.is_available) {
      return (
        <span className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          Out of Stock
        </span>
      );
    }

    if (quantity === 0) {
      return (
        <button
          type="button"
          disabled={submitting}
          onClick={() => updateQuantity(item, 1)}
          className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
        >
          + Add
        </button>
      );
    }

    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={submitting}
          onClick={() => updateQuantity(item, -1)}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-lg disabled:opacity-50"
          aria-label={`Remove one ${item.name}`}
        >
          −
        </button>

        <span className="min-w-5 text-center font-semibold">
          {quantity}
        </span>

        <button
          type="button"
          disabled={submitting || quantity >= 10}
          onClick={() => updateQuantity(item, 1)}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-lg disabled:opacity-50"
          aria-label={`Add one ${item.name}`}
        >
          +
        </button>
      </div>
    );
  }

  // Submit order to secure Next.js API
  async function placeOrder() {
    if (submitting) return;

    setError("");

    if (!qrId) {
      setError(
        "Please scan your table QR code before placing an order."
      );
      return;
    }

    if (cartItems.length === 0) {
      setError("Your cart is empty.");
      return;
    }

    if (unavailableItems.length > 0) {
      setError(
        "Some items are out of stock. Please remove them."
      );
      return;
    }

    if (totalQuantity > 50) {
      setError(
        "Maximum 50 items are allowed per order."
      );
      return;
    }

    setSubmitting(true);

    // Reuse the same key if a request is retried.
    const key =
      idempotencyKey ?? crypto.randomUUID();

    setIdempotencyKey(key);

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          qrId,
          idempotencyKey: key,
          instructions: instructions.trim(),
          items: cartItems.map((item) => ({
            id: item.id,
            quantity: item.quantity,
          })),
        }),
      });

      const responseText = await response.text();

      let result: Record<string, unknown> = {};

      if (responseText.trim()) {
        try {
          result = JSON.parse(
            responseText
          ) as Record<string, unknown>;
        } catch {
          throw new Error(
            `Invalid server response (HTTP ${response.status})`
          );
        }
      }

      if (!response.ok) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : `Order failed (HTTP ${response.status})`
        );
      }

      if (typeof result.orderId !== "string") {
        throw new Error(
          "The server did not return an order ID."
        );
      }

      const orderId = result.orderId;
      const initialStatus =
        typeof result.status === "string" ? result.status : "received";

      setOrderResult({
        orderId,
        total:
          typeof result.total === "number"
            ? result.total
            : subtotal,
        status: initialStatus,
        replayed: Boolean(result.replayed),
      });

      setActiveOrderId(orderId);
      setActiveOrderStatus(initialStatus);

      try {
        if (qrId && typeof window !== "undefined") {
          localStorage.setItem(
            `smartdine_active_order_${qrId}`,
            JSON.stringify({
              orderId,
              status: initialStatus,
              savedAt: Date.now(),
            })
          );
        }
      } catch (storageErr) {
        console.warn("Unable to save active order to localStorage", storageErr);
      }

      setCart({});
      setInstructions("");
      setIdempotencyKey(null);

      goTo("tracker");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to place your order."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (screen === "tracker" && activeOrderId) {
    return (
      <main className="min-h-screen bg-gray-50 pb-20 text-gray-900">
        <OrderTracker
          orderId={activeOrderId}
          qrId={qrId}
          restaurantName={restaurantName}
          onBackToMenu={() => goTo("menu")}
          onOrderServed={(served) => {
            setActiveOrderStatus("served");
            try {
              if (qrId && typeof window !== "undefined") {
                localStorage.setItem(
                  `smartdine_active_order_${qrId}`,
                  JSON.stringify({
                    orderId: served.id,
                    status: "served",
                    savedAt: Date.now(),
                  })
                );
              }
            } catch {}
          }}
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-28 text-gray-900">
      <div className="mx-auto max-w-3xl px-4 py-6">
        {/* Restaurant heading */}
        <header className="mb-7">
          <h1 className="text-2xl font-bold">
            {restaurantName}
          </h1>

          <p className="mt-1 text-sm text-gray-600">
            SmartDine Digital Ordering
          </p>
        </header>

        {/* ACTIVE / SERVED ORDER BANNER */}
        {activeOrderId && screen !== "success" && (
          <aside
            className={`mb-6 rounded-2xl border p-4 shadow-xs transition-colors ${
              activeOrderStatus === "served"
                ? "border-emerald-300 bg-emerald-50/95"
                : "border-emerald-200 bg-emerald-50/90"
            }`}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                {activeOrderStatus === "served" ? (
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white shadow-xs">
                    ✓
                  </span>
                ) : (
                  <span className="relative mt-1 flex h-3 w-3 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500"></span>
                  </span>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-900">
                      {activeOrderStatus === "served"
                        ? `Order Served (#${activeOrderId.slice(0, 8)})`
                        : `Order in Progress (#${activeOrderId.slice(0, 8)})`}
                    </p>
                    {activeOrderStatus && (
                      <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-800 capitalize">
                        {activeOrderStatus.replace("_", " ")}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-emerald-800">
                    {activeOrderStatus === "served"
                      ? "Your order has been served, enjoy your meal, if you need to order more, please do it from below."
                      : "Your food is being processed in the kitchen."}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => goTo("tracker")}
                className="shrink-0 inline-flex items-center justify-center rounded-xl bg-emerald-800 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-900 transition"
              >
                {activeOrderStatus === "served"
                  ? "View Order Details →"
                  : "Track Live Progress →"}
              </button>
            </div>
          </aside>
        )}

        {/* MENU */}
        {screen === "menu" && (
          <section>
            <h2 className="mb-4 text-xl font-bold">
              Our Menu
            </h2>

            {/* Category filters */}
            <div className="mb-6 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  setSelectedCategory("all")
                }
                className={`rounded-full border px-4 py-2 text-sm font-medium ${
                  selectedCategory === "all"
                    ? "border-black bg-black text-white"
                    : "border-gray-300 bg-white"
                }`}
              >
                All
              </button>

              {sortedCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() =>
                    setSelectedCategory(category.id)
                  }
                  className={`rounded-full border px-4 py-2 text-sm font-medium ${
                    selectedCategory === category.id
                      ? "border-black bg-black text-white"
                      : "border-gray-300 bg-white"
                  }`}
                >
                  {category.name}
                </button>
              ))}
            </div>

            {/* Menu cards */}
            <div className="space-y-3">
              {visibleItems.map((item) => (
                <article
                  key={item.id}
                  className={`rounded-xl border bg-white p-4 shadow-sm ${
                    !item.is_available
                      ? "border-gray-200 opacity-75"
                      : "border-gray-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="font-semibold">
                        {item.name}
                      </h3>

                      {item.description && (
                        <p className="mt-1 text-sm text-gray-600">
                          {item.description}
                        </p>
                      )}

                      {!item.is_available && (
                        <p className="mt-2 text-xs font-semibold text-red-600">
                          Currently unavailable
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <p className="font-semibold">
                      {formatPrice(item.price)}
                    </p>

                    {quantityControls(item)}
                  </div>
                </article>
              ))}

              {visibleItems.length === 0 && (
                <div className="rounded-xl border bg-white p-8 text-center text-gray-600">
                  No menu items in this category.
                </div>
              )}
            </div>
          </section>
        )}

        {/* CART */}
        {screen === "cart" && (
          <section>
            <button
              type="button"
              onClick={() => goTo("menu")}
              className="mb-5 text-sm text-gray-600"
            >
              ← Back to menu
            </button>

            <h2 className="mb-5 text-xl font-bold">
              Your Cart
            </h2>

            {cartItems.length === 0 ? (
              <div className="rounded-xl border bg-white p-8 text-center">
                <p>Your cart is empty.</p>

                <button
                  type="button"
                  onClick={() => goTo("menu")}
                  className="mt-4 rounded-lg bg-black px-5 py-3 text-sm text-white"
                >
                  Browse Menu
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {cartItems.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-xl border bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">
                          {item.name}
                        </h3>

                        <p className="mt-1 text-sm text-gray-600">
                          {formatPrice(item.price)} each
                        </p>

                        {!item.is_available && (
                          <p className="mt-2 text-sm font-semibold text-red-600">
                            Out of Stock — remove this item
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="text-sm text-red-600"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      {quantityControls(item)}

                      <p className="font-semibold">
                        {formatPrice(
                          item.price * item.quantity
                        )}
                      </p>
                    </div>
                  </article>
                ))}

                <div className="rounded-xl border bg-white p-4">
                  <div className="flex justify-between font-bold">
                    <span>Subtotal</span>
                    <span>{formatPrice(subtotal)}</span>
                  </div>

                  <p className="mt-2 text-xs text-gray-500">
                    Taxes and service charges are not
                    included in this demo.
                  </p>
                </div>
              </div>
            )}
          </section>
        )}

        {/* CHECKOUT */}
        {screen === "checkout" && (
          <section>
            <button
              type="button"
              onClick={() => goTo("cart")}
              className="mb-5 text-sm text-gray-600"
            >
              ← Back to cart
            </button>

            <h2 className="mb-5 text-xl font-bold">
              Review Your Order
            </h2>

            <div className="rounded-xl border bg-white p-4">
              <div className="space-y-3">
                {cartItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between gap-3 text-sm"
                  >
                    <span>
                      {item.name} × {item.quantity}
                    </span>

                    <span>
                      {formatPrice(
                        item.price * item.quantity
                      )}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex justify-between border-t pt-4 font-bold">
                <span>Subtotal</span>
                <span>{formatPrice(subtotal)}</span>
              </div>

              <p className="mt-2 text-xs text-gray-500">
                Taxes and service charges are not
                included in this demo.
              </p>
            </div>

            <div className="mt-4 rounded-xl border bg-white p-4">
              <label
                htmlFor="instructions"
                className="font-semibold"
              >
                Special Instructions
              </label>

              <textarea
                id="instructions"
                value={instructions}
                onChange={(event) => {
                  setInstructions(event.target.value);
                  setIdempotencyKey(null);
                }}
                maxLength={500}
                placeholder="e.g. Less spicy, no onions..."
                className="mt-3 min-h-24 w-full rounded-lg border border-gray-300 p-3 text-sm"
              />

              <p className="mt-1 text-right text-xs text-gray-500">
                {instructions.length}/500
              </p>
            </div>

            <div className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
              Your order will be confirmed and sent to the kitchen
only after completing the payment step.
            </div>

            {unavailableItems.length > 0 && (
              <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                Some items are out of stock.
                Remove them before placing your order.
              </div>
            )}

            {!qrId && (
              <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                Scan your table QR code to place an order.
              </div>
            )}
          </section>
        )}

        {/* SUCCESS SCREEN */}
        {screen === "success" && orderResult && (
          <section className="rounded-xl border bg-white p-6 text-center shadow-sm">
            <div className="text-4xl">✓</div>

            <h2 className="mt-4 text-2xl font-bold">
              Order Placed!
            </h2>

            <p className="mt-3 text-gray-600">
              Your order has been sent to the kitchen.
            </p>

            <div className="mt-6 rounded-lg bg-gray-50 p-4 text-left">
              <p className="text-xs text-gray-500">
                Order Reference
              </p>

              <p className="mt-1 break-all text-sm font-semibold">
                {orderResult.orderId}
              </p>

              <p className="mt-4 text-xs text-gray-500">
                Total
              </p>

              <p className="mt-1 font-bold">
                {formatPrice(orderResult.total)}
              </p>

              <p className="mt-4 text-xs text-gray-500">
                Status
              </p>

              <p className="mt-1 font-semibold capitalize">
                {orderResult.status.replaceAll("_", " ")}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                if (activeOrderId) {
                  goTo("tracker");
                } else {
                  goTo("menu");
                }
              }}
              className="mt-6 w-full rounded-xl bg-black py-3.5 text-center text-sm font-bold text-white shadow-xs hover:bg-gray-800 transition"
            >
              Track Live Order Progress →
            </button>

            <button
              type="button"
              onClick={() => {
                setOrderResult(null);
                goTo("menu");
              }}
              className="mt-3 w-full rounded-xl border border-gray-300 bg-white py-3 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
            >
              Back to Menu
            </button>
          </section>
        )}

        {/* Error message */}
        {error && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}
      </div>

      {/* STICKY CART / CHECKOUT BAR */}
      {screen !== "success" && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white px-4 py-3 shadow-lg">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">
                {totalQuantity}{" "}
                {totalQuantity === 1 ? "item" : "items"}
              </p>

              <p className="text-sm text-gray-700">
                {formatPrice(subtotal)}
              </p>
            </div>

            {screen === "menu" && (
              <button
                type="button"
                disabled={totalQuantity === 0}
                onClick={() => goTo("cart")}
                className="rounded-lg bg-black px-5 py-3 text-sm font-semibold text-white disabled:bg-gray-400"
              >
                View Cart →
              </button>
            )}

            {screen === "cart" && (
              <button
                type="button"
                disabled={
                  totalQuantity === 0 ||
                  unavailableItems.length > 0
                }
                onClick={() => goTo("checkout")}
                className="rounded-lg bg-black px-5 py-3 text-sm font-semibold text-white disabled:bg-gray-400"
              >
                Checkout →
              </button>
            )}

            {screen === "checkout" && (
              <button
                type="button"
                disabled={
                  submitting ||
                  !qrId ||
                  totalQuantity === 0 ||
                  unavailableItems.length > 0
                }
                onClick={() => void placeOrder()}
                className="rounded-lg bg-black px-5 py-3 text-sm font-semibold text-white disabled:bg-gray-400"
              >
                {submitting
                  ? "Placing Order..."
                  : "Continue to Payment"}
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
