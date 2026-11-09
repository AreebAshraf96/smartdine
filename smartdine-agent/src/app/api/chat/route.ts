import { NextResponse } from "next/server";
import { answerMessage } from "@/lib/agent";
import { db } from "@/lib/db";

// Deliberately development-only: public chat requires abuse prevention and identity/session verification.
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Demo chat disabled in production" },
      { status: 403 }
    );
  }

  try {
    const origin = req.headers.get("origin");
    if (origin && origin !== new URL(req.url).origin) {
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    }

    const raw = await req.text();
    if (raw.length > 50000) {
      return NextResponse.json({ error: "Too large" }, { status: 413 });
    }

    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const record = body as Record<string, unknown>;
    const customerRef = record.customerRef;

    if (typeof customerRef !== "string") {
      return NextResponse.json({ error: "Invalid customerRef" }, { status: 400 });
    }

    // Handle demo receipt upload action
    if (record.action === "upload_receipt") {
      const database = db();
      const { data: latestOrder } = await database
        .from("agent_orders")
        .select("id, order_number, total_amount, delivery_address")
        .eq("customer_ref", customerRef)
        .eq("payment_status", "pending_transfer")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestOrder) {
        await database
          .from("agent_orders")
          .update({
            payment_status: "verification_pending",
            receipt_image_url:
              typeof record.imageUrl === "string"
                ? record.imageUrl
                : "https://demo-receipt.jpg",
            updated_at: new Date().toISOString(),
          })
          .eq("id", latestOrder.id);

        return NextResponse.json({
          reply: `Thank you! We have received your payment screenshot for Order #${latestOrder.order_number} (PKR ${latestOrder.total_amount}). Our kitchen team is verifying the receipt and will dispatch your food to ${latestOrder.delivery_address} shortly!`,
          receiptUploaded: true,
        });
      }

      return NextResponse.json({
        reply:
          "Payment screenshot received! Our kitchen team is reviewing it. If you need any assistance with your order, please let us know.",
        receiptUploaded: true,
      });
    }

    const text = record.text;
    if (typeof text !== "string") {
      return NextResponse.json({ error: "Invalid text field" }, { status: 400 });
    }

    return NextResponse.json(
      await answerMessage({ channel: "web", customerRef, text })
    );
  } catch (err) {
    console.error("Chat API error:", err);
    return NextResponse.json(
      { error: "Unable to respond" },
      { status: 500 }
    );
  }
}
