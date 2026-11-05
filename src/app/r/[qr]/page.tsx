
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import CustomerMenu from "@/components/CustomerMenu";
import CallWaiter from "@/components/CallWaiter";

type Props = {
  params: Promise<{ qr: string }>;
};

async function TableMenu({ params }: Props) {
  const { qr } = await params;
  const qrId = qr;

  // Validate QR identifier
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!qrId || !uuidPattern.test(qrId)) {
    notFound();
  }

  // Identify restaurant and table
  const { data: qrRows, error: qrError } =
    await supabase.rpc("resolve_table_qr", {
      p_qr_id: qrId,
    });

  if (qrError) {
    console.error(
      "QR lookup error:",
      qrError.message
    );

    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6 text-gray-900">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold">
            Unable to Load Table
          </h1>

          <p className="mt-3 text-gray-600">
            This table could not be verified.
            Please try scanning again.
          </p>
        </div>
      </main>
    );
  }

  const table = qrRows?.[0];

  if (!table) {
    notFound();
  }

  // Load active categories
  const {
    data: categories,
    error: categoriesError,
  } = await supabase
    .from("menu_categories")
    .select("id, name, sort_order")
    .eq("restaurant_id", table.restaurant_id)
    .eq("is_active", true)
    .order("sort_order", {
      ascending: true,
    });

  if (categoriesError) {
    console.error(
      "Category error:",
      categoriesError.message
    );

    return (
      <main className="min-h-screen bg-gray-50 p-8 text-red-600">
        Unable to load menu categories.
      </main>
    );
  }

  // Load active menu items
  const {
    data: items,
    error: itemsError,
  } = await supabase
    .from("menu_items")
    .select(
      "id, category_id, name, description, price, is_available"
    )
    .eq("restaurant_id", table.restaurant_id)
    .eq("is_active", true)
    .order("name", {
      ascending: true,
    });

  if (itemsError) {
    console.error(
      "Menu error:",
      itemsError.message
    );

    return (
      <main className="min-h-screen bg-gray-50 p-8 text-red-600">
        Unable to load restaurant menu.
      </main>
    );
  }

  const formattedItems = (items ?? []).map(
    (item) => ({
      id: item.id,
      category_id: item.category_id,
      name: item.name,
      description: item.description,
      price: Number(item.price),
      is_available: item.is_available,
    })
  );

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      {/* Table identification */}
      <div className="border-b border-gray-200 bg-white px-4 py-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          SmartDine Table Ordering
        </p>

        <h2 className="mt-1 text-xl font-bold">
          Table {table.table_number}
        </h2>

        <p className="mt-1 text-sm text-gray-600">
          Your table has been identified successfully.
        </p>
      </div>

      {/* Call Waiter */}
      <CallWaiter qrId={qrId} />

      {/* Customer menu, cart and checkout */}
      <CustomerMenu
        restaurantName={table.restaurant_name}
        categories={categories ?? []}
        items={formattedItems}
        qrId={qrId}
      />
    </main>
  );
}

export default function QRPage({
  params,
}: Props) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-gray-50 p-8 text-gray-900">
          Loading your table menu...
        </main>
      }
    >
      <TableMenu params={params} />
    </Suspense>
  );
}
