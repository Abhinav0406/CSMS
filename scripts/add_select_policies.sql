-- Add SELECT policies for products and product_variants tables
-- Run this in Supabase SQL Editor if the policies don't exist

-- Add SELECT policy for products table
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='products' and policyname='products_select'
  ) then
    create policy products_select on public.products
      for select to authenticated
      using (true);
  end if;
end $$;

-- Add SELECT policy for product_variants table
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='product_variants' and policyname='product_variants_select'
  ) then
    create policy product_variants_select on public.product_variants
      for select to authenticated
      using (true);
  end if;
end $$;

