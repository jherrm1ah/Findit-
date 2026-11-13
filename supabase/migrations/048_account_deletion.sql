-- 048: Delete my account (required by Google Play, and the right thing to offer anyway).
--
-- A FindIt account can't simply be DELETEd: orders, payments, payouts and transaction records
-- point at it, and those are financial records FindIt must keep (tax, disputes, chargebacks).
-- So "delete" means: everything that identifies the person is wiped, the account can never be
-- signed into again, and the phone number is freed so it can sign up fresh. The money records
-- stay, linked to an anonymous "Deleted user".
--
-- Not allowed while money is still moving (paid orders in escrow or disputed, payouts not
-- finished), because the person would lose the ability to confirm delivery, dispute or be paid.
-- The function returns {ok:false, blocked:[...]} with plain reasons instead.
--
-- Called only by the server (service role) after it has re-checked the person's password.

alter table users add column if not exists deleted_at timestamptz;

-- Unpaid orders closed because one side deleted their account get their own reason.
alter table orders drop constraint if exists orders_cancel_reason_valid;
alter table orders add constraint orders_cancel_reason_valid
  check (cancel_reason is null or cancel_reason in ('buyer', 'expired', 'account_deleted'));

create or replace function public.delete_account(p_user_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  u users%rowtype;
  s sellers%rowtype;
  blocked text[] := '{}';
begin
  select * into u from users where id = p_user_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'blocked', jsonb_build_array('Account not found'));
  end if;
  if u.deleted_at is not null then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  if u.role = 'admin' then
    return jsonb_build_object('ok', false, 'blocked', jsonb_build_array('Staff accounts are removed by another admin'));
  end if;

  select * into s from sellers where user_id = p_user_id;

  -- Money still moving: these must finish first.
  if exists (select 1 from orders where user_id = p_user_id and payment_status = 'paid'
             and escrow_status in ('held', 'disputed')) then
    blocked := array_append(blocked, 'You have paid orders that haven''t been delivered or settled yet');
  end if;
  if s.id is not null then
    if exists (select 1 from orders where seller_id = s.id and payment_status = 'paid'
               and escrow_status in ('held', 'disputed')) then
      blocked := array_append(blocked, 'Customers have paid orders from you that haven''t been delivered or settled yet');
    end if;
    if exists (select 1 from payouts where seller_id = s.id
               and status in ('pending', 'processing', 'failed', 'manual_required')) then
      blocked := array_append(blocked, 'A payout to you is still being processed');
    end if;
  end if;
  if array_length(blocked, 1) > 0 then
    return jsonb_build_object('ok', false, 'blocked', to_jsonb(blocked));
  end if;

  -- Unpaid orders, either side, are cancelled (no money has moved on them).
  update orders set status = 'Cancelled', cancelled_at = now(), cancel_reason = 'account_deleted'
   where (user_id = p_user_id or (s.id is not null and seller_id = s.id))
     and payment_status <> 'paid' and status <> 'Cancelled';

  -- Open requests close.
  update requests set status = 'cancelled' where user_id = p_user_id and status = 'open';

  if s.id is not null then
    -- Listings come down; the shop is closed and its bank details are removed.
    update products set active = false where seller_id = s.id;
    update sellers set
      name = 'Deleted seller',
      status = 'suspended',
      status_reason = 'Account deleted',
      bank_account_number = null,
      bank_code = null,
      paystack_recipient_code = null
     where id = s.id;
    delete from seller_verification_details where seller_id = s.id;
    delete from seller_verification_evidence where seller_id = s.id;
    delete from seller_locations where seller_id = s.id;
  end if;

  -- Signed out everywhere; nothing more is sent to them.
  delete from sessions where user_id = p_user_id;
  delete from push_subscriptions where user_id = p_user_id;
  delete from saved_items where user_id = p_user_id;
  delete from notifications where user_id = p_user_id;

  -- The person is gone from the account itself. The phone becomes a placeholder (so the real
  -- number can sign up again) and the password can never match anything.
  update users set
    phone = 'deleted:' || id,
    email = null,
    name = 'Deleted user',
    business_name = null,
    avatar_url = null,
    lat = null,
    lng = null,
    location_updated_at = null,
    saved_delivery_address = null,
    notifications_enabled = false,
    phone_verified = false,
    password_hash = encode(sha256(convert_to(gen_random_uuid()::text || clock_timestamp()::text, 'UTF8')), 'hex'),
    password_salt = encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'),
    suspended = true,
    suspended_reason = 'Account deleted',
    deleted_at = now()
   where id = p_user_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.delete_account(text) from public, anon, authenticated;
