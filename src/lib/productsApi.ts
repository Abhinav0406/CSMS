import { supabase } from '@/lib/supabaseClient';
import { Product } from '@/lib/inventory';

export async function fetchProducts(): Promise<Product[]> {
  if (!supabase) return [] as Product[];
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error || !data) return [] as Product[];
  return data.map(rowToProduct);
}

export async function upsertProducts(items: Product[]): Promise<void> {
  if (!supabase || items.length === 0) return;
  const payload = items.map(productToRow);
  // Chunk large imports to avoid payload limits/timeouts
  const CHUNK = 500;
  for (let i = 0; i < payload.length; i += CHUNK) {
    const slice = payload.slice(i, i + CHUNK);
    const { error } = await supabase.from('products').upsert(slice, { onConflict: 'sku,location' });
    if (error) throw error;
  }
}

// Variant upsert: expects rows keyed by (sku, location, color, size)
export async function upsertProductVariants(items: Array<{
  sku: string;
  location: string;
  color?: string | null;
  size?: string | null;
  on_hand_current?: number;
  on_hand_new?: number;
  committed?: number;
  incoming?: number;
  unavailable?: number;
  raw?: Record<string, any>;
}>): Promise<void> {
  if (!supabase || items.length === 0) return;
  // 1) Collapse duplicates in the incoming array by (sku, location, color, size)
  const byKey = new Map<string, {
    sku: string; location: string; color: string; size: string;
    on_hand_current: number; on_hand_new: number; committed: number; incoming: number; unavailable: number; raw: Record<string, any>;
  }>();
  for (const v of items) {
    const key = [v.sku, v.location, (v.color ?? '').trim(), (v.size ?? '').trim()].join('__');
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, {
        sku: v.sku,
        location: v.location,
        color: (v.color ?? '').trim(),
        size: (v.size ?? '').trim(),
        on_hand_current: v.on_hand_current ?? 0,
        on_hand_new: v.on_hand_new ?? 0,
        committed: v.committed ?? 0,
        incoming: v.incoming ?? 0,
        unavailable: v.unavailable ?? 0,
        raw: v.raw ?? {},
      });
    } else {
      // Aggregate numeric fields when duplicates appear (e.g., multiple CSV rows for same variant)
      prev.on_hand_current += v.on_hand_current ?? 0;
      prev.on_hand_new += v.on_hand_new ?? 0;
      prev.committed += v.committed ?? 0;
      prev.incoming += v.incoming ?? 0;
      prev.unavailable += v.unavailable ?? 0;
      prev.raw = { ...prev.raw, ...(v.raw ?? {}) };
    }
  }
  const payload = Array.from(byKey.values());

  // 2) Chunk to avoid payload limits
  const CHUNK = 500;
  for (let i = 0; i < payload.length; i += CHUNK) {
    const slice = payload.slice(i, i + CHUNK);
    const { error } = await supabase
      .from('product_variants')
      .upsert(slice, { onConflict: 'sku,location,color,size' });
    if (error) throw error;
  }
}

// Fetch all variants rows from product_variants
export type ProductVariantRow = {
  sku: string;
  location: string;
  color: string | null;
  size: string | null;
  on_hand_current: number | null;
  on_hand_new: number | null;
  committed: number | null;
  incoming: number | null;
};

export async function fetchAllVariants(): Promise<ProductVariantRow[]> {
  if (!supabase) return [] as ProductVariantRow[];
  const { data, error } = await supabase
    .from('product_variants')
    .select('sku, location, color, size, on_hand_current, on_hand_new, committed, incoming');
  if (error || !data) return [] as ProductVariantRow[];
  return data as ProductVariantRow[];
}

export async function updateOnHandNew(sku: string, location: string, onHandNew: number): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('products')
    .update({ on_hand_new: onHandNew })
    .eq('sku', sku)
    .eq('location', location);
  if (error) throw error;
}

export async function updateCommittedQty(sku: string, location: string, committed: number): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('products')
    .update({ committed })
    .eq('sku', sku)
    .eq('location', location);
  if (error) throw error;
}

export async function updateOnHandCurrent(sku: string, location: string, onHandCurrent: number): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('products')
    .update({ on_hand_current: onHandCurrent })
    .eq('sku', sku)
    .eq('location', location);
  if (error) throw error;
}

export async function fetchProductBySkuLocation(sku: string, location?: string): Promise<Product | undefined> {
  if (!supabase) return undefined;
  const normSku = (sku || '').trim();
  const normLoc = (location || '').trim();

  // 1) Exact match on sku + location
  if (normLoc) {
    const exact = await supabase
      .from('products')
      .select('*')
      .eq('sku', normSku)
      .eq('location', normLoc)
      .maybeSingle();
    if (exact.data) return rowToProduct(exact.data);
  }

  // 2) Fuzzy location (case-insensitive contains)
  if (normLoc) {
    const fuzzy = await supabase
      .from('products')
      .select('*')
      .eq('sku', normSku)
      .ilike('location', `%${normLoc}%`)
      .limit(1);
    if (fuzzy.data && fuzzy.data.length > 0) return rowToProduct(fuzzy.data[0]);
  }

  // 3) Fallback to first row by sku
  const any = await supabase
    .from('products')
    .select('*')
    .eq('sku', normSku)
    .limit(1);
  if (any.data && any.data.length > 0) return rowToProduct(any.data[0]);
  return undefined;
}

export async function fetchProductsBySku(sku: string): Promise<Product[]> {
  if (!supabase) return [] as Product[];
  const normSku = (sku || '').trim();
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('sku', normSku);
  if (error || !data) return [] as Product[];
  return data.map(rowToProduct);
}

function rowToProduct(r: any): Product {
  return {
    sku: r.sku,
    name: r.title,
    handle: r.handle ?? undefined,
    location: r.location,
    onHandCurrent: r.on_hand_current ?? 0,
    onHandNew: r.on_hand_new ?? r.on_hand_current ?? 0,
    committed: r.committed ?? 0,
    incoming: r.incoming ?? 0,
    unavailable: r.unavailable ?? 0,
    returns: 0,
    rawHeaders: r.raw_headers ?? undefined,
    rawRow: r.raw ?? undefined,
  };
}

function productToRow(p: Product): any {
  return {
    sku: p.sku,
    location: p.location,
    title: p.name,
    on_hand_current: p.onHandCurrent,
    on_hand_new: p.onHandNew,
    committed: p.committed,
    incoming: p.incoming ?? 0,
    unavailable: p.unavailable ?? 0,
    handle: p.handle ?? null,
    raw: p.rawRow ?? {},
    raw_headers: p.rawHeaders ?? [],
  };
}


