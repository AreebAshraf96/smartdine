
import { Suspense } from "react";
import { supabase } from "@/lib/supabase";

async function RestaurantMenu() {
  const { data: restaurant, error: restaurantError } =
    await supabase
      .from("restaurants")
      .select("id, name")
      .eq("slug", "smartdine-demo")
      .single();

  if (restaurantError || !restaurant) {
    return (
      <p className="p-8 text-red-600">
        Restaurant not found: {restaurantError?.message}
      </p>
    );
  }

  const { data: items, error } = await supabase
    .from("menu_items")
    .select("id, name, description, price, is_available")
    .eq("restaurant_id", restaurant.id)
    .eq("is_active", true)
    .order("name");

  if (error) {
    return (
      <p className="p-8 text-red-600">
        Error loading menu: {error.message}
      </p>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 text-gray-900">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-2 text-3xl font-bold">
          {restaurant.name}
        </h1>

        <p className="mb-8 text-gray-600">
          Welcome! Explore our menu.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {items?.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border bg-white p-5 shadow-sm"
            >
              <h2 className="text-xl font-semibold">
                {item.name}
              </h2>

              <p className="mt-2 text-sm text-gray-600">
                {item.description}
              </p>

              <div className="mt-4 flex justify-between">
                <span className="font-bold">
                  PKR {Number(item.price).toLocaleString()}
                </span>

                <span
                  className={
                    item.is_available
                      ? "text-green-700"
                      : "text-red-600"
                  }
                >
                  {item.is_available
                    ? "Available"
                    : "Sold out"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="p-8 text-gray-900">
          Loading SmartDine menu...
        </main>
      }
    >
      <RestaurantMenu />
    </Suspense>
  );
}
