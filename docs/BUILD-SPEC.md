# FindIt — Complete the Missing Systems

> Product specification issued by the project owner. This file is the durable
> record of that request. `docs/IMPLEMENTATION-PLAN.md` holds the audit of what
> already exists and the phased plan for what remains.

## Ground rules

- Do NOT rebuild features that are already working.
- Do NOT create fake/mock functionality.
- Do NOT create UI that only looks functional.
- For every feature: connect UI → API/server logic → database → permissions → actual behaviour.
- Use the existing architecture wherever possible.
- Inspect existing code and reuse it before implementing each major system.
- If something requires an external service, env var, API key, business account or
  credential that is not available, build everything that can safely be built now and
  clearly mark the external dependency as pending configuration/testing.

## 1. Complete the admin dashboard

Turn the Admin Dashboard into the actual control center. Keep all existing admin
functionality: seller approval/rejection, seller verification review, verification
evidence viewing, dispute/order review, admin promotion/demotion, audit logs, OTP stats.

Navigation to reach: Dashboard, Users, Sellers, Verification, Stores, Products, Orders,
Transactions, Payments, Subscriptions, FindIt Pro, Reports & Disputes, Boosts, Categories,
Analytics, Notifications, Settings, Audit Logs.

Every section must use real database data. No mock statistics.

## 2. Admin overview

Real platform overview showing: total users, new users, active users, buyers, sellers,
verified sellers, pending sellers, suspended sellers, total stores, active stores,
suspended stores, total products, active products, flagged products, total orders,
pending orders, completed orders, cancelled orders, disputed orders, transaction volume,
successful payments, failed payments, refunds, FindIt platform revenue, subscription
revenue, FindIt Pro revenue, boost revenue, advertising revenue when implemented, active
subscriptions, pending verification, open disputes, reported products.

Important numbers must be clickable and open the relevant section. Do not fabricate numbers.

## 3. User management

Search users; filter by role; filter by status; view user, account information, seller
information, stores, products, orders, subscription, reports; suspend; reactivate; restrict.
Respect privacy and expose only what the admin's role requires.

## 4. Seller management

Search sellers; filter by verification status and seller type; view seller, store, products,
orders, ratings, disputes, account status, subscription; suspend; reactivate; restrict;
review seller activity. Status changes must affect the actual application.

## 5. Complete seller verification

Keep the existing wizard and admin review. Support different requirements for physical
stores, online businesses, home-based sellers, individual sellers, resellers and other
types. Build configurable verification requirements where practical. Potential requirements:
business information, location, product evidence, shop photo, business/social link,
additional documents. Do not force physical-store requirements onto online/home-based
sellers. If document/ID upload can be safely implemented within the existing architecture,
build it using the private verification storage system. Add verification history,
resubmission, admin reason, verification timestamps, and the admin who reviewed it. Never
claim someone is verified unless the database says so.

## 6. Fix seller approval logic

`sellers.status = pending` must actually prevent restricted seller activity. Lifecycle:
PENDING can complete onboarding but cannot perform restricted activities; APPROVED has
normal selling privileges; REJECTED restricted; SUSPENDED restricted. Consistent throughout
the application. Do not break existing sellers.

## 7. Store management

View stores; search; filter; view owner, products, orders, subscription, verification,
ratings, activity; suspend; reactivate; restrict; review. Store suspension must actually
affect the storefront and seller functionality.

## 8. Complete subscription admin

Build the missing admin UI over the existing plan APIs. Manage FREE, BASIC, BUSINESS, PRO,
and separately FINDIT PRO. Configure plan name, monthly price, annual price, product limits,
storage limits, features, trial duration, promotional pricing, active/inactive status. One
database source of truth; do not duplicate pricing/feature values in frontend code. Admin
changes must propagate. Include subscriber count, active, cancelled, expired, trialing,
past due, MRR, annual revenue, churn, conversion, subscription history.

## 9. Build FindIt Pro

Complete it: purchase flow, monthly subscription, annual subscription, payment, activation,
renewal, cancellation, expiration, feature gating, Pro badge, Pro dashboard features, admin
management. Only advertise benefits that exist; otherwise show "Coming Soon". Keep FindIt
Pro separate from Pro Store.

## 10. Real marketplace payments

Buyer → checkout → Paystack → backend verification → payment record → order marked funded →
delivery → buyer confirmation → release → seller payout → FindIt fee recorded.

Never trust the frontend to declare payment successful. Use Paystack initialization, backend
verification, secure webhook verification, idempotency, payment/order relationship,
duplicate-payment protection, failed payment handling, refund handling. Do not mark an order
paid until payment is properly verified.

