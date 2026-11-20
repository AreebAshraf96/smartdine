"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "@/lib/supabase";
import { getPublicSiteUrl, isLocalOnly, tableQrUrl } from "@/lib/siteUrl";

type Restaurant = { id: string; name: string };
type Table = { id: string; restaurant_id: string; table_number: string | number; qr_code_id: string; is_active: boolean };

const QR_OPTIONS = { errorCorrectionLevel: "M" as const, margin: 2, color: { dark: "#000000", light: "#ffffff" } };

// Table numbers are stored as text, so sort "2" before "10".
function compareTables(a: Table, b: Table) {
  return String(a.table_number).localeCompare(String(b.table_number), undefined, { numeric: true, sensitivity: "base" });
}

function safeFilePart(value: string) {
  return value.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "table";
}

async function fetchTables(): Promise<{ restaurants: Restaurant[]; tables: Table[] }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Sign in again");
  const res = await fetch("/api/staff/tables", { cache: "no-store", headers: { Authorization: `Bearer ${session.access_token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return { restaurants: data.restaurants ?? [], tables: data.tables ?? [] };
}

// Renders a printable card (restaurant name, QR, table number) and downloads it as PNG.
async function downloadTablePng(url: string, tableNumber: string, restaurantName: string) {
  const width = 1000, height = 1300, qrSize = 800;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser cannot create images");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#111111";
  ctx.textAlign = "center";
  ctx.font = "600 52px system-ui, sans-serif";
  ctx.fillText(restaurantName, width / 2, 110, width - 80);

  const qrCanvas = document.createElement("canvas");
  await QRCode.toCanvas(qrCanvas, url, { ...QR_OPTIONS, width: qrSize });
  ctx.drawImage(qrCanvas, (width - qrSize) / 2, 160, qrSize, qrSize);

  ctx.font = "bold 96px system-ui, sans-serif";
  ctx.fillText(`Table ${tableNumber}`, width / 2, 1080);
  ctx.font = "44px system-ui, sans-serif";
  ctx.fillStyle = "#444444";
  ctx.fillText("Scan to view the menu and order", width / 2, 1160, width - 80);

  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Unable to create image");
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = `smartdine-table-${safeFilePart(tableNumber)}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export default function ManagerQrCodes() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [restaurantId, setRestaurantId] = useState("");
  const [images, setImages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  // Only rendered client-side after sign-in, so window is available here.
  const [baseUrl] = useState(() => getPublicSiteUrl());
  const localOnly = isLocalOnly(baseUrl);

  useEffect(() => {
    let cancelled = false;
    fetchTables()
      .then(data => {
        if (cancelled) return;
        setRestaurants(data.restaurants);
        setTables(data.tables);
        setRestaurantId(prev => prev || data.restaurants[0]?.id || data.tables[0]?.restaurant_id || "");
      })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load tables"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const restaurantName = restaurants.find(r => r.id === restaurantId)?.name ?? "SmartDine";
  const visibleTables = useMemo(
    () => tables.filter(t => t.restaurant_id === restaurantId).sort(compareTables),
    [tables, restaurantId]
  );
  const printCards = useRef<HTMLDivElement>(null);
  const activeTables = visibleTables.filter(t => t.is_active);
  const activeCount = activeTables.length;
  const canPrint = activeCount > 0 && activeTables.every(table => images[table.qr_code_id]);

  async function printTables() {
    const cards = printCards.current;
    if (!canPrint || !cards) return;
    const codes = Array.from(cards.querySelectorAll<HTMLImageElement>("article[data-active] img"));
    try {
      await Promise.all(codes.map(code => code.decode()));
      if (codes.length === activeCount && codes.every(code => code.isConnected)) window.print();
    } catch {
      setError("Unable to load the QR codes for printing.");
    }
  }

  // Generate on-screen QR images locally; table links never leave the browser.
  useEffect(() => {
    if (!baseUrl || !visibleTables.length) return;
    let cancelled = false;
    void Promise.all(visibleTables.map(async t =>
      [t.qr_code_id, await QRCode.toDataURL(tableQrUrl(baseUrl, t.qr_code_id), { ...QR_OPTIONS, width: 480 })] as const
    )).then(entries => { if (!cancelled) setImages(Object.fromEntries(entries)); })
      .catch(() => { if (!cancelled) setError("Unable to generate QR codes"); });
    return () => { cancelled = true; };
  }, [baseUrl, visibleTables]);

  async function changeTable(action: "add" | "rename" | "toggle" | "remove", table?: Table) {
    if (!restaurantId) return;
    const label = action === "add" || action === "rename"
      ? window.prompt("Table name or number", table ? String(table.table_number) : "")
      : null;
    if ((action === "add" || action === "rename") && !label?.trim()) return;
    if (action === "remove" && !window.confirm("Remove this table and disable its QR code?")) return;

    await run(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in again");
      const response = await fetch("/api/staff/tables/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action, restaurantId, tableId: table?.id, label, active: !table?.is_active }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to save table");
      setTables((await fetchTables()).tables);
    }, "Table changes saved.");
  }

  async function run(fn: () => Promise<unknown>, success: string) {
    setError(""); setMessage("");
    try { await fn(); setMessage(success); }
    catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); }
  }

  return <section className="space-y-5">
    <div className="print:hidden space-y-2">
      <h2 className="text-xl font-semibold">Table QR Codes</h2>
      <p className="text-sm text-gray-600">Download a code for each table, or print them all on one sheet (choose &quot;Save as PDF&quot; in the print dialog for a PDF). Customers scan the code to open that table&apos;s menu.</p>
      <p className="text-sm text-gray-600">Codes point to: <span className="font-mono">{baseUrl || "(unknown)"}</span></p>
      {localOnly && <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        These codes point to <strong>{baseUrl}</strong>, which only works on this computer. Phones will not be able to open them.
        Set <code>NEXT_PUBLIC_SITE_URL</code> in <code>.env.local</code> to your network address (for testing) or your live domain, then restart the server.
      </div>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {message && <p role="status" className="text-green-700">{message}</p>}
      <div className="flex flex-wrap items-end gap-3">
        {restaurants.length > 1 && <label className="text-sm">Restaurant
          <select className="mt-1 block rounded border bg-white p-2" value={restaurantId} onChange={e => setRestaurantId(e.target.value)}>
            {restaurants.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>}
        <button type="button" disabled={!restaurantId} onClick={() => void changeTable("add")} className="rounded border bg-white px-4 py-2 disabled:opacity-50">Add table</button>
        <button type="button" disabled={!canPrint} onClick={() => void printTables()} className="rounded bg-black px-4 py-2 text-white disabled:opacity-50">
          Print all ({activeCount})
        </button>
      </div>
    </div>

    <h2 className="hidden print:block text-center text-2xl font-bold">{restaurantName}</h2>

    {loading && <p className="print:hidden">Loading tables...</p>}
    {!loading && !error && !visibleTables.length && <p className="print:hidden text-gray-600">No tables found for this restaurant.</p>}

    <div ref={printCards} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-2 print:gap-6">
      {visibleTables.map(table => {
        const url = tableQrUrl(baseUrl, table.qr_code_id);
        const label = String(table.table_number);
        return <article key={table.id} data-active={table.is_active || undefined} className={`break-inside-avoid rounded-xl border bg-white p-4 text-center print:border-gray-400 ${table.is_active ? "" : "opacity-60 print:hidden"}`}>
          <p className="hidden print:block text-sm font-medium">{restaurantName}</p>
          {images[table.qr_code_id]
            // eslint-disable-next-line @next/next/no-img-element -- generated data URL, next/image adds nothing here
            ? <img src={images[table.qr_code_id]} alt={`QR code for table ${label}`} className="mx-auto h-48 w-48 print:h-[6.5cm] print:w-[6.5cm]" />
            : <div className="mx-auto h-48 w-48 animate-pulse rounded bg-gray-100" />}
          <p className="mt-2 text-2xl font-bold">Table {label}</p>
          <p className="hidden print:block text-sm">Scan to view the menu and order</p>
          {!table.is_active && <p className="mt-1 inline-block rounded bg-gray-200 px-2 py-0.5 text-xs font-semibold">Inactive</p>}
          <p className="mt-1 break-all font-mono text-[10px] text-gray-500">{url}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2 print:hidden">
            <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => void changeTable("rename", table)}>Rename</button>
            <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => void changeTable("toggle", table)}>{table.is_active ? "Deactivate" : "Activate"}</button>
            <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => void changeTable("remove", table)}>Remove</button>
            <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => void run(() => downloadTablePng(url, label, restaurantName), `Downloaded Table ${label}`)}>Download PNG</button>
            <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => void run(() => navigator.clipboard.writeText(url), `Link for Table ${label} copied`)}>Copy link</button>
            <a className="rounded border px-3 py-1.5 text-sm" href={url} target="_blank" rel="noopener noreferrer">Open</a>
          </div>
        </article>;
      })}
    </div>
  </section>;
}
