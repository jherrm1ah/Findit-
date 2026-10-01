# FindIt — Database Reference

Companion to [`PROJECT_STATUS.md`](./PROJECT_STATUS.md). This is the full table-by-table
database reference: every table, its important columns, relationships, Row Level Security
status, storage buckets, database functions, and the complete migration history.

**Source of truth**: `supabase/migrations/002_*.sql` through `034_*.sql`, applied in order on
top of `supabase/schema.sql`. `schema.sql` was regenerated and verified against the live
project (all 34 tables, RLS enabled on every one, zero duplicate names) — it is a true mirror
as of 2026-10-01; keep it that way by regenerating it again whenever a new migration lands,
rather than letting it drift a second time.

---

## 1. Tables

### `users`
Account record (buyer/seller/admin). This app uses **custom phone+password auth, not
Supabase Auth**.

| Column | Type | Notes |
|---|---|---|
| `id` | text | **PK** |
| `phone` | text | not null, unique |
| `phone_verified` | boolean | default true |
| `password_hash`, `password_salt` | text | not null |
| `name` | text | not null |
| `role` | text | not null, check in (`buyer`,`seller`,`admin`) |
| `business_name` | text | |
| `lat`, `lng`, `location_updated_at` | double precision, double precision, timestamptz | only set on explicit geolocation grant |
| `avatar_url` | text | |
| `notifications_enabled` | boolean | default true |
| `email` | text | optional; partial unique index where not null |
| `previous_role` | text | role before an admin promotion, for exact demotion |
| `admin_role` | text | check in (`super_admin`,`verification_admin`,`support_admin`,`finance_admin`,`moderation_admin`); meaningful only when `role='admin'` |
| `suspended`, `suspended_reason`, `suspended_at` | boolean, text, timestamptz | platform-level suspension, independent of seller status |
| `created_at` | timestamptz | |

### `sessions`
Login sessions (custom cookie-based auth, not JWT).

| Column | Type | Notes |
|---|---|---|
| `token` | text | **PK** |
| `user_id` | text | not null, **FK → users.id** (cascade) |
| `created_at`, `expires_at` | timestamptz | |
| `admin_unlocked_at` | timestamptz | (020) per-session staff re-auth stamp; admin routes require this fresher than `ADMIN_UNLOCK_MINUTES` |

Index: `sessions_user_id_idx(user_id)`.

### `sellers`
The seller/store record — admin-verification + lifecycle gate + Store customization.

| Column | Type | Notes |
|---|---|---|
| `id` | text | **PK** |
| `user_id` | text | not null, unique, **FK → users.id** (cascade) |
| `name` | text | not null |
| `status` | text | default `pending`, check in (`pending`,`approved`,`rejected`,`suspended`); only `approved` can transact (013) |
| `status_reason` | text | reused for rejection or suspension reason |
| `store_slug`, `store_slug_claimed_at` | text, timestamptz | (023); unique partial index where not null |
| `logo_url`, `banner_url` | text | (011) |
| `store_template` | text | default `classic`, not null (031) |
| `store_accent` | text | default `violet`, not null (032) |
| `seller_type`, `category`, `description`, `years_selling`, `social_links` (jsonb), `has_physical_store`, `public_state`, `public_city`, `public_area` | mixed | (012) public trust fields |
| `verification_status` | text | default `incomplete`, check in (`incomplete`,`pending`,`approved`,`rejected`,`needs_info`) |
| `verification_submitted_at`, `verification_reviewed_at`, `verification_reviewed_by` (**FK → users.id**), `verification_rejection_reason` | mixed | |
| `bank_account_number`, `bank_code`, `bank_account_name`, `paystack_recipient_code` | text | (016) payout destination |

Indexes: `sellers_verification_reviewed_by_idx` (021); unique
partial index `sellers_store_slug_unique_idx(store_slug) where store_slug is not null`.

