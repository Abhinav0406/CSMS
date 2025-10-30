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
  const { error } = await supabase.from('products').upsert(payload, { onConflict: 'sku,location' });
  if (error) throw error;
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


