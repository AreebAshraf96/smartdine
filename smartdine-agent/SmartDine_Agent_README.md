# SmartDine AI Agent

A standalone conversational restaurant assistant for **home kitchens, home bakers, cloud kitchens, and small food businesses**. It lives inside the SmartDine repository but runs as its **own Next.js app** on port **3001**. The main SmartDine QR-ordering app runs separately on port **3000** and does not need to be running.

> **Project status:** Development prototype. The local chat interface and Supabase-backed restaurant/menu/draft architecture are implemented. Gemini configuration is in progress: the API key successfully listed available models, but a chat request previously returned HTTP 404. **End-to-end AI replies are not yet confirmed working.** WhatsApp/email are not connected, and the agent cannot take payment or submit a confirmed order.

## Quick start (Windows PowerShell)

From the SmartDine repository:

```powershell
cd C:\Users\hp\SmartDine\smartdine\smartdine-agent
npm install
```

If you do not have `.env.local`, create it from the template:

```powershell
Copy-Item .env.example .env.local
```

Edit `smartdine-agent/.env.local` with your **own** credentials:

```dotenv
GEMINI_API_KEY=your_google_ai_studio_api_key
GEMINI_MODEL=gemini-2.5-flash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_secret_key
AGENT_RESTAURANT_ID=your_agent_restaurant_uuid
```

**Note:** The current `agent.ts` uses the `openai` npm package as a compatibility client pointed at Google's Gemini API. It does **not** use an OpenAI API key. Keep the `openai` package installed. If `.env.example` still contains `OPENAI_API_KEY`, follow the Gemini values above and update the example when convenient.

### Where to get credentials

