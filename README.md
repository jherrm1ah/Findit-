# FindIt Naija

A request-first marketplace connecting buyers to verified sellers, starting in Nigeria and built
to scale globally: tell FindIt what you need (or browse the catalogue directly), sellers near you
send offers, you pay into escrow and confirm on delivery. Jos is the pilot city in the seed data —
not a hardcoded assumption about where the app runs.

This is a Next.js port of a mobile-first React prototype, now backed by a real SQLite database:
products, orders, requests/offers, notifications, seller verification, and user accounts all
persist across a reload. Payments are still a stub (checkout shows the escrow-held-funds UI as a
simulated state) — see "Next steps" below.

## Flows

- **Splash → Onboarding → Login/signup** (or "Continue as guest") on first load. Signing up picks
  a buyer or seller account; a returning user with a live session skips straight past login. A
  seller signup immediately enters the admin verification queue.
- **Home** — promo banner, category shortcuts, trending discoveries; a real unread-notification
  badge.
- **Browse** — all 300 products across 15 categories from the FindIt idea bank; search, filter
  by category/verified/first-20 test batch.
- **Product detail → Buy now → Checkout** — creates a real order, with a simulated escrow hold
  and a delivery-status tracker.
- **Request an item** — submits a real request; the server auto-generates offers from three
  sellers (simulating instant matching), compare and accept one to pay and track delivery.
- **Seller dashboard** — seller accounts only; everyone else sees a locked screen explaining why
  and a way to log in as one. Manage your own listings (add/edit/delete), advance your orders
  through the fulfillment lifecycle, and respond to open customer requests with a real offer,
  attributed to your real business name.
