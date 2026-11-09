import { NextResponse } from "next/server";
import { answerMessage } from "@/lib/agent";

// Deliberately development-only: public chat requires abuse prevention and identity/session verification.
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Demo chat disabled in production" }, { status: 403 });
  try {
    const origin = req.headers.get("origin");
    if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    const raw = await req.text();
    if (raw.length > 5000) return NextResponse.json({ error: "Too large" }, { status: 413 });
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    const { customerRef, text } = body as Record<string, unknown>;
    if (typeof customerRef !== "string" || typeof text !== "string") return NextResponse.json({ error: "Invalid fields" }, { status: 400 });
    return NextResponse.json(await answerMessage({ channel: "web", customerRef, text }));
  } catch (err) { console.error(err); return NextResponse.json({ error: "Unable to respond" }, { status: 500 }); }
}
