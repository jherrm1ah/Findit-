-- 050: Codes for deleting an account on request (Admin → Users → "Delete on request"). When
-- someone asks by email, support sends a code to the account's phone and deletes it only once
-- the owner reads that code back, proving the request really comes from them.
alter table otp_verifications drop constraint if exists otp_verifications_purpose_check;
alter table otp_verifications add constraint otp_verifications_purpose_check
  check (purpose in ('signup', 'reset', 'delete_account'));
