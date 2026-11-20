import { connection, NextResponse } from "next/server";
import { findOrderAtQr } from "@/lib/customerOrderAccess";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

export async function GET(request: Request) {
  await connection();
  try {
    const query = new URL(request.url).searchParams;
    const invoice = query.get("kind") === "invoice";
    const order = await findOrderAtQr(query.get("orderId") ?? "", query.get("qrId") ?? "");
    if (!order) return NextResponse.json({ error: "Order not found for this table" }, { status: 404, headers });

    const { data: receipt, error } = await getSupabaseAdmin().from("order_receipts")
      .select("payment_id,restaurant_name,table_number,method,provider,currency,subtotal,tip_amount,total_amount,items,paid_at")
      .eq("order_id", order.id).eq("restaurant_id", order.restaurant_id)
      .gt("expires_at", new Date().toISOString()).maybeSingle();
    if (error?.code === "PGRST205" || error?.code === "42P01") {
      return NextResponse.json({ error: "Receipt downloads are not configured yet" }, { status: 503, headers });
    }
    if (error) throw error;
    if (!receipt) return NextResponse.json({ error: "This receipt is unpaid or expired" }, { status: 404, headers });

    const money = new Intl.NumberFormat("en", { style: "currency", currency: receipt.currency });
    const format = (amount: number) => escapeHtml(money.format(amount));
    const label = invoice ? "Paid order invoice" : "Payment receipt";
    const items = (receipt.items as { name: string; quantity: number; unit_price: number }[]).map(item =>
      `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.quantity)}</td><td>${format(item.unit_price)}</td><td>${format(item.quantity * item.unit_price)}</td></tr>`
    ).join("");
    const method = receipt.provider === "stripe_test" ? "Stripe test card"
      : receipt.provider === "demo" ? "Simulated card" : receipt.method === "pay_waiter" ? "Cash" : "Card";
    const content = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${label}</title>
<style>body{font:16px system-ui,sans-serif;max-width:44rem;margin:2rem auto;padding:1rem;color:#111}h1,h2{margin:.4rem 0}table{width:100%;border-collapse:collapse;margin:1.5rem 0}th,td{padding:.55rem;text-align:left;border-bottom:1px solid #bbb}td:last-child,th:last-child{text-align:right}dt,dd{display:inline;margin:0}dl div{display:flex;justify-content:space-between;padding:.3rem}@media print{body{margin:0}}</style></head><body>
<h1>${label}</h1><h2>${escapeHtml(receipt.restaurant_name)}</h2>
<p>Reference ${escapeHtml(receipt.payment_id)}<br>Order ${escapeHtml(order.id)}<br>Table ${escapeHtml(receipt.table_number ?? "—")}<br>Paid ${escapeHtml(new Date(receipt.paid_at).toISOString())}<br>Method ${method}</p>
<table><thead><tr><th scope="col">Item</th><th scope="col">Quantity</th><th scope="col">Unit price</th><th scope="col">Amount</th></tr></thead><tbody>${items}</tbody></table>
<dl><div><dt>Subtotal</dt><dd>${format(receipt.subtotal)}</dd></div><div><dt>Tip</dt><dd>${format(receipt.tip_amount)}</dd></div><div><dt><strong>Total paid</strong></dt><dd><strong>${format(receipt.total_amount)}</strong></dd></div></dl>
</body></html>`;
    return new Response(content, { headers: {
      ...headers, "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "Content-Disposition": `attachment; filename="smartdine-${invoice ? "invoice" : "receipt"}-${order.id}.html"`,
    } });
  } catch (error) {
    console.error("Customer receipt download", error);
    return NextResponse.json({ error: "Unable to download this receipt" }, { status: 500, headers });
  }
}
