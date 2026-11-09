import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { answerMessage } from "@/lib/agent";
import {
  sendWhatsApp,
  downloadWhatsAppMedia,
  validMetaSignature,
} from "@/lib/whatsapp";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (
    token &&
    query.get("hub.mode") === "subscribe" &&
    query.get("hub.verify_token") === token
  ) {
    return new Response(query.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

type Incoming = {
  id?: string;
  from?: string;
  type?: string;
  text?: { body?: string };
  image?: { id?: string; mime_type?: string; caption?: string };
};

export async function POST(request: Request) {
  const raw = await request.text();
  if (
    raw.length > 200000 ||
    !validMetaSignature(raw, request.headers.get("x-hub-signature-256"))
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const event = JSON.parse(raw);
    const changes =
      event?.entry?.flatMap(
        (entry: { changes?: unknown[] }) => entry.changes ?? []
      ) ?? [];

    for (const change of changes) {
      const messages: Incoming[] = change?.value?.messages ?? [];

      for (const message of messages) {
        if (!message.id || !message.from) continue;

        // Deduplicate webhook event
        const { error } = await db()
          .from("agent_inbound_events")
          .insert({ provider: "whatsapp", event_id: message.id });
        if (error?.code === "23505") continue; // retry already received
        if (error) throw error;

        // 1. Text Message Handling
        if (message.type === "text" && message.text?.body) {
          const result = await answerMessage({
            channel: "whatsapp",
            customerRef: message.from,
            text: message.text.body,
          });
          await sendWhatsApp(message.from, result.reply);
          continue;
        }

        // 2. Image / Payment Receipt Handling
        if (message.type === "image" && message.image?.id) {
          const database = db();

          // Check if there is an active order waiting for payment transfer
          const { data: latestOrder } = await database
            .from("agent_orders")
            .select(
              "id, order_number, total_amount, restaurant_id, items, delivery_address, customer_name, customer_phone"
            )
            .eq("customer_ref", message.from)
            .eq("payment_status", "pending_transfer")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (latestOrder) {
            let receiptPublicUrl = "";

            try {
              const { buffer, mimeType } = await downloadWhatsAppMedia(
                message.image.id
              );
              const fileName = `receipts/${latestOrder.id}_${Date.now()}.jpg`;

              const { error: uploadError } = await database.storage
                .from("agent-receipts")
                .upload(fileName, buffer, {
                  contentType: mimeType,
                  upsert: true,
                });

              if (!uploadError) {
                const { data: urlData } = database.storage
                  .from("agent-receipts")
                  .getPublicUrl(fileName);
                receiptPublicUrl = urlData?.publicUrl || fileName;
              }
            } catch (mediaErr) {
              console.error(
                "Failed to download or store receipt image:",
                mediaErr
              );
            }

            // Update order status to verification_pending
            await database
              .from("agent_orders")
              .update({
                payment_status: "verification_pending",
                receipt_image_url:
                  receiptPublicUrl || `meta_media_id:${message.image.id}`,
                updated_at: new Date().toISOString(),
              })
              .eq("id", latestOrder.id);

            // Fetch manager phone
            const { data: rest } = await database
              .from("agent_restaurants")
              .select("manager_phone")
              .eq("id", latestOrder.restaurant_id)
              .single();

            const managerPhone =
              ((rest as Record<string, unknown>)?.manager_phone as string) ||
              "923178018027";

            // Ping the restaurant manager via WhatsApp
            const alertMsg =
              `🚨 *PAYMENT RECEIPT RECEIVED (#${latestOrder.order_number})*\n\n` +
              `*Customer:* ${latestOrder.customer_name || latestOrder.customer_phone}\n` +
              `*Amount to Verify:* PKR ${latestOrder.total_amount}\n` +
              `*Address:* ${latestOrder.delivery_address}\n` +
              `*Receipt Screenshot:* ${receiptPublicUrl || "Received on WhatsApp"}\n\n` +
              `Please check your bank app and dispatch the order!`;

            try {
              await sendWhatsApp(managerPhone, alertMsg);
            } catch (err) {
              console.error("Failed to send WhatsApp alert to manager:", err);
            }

            // Send confirmation to customer
            const customerMsg =
              `Thank you! We have received your payment screenshot for Order #${latestOrder.order_number} (PKR ${latestOrder.total_amount}).\n\n` +
              `Our kitchen team is verifying the receipt and will dispatch your food shortly!`;

            await sendWhatsApp(message.from, customerMsg);
            continue;
          }

          // Image received with no pending order
          await sendWhatsApp(
            message.from,
            "We received your image! If you are ordering food, please let us know what dishes you would like from our menu."
          );
        }
      }
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("WhatsApp webhook processing failed", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
