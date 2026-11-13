# PRESTIGE Portal (RankTrack)

The University of Santo Tomas PRESTIGE Portal (Performance & Rankings Evaluator of Sustainability, Transparency, & Intelligence for Global Excellence). It brings the work of the Office of the QS/THE Ranking into one place: ranking
methodologies, evidence submitted by units, reviews, reports and public results.

| Area | Path | For |
|---|---|---|
| Public website | `/` | Anyone: rankings, publications, recognition and the Knowledge Center |
| Administration | `/admin` | Rankings Office Administrators |
| Portal | `/portal` | Coordinators and Student Organizers |
| Digital Forms | `/f/<code>` | Anyone with a form link |
| Sign-in and request access | `/signin` | Everyone with a Hub account, or asking for one |

Built with Next.js 16, React 19 and TypeScript. Data and sign-in run on Supabase, with Google as the sign-in provider.
Files are stored in Cloudflare R2, and the site is deployed on Vercel.

## Run it on your computer

### 1. Install the tools

- [Git](https://git-scm.com/downloads)
- [Node.js 24](https://nodejs.org/), which includes npm. CI uses version 24, and Next.js needs at least 20.9.

Check that both work:

```bash
git --version
node --version
```

### 2. Get the code

You need access to the
[Office-of-the-QS-THE-Ranking](https://github.com/Office-of-the-QS-THE-Ranking) GitHub organization.

```bash
git clone https://github.com/Office-of-the-QS-THE-Ranking/RankTrack.git
cd RankTrack
npm ci
```

### 3. Add the keys

Copy the template:

```bash
cp .env.example .env.local
```

On Windows Command Prompt, use `copy .env.example .env.local`.

Ask a project maintainer for the values below and paste them into `.env.local`. Send keys through a password manager,
not chat or email. Git ignores `.env.local`, so it won't be committed.

| Variable | Needed for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Required: the app won't load without it. Already filled in by the template. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Required |
| `SUPABASE_SECRET_KEY` | Required. Server only: never put it in browser code. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_URL` | Optional: file uploads and pictures stored in R2. The bucket names are already in the template. |

`.env.example` explains the rest. You can leave those empty for local work, including `HUB_BOOTSTRAP_ADMIN`.

> [!WARNING]
> These keys connect your computer to the **live Hub database**. Anything you save, approve or delete locally changes
> real data and can notify real people. Look around freely, but don't test with real records unless you mean to change them.

### 4. Start the app

```bash
npm run dev
```

Open <http://localhost:3000>. The first load of each page is slow while it compiles.

### 5. Sign in

The public pages work without signing in. For `/admin` and `/portal`, select **Sign in via Institution Account** and
use your Google account. That account must already have Hub access. If it doesn't, select **Request access** and wait
for the Rankings Office to approve you.

Google sign-in only returns to `localhost:3000` or `localhost:3100`. If port 3000 is taken, use 3100:

```bash
npm run dev -- -p 3100
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Starts the app for local work |
| `npm test` | Runs the unit tests |
| `npm run typecheck` | Checks the TypeScript types |
| `npm run build` | Makes a production build (needs the Supabase keys) |
| `npm start` | Runs the production build |
| `npm run db:types` | Regenerates the database types (needs a linked Supabase project) |
| `npm run db:lint` | Lints the database (needs a linked Supabase project) |

## Troubleshooting

| Problem | Fix |
|---|---|
| Page shows an error, and the terminal says `NEXT_PUBLIC_SUPABASE_URL is not set` | `.env.local` is missing or incomplete. Add the keys (step 3), then restart `npm run dev`. |
| `npm run typecheck` says it can't find a `.webp` module | `next-env.d.ts` hasn't been generated yet. Run `npx next typegen` once, then try again. |
| Google sign-in fails or sends you to the wrong site | Use port 3000 or 3100, on `localhost` rather than `127.0.0.1`. |
| `npm run build` times out on every page | `npm run dev` is running in the same folder. Stop it, then build again. |
| Port 3000 is already in use | Stop the other app, or use port 3100 (step 5). |
| Uploads or some pictures fail | The R2 keys are missing from `.env.local` (step 3). |

## Project layout

```text
src/app/          Pages and server actions: (public), admin, portal, f (forms), api
src/components/   Interface components, grouped by feature
src/lib/          Business logic: governance, analytics, forms, Supabase, R2
src/styles/       Stylesheets
supabase/         Database migrations and Supabase configuration
scripts/          One-off tools: analytics catalogs, form seeds, R2 setup, store tests
tests/            Unit tests (Vitest)
docs/             Longer guides
```

## Before you change anything

- Read [AGENTS.md](AGENTS.md). It sets the rules for toasts, form pickers, field validation and content tabs.
- This version of Next.js differs from older ones. Check `node_modules/next/dist/docs/` before relying on what you remember.
- Run `npm run typecheck` and `npm test` before you push. CI also runs both.

## More documentation

- [Analytics engine](docs/analytics-engine.md)
- [Digital Forms](docs/digital-forms.md)
- [System features](docs/srs-system-features.md)
- [Use case narratives](docs/use-case-narratives.md)
