-- A payout can land at 'manual_required' for two very different reasons:
-- (a) the original attempt never reached Paystack at all (no bank account
-- on file, or Paystack not configured), which is perfectly safe to retry
-- with a fresh transfer reference; or (b) the attempt DID reach Paystack
-- but the connection dropped before a response came back, so the transfer
-- may have actually succeeded — retrying that one blindly risks paying the
-- seller twice. This column lets code (lib/payments.ts#retrySellerPayout)
-- tell the two apart and refuse to auto-retry case (b), instead requiring
-- an admin to manually check Paystack's own transfer history first.
alter table payouts
  add column if not exists transfer_unconfirmed boolean not null default false;
