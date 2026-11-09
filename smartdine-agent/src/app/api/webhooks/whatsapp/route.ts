import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { answerMessage } from "@/lib/agent";
import { sendWhatsApp, validMetaSignature } from "@/lib/whatsapp";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && query.get("hub.mode") === "subscribe" && query.get("hub.verify_token") === token) {
    return new Response(query.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

type Incoming = { id?: string; from?: string; type?: string; text?: { body?: string } };
export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 200000 || !validMetaSignature(raw, request.headers.get("x-hub-signature-256"))) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const event = JSON.parse(raw);
    const changes = event?.entry?.flatMap((entry: { changes?: unknown[] }) => entry.changes ?? []) ?? [];
    for (const change of changes) {
      const messages: Incoming[] = change?.value?.messages ?? [];
      for (const message of messages) {
        if (!message.id || !message.from || message.type !== "text" || !message.text?.body) continue;
        const { error } = await db().from("agent_inbound_events").insert({ provider: "whatsapp", event_id: message.id });
        if (error?.code === "23505") continue; // webhook retry already received
        if (error) throw error;
        const result = await answerMessage({ channel: "whatsapp", customerRef: message.from, text: message.text.body });
        await sendWhatsApp(message.from, result.reply);
      }
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("WhatsApp webhook processing failed", err);
    // Production: use a durable background queue and retry failed processing.
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
