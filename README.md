
# SmartDine

SmartDine is a QR-based restaurant ordering and kitchen
management system built using Next.js, TypeScript,
Tailwind CSS and Supabase.

Customers scan a QR code assigned to their table to
view the menu, place orders and call a waiter.

Restaurant staff use the kitchen dashboard to manage
incoming orders, waiter requests and item availability.

## Requirements

Install the following before starting:

- Node.js (version 24 or another version compatible
  with the project's Next.js dependencies)
- npm
- Git
- Visual Studio Code (recommended)
- Access to the SmartDine Supabase project

## 1. Clone the repository

Open PowerShell or the VS Code terminal:

```bash
git clone https://github.com/AreebAshraf96/smartdine.git
cd smartdine
```

The repository is private. You must have GitHub access
to clone it.

## 2. Install dependencies

Run:

```bash
npm ci
```

This installs the packages specified by package-lock.json.

## 3. Configure environment variables

Create a file named `.env.local` in the project root.

Add:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_publishable_or_anon_key
SUPABASE_SECRET_KEY=your_supabase_secret_key
```

Ask the project owner for the required development
credentials through a secure channel.

Do not commit `.env.local` or secret keys to GitHub.

Use a Supabase project containing the SmartDine
database schema, demo restaurant, menu items, tables,
order functions and staff permissions.

## 4. Start the development server

```bash
npm run dev
```

Open:

http://localhost:3000

If port 3000 is occupied, stop the existing server
before starting another one.

## 5. Customer ordering

General restaurant menu:

http://localhost:3000

Table-specific QR menu:

### Table 1

http://localhost:3000/r/c970d75e-4aa6-4f6d-b8c5-3f4b2fe646be

### Table 2

http://localhost:3000/r/48429211-2c11-4795-b100-382a9da44e3f

### Table 3

http://localhost:3000/r/2d0b77da-150f-47a5-8673-191e4427574a

### Table 4

http://localhost:3000/r/7cde9e36-5937-47d6-9ece-b555282264bd

### Table 5

http://localhost:3000/r/7f892a98-5c1c-438c-b070-52fd6f390fe4

These are development QR identifiers stored in the
SmartDine demo database. They require the corresponding
database records to exist.

### Test customer ordering

1. Open a table-specific QR link.
2. Confirm the correct table number appears.
3. Browse the restaurant menu.
4. Add available items to the cart.
5. Proceed to checkout.
6. Add special instructions if required.
7. Place the order.
8. Confirm that an order reference appears.
9. Open the kitchen dashboard to find the order.

Out-of-stock items should be labelled and cannot
be added to the cart.

## 6. Kitchen dashboard

Open:

http://localhost:3000/staff/kitchen

Sign in with a Supabase staff account assigned to
the demo restaurant.

The kitchen dashboard contains three sections:

### Orders

- View incoming orders.
- Start preparing received orders.
- Mark prepared orders as ready.

### Waiter Calls

- View customer assistance requests.
- Identify the table requesting assistance.
- Mark a waiter request as resolved.

### Stock

- View restaurant menu items.
- Mark an item as out of stock.
- Mark an item as available again.

Refresh the customer menu to see stock changes.

## 7. Test the Call Waiter feature

1. Open the Table 1 QR menu.
2. Click "Call Waiter".
3. Confirm the request is submitted.
4. Open the kitchen dashboard.
5. Select "Waiter Calls".
6. Confirm Table 1 appears.
7. Click "Mark Resolved".
8. Confirm the request disappears.

## 8. Test stock availability

1. Open the kitchen dashboard.
2. Select "Stock".
3. Choose an available menu item.
4. Click "Mark Out of Stock".
5. Refresh the customer's QR menu.
6. Confirm the item displays "Out of Stock".
7. Return to the kitchen dashboard.
8. Click "Mark Available".
9. Refresh the customer menu again.
10. Confirm the item can be ordered again.

## 9. Working with GitHub

Always pull the latest changes before beginning new work.

```bash
git switch main
git pull --ff-only origin main
```

Create a feature branch for new development:

```bash
git switch -c feature/your-feature-name
```

After completing your changes:

```bash
git add .
git commit -m "Describe your changes"
git push -u origin feature/your-feature-name
```

Create a pull request on GitHub for review before
merging into main.

## Technology Stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Supabase PostgreSQL
- Supabase Authentication

## Notes

- The application runs locally during development.
- Supabase database access is required for testing.
- Do not expose service-role or secret keys publicly.
- Staff operations require authorized accounts.
- Production deployment and security testing are
  separate from local development.
```
