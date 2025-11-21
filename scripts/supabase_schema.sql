-- PRODUCTS (one row per SKU+Location)
create table if not exists public.products (
  id bigserial primary key,
  sku text not null,
  location text not null,
  title text,
  handle text,
  on_hand_current integer default 0,
  on_hand_new integer default 0,
  committed integer default 0,
  incoming integer default 0,
  unavailable integer default 0,
  raw jsonb default '{}'::jsonb,
  raw_headers jsonb default '[]'::jsonb,
  updated_at timestamptz default now()
);

-- unique(sku,location)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_sku_location_key'
  ) then
    alter table public.products
      add constraint products_sku_location_key unique (sku, location);
  end if;
end $$;

-- enable RLS + policies (INSERT uses only WITH CHECK)
alter table public.products enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='products' and policyname='products_insert'
  ) then
    create policy products_insert on public.products
      for insert to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='products' and policyname='products_update'
  ) then
    create policy products_update on public.products
      for update to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='products' and policyname='products_select'
  ) then
    create policy products_select on public.products
      for select to authenticated
      using (true);
  end if;
end $$;

-- PRODUCT VARIANTS (one row per SKU+Location+Color+Size)
create table if not exists public.product_variants (
  id bigserial primary key,
  sku text not null,
  location text not null,
  color text,  -- app sends '' when no color
  size text,   -- app sends '' when no size
  source_row_id text default '',
  on_hand_current integer default 0,
  on_hand_new integer default 0,
  committed integer default 0,
  incoming integer default 0,
  unavailable integer default 0,
  raw jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- ensure uniqueness across (sku, location, color, size)
do $$
begin
  if exists (
    select 1 from pg_indexes
    where schemaname='public' and indexname='product_variants_sku_loc_color_size_idx'
  ) then
    drop index public.product_variants_sku_loc_color_size_idx;
  end if;

  if exists (
    select 1 from pg_constraint
    where conname='product_variants_unique'
  ) then
    alter table public.product_variants drop constraint product_variants_unique;
  end if;

  alter table public.product_variants
    add constraint product_variants_unique unique (sku, location, color, size, source_row_id);
end $$;

-- enable RLS + policies for variants
alter table public.product_variants enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='product_variants' and policyname='product_variants_insert'
  ) then
    execute 'create policy product_variants_insert on public.product_variants
      for insert to authenticated
      with check (true);';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='product_variants' and policyname='product_variants_update'
  ) then
    execute 'create policy product_variants_update on public.product_variants
      for update to authenticated
      using (true)
      with check (true);';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='product_variants' and policyname='product_variants_select'
  ) then
    execute 'create policy product_variants_select on public.product_variants
      for select to authenticated
      using (true);';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='product_variants' and policyname='product_variants_delete'
  ) then
    execute 'create policy product_variants_delete on public.product_variants
      for delete to authenticated
      using (true);';
  end if;
end $$;