## 11. Real pay after delivery

Turn `escrow_status` into a properly structured payment lifecycle: payment pending, payment
successful, funds held, order processing, shipped, delivered, awaiting buyer confirmation,
released, disputed, refunded, partially refunded, cancelled. Buyer confirmation triggers the
release workflow. A dispute prevents automatic release until resolved. Do not describe the
system as escrow if the provider/account structure does not actually support holding and
release; identify that dependency and build the internal architecture around it without
pretending funds are held.

## 12. Seller payouts

Track seller, order, gross amount, payment processing fee, FindIt fee, refund amount, seller
net amount, payout amount, payout status, payout reference, date. Statuses: PENDING,
PROCESSING, PAID, FAILED, REVERSED. Never mark a payout successful without provider
confirmation. If automatic payouts need more Paystack configuration, build the internal
system and identify what remains.

## 13. FindIt transaction fees

Do not hard-code 1.5% or 2%. Configurable settings for FindIt percentage, minimum fee,
maximum fee, seller fee, buyer fee, promotional fee rules. Every order transaction stores
the actual fee used at the time. Historical transactions must NOT change when the admin
changes the current fee. Log every fee-setting change.

## 14. Transaction ledger

Every financial event gets a record: order payment, subscription payment, FindIt fee, seller
payout, refund, boost payment, FindIt Pro payment, advertising payment. Each record carries
transaction ID, type, user, seller, store, order, gross amount, fees, net amount, provider,
provider reference, status, timestamp. This is the financial source of truth for the admin
dashboard.

## 15. Refunds

Full refund, partial refund, refund reason, admin decision, provider refund reference, refund
status, refund date. Never simply change a database status and pretend the external payment
was refunded. Provider refund confirmation must be handled properly.

## 16. Reviews & ratings

Inspect whether the current system is complete. If incomplete, build buyer reviews,
seller/store ratings, product reviews where appropriate, verified-purchase reviews, rating
calculation, review reporting, admin moderation, review removal where justified, review
history. Ratings used for Trusted Seller calculations must come from the actual review system.

## 17. Seller reputation

Use real marketplace behaviour: completed orders, cancellation rate, dispute rate, rating,
account age, response behaviour, successful deliveries. Sellers must not be able to declare
themselves trusted. Keep admin override with audit logging. Move hard-coded trust thresholds
into configurable settings where practical.

## 18. Returns & disputes

Return request, reason, evidence, seller response, admin review, approval/rejection, refund,
return status. Integrate with the existing dispute system rather than creating a disconnected
one.

## 19. Delivery management

Delivery method, delivery address, delivery fee, delivery status, tracking reference, proof
of delivery, failed delivery, delivery confirmation. Do not invent a logistics provider
integration. Build the internal architecture first and mark external logistics as Coming Soon.

## 20. Fraud / risk signals

Non-accusatory risk monitoring: excessive cancellations, excessive disputes, repeated failed
deliveries, unusual payment behaviour, multiple suspicious accounts, abnormal pay-after-
delivery behaviour, unusual seller activity. Use "REQUIRES REVIEW", never an automatic "FRAUD"
declaration. Authorized admins can investigate.

## 21. Boosts / featured listings

Keep subscription-based featured placement. Add paid promotional boosts: 24-hour, 7-day,
30-day, homepage promotion, category promotion. Build purchase, payment, activation, start
date, end date, expiration, placement, revenue record, admin management. Admin configures
boost prices.

## 22. Advertising system

Foundation for advertiser/business, campaign, placement, start/end date, budget, pricing,
payment, approval, performance analytics. Do not pretend ads work if the payment/campaign
system is not ready. Use Coming Soon where appropriate.

## 23. Enterprise / business accounts

Architecture for larger businesses where practical: enterprise account, multiple staff/admin
users, multiple stores, advanced analytics, custom plans, custom pricing, admin management.
Do not overbuild. Create a clean foundation rather than a fake feature.

## 24. Search & discovery

Audit and improve search, categories, subcategories, filters, price, location, seller, store,
verification, featured products, relevance sorting. Keep existing location-distance
functionality. Add reverse geocoding/map picker if it can be done cleanly; otherwise mark the
external map/geocoding dependency clearly.

## 25. Categories

Admin category management: create, edit, activate/deactivate, reorder, subcategories. Do not
break existing products when categories change.

## 26. Customer support

Chat is not support. Ticket creation, category, priority, status, assigned admin, messages,
attachments where appropriate, resolution, escalation. Integrate with the admin dashboard.

