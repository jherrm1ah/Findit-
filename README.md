# FindIt Naija

A request-first marketplace connecting buyers in Jos, Nigeria to verified sellers: tell FindIt
what you need (or browse the catalogue directly), sellers send offers, you pay into escrow and
confirm on delivery.

This is a Next.js port of a mobile-first React prototype, now backed by a real SQLite database:
products, orders, requests/offers, notifications, and seller verification all persist across a
reload. Auth and payments are still stubs (login accepts a guest pass-through; checkout shows the
escrow-held-funds UI as a simulated state) — see "Next steps" below.

## Flows

- **Splash → Onboarding → Login** (or "Continue as guest") on first load.
- **Home** — promo banner, category shortcuts, trending discoveries.
- **Browse** — all 300 products across 15 categories from the FindIt idea bank; search, filter
  by category/verified/first-20 test batch.
- **Product detail → Buy now → Checkout** — creates a real order, with a simulated escrow hold
  and a delivery-status tracker.
- **Request an item** — submits a real request; the server auto-generates offers from three
  sellers (simulating instant matching), compare and accept one to pay and track delivery.
- **Seller dashboard** — respond to open customer requests with a real offer.
- **Admin queue** — approve/reject pending sellers; requests with zero offers show as unmatched.
- **Account** — real order history, delivery tracking, reviews, saved items.
- **Notifications** — mark one or all as read, persisted.

## Stack

Next.js (App Router) + Tailwind CSS + lucide-react icons, with SQLite (`better-sqlite3`) for
storage via API routes under `app/api/`. The screen shell is one client component tree mounted at
`app/page.tsx`; screen navigation is in-memory state (`components/findit-app/App.jsx` →
`MainApp.jsx`), not URL routing, matching the original prototype's design. `MainApp.jsx` owns all
server-backed state (products, orders, notifications, sellers, open requests) and passes it down
as props, with handlers that call the API and update local state.

## Running locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000. The SQLite database (`data/findit.db`, gitignored) is created
and seeded automatically on first run.

## Code layout

- `lib/catalogue.js` — the category → product-name lists and deterministic listing generator
  (price/seller/rating/etc), used only for seeding.
- `lib/db.ts` — schema + seeding (products, sellers, requests, offers, orders, notifications).
- `lib/repo.ts` — typed query/mutation functions used by the API routes.
- `app/api/**/route.ts` — REST endpoints for products, orders, requests/offers, notifications,
  sellers.
- `components/findit-app/data.js` — client-only presentation data: category labels/icons,
  notification-type icons, gradient swatches, static copy.
- `components/findit-app/api.js` — small fetch wrapper used by the client components.
- `components/findit-app/shared.jsx` — small shared UI primitives (Pill, ArtBlock, Logo, etc).
- `components/findit-app/*.jsx` — one file per screen (Home, Browse, ProductDetail, Checkout,
  RequestForm, SellerDashboard, AdminQueue, Account, Notifications, Profile, Splash, Onboarding,
  Login), plus `MainApp.jsx` (tab bar + screen router + data fetching) and `App.jsx`
  (splash/onboarding/login/main phase machine).

## Next steps toward a real product

Real auth (phone/password accounts, sessions), a real seller-offer/notification pipeline tied to
actual seller accounts, and a real Nigerian payment processor (e.g. Paystack or Flutterwave) for
the escrow flow.
