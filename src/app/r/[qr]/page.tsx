
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import CustomerMenu from "@/components/CustomerMenu";

// Next.js 16 dynamic route parameters
type Props = {
  params: Promise<{ qr: string }>;
};

// Loads the restaurant and table using the QR identifier
async function TableMenu({ params }: Props) {
  // The folder is named [qr], so the parameter is qr
  const { qr } = await params;
  const qrId = qr;

  // 1. Validate QR identifier
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!qrId || !uuidPattern.test(qrId)) {
    notFound();
  }

  // 2. Find the restaurant and table using Supabase
  const { data: qrRows, error: qrError } =
    await supabase.rpc("resolve_table_qr", {
      p_qr_id: qrId,
    });

  if (qrError) {
    console.error(
      "SmartDine QR lookup error:",
      qrError.message
    );

    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6 text-gray-900">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold">
            Unable to Load Table
          </h1>

          <p className="mt-3 text-gray-600">
            We couldn't verify this table's QR code.
            Please try scanning again or ask a waiter
            for assistance.
          </p>
        </div>
      </main>
    );
  }

  const table = qrRows?.[0];

  // 3. Handle invalid or inactive tables
  if (!table) {
    notFound();
  }

  // 4. Fetch menu categories
  const { data: categories, error: categoriesError } =
    await supabase
      .from("menu_categories")
      .select("id, name, sort_order")
      .eq("restaurant_id", table.restaurant_id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

  if (categoriesError) {
    console.error(
      "SmartDine category error:",
      categoriesError.message
    );

    return (
      <main className="min-h-screen bg-gray-50 p-8 text-red-600">
        Unable to load menu categories.
        Please refresh the page.
      </main>
    );
  }

  // 5. Fetch menu items
  const { data: items, error: itemsError } =
    await supabase
      .from("menu_items")
      .select(
        "id, category_id, name, description, price, is_available"
      )
      .eq("restaurant_id", table.restaurant_id)
      .eq("is_active", true)
      .order("name", { ascending: true });

  if (itemsError) {
    console.error(
      "SmartDine menu error:",
      itemsError.message
    );

    return (
      <main className="min-h-screen bg-gray-50 p-8 text-red-600">
        Unable to load the restaurant menu.
        Please refresh the page.
      </main>
    );
  }

  // 6. Format item prices
  const formattedItems = (items ?? []).map((item) => ({
    id: item.id,
    category_id: item.category_id,
    name: item.name,
    description: item.description,
    price: Number(item.price),
    is_available: item.is_available,
  }));

  // 7. Display the table and customer menu
  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      {/* Table identification banner */}
      <div className="border-b border-gray-200 bg-white px-4 py-4 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          SmartDine Table Ordering
        </p>

        <h2 className="mt-1 text-xl font-bold">
          Table {table.table_number}
        </h2>

        <p className="mt-1 text-sm text-gray-600">
          Your table has been identified successfully
        </p>
      </div>

      {/* Existing customer ordering interface */}
      <CustomerMenu
        restaurantName={table.restaurant_name}
        categories={categories ?? []}
        items={formattedItems}
      />
    </main>
  );
}

// Suspense boundary required for dynamic data in Next.js 16
export default function QRPage({ params }: Props) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-gray-50 p-8 text-gray-900">
          <p className="text-gray-600">
            Loading your table menu...
          </p>
        </main>
      }
    >
      <TableMenu params={params} />
    </Suspense>
  );
}