### `seller_verification_details`
Private half of seller verification (kept off `sellers` so a `select('*')` can't leak it).

| Column | Type | Notes |
|---|---|---|
| `seller_id` | text | **PK, FK → sellers.id** (cascade) |
| `shop_address`, `lat`, `lng`, `website` | mixed | |
| `updated_at` | timestamptz | |

### `seller_verification_evidence`
Evidence items (photos/links) backing a verification submission.

| Column | Type | Notes |
|---|---|---|
| `id` | text | **PK** |
| `seller_id` | text | not null, **FK → sellers.id** (cascade) |
| `kind` | text | check in (`product_photo`,`shop_photo`,`business_page`,`social_link`,`other`) |
| `storage_path` XOR `text_value` | text | `check ((storage_path is not null) <> (text_value is not null))` |
| `note`, `created_at` | text, timestamptz | |

Index: `seller_verification_evidence_seller_id_idx(seller_id)`.

### `store_slug_aliases`
Every slug a store has ever used, so an old shared link never breaks or gets reassigned.

| Column | Type | Notes |
|---|---|---|
| `slug` | text | **PK** |
| `seller_id` | text | not null, **FK → sellers.id** (cascade) |
| `created_at` | timestamptz | |

Index: `store_slug_aliases_seller_id_idx(seller_id)`.

### `categories`
Admin-editable product/request category taxonomy (017) — replaces a hardcoded list.

| Column | Type | Notes |
|---|---|---|
| `id` | text | **PK** |
| `label` | text | not null |
| `icon_key` | text | default `Package` (a `lucide-react` icon name, looked up client-side) |
| `sort_order`, `active` | integer, boolean | default true |
| `created_at`, `updated_at` | timestamptz | |

Index: `categories_active_idx(active)`. Seeded with 15 categories (reading, tools,
organization, lighting, cleaning, kitchen, bathroom, campus, travel, phonetech, car, power,
weird, plant, desk).

### `products`
Marketplace listings.

| Column | Type | Notes |
|---|---|---|
| `id` | text | **PK** |
| `category`, `name` | text | not null |
| `price` | integer | not null, check `> 0` |
| `seller` | text | not null — legacy name-text identity |
| `seller_id` | text | **FK → sellers.id**, nullable — reliable identity (009) |
| `image_url` | text | cover photo, denormalized from `product_images` sort_order 0 |
| `art` | integer | default 0 |
| `lat`, `lng` | double precision | captured from the seller account at listing time |
| `created_at` | timestamptz | |
| `active` | boolean | default true — lets a Store downgrade deactivate excess listings without deleting (010) |
| `boosted_until` | timestamptz | null = not boosted; sort-only, no cron needed (018) |
| `boost_expiry_notified_at` | timestamptz | dedupes the "boost ended" notification (030) |
| `description` | text | (026) |
| `condition` | text | check(`New`,`Used`) (026) |
| `qty` | integer | not null, default 1, check `>= 0` (026) |
| `location`, `delivery_option`, `color`, `variation` | text | (026); `delivery_option` check(`Delivery`,`Pickup`,`Both`) |
| `moderation_status` | text | not null, default `active`, check(`active`,`under_review`,`removed`) (027) |
| `moderation_reason`, `moderated_by` (**FK → users.id**), `moderated_at` | mixed | (027) |

Indexes: `products_seller_id_idx`, `products_seller_idx`, `products_created_at_idx(created_at
desc)`, `products_active_idx`, `products_boosted_until_idx`, `products_moderation_status_idx`
(027).

### `product_images`
*(Added in migration 026.)* Up to N photos per listing; `products.image_url`
stays as a denormalized cover.

| Column | Type | Notes |
|---|---|---|
| `id` | text | **PK** |
| `product_id` | text | not null, **FK → products.id** (cascade) |
| `url` | text | not null |
| `sort_order` | integer | default 0 |
| `created_at` | timestamptz | |

Index: `product_images_product_id_idx(product_id, sort_order)`.

### `requests`
Buyer "I'm looking for X" requests.

| Column | Type | Notes |
|---|---|---|
| `id` | text | **PK** |
| `user_id` | text | not null, **FK → users.id** (cascade) |
| `title` | text | not null |
| `description` | text | |
| `category` | text | nullable; AI-suggested |
| `budget_min`, `budget_max` | integer | |
| `qty` | integer | default 1 |
| `location` | text | free-text, never geocoded |
| `lat`, `lng` | double precision | real coords |
| `condition` | text | default `New` |
| `deadline` | text | |
| `status` | text | default `open`, check in (`open`,`matched`,`cancelled`) |
| `created_at` | timestamptz | |

Indexes: `requests_user_id_idx`, `requests_status_idx`.

### `offers`
Seller responses to a request.

| Column | Type | Notes |
|---|---|---|
| `id` | text | **PK** |
| `request_id` | text | not null, **FK → requests.id** (cascade) |
| `seller` | text | not null — legacy text identity |
| `seller_id` | text | **FK → sellers.id** (009) |
| `price` | integer | not null, check `> 0` |
| `delivery`, `eta`, `condition`, `warranty` | text | not null |
| `note` | text | |
| `accepted` | boolean | default false |
| `created_at` | timestamptz | |

Indexes: `offers_seller_id_idx`, `offers_request_id_idx`.

### `orders`
A placed order / the escrow + payment record.

| Column | Type | Notes |
|---|---|---|
| `id` | text | **PK** |
| `user_id` | text | not null, **FK → users.id** (cascade) — login required, no guest orders |
| `item` | text | not null |
| `seller` | text | not null — legacy text identity |
| `seller_id` | text | **FK → sellers.id** |
| `price` | integer | not null, check `> 0` |
| `status` | text | default `Awaiting payment` |
| `can_review`, `reviewed` | boolean | |
| `my_rating` | integer | check 1–5 |
| `review_comment` | text | |
| `request_id` | text | **FK → requests.id**, nullable |
| `created_at`, `buyer_confirmed_at` | timestamptz | delivery confirmed only by buyer (008) |
| `escrow_status` | text | default `unpaid`, check in (`unpaid`,`held`,`released`,`disputed`,`refunded`) (016) |
| `issue_reported_at`, `issue_note` | timestamptz, text | |
| `payment_status` | text | default `pending`, check in (`pending`,`paid`,`failed`) (016) |
| `paid_at` | timestamptz | |
| `platform_fee_bps`, `platform_fee_amount`, `seller_payout_amount` | integer | snapshotted once at payment confirmation, frozen forever after |

**Constraints added in 021**: `orders_platform_fee_amount_nonneg`,
`orders_seller_payout_amount_nonneg`, `orders_platform_fee_bps_range` (0–10000),
`orders_fee_split_reconciles` (`platform_fee_amount + seller_payout_amount = price` when both
set), `orders_escrow_requires_payment` (escrow can't be `held`/`released` unless
`payment_status='paid'`), `orders_paid_has_fee_snapshot` (paid orders must have a fee
snapshot).

Indexes: `orders_user_id_idx`, `orders_seller_idx`, `orders_escrow_status_idx` (partial,
`where escrow_status='disputed'`), `orders_seller_id_idx`, `orders_request_id_idx` (021).

### `notifications`
Per-user notification feed.

| Column | Type | Notes |
|---|---|---|
| `id` | text | **PK** |
| `user_id` | text | not null, **FK → users.id** (cascade) |
| `type`, `title`, `body` | text | not null |
| `unread` | boolean | default true |
| `created_at` | timestamptz | |

Index: `notifications_user_id_idx`.

### `conversations`
Buyer↔seller chat thread.

| Column | Type | Notes |
|---|---|---|
| `id` | text | **PK** |
| `buyer_id` | text | not null, **FK → users.id** (cascade) |
| `seller_id` | text | not null, **FK → users.id** (cascade) — note: references `users`, not `sellers` |
| `created_at` | timestamptz | |

Unique `(buyer_id, seller_id)`. Index: `conversations_seller_id_idx` (021).

### `messages`
Chat messages within a conversation.

| Column | Type | Notes |
|---|---|---|
| `id` | text | **PK** |
| `conversation_id` | text | not null, **FK → conversations.id** (cascade) |
| `sender_id` | text | not null, **FK → users.id** (cascade) |
| `body` | text | not null |
| `created_at` | timestamptz | |
| `read` | boolean | default false |

Indexes: `messages_conversation_id_idx`; `messages_sender_id_idx` (021).

### `support_tickets`
In-app support ticket thread (019).

| Column | Type | Notes |
|---|---|---|
| `id` | text | **PK** |
| `user_id` | text | not null, **FK → users.id** (cascade) |
| `subject` | text | not null |
| `status` | text | default `open`, check in (`open`,`resolved`) |
| `user_has_unread`, `admin_has_unread` | boolean | |
| `created_at`, `updated_at` | timestamptz | |
| `priority` | boolean | default false (033) — decided once at creation from the filer's plan at that moment |

Indexes: `support_tickets_user_id_idx`, `support_tickets_status_idx`,
`support_tickets_priority_idx`.

### `support_ticket_messages`
Messages within a support ticket.

| Column | Type | Notes |
|---|---|---|
| `id` | text | **PK** |
| `ticket_id` | text | not null, **FK → support_tickets.id** (cascade) |
| `sender_id` | text | not null, **FK → users.id** (cascade) |
| `is_admin` | boolean | default false |
| `body` | text | not null |
| `created_at` | timestamptz | |

Indexes: `support_ticket_messages_ticket_id_idx`; `support_ticket_messages_sender_id_idx`
(021).

### `saved_items`
Wishlist / "save for later".

| Column | Type | Notes |
|---|---|---|
| `id` | text | **PK** |
| `user_id` | text | not null, **FK → users.id** (cascade) |
| `product_id` | text | not null, **FK → products.id** (cascade) |
| `created_at` | timestamptz | |

Unique `(user_id, product_id)`. Indexes: `saved_items_user_id_idx`;
`saved_items_product_id_idx` (021).

### `admin_actions`
Audit trail for high-impact admin actions.

| Column | Type | Notes |
|---|---|---|
| `id` | text | **PK** |
| `admin_id` | text | not null, **FK → users.id** (cascade) |
| `action`, `target_type`, `target_id` | text | not null |
| `detail` | jsonb | |
| `created_at` | timestamptz | |

Indexes: `admin_actions_created_at_idx(created_at desc)`; `admin_actions_admin_id_idx` (021).

### `transaction_records`
*(024)* Verified, buyer-facing proof-of-completion snapshot — created exactly once per order,
only when `escrow_status` reaches `released`.

| Column | Type | Notes |
|---|---|---|
| `id` | text | **PK** |
| `code` | text | not null, unique — public, non-sequential id, format `FI-XXXXXXXX` |
| `order_id` | text | not null, unique, **FK → orders.id** (restrict) — one-per-order, makes creation idempotent |
| `buyer_user_id` | text | not null, **FK → users.id** (restrict) |
| `seller_id` | text | **FK → sellers.id**, nullable |
| `seller_name`, `item_name` | text | not null — snapshots, never recomputed |
| `product_id` | text | **FK → products.id** (set null on delete) |
| `amount` | integer | check `>= 0` |
| `currency` | text | default `NGN` |
| `seller_verification_level` | text | default `new`, check in (`new`,`verified`,`trusted`) |
| `paid_at`, `completed_at` | timestamptz | `completed_at` not null |
| `status` | text | default `completed`, check in (`completed`,`disputed`,`refunded`) |
| `record_scope` | text | default `listing`, check in (`listing`,`item`) — foundation for future item-level identity |
| `created_at` | timestamptz | |

Indexes: `transaction_records_buyer_idx`, `_seller_idx`, `_seller_name_idx`,
`_completed_at_idx(completed_at desc)`.

### `transaction_record_events`
Append-only history against a `transaction_records` row (disputes, refunds, corrections).

| Column | Type | Notes |
|---|---|---|
| `id` | text | **PK** |
| `transaction_record_id` | text | not null, **FK → transaction_records.id** (cascade) |
| `event_type` | text | not null, check in (`completed`,`dispute_opened`,`dispute_resolved`,`refunded`,`admin_correction`) |
| `actor_type` | text | not null, check in (`system`,`buyer`,`seller`,`admin`) |
| `actor_id` | text | **FK → users.id** (set null on delete) |
| `reason` | text | |
| `previous_value`, `new_value` | jsonb | |
| `created_at` | timestamptz | |

Index: `transaction_record_events_record_idx(transaction_record_id, created_at)`.

### `otp_verifications`
Self-hosted hashed OTP codes (006) — replaced a Termii-hosted OTP product.

| Column | Type | Notes |
|---|---|---|
| `id` | text | **PK** |
| `phone` | text | not null |
| `purpose` | text | not null, check in (`signup`,`reset`) |
| `otp_hash`, `otp_salt` | text | not null — the code itself is never stored |
| `expires_at` | timestamptz | not null |
| `created_at`, `verified_at` | timestamptz | |
| `attempts` | integer | default 0 |
| `max_attempts` | integer | default 5 |
| `resend_count` | integer | default 0 |
| `last_sent_at` | timestamptz | |
| `used` | boolean | default false |
| `request_ip` | text | |

Indexes: `otp_verifications_phone_purpose_idx(phone,purpose)`, `_expires_at_idx`,
`_created_at_idx`.

### `subscription_plans`
Store tier + FindIt Pro plan definitions, as data not code (010).

| Column | Type | Notes |
|---|---|---|
| `id` | text | **PK** |
| `kind` | text | not null, check in (`store`,`platform`) |
| `name` | text | not null |
| `price_monthly` | integer | check `>= 0` |
| `price_yearly` | integer | nullable |
| `product_limit`, `storage_limit_mb` | integer | null = unlimited |
| `analytics_level`, `customization_level` | text | default `none`, check in (`none`,`basic`,`advanced`,`full`) |
| `featured_listing_access`, `priority_support`, `pro_badge` | boolean | default false |
| `trial_days` | integer | default 0 |
| `sort_order` | integer | default 0 |
| `active` | boolean | default true |
| `created_at`, `updated_at` | timestamptz | |

Seeded rows: `store_free`, `store_basic`, `store_business`, `store_pro`, `findit_pro`.

### `subscriptions`
A seller's Store plan OR a user's FindIt Pro plan (same shape, `owner_type` distinguishes).

| Column | Type | Notes |
|---|---|---|
| `id` | text | **PK** |
| `owner_type` | text | not null, check in (`store`,`platform`) |
| `owner_id` | text | not null — points at `sellers.id` (store) or `users.id` (platform); **not a literal FK**, since it targets two different tables; ownership verified in app code |
| `plan_id` | text | not null, **FK → subscription_plans.id** |
| `status` | text | default `active`, check in (`active`,`trialing`,`past_due`,`cancelled`,`expired`) |
| `billing_period` | text | default `monthly`, check in (`monthly`,`yearly`) |
| `current_period_start` | timestamptz | default now() |
| `current_period_end`, `trial_ends_at` | timestamptz | |
| `cancel_at_period_end` | boolean | default false |
| `cancelled_at` | timestamptz | |
| `created_at`, `updated_at` | timestamptz | |

Unique `(owner_type, owner_id)`. Indexes: `subscriptions_owner_idx(owner_type,owner_id)`,
`subscriptions_status_idx`, `subscriptions_plan_id_idx` (021).

### `subscription_events`
Append-only audit trail for a subscription (upgrades, trial starts, cancellations…).

| Column | Type | Notes |
|---|---|---|
| `id` | text | **PK** |
| `subscription_id` | text | not null, **FK → subscriptions.id** (cascade) |
| `type` | text | not null |
| `detail` | jsonb | |
| `created_at` | timestamptz | |

Indexes: `subscription_events_subscription_id_idx`, `_created_at_idx(created_at desc)`.

### `payments`
Every provider transaction (subscriptions, orders, boosts, fees).

| Column | Type | Notes |
|---|---|---|
| `id` | text | **PK** |
| `user_id` | text | not null, **FK → users.id** (cascade) |
| `subscription_id` | text | **FK → subscriptions.id**, nullable |
| `order_id` | text | **FK → orders.id**, nullable (016) |
| `kind` | text | default `subscription`, check in (`subscription`,`order`,`boost`,`fee`,`other`) |
| `amount` | integer | check `>= 0` |
| `currency` | text | default `NGN` |
| `status` | text | default `pending`, check in (`pending`,`success`,`failed`,`refunded`) |
| `provider` | text | default `paystack` |
| `provider_reference` | text | unique |
| `metadata` | jsonb | |
| `paid_at`, `created_at` | timestamptz | |

Indexes: `payments_user_id_idx`, `_subscription_id_idx`, `_order_id_idx`, `_status_idx`.

### `platform_fee_config`
Admin-editable, append-only marketplace commission — "current fee" = latest row.

| Column | Type | Notes |
|---|---|---|
| `id` | text | **PK** |
| `fee_bps` | integer | not null, check `0 <= x <= 10000` |
| `created_by` | text | **FK → users.id**, nullable |
| `created_at` | timestamptz | |

Index: `platform_fee_config_created_at_idx(created_at desc)`; `_created_by_idx` (021). Seed
row: `fee_default`, 500 bps (5%).

### `payouts`
One row per order once funds are released to the seller.

| Column | Type | Notes |
|---|---|---|
| `id` | text | **PK** |
| `seller_id` | text | not null, **FK → sellers.id** |
| `order_id` | text | not null, **FK → orders.id** |
| `amount` | integer | check `> 0` |
| `status` | text | default `pending`, check in (`pending`,`processing`,`paid`,`failed`,`manual_required`) |
| `provider_reference`, `failure_reason` | text | |
| `created_at`, `paid_at` | timestamptz | |

Unique `(order_id)` — one payout per order, DB-enforced. Indexes: `payouts_seller_id_idx`,
`payouts_status_idx`.

### `boost_plans`
Pricing data for listing boosts (018).

| Column | Type | Notes |
|---|---|---|
| `id` | text | **PK** |
| `name` | text | not null |
| `duration_days` | integer | check `> 0` |
| `price` | integer | check `>= 0` |
| `sort_order`, `active` | integer, boolean | |
| `created_at`, `updated_at` | timestamptz | |

Seed rows: `boost_3d`, `boost_7d`, `boost_14d`.

### `boosts`
Append-only purchase record of a listing boost.

| Column | Type | Notes |
|---|---|---|
| `id` | text | **PK** |
| `product_id` | text | not null, **FK → products.id** (cascade) |
| `seller_id` | text | not null, **FK → sellers.id** (cascade) |
| `boost_plan_id` | text | not null, **FK → boost_plans.id** |
| `amount` | integer | check `>= 0` (021) |
| `starts_at`, `ends_at` | timestamptz | |
| `created_at` | timestamptz | |
| `payment_id` | text | **FK → payments.id**, nullable (029) — unique partial index `boosts_payment_id_key` where not null, makes boost activation idempotent against a redelivered Paystack webhook |

Indexes: `boosts_product_id_idx`, `boosts_seller_id_idx`; `boosts_boost_plan_id_idx` (021).

### `rate_limits`
*(Added in migration 022.)* Shared, cross-serverless-instance
rate-limit counters (DB-backed because each Vercel serverless instance used to keep its own,
independently-wrong, in-memory counter).

| Column | Type | Notes |
|---|---|---|
| `key` | text | **PK** — e.g. `login:<ip>:<phone>`, `order:<user id>` |
| `window_start` | timestamptz | default now() |
| `hits` | integer | default 0 |

Index: `rate_limits_window_start_idx(window_start)` (supports opportunistic GC). Companion
function: `check_rate_limit()`, see §3 below.

### `reviews`
*(Added in migration 025.)* Real, listable, seller-repliable reviews (the
text itself used to live only on `orders.review_comment`, invisible to other buyers).

| Column | Type | Notes |
|---|---|---|
| `id` | text | **PK** |
| `order_id` | text | not null, unique, **FK → orders.id** (restrict) — one review per order |
| `buyer_user_id` | text | not null, **FK → users.id** (restrict) |
| `seller_id` | text | **FK → sellers.id**, nullable |
| `seller_name` | text | not null — dual-key pattern, same as `transaction_records` |
| `rating` | integer | not null, check 1–5 |
| `comment` | text | |
| `seller_reply`, `seller_replied_at` | text, timestamptz | a single mutable reply, not an events table |
| `created_at` | timestamptz | |

Indexes: `reviews_seller_id_idx`, `_seller_name_idx`, `_buyer_user_id_idx`,
`_created_at_idx(created_at desc)`. Backfilled once from existing `orders` rows where
`reviewed=true`.

### `moderation_rules`
*(Added in migration 027.)* Admin-editable prohibited-keyword list for
listings.

| Column | Type | Notes |
|---|---|---|
| `id` | text | **PK** |
| `keyword` | text | not null — matched case-insensitively, not a regex |
| `reason` | text | not null |
| `severity` | text | default `flag`, check in (`flag`,`block`) |
| `active` | boolean | default true |
| `created_at`, `updated_at` | timestamptz | |

Index: `moderation_rules_active_idx(active)`.

### `product_reports`
*(Added in migration 027.)* Buyer "report this listing" queue.

| Column | Type | Notes |
|---|---|---|
| `id` | text | **PK** |
| `product_id` | text | not null, **FK → products.id** (cascade) |
| `reporter_id` | text | not null, **FK → users.id** (cascade) |
| `reason` | text | not null, check in (`prohibited_item`,`counterfeit`,`scam`,`spam`,`inappropriate`,`other`) |
| `details` | text | check `char_length <= 1000` when present |
| `status` | text | default `open`, check in (`open`,`resolved`,`dismissed`) |
| `resolved_by` | text | **FK → users.id**, nullable |
| `resolution_note` | text | |
| `created_at`, `updated_at` | timestamptz | |

Indexes: `product_reports_product_id_idx`, `_status_idx`.

---

## 2. Relationships (ER sketch)

```
users 1──1 sellers (sellers.user_id unique FK)
users 1──* sessions
sellers 1──1 seller_verification_details
sellers 1──* seller_verification_evidence
sellers 1──* store_slug_aliases
sellers 1──* products (products.seller_id, nullable — legacy text `seller` also used)
sellers 1──* offers (offers.seller_id, nullable)
sellers 1──* orders (orders.seller_id, nullable)
sellers 1──* boosts
sellers 1──1 subscriptions (via owner_type='store', owner_id=sellers.id — untyped FK)
sellers 1──* payouts
sellers 1──* reviews / transaction_records (seller_id, nullable)

users 1──* requests
requests 1──* offers
requests 1──* orders (orders.request_id, nullable — "bought from an accepted offer")

users 1──* orders (buyer)
orders 1──1 transaction_records (unique order_id; created only once, on release)
orders 1──1 reviews (unique order_id)
orders 1──* payments (order_id nullable FK; also payments.subscription_id for subscription payments)
orders 1──1 payouts (unique order_id)
transaction_records 1──* transaction_record_events

products 1──* product_images
products 1──* saved_items
products 1──* boosts
products 1──* product_reports
products (seller_id → sellers)

users 1──* conversations (as buyer_id AND independently as seller_id — both FK → users)
conversations 1──* messages
users 1──* messages (sender_id)

users 1──* support_tickets
support_tickets 1──* support_ticket_messages

subscription_plans 1──* subscriptions
subscriptions 1──* subscription_events
subscriptions 1──* payments (subscription_id, nullable)

boost_plans 1──* boosts
payments 1──* boosts (payments.id ← boosts.payment_id, nullable, idempotency)

users 1──* notifications
users 1──* admin_actions (admin_id)
platform_fee_config — standalone, append-only config (created_by → users)
categories — standalone lookup, referenced only by text (products.category / requests.category are plain text, not FK'd)
moderation_rules — standalone; informs validation of products on write, not FK'd
rate_limits — standalone, keyed by an arbitrary app-chosen string
otp_verifications — standalone, keyed by phone (not FK'd to users; a user may not exist yet at signup time)
```

Core business flow: `users → sellers → products/offers` · `requests → offers → orders` ·
`orders → payments/payouts/escrow → transaction_records → transaction_record_events` ·
`orders → reviews`. Support/chat are parallel subsystems:
`conversations → messages`, `support_tickets → support_ticket_messages`. Subscriptions
(`subscription_plans → subscriptions → subscription_events`) attach to either a seller
(Store plan) or a user (FindIt Pro) via the untyped `owner_type`/`owner_id` pair — the one
place the schema deliberately avoids a real FK, because it targets two different parent
tables depending on `owner_type`.

---

## 3. Row Level Security

**Every one of the 34 tables has RLS enabled, and there is not one `CREATE POLICY` statement
anywhere in the codebase** (verified across `schema.sql` and all 32 migration files). This is
explicit and intentional — documented in a comment at the top of `supabase/schema.sql`:

> *"This app does NOT use Supabase Auth... All database access goes through Next.js API
> routes using the Supabase service role key, which bypasses Row Level Security entirely...
> Row Level Security is enabled below purely as defense-in-depth (so the anon/public key —
> which nothing in this app uses, but could leak — can't read or write anything without an
> explicit policy). The real authorization check... happens in the API route code, not in
> Postgres."*

Full list of the 34 tables with RLS enabled and zero policies (verified 1:1 against the full
table list above): `users`, `sessions`, `sellers`, `seller_verification_details`,
`seller_verification_evidence`, `store_slug_aliases`, `categories`, `products`,
`product_images`, `requests`, `offers`, `orders`, `notifications`, `conversations`,
`messages`, `support_tickets`, `support_ticket_messages`, `saved_items`, `admin_actions`,
`transaction_records`, `transaction_record_events`, `otp_verifications`,
`subscription_plans`, `subscriptions`, `subscription_events`, `payments`,
`platform_fee_config`, `payouts`, `boost_plans`, `boosts`, `rate_limits`, `reviews`,
`moderation_rules`, `product_reports`.

**What this means in practice**: if the anon/public Supabase key were ever used anywhere
(client-side, or leaked), it would be denied access to everything by default — an empty
policy set under RLS means deny-all. But since nothing in this app ever uses that key, RLS
isn't doing any day-to-day authorization work; the Next.js API route layer (`getSessionUser`
+ ownership checks + `requireAdmin`/`requireSuperAdmin`) is the real and only boundary. See
`PROJECT_STATUS.md` §7 for the full implication of this for anyone extending the app.

