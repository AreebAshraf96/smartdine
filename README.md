# SmartDine

QR-based restaurant ordering with customer checkout, an owner dashboard, and manager operations. Built using Next.js, TypeScript, Tailwind CSS and Supabase.

> **Development note:** Card payments are currently simulated. No real card is charged. Do not use demo payment mode for live transactions.

## Run SmartDine locally

**Requirements:** Git, Node.js and npm. You need access to the private repository and the development Supabase project.

### First-time setup

```powershell
git clone https://github.com/AreebAshraf96/smartdine.git
cd smartdine
npm ci
```

Create `.env.local` in the project root and get the actual development values privately from your teammate:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_DEV_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY=YOUR_DEV_SECRET_KEY
SMARTDINE_DEMO_PAYMENTS=true
# Optional: address printed table QR codes point to (origin only)
NEXT_PUBLIC_SITE_URL=http://192.168.x.x:3000
```

These are the exact names read by `src/lib/supabase.ts`, `src/lib/supabaseAdmin.ts`, the payment route and the QR generator.

- `NEXT_PUBLIC_SUPABASE_URL` is the project URL only. Do not add `/rest/v1/`.
- The publishable key starts with `sb_publishable_` (a legacy anon key also works). The secret key starts with `sb_secret_` and must stay server-side.
- `SMARTDINE_DEMO_PAYMENTS=true` enables simulated card payments. It is for local testing only and is ignored in production builds.
- `NEXT_PUBLIC_SITE_URL` is optional. See [Generate table QR codes](#generate-table-qr-codes).

Keep `.env.local` private and never commit it. Restart `npm run dev` after editing it.

```powershell
npm run dev
```

Open **http://localhost:3000**. Stop with **Ctrl+C**. If Next.js switches to port 3001, stop the other local instance before using the links below.

### Existing clone: get teammates' latest code

```powershell
git status
git switch main
git pull --ff-only origin main
npm ci
npm run dev
```

If `git status` shows local changes, commit or stash them safely *before* switching branches. Local code pulls **do not** import Supabase tables, functions or migrations; the connected database must be configured separately.

## Important local links

| Page | URL | Access |
| --- | --- | --- |
| Customer menu | http://localhost:3000 | Public browse page |
| Table 1 QR menu | http://localhost:3000/r/c970d75e-4aa6-4f6d-b8c5-3f4b2fe646be | Customer |
| Table 2 QR menu | http://localhost:3000/r/48429211-2c11-4795-b100-382a9da44e3f | Customer |
| Table 3 QR menu | http://localhost:3000/r/2d0b77da-150f-47d6-9ece-b555282264bd | Customer |
| Table 4 QR menu | http://localhost:3000/r/7cde9e36-5937-47d6-9ece-b555282264bd | Customer |
| Table 5 QR menu | http://localhost:3000/r/7f892a98-5c1c-438c-b070-52fd6f390fe4 | Customer |
| Staff login | http://localhost:3000/staff/login | Owner / Manager |
| Manager operations | http://localhost:3000/staff/manager | Manager / Owner permissions via app |
| Owner analytics | http://localhost:3000/staff/owner | Owner only |

The five QR UUIDs are **demo data**. They work only if the corresponding `restaurant_tables` rows exist in your Supabase development database. You can open these URLs directly to test QR ordering; physical QR codes are not needed for local testing.

## Quick test

1. Open **Table 1**. Add an available dish and continue to payment.
2. Choose **Card (Demo)** and optionally add a tip. Confirm that the order reaches the restaurant queue without a real charge.
3. Repeat with **Pay Cash**. The order must remain outside the cooking queue until a **manager or owner** approves the cash request.
4. Sign in at `/staff/login`. **Manager** can handle orders, cash approvals, waiter calls, stock and menu editing; **owner** can do all that plus view analytics.
5. Mark an order **Preparing → Ready → Served**, then check customer tracking and feedback.
6. In `/staff/owner`, check date and payment-method filters, cash/card transaction counts, totals, popular dishes and peak periods.

## Generate table QR codes

1. Sign in at `/staff/login` as a manager or owner and open `/staff/manager`.
2. Open the **QR Codes** tab.
3. Click **Download PNG** on a table for a single printable image, or **Print all** to print every active table. Choose "Save as PDF" in the print dialog to get a PDF.

Inactive tables are shown but left out of **Print all**.

Codes point to `NEXT_PUBLIC_SITE_URL`, or to the address the dashboard is open on if that is unset. A `localhost` address only works on your computer, and the page warns you when that's the case.

### Test QR codes on a phone

1. Run `ipconfig` and copy your Wi-Fi **IPv4 Address** (e.g. `192.168.0.136`).
2. In `.env.local` set `NEXT_PUBLIC_SITE_URL=http://192.168.0.136:3000`.
3. Start the server so other devices on the network can reach it:

   ```powershell
   npm run dev -- -H 0.0.0.0
   ```

   If Windows Firewall asks, allow Node.js on **private** networks only.
4. Download a table's code and scan it with a phone on the same Wi-Fi. The menu should open for that table.

Your network address can change. If phones stop connecting, run `ipconfig` again and update `.env.local`.

## Checks and collaboration

```powershell
npx tsc --noEmit
npm run build
```

Repository: https://github.com/AreebAshraf96/smartdine

Development tracker: **SmartDine_Project_Tracker.xlsx** (keep it alongside this README in the repository root).

**Production readiness:** A successful local test is not approval to process live payments. Complete gateway integration, webhooks, reconciliation, security reviews, deployment and a restaurant pilot before real-world use.
