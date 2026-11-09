import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export function validMetaSignature(raw: string, signature: string | null) {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const received = signature.slice(7);
  if (!/^[0-9a-f]{64}$/i.test(received)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
}

export async function sendWhatsApp(to: string, text: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const version = process.env.WHATSAPP_GRAPH_API_VERSION ?? "v23.0";
  if (!token || !phoneId) {
    console.warn("WhatsApp credentials not set; skipping WhatsApp message to", to);
    return;
  }
  const response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(phoneId)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body: text.slice(0, 4000) } })
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`WhatsApp send failed: ${response.status} - ${errorText}`);
    throw new Error(`WhatsApp send failed: ${response.status}`);
  }
}

export async function downloadWhatsAppMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const version = process.env.WHATSAPP_GRAPH_API_VERSION ?? "v23.0";
  if (!token) throw new Error("WHATSAPP_ACCESS_TOKEN missing");

  // Step 1: Look up media URL
  const metaRes = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(mediaId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaRes.ok) throw new Error(`Meta media lookup failed: ${metaRes.status}`);
  const mediaData = (await metaRes.json()) as { url?: string; mime_type?: string };
  if (!mediaData.url) throw new Error("No media URL in Meta response");

  // Step 2: Download binary media file
  const fileRes = await fetch(mediaData.url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!fileRes.ok) throw new Error(`Meta media download failed: ${fileRes.status}`);
  const arrayBuffer = await fileRes.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: mediaData.mime_type || "image/jpeg",
  };
}
