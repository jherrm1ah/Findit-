# FindIt Naija — Product Idea Bank

A web app for scoring and tracking the 300-product idea bank from the FindIt Naija sourcing
business brief. Originally a spreadsheet; this replaces it with a live, shared catalogue.

## Features

- **Catalogue** — all 300 products across 15 categories. Score each one on the ten criteria
  from the brief's scoring model (Local Difficulty, Problem Strength, Visual Demo Potential,
  Shipping Simplicity, Durability, Profit Margin, Repeat Demand, QC Ease, Return Safety,
  Legal/Safety) on a 1–5 scale. Priority Score is the live average. Filter by category, status,
  search, or "test batch only", and sort by Priority Score.
- **Dashboard** — category rollups (product counts, test-batch counts, average priority score)
  and pipeline status counts (Idea / Testing / Ordered / Launched / Killed).
- Basic ops tracking per product: status, a supplier link, and free-text notes.

## Stack

Next.js (App Router) + TypeScript + Tailwind CSS, with a SQLite database (via `better-sqlite3`)
for storage. No separate backend — API routes live under `app/api/`.

## Running locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000. The SQLite database (`data/findit.db`, gitignored) is created
and seeded automatically from `data/products.json` on first run.

## Data model

Each product row has: category, name, a "first test batch" flag, ten nullable 1–5 score fields,
a status, an optional supplier URL, and notes. Priority Score is computed (not stored) as the
average of whichever score fields are filled in.
