# SmartDine

QR-based restaurant ordering with customer checkout, an owner dashboard, and manager operations. Built using Next.js, TypeScript, Tailwind CSS and Supabase.

> **Development note:** Card checkout supports Stripe test mode or local simulation. Use a development Supabase project for either mode.

## Project status

- QR ordering, cash approval, and kitchen tracking have been tested locally from Table 1 through service.
- Staff can generate table QR codes, manage tables, view seven-day receipt archives, handle cancellations and full refunds, and record end-of-day reconciliation.
- Customers can download a printable receipt or paid invoice from the order tracker. Owners can review and export sales and payment reports.
- Stripe Checkout and refunds are implemented for test mode. A full Stripe test-mode run, restaurant onboarding, and production deployment remain pending.

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
2. With local simulation enabled, choose **Pay by Card (Test)** and optionally add a tip. Confirm that the order reaches the restaurant queue without a real charge.
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

## Stripe test checkout

Use a development Supabase project because paid test orders enter the kitchen queue and financial reports. Add these server-only values to `.env.local`:

```dotenv
STRIPE_TEST_SECRET_KEY=YOUR_STRIPE_TEST_SECRET_KEY
STRIPE_TEST_WEBHOOK_SECRET=YOUR_STRIPE_WEBHOOK_SIGNING_SECRET
STRIPE_TEST_RETURN_ORIGIN=http://localhost:3000
SMARTDINE_DEMO_PAYMENTS=false
```

For a local run, sign in to the Stripe CLI and run `stripe listen --events checkout.session.completed,checkout.session.expired --forward-to localhost:3000/api/webhooks/stripe`. Use the listener's webhook signing secret above. For staging, configure a test-mode webhook endpoint for both events and set the return origin to the staging HTTPS origin. The customer browser must open the table menu on that same origin so it can restore the order after the redirect.

Restart the app, scan a development table code, choose **Pay by Card (Test)**, and complete Checkout with a Stripe test card. Check that the order stays pending until the signed webhook arrives, then appears in the kitchen queue. In the Stripe dashboard, the Checkout Session's SmartDine payment and order IDs are available in its metadata. An expired test checkout requires a new order.

## Reporting time zones

Set the optional server-side `SMARTDINE_RESTAURANT_TIME_ZONES` environment variable to a JSON object mapping restaurant IDs to IANA time zones, for example `{"restaurant-uuid":"Australia/Sydney"}`. Restaurants without an entry continue to use `Asia/Karachi`. Restart the app after changing the setting.

## Order receipts

Apply [the receipts migration](supabase/migrations/202611200001_order_receipts.sql) to the SmartDine Supabase database after the existing order and payment schema is installed. The migration enables Supabase Cron, captures paid receipts from the previous seven days, and schedules cleanup every minute.

Owners and managers can open **Receipts** directly in their respective staff dashboards for their restaurants. A receipt expires 168 hours after payment confirmation, and the scheduled job deletes expired copies even when the app is offline. Orders and payment records still support operations and reporting.

## Staff operations

Apply the [table management](supabase/migrations/202611200002_table_management.sql) and [refunds and reconciliation](supabase/migrations/202611200003_refunds_reconciliation.sql) migrations after the receipts migration. Run the three migration files in numeric order in the Supabase SQL Editor. Skip any migration already applied successfully. These changes use the existing SmartDine schema.

- In **QR Codes**, staff can add and rename tables, deactivate or reactivate them, or remove them from the active staff list. Removed tables stay inactive in the database so order history keeps its table reference.
- In **Refunds & cancellations**, staff can find an order by its full ID. A paid order needs a full refund before cancellation. For cash, return the money before recording the refund. Stripe refunds apply to test-mode payments made after the migration. Pending or partial Stripe refunds must be reviewed in Stripe. Cancellation preserves the original items and does not replenish stock automatically.
- The customer order tracker offers printable HTML receipt and paid-invoice downloads for seven days after payment. Customers can save these as PDF from the browser print dialog.
- Under **Reconciliation**, enter the day's counted cash and the card processor's net transaction amount in PKR before fees. The saved close records expected amounts, variances, and the staff member. Test card activity is displayed separately. Use the processor's report for the same business date and currency.

## Checks and collaboration

```powershell
npx tsc --noEmit
npm run build
```

Repository: https://github.com/AreebAshraf96/smartdine

Development tracker: **SmartDine_Project_Tracker.xlsx** (keep it alongside this README in the repository root).

**Production readiness:** A successful local test is not approval to process live payments. Complete gateway integration, webhooks, reconciliation, security reviews, deployment and a restaurant pilot before real-world use.