- **Gemini key:** [Google AI Studio – API keys](https://aistudio.google.com/api-keys). Create a key in a project eligible for the free tier. Free usage has quotas; check current model eligibility and billing status before testing. Do not send live customer personal data to a free-tier model without reviewing the provider's data terms.
- **Supabase URL:** Supabase Dashboard → your project → **Integrations → Data API**. Copy the base URL, removing `/rest/v1/` if copied from the REST endpoint.
- **Supabase secret key:** Supabase Dashboard → **Settings → API Keys → Secret keys**. The server-side key typically starts with `sb_secret_`.
- **Agent restaurant ID:** Supabase SQL Editor:

```sql
SELECT id, name, is_active
FROM public.agent_restaurants;
```

Choose an **active** restaurant row, and set its UUID as `AGENT_RESTAURANT_ID`. Do not use a UUID from the main QR app's `restaurants` table unless you have also created an equivalent agent restaurant record.

### Database setup

Run `smartdine-agent/sql/001_agent.sql` **once** in the development Supabase SQL Editor if the agent tables do not exist. This creates the separate `agent_*` tables. Insert a restaurant in `agent_restaurants` and its dishes in `agent_menu_items`. Without restaurant/menu rows, the AI cannot answer menu queries accurately.

Check that the restaurant and menu were created:

```sql
SELECT id, name, is_active FROM public.agent_restaurants;
SELECT restaurant_id, name, price, is_available FROM public.agent_menu_items ORDER BY name;
```

### Run

```powershell
npm run typecheck
npm run dev
```

Open **http://localhost:3001** to test the local chat. You do **not** need to run SmartDine on port 3000, or connect WhatsApp/email, for this test. Supabase and Google's API do require internet access.

## Important links

| Destination | URL |
| --- | --- |
| AI Agent local chat | http://localhost:3001 |
| Main SmartDine local app (separate) | http://localhost:3000 |
| Supabase Dashboard | https://supabase.com/dashboard |
| Gemini API keys | https://aistudio.google.com/api-keys |
| Gemini model/API reference | https://ai.google.dev/gemini-api/docs |
| SmartDine GitHub repository | https://github.com/AreebAshraf96/smartdine |

## Project structure

```text
smartdine/
├── src/                         # Main QR ordering application
├── README.md                    # Main application setup
└── smartdine-agent/             # Independent home-restaurant agent
    ├── src/
    │   ├── app/                 # Chat page and API/webhook routes
    │   │   └── api/
    │   │       ├── chat/
    │   │       └── webhooks/whatsapp/
    │   ├── components/AgentDemo.tsx
    │   ├── lib/
    │   │   ├── agent.ts         # Gemini client and cart/menu tools
    │   │   ├── db.ts            # Supabase server connection
    │   │   └── whatsapp.ts      # Optional Meta integration
    │   └── types/
    ├── sql/001_agent.sql
    ├── .env.example
    ├── .env.local                # Private; do NOT commit
    └── package.json
```

## Current agent capabilities

- Local browser chat for development (no messaging account needed).
- Restaurant-scoped menu lookup with real prices and stock flags from Supabase.
- Draft cart: add/remove items, review quantities and subtotal.
- Save a cart **on hold** and resume later.
- Conversation history saved in Supabase.
- Flag a conversation for human assistance.
- English/Urdu/Roman Urdu conversational instructions (quality not yet validated).
- WhatsApp webhook code exists but requires Meta configuration and production hardening.

**Limits:** The agent currently creates **drafts only**, not paid/confirmed orders. A human handoff flag is not the same as a functioning manager inbox. Customer chats are not connected to WhatsApp or email yet.

## Example local tests

1. `Hi, what's on the menu?`
2. `Add two chicken biryanis and one fries.`
3. `What's my total?`
4. `Hold my order; I'll return later.`
5. `I'm back, add a cold coffee.`
6. `Remove the fries and show my cart.`
7. `I want to speak to the owner.`

Compare prices and availability with `agent_menu_items`; ensure no draft is presented as a paid order.

## Troubleshooting

- **`crypto.randomUUID()` / unstable value / blocking route:** Ensure `AgentDemo.tsx` creates the browser customer reference in `useEffect`, not during React's initial render.
- **`Invalid supabaseUrl` / `ENOTFOUND`:** Copy the **exact base project URL** from Supabase; verify spelling and remove `/rest/v1/`. Restart the development server after changing `.env.local`.
- **`Restaurant unavailable`:** Verify `AGENT_RESTAURANT_ID`, `agent_restaurants.is_active`, and that your secret key belongs to the same Supabase project.
- **`404` in `client.chat.completions.create`:** Verify Gemini endpoint/model compatibility. Check which models the key lists and test a direct Gemini completion before changing the 900-line agent implementation. Listing a model alone does not prove that chat-completions requests work.
- **`429` from Gemini:** You may have hit free-tier quotas or rate limits. Inspect the HTTP response and model/project limits.
- **Multiple lockfiles warning:** Next.js may select the main app's lockfile as the workspace root. Treat this separately from API errors; configure `turbopack.root` for the agent project if needed.

## Optional messaging integrations (not required locally)

WhatsApp Cloud API requires a Meta app, business number, and verification/signing credentials. The starter's webhook route is `/api/webhooks/whatsapp`. Email integration is **not implemented**. Before real customers use either channel, add authenticated tenant routing, retries, duplicate-event handling, rate limiting, human takeover, consent/data-retention rules, and error monitoring.

## Next development tasks

- Resolve the Gemini chat completion error and complete end-to-end local chat tests.
- Improve natural order editing and handling of custom dish instructions.
- Build an owner/manager inbox and real human handoff.
- Build a secure home-business order confirmation/payment flow.
- Add email adapter and connect WhatsApp Cloud API.
- Add per-business onboarding, channel mapping, deployment, logging and automated tests.

## Security and privacy

Never commit `.env.local`, Gemini keys or Supabase secret keys. Never use the Supabase secret key in browser code or variables prefixed `NEXT_PUBLIC_`. Check `git status` before pushing. Use **synthetic customer data** while testing the Gemini free tier.
