# SmartDine Agent — Independent module for home restaurants

This is a **separate Next.js application inside the existing SmartDine repository**. It has its own `src/`, `src/lib/`, `src/components/`, API routes, dependencies, env config and Supabase agent tables. It does **not** modify the main SmartDine ordering app.

## What works in this scaffold

- Local conversational AI chat using OpenAI and server-side function tools.
- Restaurant-scoped menu lookup from `agent_menu_items`.
- Draft cart: add/remove items, view subtotal, hold and resume later.
- Conversation history stored in Supabase, separated per restaurant, channel and customer ID.
- Human handoff flag (manager inbox is **not yet built**).
- WhatsApp Cloud API GET verification, signed POST webhook and outgoing text messages once you connect Meta credentials.
- No online payments or actual order placement. Customer drafts are **not kitchen orders**.

## Folder layout

```text
smartdine/                       # existing QR ordering app (leave unchanged)
  src/
  smartdine-agent/               # this independent app
    src/
      app/                       # separate Next.js pages and APIs
        api/chat/
        api/webhooks/whatsapp/
      components/AgentDemo.tsx
      lib/agent.ts               # OpenAI agent + tool dispatch
      lib/db.ts                  # tenant-aware Supabase connection
      lib/whatsapp.ts            # Meta verification + sending
      types/
    sql/001_agent.sql
    .env.example
    package.json
```

## Run locally (PowerShell)

```powershell
cd C:\Users\hp\SmartDine\smartdine\smartdine-agent
npm install
Copy-Item .env.example .env.local
```

Open `.env.local` and set `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `AGENT_RESTAURANT_ID`.

Run `sql/001_agent.sql` in your development Supabase project. Create an entry in `agent_restaurants`, copy its UUID into `AGENT_RESTAURANT_ID`, then create a few `agent_menu_items` under that UUID. Start:

```powershell
npm run typecheck
npm run dev
```

Open **http://localhost:3001**. The original SmartDine app remains on **http://localhost:3000**.

## WhatsApp setup

For actual WhatsApp messages, configure a Meta Business app and phone number. Set `META_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, and optionally `WHATSAPP_GRAPH_API_VERSION`.

After deployment, configure your webhook callback as `https://your-agent-host/api/webhooks/whatsapp` and use the same verification token. Subscribe to messages. Localhost is not publicly reachable by Meta.

**Warning:** A robust production integration should enqueue incoming messages, handle retries, enforce rate limits, and provide a real human inbox. This initial webhook processes synchronously and is not ready for high-volume deployment. Stay within WhatsApp's applicable messaging rules.

## For home-business restaurants

Every home restaurant should have its own `agent_restaurants` record and menu. This demo uses exactly one restaurant configured with `AGENT_RESTAURANT_ID`. For SaaS multi-tenancy, map each verified WhatsApp phone number or email receiving address to its restaurant at the webhook boundary; do not let customers supply arbitrary restaurant IDs. Each business must own or authorize its communication channel and consent practices.

## Still to implement

1. Secure human manager inbox and notifications; current handoff only flags the conversation.
2. Production-grade webhook queue, retry states, logging and rate limits.
3. Email inbound/outbound adapter (Resend) with verified signatures.
4. Checkout link bridge to SmartDine payment-first ordering, or a home-business order/payment system.
5. Delivery/pickup choice, fees, business hours, cancellations and order tracking.
6. Agent observability, evaluation, safety tests and opt-in customer data retention policies.

Never expose the Supabase service role key or the OpenAI API key in browser code or GitHub.
