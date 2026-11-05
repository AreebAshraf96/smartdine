
import { Suspense } from "react";
import { supabase } from "@/lib/supabase";
import CustomerMenu from "@/components/CustomerMenu";

async function RestaurantMenu() {
  // Fetch the demo restaurant
  const { data: restaurant, error: restaurantError } =
    await supabase
      .from("restaurants")
      .select("id, name")
      .eq("slug", "smartdine-demo")
      .eq("is_active", true)
      .single();

  if (restaurantError || !restaurant) {
    return (
      <main className="min-h-screen bg-gray-50 p-8 text-red-600">
        Restaurant not found:{" "}
        {restaurantError?.message ?? "No matching restaurant"}
      </main>
    );
  }

  // Fetch active menu categories
  const { data: categories, error: categoriesError } =
    await supabase
      .from("menu_categories")
      .select("id, name, sort_order")
      .eq("restaurant_id", restaurant.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

  if (categoriesError) {
    return (
      <main className="min-h-screen bg-gray-50 p-8 text-red-600">
        Error loading categories: {categoriesError.message}
      </main>
    );
  }

  // Fetch active menu items
  const { data: items, error: itemsError } =
    await supabase
      .from("menu_items")
      .select(
        "id, category_id, name, description, price, is_available"
      )
      .eq("restaurant_id", restaurant.id)
      .eq("is_active", true)
      .order("name", { ascending: true });

  if (itemsError) {
    return (
      <main className="min-h-screen bg-gray-50 p-8 text-red-600">
        Error loading menu: {itemsError.message}
      </main>
    );
  }

  // Convert database prices to numbers
  const formattedItems = (items ?? []).map((item) => ({
    id: item.id,
    category_id: item.category_id,
    name: item.name,
    description: item.description,
    price: Number(item.price),
    is_available: item.is_available,
  }));

  return (
    <CustomerMenu
      restaurantName={restaurant.name}
      items={formattedItems}
      categories={categories ?? []}
    />
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-gray-50 p-8 text-gray-900">
          Loading SmartDine menu...
        </main>
      }
    >
      <RestaurantMenu />
    </Suspense>
  );
}
