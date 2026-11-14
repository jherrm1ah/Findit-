-- 051: Phone notifications in the Android app (Firebase Cloud Messaging). App devices are stored
-- in the same push_subscriptions table as browsers, so signing out, turning alerts off and
-- deleting an account (migration 048) remove them the same way.
--   kind = 'web' (a browser: endpoint + keys)  |  'fcm' (the Android app: endpoint = the device token)
alter table push_subscriptions add column if not exists kind text not null default 'web';
alter table push_subscriptions drop constraint if exists push_subscriptions_kind_valid;
alter table push_subscriptions add constraint push_subscriptions_kind_valid check (kind in ('web', 'fcm'));
