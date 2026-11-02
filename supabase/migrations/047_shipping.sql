-- ---------------------------------------------------------------------------
-- 047: shipping & delivery (see docs/SHIPPING.md).
-- Additive. RLS on and no policies, like every table here: only the server
-- (service role) reads or writes; seller routes check ownership.
-- ---------------------------------------------------------------------------

-- Where a seller ships from and/or lets buyers collect (warehouses, shops).
create table if not exists seller_locations (
  id text primary key,
  seller_id text not null references sellers(id) on delete cascade,
  name text not null,
  address text not null,
  area text not null,
  state text not null,
  phone text,
  ships_from boolean not null default true,
  pickup_enabled boolean not null default false,
  pickup_hours text,
  pickup_instructions text,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists seller_locations_seller_id_idx on seller_locations(seller_id);
alter table seller_locations enable row level security;

-- A named set of delivery zones and rates; listings point at one.
create table if not exists shipping_profiles (
  id text primary key,
  seller_id text not null references sellers(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  free_shipping_over integer check (free_shipping_over is null or free_shipping_over > 0),
  location_id text references seller_locations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shipping_profiles_seller_id_idx on shipping_profiles(seller_id);
alter table shipping_profiles enable row level security;

-- Where a profile delivers: states ('*' = everywhere else in Nigeria) and,
-- for local delivery, cities/neighbourhoods.
create table if not exists shipping_zones (
  id text primary key,
  profile_id text not null references shipping_profiles(id) on delete cascade,
  name text not null,
  states text[] not null default '{}',
  areas text[] not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists shipping_zones_profile_id_idx on shipping_zones(profile_id);
alter table shipping_zones enable row level security;

-- One delivery option in a zone.
create table if not exists shipping_rates (
  id text primary key,
  zone_id text not null references shipping_zones(id) on delete cascade,
  name text not null,
  method text not null check (method in ('free', 'flat', 'price', 'weight', 'local')),
  amount integer not null default 0 check (amount >= 0),
  min_order integer check (min_order is null or min_order >= 0),
  max_order integer check (max_order is null or max_order > 0),
  min_weight_g integer check (min_weight_g is null or min_weight_g >= 0),
  max_weight_g integer check (max_weight_g is null or max_weight_g > 0),
  base_weight_g integer check (base_weight_g is null or base_weight_g >= 0),
  per_extra_kg integer check (per_extra_kg is null or per_extra_kg >= 0),
  eta_min_days integer check (eta_min_days is null or eta_min_days >= 0),
  eta_max_days integer check (eta_max_days is null or eta_max_days >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists shipping_rates_zone_id_idx on shipping_rates(zone_id);
alter table shipping_rates enable row level security;

-- Live quotes from a connected carrier (none connected yet).
create table if not exists shipping_quotes (
  id text primary key,
  order_id text not null references orders(id) on delete cascade,
  provider text not null,
  service text not null,
  amount integer not null check (amount >= 0),
  eta_min_days integer,
  eta_max_days integer,
  raw jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists shipping_quotes_order_id_idx on shipping_quotes(order_id);
alter table shipping_quotes enable row level security;

-- A dispatched parcel and its tracking.
create table if not exists shipments (
  id text primary key,
  order_id text not null references orders(id) on delete cascade,
  seller_id text references sellers(id) on delete set null,
  carrier text not null,
  service text,
  tracking_number text,
  tracking_url text,
  label_url text,
  status text not null default 'in_transit'
    check (status in ('pending', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned', 'cancelled')),
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shipments_order_id_idx on shipments(order_id);
create index if not exists shipments_seller_id_idx on shipments(seller_id);
alter table shipments enable row level security;

create table if not exists shipment_events (
  id text primary key,
  shipment_id text not null references shipments(id) on delete cascade,
  status text not null,
  description text,
  location text,
  source text not null default 'seller' check (source in ('seller', 'carrier', 'system')),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists shipment_events_shipment_id_idx on shipment_events(shipment_id);
alter table shipment_events enable row level security;

-- Listings: package details and which profile prices their delivery.
alter table products add column if not exists weight_g integer check (weight_g is null or weight_g > 0);
alter table products add column if not exists length_cm integer check (length_cm is null or length_cm > 0);
alter table products add column if not exists width_cm integer check (width_cm is null or width_cm > 0);
alter table products add column if not exists height_cm integer check (height_cm is null or height_cm > 0);
alter table products add column if not exists shipping_profile_id text references shipping_profiles(id) on delete set null;
create index if not exists products_shipping_profile_id_idx on products(shipping_profile_id);

-- Orders: what the buyer chose, frozen at checkout.
alter table orders add column if not exists shipping_option jsonb;
alter table orders add column if not exists pickup_location jsonb;
alter table orders add column if not exists pickup_status text
  check (pickup_status is null or pickup_status in ('awaiting', 'ready', 'collected'));
alter table orders add column if not exists package_weight_g integer;
