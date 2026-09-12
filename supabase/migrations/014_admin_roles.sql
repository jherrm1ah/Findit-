-- ---------------------------------------------------------------------------
-- 014 — Scoped admin roles.
--
-- Before this, "admin" was one flat role with total access. This adds a
-- sub-role on top of it (users.role stays 'admin' — this only narrows what
-- an admin account can DO), enforced server-side (see
-- lib/adminRoles.ts#hasAdminPermission), never just hidden in the UI.
--
-- Every EXISTING admin backfills to 'super_admin' (full access) so nobody
-- currently running this app loses any capability they have today — this
-- migration only adds the ability to grant a MORE restricted role to a
-- newly-promoted admin going forward.
-- ---------------------------------------------------------------------------

alter table users add column if not exists admin_role text
  check (admin_role in ('super_admin', 'verification_admin', 'support_admin', 'finance_admin', 'moderation_admin'));

update users set admin_role = 'super_admin' where role = 'admin' and admin_role is null;