- **Admin queue** — staff-only (there's no self-serve "I'm an admin" signup); log in with the seed
  admin account below. Approve/reject pending sellers (including real seller signups); requests
  with zero offers show as unmatched.
- **Account** — real order history with a live delivery-status tracker (Awaiting payment → Seller
  preparing → Dispatched → Out for delivery → Delivered), reviews, saved items. Orders you place
  are tied to your account; guests and every account also see the shared seed/demo orders.
- **Messages** — real buyer-seller chat. Tap "Contact" on a product to start a conversation with
  its seller; both sides see the thread, unread counts, and can reply from their own account.
- **Notifications** — mark one or all as read, persisted, scoped per account the same way.
- **Profile** — shows your real name/phone/role with a working log out (or a log-in prompt as a
  guest), plus entry points into your orders, messages, and notifications.
- **Product photos** — sellers can attach a real photo to a listing (add or edit), stored in
  Supabase Storage; falls back to a generated gradient icon for listings without one.

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
and seeded automatically on first run — including a demo admin account:

```
Phone:    08000000000
Password: admin1234
```

This is a local-demo credential seeded directly in `lib/db.ts`, not something anyone can sign up
for — change or remove it before this goes anywhere near production.

## Code layout

- `lib/catalogue.js` — the category → product-name lists and deterministic listing generator
  (price/seller/rating/etc), used only for seeding.
- `lib/db.ts` — schema + seeding (products, sellers, requests, offers, orders, notifications,
  users, sessions, conversations, messages), with a tiny startup migration for columns added
  after the first release. `DB_PATH` can be overridden with the `FINDIT_DB_PATH` env var (used by
  the test suite to keep test data out of the dev database).
- `lib/repo.ts` — typed query/mutation functions used by the API routes.
- `lib/auth.ts` — password hashing (scrypt) and cookie-based sessions (no external auth service).
- `lib/rateLimit.ts` — a small in-memory sliding-window limiter guarding login/signup (see
  "Access control" below). Single-process only — fine for this app, not for a multi-instance
  deployment.
- `lib/storage.ts` — uploads product photos to Supabase Storage (server-side only, using
  `SUPABASE_SERVICE_ROLE_KEY`), auto-creating the `product-images` bucket on first use. See
  "Image uploads" below for setup.
- `app/api/**/route.ts` — REST endpoints for products, orders, requests/offers, notifications,
  sellers, messages, uploads, and auth (signup/login/logout/me).
- `components/findit-app/data.js` — client-only presentation data: category labels/icons,
  notification-type icons, gradient swatches, static copy.
- `components/findit-app/api.js` — small fetch wrapper used by the client components.
- `components/findit-app/shared.jsx` — small shared UI primitives (Pill, ArtBlock, Logo, etc).
- `components/findit-app/*.jsx` — one file per screen (Home, Browse, ProductDetail, Checkout,
  RequestForm, SellerDashboard, AdminQueue, Account, Notifications, Profile, Splash, Onboarding,
  Login), plus `MainApp.jsx` (tab bar + screen router + data fetching) and `App.jsx`
  (splash/onboarding/login/main phase machine).

## UI polish

- **Toasts, not `alert()`** — every background action (send offer, approve/reject a seller,
  submit a review, a failed purchase) surfaces an in-app toast (`components/findit-app/Toast.jsx`,
  hosted once in `App.jsx` so it works on the Login screen too) instead of a native browser
  dialog.
- **Busy states** on every button that fires an async request it can't otherwise tell happened
  (Buy now, Accept offer, Send offer, Submit review) — disabled + a "…" label while in flight, so
  there's no silent double-submit window.
- **Role-aware bottom nav** — the middle tab used to always say "Messages" and point at the
  seller dashboard regardless of who was logged in; it now shows "Dashboard" for a seller, "Admin"
  for an admin, and "Sell" for anyone else, with a matching icon and destination.
- Removed the leftover "PROTOTYPE" header badge and the dead "Forgot password?" button (now
  surfaces a toast instead of doing nothing); the loading screen got a branded spinner instead of
  bare text; the splash screen is snappier and tappable-to-skip instead of a fixed 5s wait.

## Access control

Three roles: `buyer`, `seller`, `admin`. The Seller Dashboard requires `seller`; the Admin Queue
requires `admin` — both gated server-side (`GET`/`PATCH /api/sellers`, `GET /api/requests`, and
`POST /api/requests/:id/offers` all check the session's role and return 403 otherwise), not just
hidden in the UI. `admin` has no public signup path — see the seed credentials above. Product
listing management (`POST`/`PATCH`/`DELETE /api/products*`) and order status advances are
restricted to the listing's/order's own seller (matched by business name) or an admin. Messaging
routes require a session and check the caller is a participant in the conversation.

`POST /api/auth/login` and `POST /api/auth/signup` are rate-limited (5 attempts per 15 minutes,
keyed by IP + phone for login and by IP for signup) — a 429 with a friendly error is returned once
the limit is hit. This doesn't cover phone verification (OTP), since that needs a real SMS
provider — same "needs external setup" category as payments below.

## Image uploads

Product photos are stored in [Supabase](https://supabase.com) Storage, not in the app's own
database. To enable it:

1. Create a free Supabase project.
2. Copy `.env.example` to `.env.local` and fill in:
   - `SUPABASE_URL` — your project's URL (Settings → API).
   - `SUPABASE_SERVICE_ROLE_KEY` — the **`service_role`** secret key from the same page. Use the
     classic JWT-style key (starts with `eyJ`, found under "Legacy API keys" if your project shows
     the newer `sb_secret_...` key format by default) — the newer key format doesn't currently
     have Storage admin permissions with this SDK version.
3. That's it — the `product-images` bucket is created automatically the first time a seller
   uploads a photo. No manual bucket setup needed.

Without these env vars set, everything else in the app still works; only the photo-upload button
in "Add listing" will fail with a clear error until they're configured.

## Testing

```bash
npm test
```

Runs the Vitest suite (`lib/**/*.test.ts`) covering password hashing/login, order creation and
scoping, the request → offer → accept flow, order status progression (including the
forward-only rule), product listing validation, buyer-seller messaging, and the rate limiter.
Tests run against an isolated SQLite file (`data/findit.test.db`, also gitignored) so they never
touch your dev database.

## Next steps toward a real product

A real Nigerian payment processor (e.g. Paystack or Flutterwave) for the escrow flow, real hosting/
deployment, phone number verification (OTP) at signup, and a real way to provision admin accounts
beyond the single seeded one.
