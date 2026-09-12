-- ---------------------------------------------------------------------------
-- 017 — Categories admin
--
-- Moves the product/request category taxonomy from a hardcoded object
-- (lib/categories.js) into a real, admin-editable table — the same
-- "price/limits as data, not code" pattern already used for
-- subscription_plans (migration 010). An admin can add/rename/deactivate/
-- reorder a category without a deploy; see lib/categoryCatalog.ts.
--
-- `icon_key` names a lucide-react icon component (e.g. "BookOpen") looked
-- up client-side against a fixed, known set (components/findit-app/data.js)
-- — an unrecognized key just falls back to a generic icon rather than
-- breaking anything, since a database row can't literally contain a React
-- component.
--
-- Seeded with the exact same 15 categories/icons/order that
-- lib/categories.js already hardcodes, so this migration changes nothing
-- about what exists today — only who can change it next, and how.
-- ---------------------------------------------------------------------------

create table if not exists categories (
  id text primary key,
  label text not null,
  icon_key text not null default 'Package',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists categories_active_idx on categories(active);

alter table categories enable row level security;

insert into categories (id, label, icon_key, sort_order) values
  ('reading', 'Reading & Book Gadgets', 'BookOpen', 0),
  ('tools', 'Tools & Repair', 'Wrench', 1),
  ('organization', 'Home Organization', 'Package', 2),
  ('lighting', 'Lighting', 'Lightbulb', 3),
  ('cleaning', 'Cleaning', 'Droplet', 4),
  ('kitchen', 'Kitchen', 'Utensils', 5),
  ('bathroom', 'Bathroom & Personal Care', 'Droplets', 6),
  ('campus', 'Student & Campus', 'GraduationCap', 7),
  ('travel', 'Travel & Everyday Carry', 'Briefcase', 8),
  ('phonetech', 'Phone & Everyday Tech', 'Smartphone', 9),
  ('car', 'Car Products', 'Car', 10),
  ('power', 'Power & Connectivity', 'BatteryCharging', 11),
  ('weird', 'Weirdly Useful', 'Sparkles', 12),
  ('plant', 'Plant & Agriculture', 'Leaf', 13),
  ('desk', 'Desk Setup', 'Monitor', 14)
on conflict (id) do nothing;
