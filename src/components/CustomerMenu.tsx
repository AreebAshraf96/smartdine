
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

export default function CustomerMenu({
  restaurantName,
  items,
  categories,
}: Props) {
  const [cart, setCart] = useState<Cart>({});
  const [selectedCategory, setSelectedCategory] =
    useState<string>("all");

  // Display only items from the selected category
  const filteredItems = useMemo(() => {
    if (selectedCategory === "all") {
      return items;
    }

    return items.filter(
      (item) => item.category_id === selectedCategory
    );
  }, [items, selectedCategory]);

  // Add an item to the cart
  const addToCart = (id: string) => {
    const item = items.find((menuItem) => menuItem.id === id);

    if (!item || !item.is_available) {
      return;
    }

    setCart((previous) => ({
      ...previous,
      [id]: (previous[id] ?? 0) + 1,
    }));
  };

  // Remove one quantity from the cart
  const removeFromCart = (id: string) => {
    setCart((previous) => {
      const updated = { ...previous };
      const newQuantity = (updated[id] ?? 0) - 1;

      if (newQuantity <= 0) {
        delete updated[id];
      } else {
        updated[id] = newQuantity;
      }

      return updated;
    });
  };

  // Calculate cart item count
  const itemCount = useMemo(() => {
    return items.reduce(
      (sum, item) =>
        sum +
        (item.is_available ? (cart[item.id] ?? 0) : 0),
      0
    );
  }, [items, cart]);

  // Calculate total cart price
  const total = useMemo(() => {
    return items.reduce(
      (sum, item) =>
        sum +
        (item.is_available
          ? item.price * (cart[item.id] ?? 0)
          : 0),
      0
    );
  }, [items, cart]);

  // Price formatting
  const formatPrice = (price: number) => {
    return `PKR ${price.toLocaleString("en-PK", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
  };

  return (
    <main className="min-h-screen bg-gray-50 pb-28 text-gray-900">
      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* Restaurant header */}
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">
            {restaurantName}
          </h1>

          <p className="mt-2 text-gray-600">
            Explore our menu and add your favourites.
          </p>
        </header>

        {/* Category filters */}
        <nav
          aria-label="Menu categories"
          className="mb-6 flex gap-2 overflow-x-auto pb-3"
        >
          <button
            type="button"
            onClick={() => setSelectedCategory("all")}
            className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-medium transition-colors ${
              selectedCategory === "all"
                ? "bg-black text-white"
                : "border border-gray-200 bg-white text-gray-800 hover:bg-gray-100"
            }`}
          >
            All
          </button>

          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setSelectedCategory(category.id)}
              className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-medium transition-colors ${
                selectedCategory === category.id
                  ? "bg-black text-white"
                  : "border border-gray-200 bg-white text-gray-800 hover:bg-gray-100"
              }`}
            >
              {category.name}
            </button>
          ))}
        </nav>

        {/* Menu item list */}
        {filteredItems.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-600">
            No menu items available in this category.
          </div>
        ) : (
          <div className="space-y-4">
            {filteredItems.map((item) => {
              const quantity = cart[item.id] ?? 0;

              return (
                <article
                  key={item.id}
                  className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-col gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">
                        {item.name}
                      </h2>

                      {item.description && (
                        <p className="mt-1 text-sm text-gray-600">
                          {item.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold">
                        {formatPrice(item.price)}
                      </span>

                      {!item.is_available ? (
                        <span className="text-sm font-medium text-red-600">
                          Sold out
                        </span>
                      ) : quantity === 0 ? (
                        <button
                          type="button"
                          onClick={() => addToCart(item.id)}
                          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
                        >
                          + Add
                        </button>
                      ) : (
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => removeFromCart(item.id)}
                            aria-label={`Remove one ${item.name}`}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-lg hover:bg-gray-100"
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
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-lg hover:bg-gray-100"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Fixed cart summary */}
      {itemCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white p-4 shadow-lg">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
            <div>
              <p className="font-semibold">
                {itemCount}{" "}
                {itemCount === 1 ? "item" : "items"} in cart
              </p>

              <p className="text-sm text-gray-600">
                {formatPrice(total)}
              </p>
            </div>

            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded-lg bg-gray-400 px-5 py-3 text-sm font-semibold text-white"
            >
              Checkout coming soon
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
