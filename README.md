# SmartDine — Local Setup

## 1. Requirements

Install these before starting:

- [Git](https://git-scm.com/downloads)
- [Node.js](https://nodejs.org/) (version 24 LTS recommended; npm is included)
- [Visual Studio Code](https://code.visualstudio.com/) (optional)

Make sure you have accepted the invitation to the private SmartDine GitHub repository.

## 2. Clone the repository

Open a terminal (PowerShell on Windows) and run:

```bash
git clone https://github.com/AreebAshraf96/smartdine.git
cd smartdine
```

If using VS Code, open the folder with:

```bash
code .
```

## 3. Install dependencies

From the `smartdine` folder, run:

```bash
npm ci
```

## 4. Configure Supabase

Create a file called `.env.local` in the project root (beside `package.json`) and add:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
```

Ask your teammate for the shared `smartdine-dev` Supabase project URL and **publishable** key. Do not commit `.env.local` to GitHub.

## 5. Run the application

```bash
npm run dev
```

Open **http://localhost:3000** in your browser.

To stop the development server, press `Ctrl + C` in the terminal.

## 6. Get the latest changes

Before starting new work, run:

```bash
git switch main
git pull origin main
```

Create a separate branch for your work:

```bash
git switch -c feature/your-feature-name
```

**Note:** The table-specific QR page may still be on the `feature/table-qr` branch until merged into `main`.
