-- Quick sanity check: run this in Supabase SQL editor to verify variant rows exist
select sku, location, color, size, on_hand_current, on_hand_new
from public.product_variants
order by sku, color, size
limit 20;