---

## 4. Storage buckets

Defined in `lib/storage.ts`, created lazily on first use (`ensureBucket()`) — not
pre-provisioned via SQL or the Supabase dashboard.

| Bucket | Public? | Purpose | Access pattern |
|---|---|---|---|
| `product-images` | **Public** (`public: true`) | Product listing photos, uploaded via `uploadProductImage()` | Served via `getPublicUrl()` — a plain public URL, no signing. Real file-signature ("magic bytes") validation against the declared Content-Type; server-generated filenames only (`${Date.now()}-${random}.${ext}`), never the client's own filename — blocks path-traversal and double-extension tricks. 5 MB file size limit. |
| `seller-verification` | **Private** (`public: false`) | Seller trust/verification evidence photos (shop interior, product photos, etc.), uploaded via `uploadVerificationEvidence()` | Never gets a public URL. Read only via `getSignedEvidenceUrl()` — a 10-minute signed URL. Callers (`app/api/sellers/me/verification`, `app/api/admin/seller-verifications`) must check the caller is the owning seller or an admin **before** requesting a signed URL — the storage layer itself does no authorization. Paths are scoped `${sellerId}/...` so evidence can't collide across sellers. 5 MB limit. |

No bucket-level storage policies exist in SQL — buckets are managed entirely through the
service-role `supabase-js` client, the same trust model as the Postgres RLS section above (no
anon-key access is expected or configured for storage either).