## 27. Notification system

Keep the existing real notification system. Expand to cover payment successful, payment
failed, order paid, order shipped, order delivered, buyer confirmation, refund, seller payout,
subscription renewal, subscription expiration, FindIt Pro activation, boost activated, dispute
update, account suspension, verification decision. Do not create notification UI without real
events behind it.

## 28. Admin analytics

Real platform-wide analytics calculated from actual database records.

- User growth: new users, active users, buyer/seller growth.
- Seller: new sellers, verified sellers, active sellers.
- Stores: new stores, free vs paid, upgrades, downgrades.
- Marketplace: listings, orders, completed orders, cancellation rate, dispute rate.
- Finance: GMV/transaction volume, subscription revenue, FindIt fees, boost revenue, FindIt
  Pro revenue, refunds, payouts.
- Subscriptions: conversion, churn, MRR, ARPU, plan popularity.

## 29. Admin alert center

An operational "Needs Attention" section: failed payments, pending seller verification, open
disputes, reported products, suspended stores requiring review, failed payouts, risk signals.
Clicking an alert opens the relevant record.

## 30. Admin roles

Keep role-based access: SUPER ADMIN, ADMIN, VERIFICATION ADMIN, SUPPORT ADMIN, FINANCE ADMIN,
MODERATION ADMIN. Permissions enforced server-side, never by frontend hiding. Finance admin
sees financial data; verification admin sees seller verification; moderation admin sees
reports/products.

## 31. Audit logging

Extend `admin_actions` to log seller decisions, user suspension, store suspension, product
removal, subscription changes, price changes, fee changes, refund decisions, dispute
decisions, admin role changes, verification settings changes, boost configuration changes.
Store admin ID, action, target, previous value, new value, reason, timestamp.

## 32. Security hardening

The architecture uses server-side authorization with zero Supabase RLS policies. Do NOT
blindly migrate the authentication architecture. First analyze whether database-level
protections can be added safely without breaking custom-auth/service-role access.

At minimum: review every API route for authorization; review ownership checks; review
sensitive selects; remove unnecessary `select("*")`; protect verification evidence, financial
data, admin data and audit logs; validate every admin action server-side; rate-limit sensitive
operations; prevent IDOR/ownership vulnerabilities; prevent privilege escalation; prevent
duplicate payments/webhooks.

**A security plan is required before any architectural change to authentication or RLS.**

## 33. Data integrity

Audit relationships and remove fragile dependencies: old seller business-name references,
seller ID relationships, subscription ownership, order/payment relationships, product/store
relationships, user/seller relationships. Keep legacy fields where needed for compatibility,
but use proper foreign keys as the source of truth.

## 34. Environment / external services

Clearly identify everything requiring external configuration: Paystack keys, Termii keys,
Gemini key, map/geocoding provider, email provider, storage configuration, production webhook
URLs. Never fake an integration because credentials are missing. Build the code and
configuration structure, then state what must be configured and tested externally.

## 35. Final architecture

    USER → AUTH → SELLER ONBOARDING → VERIFICATION → STORE → SUBSCRIPTION → PRODUCTS →
    DISCOVERY → CUSTOMER → ORDER → PAYMENT → PAYMENT VERIFICATION → PAY AFTER DELIVERY →
    DELIVERY → BUYER CONFIRMATION → FINDIT FEE → SELLER PAYOUT → TRANSACTION LEDGER →
    REVENUE → ANALYTICS

Admin operates across the entire ecosystem:

    MONITOR → VERIFY → MANAGE → MODERATE → CONFIGURE → ANALYZE → AUDIT

## 36. Implementation rules

Before coding: inspect the existing implementation; identify reusable code, schema changes,
API changes, security changes, external dependencies and conflicts; then give a concise
implementation plan. Implement in logical phases.

Do not rewrite working systems unnecessarily. Do not create duplicate tables when an existing
table can be extended safely. Do not create fake data. Do not mark incomplete features as
complete. Do not create UI-only functionality.

For anything blocked on an external credential or service: build everything that can safely be
built, clearly mark the external dependency, and never simulate successful money movement.

After each major phase, report:

- ✅ Completed
- 🟡 Partially completed
- 🔴 Still missing
- ⚠️ Needs external configuration/testing

## Final goal

FindIt should not merely look like a complete marketplace. The underlying system must behave
like one. The Admin Dashboard is the operational brain; Supabase and server-side logic remain
the source of truth. Build carefully, reuse what works, never fake functionality.
