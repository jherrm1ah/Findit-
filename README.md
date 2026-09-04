# FindIt Naija

A request-first marketplace prototype connecting buyers in Jos, Nigeria to verified sellers:
tell FindIt what you need (or browse the catalogue directly), sellers send offers, you pay into
escrow and confirm on delivery.

This is a faithful Next.js port of a mobile-first React prototype. It runs entirely on in-memory
mock data — no real backend, auth, or payments yet — so every flow below is fully clickable but
nothing persists across a page reload.

## Flows

- **Splash → Onboarding → Login** (or "Continue as guest") on first load.
- **Home** — promo banner, category shortcuts, trending discoveries.
- **Browse** — all 300 products across 15 categories from the FindIt idea bank; search, filter
  by category/verified/first-20 test batch.
- **Product detail → Buy now → Checkout** — simulated escrow hold with a delivery-status tracker.
- **Request an item** — describe what you need, "sellers" respond with mock offers, accept one to
  pay and track delivery.
- **Seller dashboard** — respond to matching customer requests.
- **Admin queue** — approve/reject pending sellers, view unmatched requests.
- **Account** — order history, delivery tracking, reviews, saved items.
- **Notifications**.

## Stack

Next.js (App Router) + Tailwind CSS + lucide-react icons. The whole app is one client component
tree mounted at `app/page.tsx`; screen navigation is in-memory state (`components/findit-app/App.jsx`
→ `MainApp.jsx`), not URL routing, matching the original prototype's design.

## Running locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Code layout

- `components/findit-app/data.js` — the product catalogue (300 items / 15 categories) and all
  other mock data (offers, orders, notifications, sellers).
- `components/findit-app/shared.jsx` — small shared UI primitives (Pill, ArtBlock, Logo, etc).
- `components/findit-app/*.jsx` — one file per screen (Home, Browse, ProductDetail, Checkout,
  RequestForm, SellerDashboard, AdminQueue, Account, Notifications, Profile, Splash, Onboarding,
  Login), plus `MainApp.jsx` (tab bar + screen router) and `App.jsx` (splash/onboarding/login/main
  phase machine).

## Next steps toward a real product

Real auth (phone/password accounts), a persisted database for products/requests/orders/sellers,
a real seller-offer/notification pipeline, and a real Nigerian payment processor (e.g. Paystack
or Flutterwave) for the escrow flow.