---

## 5. Database functions / triggers

Only **one** SQL function exists in the entire schema, and there are **no triggers anywhere**
— every `updated_at` column, where one exists, is written by application code, not
database-maintained.

**`check_rate_limit(p_key text, p_max integer, p_window_seconds integer) returns table(allowed
boolean, retry_after_seconds integer)`** — migration 022, with its `search_path` pinned to
`public` in migration 028 (fixing a Supabase security-linter warning about a mutable
search_path).

- Attached to: `rate_limits` table.
- Purpose: an atomic, single-round-trip check-and-increment for a fixed-window rate limiter,
  replacing an in-process JS `Map` that silently broke the moment the app ran on more than
  one Vercel serverless instance. Upserts a row keyed by `p_key`; resets the window if the
  previous one has expired; returns whether the caller is still under `p_max` and, if not,
  how many seconds until retry. Also does opportunistic 0.5%-probability garbage collection
  of rows older than 1 day on each call — no separate scheduled cleanup job needed.
- Called from `lib/rateLimit.ts`, with an in-memory fallback if the DB call itself throws, so
  a transient DB blip degrades rate-limit quality rather than locking everyone out.

---

## 6. Notable indexes

Beyond the routine FK/lookup indexes listed per-table above, these are worth calling out as
deliberately performance- or correctness-motivated:

- `orders_escrow_status_idx on orders(escrow_status) where escrow_status = 'disputed'` —
  partial index, backs the admin "reported problems" queue without scanning/indexing every
  order.
- `sellers_store_slug_unique_idx on sellers(store_slug) where store_slug is not null` —
  partial unique index that doubles as the concurrency-safety mechanism for slug allocation
  (the app tries candidate slugs and lets a unique-violation decide the winner, rather than a
  racy check-then-insert).
- `products_boosted_until_idx on products(boosted_until)` — backs the boosted-listings sort
  on Home/Browse; needs no cron for correctness, since the sort just stops matching once
  `now() > boosted_until`.
- `products_moderation_status_idx on products(moderation_status)` — backs filtering
  `under_review`/`removed` listings out of buyer-facing views.
- `rate_limits_window_start_idx(window_start)` — supports the opportunistic stale-row cleanup
  inside `check_rate_limit` without a full table scan.
- `boosts_payment_id_key on boosts(payment_id) where payment_id is not null` — partial unique
  index that makes boost activation idempotent against a redelivered Paystack webhook event.
- 10 FK-covering indexes added in migration 021 specifically because Supabase's own
  performance advisor flagged them as unindexed foreign keys carrying real query/delete load:
  `admin_actions_admin_id_idx`, `boosts_boost_plan_id_idx`, `conversations_seller_id_idx`,
  `messages_sender_id_idx`, `orders_request_id_idx`, `saved_items_product_id_idx`,
  `sellers_verification_reviewed_by_idx`, `subscriptions_plan_id_idx`,
  `support_ticket_messages_sender_id_idx`, `platform_fee_config_created_by_idx`.
