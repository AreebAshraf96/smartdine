
"use client";

import { useMemo, useState } from "react";

type MenuItem = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  is_available: boolean;
};

type Category = {
  id: string;
  name: string;
  sort_order: number;
};

type Props = {
  restaurantName: string;
  items: MenuItem[];
  categories: Category[];
};

type Cart = Record<string, number>;
type View = "menu" | "cart" | "checkout";

export default function CustomerMenu({
  restaurantName,
  items,
  categories,
}: Props) {
  const [cart, setCart] = useState<Cart>({});
  const [selectedCategory, setSelectedCategory] =
    useState("all");
  const [view, setView] = useState<View>("menu");
  const [specialInstructions, setSpecialInstructions] =
    useState("");

  const formatPrice = (price: number) =>
    `PKR ${price.toLocaleString("en-PK", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;

  const addToCart = (id: string) => {
    const item = items.find((i) => i.id === id);

    if (!item || !item.is_available) return;

    setCart((previous) => ({
      ...previous,
      [id]: (previous[id] ?? 0) + 1,
    }));
  };

  const removeFromCart = (id: string) => {
    setCart((previous) => {
      const updated = { ...previous };
      const quantity = (updated[id] ?? 0) - 1;

      if (quantity <= 0) {
        delete updated[id];
      } else {
        updated[id] = quantity;
      }

      return updated;
    });
  };

  const filteredItems = useMemo(
    () =>
      selectedCategory === "all"
        ? items
        : items.filter(
            (item) => item.category_id === selectedCategory
          ),
    [items, selectedCategory]
  );

  const cartItems = useMemo(
    () =>
      items.filter(
        (item) =>
          item.is_available && (cart[item.id] ?? 0) > 0
      ),
    [items, cart]
  );

  const itemCount = cartItems.reduce(
    (sum, item) => sum + cart[item.id],
    0
  );

  const subtotal = cartItems.reduce(
    (sum, item) => sum + item.price * cart[item.id],
    0
  );

  const hasUnavailableItems = items.some(
    (item) => !item.is_available && (cart[item.id] ?? 0) > 0
  );

  const clearCart = () => {
    setCart({});
    setSpecialInstructions("");
    setView("menu");
  };

  const quantityControls = (item: MenuItem) => {
    const quantity = cart[item.id] ?? 0;

    if (!item.is_available) {
      return (
        <span className="text-sm font-medium text-red-600">
          Sold out
        </span>
      );
    }

    if (quantity === 0) {
      return (
        <button
          type="button"
          onClick={() => addToCart(item.id)}
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          + Add
        </button>
      );
    }

    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => removeFromCart(item.id)}
          aria-label={`Remove one ${item.name}`}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 hover:bg-gray-100"
        >
          −
        </button>

        <span className="min-w-5 text-center font-semibold">
          {quantity}
        </span>

        <button
          type="button"
          onClick={() => addToCart(item.id)}
          aria-label={`Add one ${item.name}`}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 hover:bg-gray-100"
        >
          +
        </button>
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-gray-50 pb-32 text-gray-900">
      <div className="mx-auto max-w-3xl px-4 py-6">
        {/* Restaurant Header */}
        <header className="mb-6">
          <h1 className="text-3xl font-bold">
            {restaurantName}
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            SmartDine Digital Ordering
          </p>
        </header>

        {/* MENU VIEW */}
        {view === "menu" && (
          <section>
            <h2 className="mb-4 text-2xl font-semibold">
              Our Menu
            </h2>

            {/* Category Filters */}
            <nav
              aria-label="Menu categories"
              className="mb-6 flex gap-2 overflow-x-auto pb-3"
            >
              <button
                type="button"
                onClick={() => setSelectedCategory("all")}
                className={`shrink-0 rounded-full px-5 py-2 text-sm ${
                  selectedCategory === "all"
                    ? "bg-black text-white"
                    : "border bg-white text-gray-900"
                }`}
              >
                All
              </button>

              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() =>
                    setSelectedCategory(category.id)
                  }
                  className={`shrink-0 rounded-full px-5 py-2 text-sm ${
                    selectedCategory === category.id
                      ? "bg-black text-white"
                      : "border bg-white text-gray-900"
                  }`}
                >
                  {category.name}
                </button>
              ))}
            </nav>

            <div className="space-y-4">
              {filteredItems.length === 0 && (
                <p className="rounded-xl bg-white p-6 text-gray-600">
                  No items found in this category.
                </p>
              )}

              {filteredItems.map((item) => (
                <article
                  key={item.id}
                  className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
                >
                  <h3 className="text-lg font-semibold">
                    {item.name}
                  </h3>

                  {item.description && (
                    <p className="mt-1 text-sm text-gray-600">
                      {item.description}
                    </p>
                  )}

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="font-semibold">
                      {formatPrice(item.price)}
                    </span>
                    {quantityControls(item)}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* CART VIEW */}
        {view === "cart" && (
          <section>
            <button
              type="button"
              onClick={() => setView("menu")}
              className="mb-5 font-medium text-gray-600 hover:text-black"
            >
              ← Continue Shopping
            </button>

            <h2 className="mb-5 text-2xl font-bold">
              Your Cart
            </h2>

            {hasUnavailableItems && (
              <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                Some selected items are unavailable and are
                excluded from your total.
              </p>
            )}

            {cartItems.length === 0 ? (
              <div className="rounded-xl bg-white p-8 text-center">
                <p className="mb-5 text-gray-600">
                  Your cart is empty.
                </p>

                <button
                  type="button"
                  onClick={() => setView("menu")}
                  className="rounded-lg bg-black px-5 py-3 text-white"
                >
                  Browse Menu
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {cartItems.map((item) => (
                    <div
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
                          <p className="mt-2 font-semibold">
                            {formatPrice(
                              item.price * cart[item.id]
                            )}
                          </p>
                        </div>

                        {quantityControls(item)}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={clearCart}
                  className="mt-4 text-sm font-medium text-red-600"
                >
                  Clear Cart
                </button>

                <div className="mt-6 rounded-xl border bg-white p-5">
                  <div className="flex justify-between text-lg font-bold">
                    <span>Subtotal</span>
                    <span>{formatPrice(subtotal)}</span>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    Taxes or service charges are not included
                    in this demo.
                  </p>
                </div>
              </>
            )}
          </section>
        )}

        {/* CHECKOUT VIEW */}
        {view === "checkout" && (
          <section>
            <button
              type="button"
              onClick={() => setView("cart")}
              className="mb-5 font-medium text-gray-600 hover:text-black"
            >
              ← Back to Cart
            </button>

            <h2 className="mb-5 text-2xl font-bold">
              Review Your Order
            </h2>

            <div className="rounded-xl border bg-white p-5">
              <h3 className="mb-4 text-lg font-semibold">
                Order Summary
              </h3>

              {cartItems.map((item) => (
                <div
                  key={item.id}
                  className="mb-3 flex justify-between gap-3 text-sm"
                >
                  <span>
                    {item.name} × {cart[item.id]}
                  </span>
                  <span className="font-medium">
                    {formatPrice(
                      item.price * cart[item.id]
                    )}
                  </span>
                </div>
              ))}

              <div className="mt-4 flex justify-between border-t pt-4 text-lg font-bold">
                <span>Subtotal</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
            </div>

            <div className="mt-5 rounded-xl border bg-white p-5">
              <label
                htmlFor="specialInstructions"
                className="mb-3 block font-semibold"
              >
                Special Instructions
              </label>

              <textarea
                id="specialInstructions"
                value={specialInstructions}
                maxLength={500}
                onChange={(event) =>
                  setSpecialInstructions(event.target.value)
                }
                placeholder="e.g. Less spicy, no onions, extra sauce..."
                rows={4}
                className="w-full resize-y rounded-lg border border-gray-300 p-3 text-sm outline-none focus:border-black"
              />

              <p className="mt-2 text-xs text-gray-500">
                Optional kitchen instructions.
              </p>
            </div>

            <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              This is a checkout preview. Table verification
              and secure order submission are not enabled yet.
            </div>
          </section>
        )}
      </div>

      {/* BOTTOM ACTION BAR */}
      {itemCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white p-4 shadow-lg">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
            <div>
              <p className="font-semibold">
                {itemCount}{" "}
                {itemCount === 1 ? "item" : "items"}
              </p>
              <p className="text-sm text-gray-600">
                {formatPrice(subtotal)}
              </p>
            </div>

            {view === "menu" && (
              <button
                type="button"
                onClick={() => setView("cart")}
                className="rounded-lg bg-black px-5 py-3 text-sm font-semibold text-white"
              >
                View Cart →
              </button>
            )}

            {view === "cart" && (
              <button
                type="button"
                onClick={() => setView("checkout")}
                className="rounded-lg bg-black px-5 py-3 text-sm font-semibold text-white"
              >
                Checkout →
              </button>
            )}

            {view === "checkout" && (
              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded-lg bg-gray-400 px-5 py-3 text-sm font-semibold text-white"
              >
                Place Order (Coming Soon)
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