- `transaction_records_completed_at_idx`, `reviews_created_at_idx`,
  `admin_actions_created_at_idx` (all `desc`) — descending indexes for "most recent first"
  admin/listing views, avoiding a sort step.

---

## 7. Migration history

| File | Adds |
|---|---|
| `002_add_location.sql` | `lat`/`lng`/`location_updated_at` on `users`; `lat`/`lng` on `products` and `requests` |
| `003_security_hardening.sql` | `admin_actions` audit table; `orders_price_check` (`price > 0`) |
| `004_phone_verification.sql` | `users.phone_verified` |
| `005_profile.sql` | `users.avatar_url`, `users.notifications_enabled` |
| `006_otp_verifications.sql` | `otp_verifications` table — self-managed hashed OTP codes, replacing Termii-hosted OTP |
| `007_admin_demote.sql` | `users.previous_role` — lets an admin be demoted back to their real prior role |
| `008_delivery_confirmation.sql` | `orders.buyer_confirmed_at`, `escrow_status`, `issue_reported_at`, `issue_note` — buyer-driven delivery confirmation + escrow states |
| `009_seller_identity.sql` | `seller_id` FK columns on `products`/`orders`/`offers` — reliable identity alongside the legacy text `seller` column |
| `010_store_subscriptions.sql` | `subscription_plans`, `subscriptions`, `subscription_events`, `payments` tables; `products.active`; seeds the 5 real plans |
| `011_store_branding.sql` | `sellers.logo_url`, `sellers.banner_url` |
| `012_seller_verification.sql` | `users.email` (+ unique partial index); seller trust fields on `sellers`; `seller_verification_details`, `seller_verification_evidence` tables |
| `013_seller_lifecycle.sql` | Adds `suspended` to the `sellers.status` check constraint; `sellers.status_reason` |
| `014_admin_roles.sql` | `users.admin_role` — scoped admin sub-roles, backfills existing admins to `super_admin` |
| `015_user_suspension.sql` | `users.suspended`, `suspended_reason`, `suspended_at` — platform-level (not just seller-level) suspension |
| `016_order_payments.sql` | `orders.payment_status`/`paid_at`/`platform_fee_bps`/`platform_fee_amount`/`seller_payout_amount`; `escrow_status` gains `unpaid`; `payments.order_id`; `sellers` bank/payout fields; `platform_fee_config`, `payouts` tables |
| `017_categories.sql` | `categories` table — admin-editable taxonomy, seeded with 15 categories, replacing a hardcoded list |
| `018_boosts.sql` | `boost_plans`, `boosts` tables; `products.boosted_until` — paid listing promotion |
| `019_support_tickets.sql` | `support_tickets`, `support_ticket_messages` tables — in-app support, mirrors the conversations/messages shape |
| `020_admin_session_unlock.sql` | `sessions.admin_unlocked_at` — per-session staff re-authentication before admin routes unlock |
| `021_financial_integrity.sql` | DB-level money CHECK constraints (no negative amounts, fee-split reconciliation, escrow-requires-payment, paid-requires-fee-snapshot) + backfill of pre-payment-era `escrow_status`; 10 missing FK-covering indexes |
| `022_rate_limits.sql` | `rate_limits` table + `check_rate_limit()` function — moves rate limiting from in-process memory to Postgres (fixes per-instance limit bypass on serverless) |
| `023_store_slugs.sql` | `sellers.store_slug`/`store_slug_claimed_at`; `store_slug_aliases` table — permanent shareable storefront URLs |
| `024_transaction_records.sql` | `transaction_records`, `transaction_record_events` tables — buyer-facing verified proof-of-completion, created once per order on release |
| `025_reviews.sql` | `reviews` table — makes review text visible/listable/repliable (previously only lived on `orders.review_comment`); backfills existing reviewed orders |
| `026_product_details.sql` | `products` gains `description`/`condition`/`qty`/`location`/`delivery_option`/`color`/`variation`; `product_images` table — multi-photo listings |
| `027_product_moderation.sql` | `moderation_rules`, `product_reports` tables; `products.moderation_status`/`moderation_reason`/`moderated_by`/`moderated_at` |
| `028_pin_rate_limit_search_path.sql` | Pins `check_rate_limit`'s `search_path` to `public` (fixes a Supabase security-linter warning) |
| `029_boost_payment_idempotency.sql` | `boosts.payment_id` (+ unique partial index) — makes boost activation idempotent against a redelivered Paystack webhook |
| `030_boost_subscription_expiry_notifications.sql` | `products.boost_expiry_notified_at` — dedupes the "your boost ended" notification per boost window |
| `031_store_templates.sql` | `sellers.store_template` default `classic` — storefront layout picker for paid plans |
| `032_store_accent_colors.sql` | `sellers.store_accent` default `violet` — curated storefront color presets for paid plans |
| `033_priority_support.sql` | `support_tickets.priority` (+ index) — real enforcement of the "priority support" plan benefit, decided once at ticket creation |

---

## Key takeaways

1. **No Supabase Auth, no `auth.uid()` policies anywhere.** Custom phone+password auth
   (`lib/auth.ts`), cookie sessions (`sessions` table). RLS is defense-in-depth only; the
   service-role key is the actual trust boundary, used from every Next.js API route.
2. **`schema.sql` is a true mirror of the live schema** (regenerated and verified 2026-10-01,
   see the note at the top of this file) — keep it that way by regenerating it again whenever
   a new migration lands, rather than letting it drift a second time.
3. **Identity dual-tracking is a recurring pattern**: `products`/`orders`/`offers` all carry
   both a legacy text `seller` name and a nullable `seller_id` FK — a deliberate, additive,
   in-progress migration (009) toward reliable identity, not yet the sole source of truth
   anywhere. Don't assume `seller_id` is always populated.
4. **Snapshot-on-completion is a recurring pattern** too: `orders`' fee columns,
   `transaction_records`, and `reviews.seller_name`/`support_tickets.priority` are all values
   frozen at a specific moment and never recomputed — specifically so a later
   config/plan/rename change can't retroactively rewrite history.
