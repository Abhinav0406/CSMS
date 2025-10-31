import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { parseCsvLine } from '@/lib/csv';
import { buildVariantKey } from '@/lib/variantKey';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'file missing' }, { status: 400 });
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return NextResponse.json({ inserted: 0, updated: 0 });

    const header = parseCsvLine(lines[0]);
    const map = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
    const idx = {
      handle: map('Handle'),
      title: map('Title'),
      o1n: map('Option1 Name'), o1v: map('Option1 Value'),
      o2n: map('Option2 Name'), o2v: map('Option2 Value'),
      o3n: map('Option3 Name'), o3v: map('Option3 Value'),
      sku: map('SKU'),
      hs: map('HS Code'),
      coo: map('COO'),
      location: map('Location'),
      bin: map('Bin name'),
      incoming: map('Incoming'),
      unavailable: map('Unavailable'),
      committed: map('Committed'),
      available: map('Available'),
      ohc: map('On hand (current)'),
      ohn: map('On hand (new)'),
    };

    const rows: any[] = [];
    for (let r = 1; r < lines.length; r++) {
      const cols = parseCsvLine(lines[r]);
      if (cols.length === 0) continue;
      const get = (i: number) => (i >= 0 ? cols[i] ?? '' : '');
      const handle = get(idx.handle).trim();
      const title = get(idx.title).trim();
      const option1Name = get(idx.o1n).trim();
      const option1Value = get(idx.o1v).trim();
      const option2Name = get(idx.o2n).trim();
      const option2Value = get(idx.o2v).trim();
      const option3Name = get(idx.o3n).trim();
      const option3Value = get(idx.o3v).trim();
      const sku = get(idx.sku).trim();
      const hs_code = get(idx.hs).trim();
      const coo = get(idx.coo).trim();
      const location = get(idx.location).trim();
      const bin_name = get(idx.bin).trim();
      const incoming = toInt(get(idx.incoming));
      const unavailable = toInt(get(idx.unavailable));
      const committed = toInt(get(idx.committed));
      const available = toInt(get(idx.available));
      const on_hand_current = toInt(get(idx.ohc));
      const on_hand_new = toInt(get(idx.ohn), on_hand_current);
      const variant_key = buildVariantKey(handle, location, option1Value, option2Value, option3Value);
      rows.push({
        handle, title,
        option1_name: option1Name, option1_value: option1Value,
        option2_name: option2Name, option2_value: option2Value,
        option3_name: option3Name, option3_value: option3Value,
        sku, hs_code, coo, location, bin_name,
        incoming, unavailable, committed, available,
        on_hand_current, on_hand_new,
        variant_key,
      });
    }

    // batch upsert
    let inserted = 0, updated = 0;
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const { data, error } = await supabase
        .from('inventory')
        .upsert(slice, { onConflict: 'variant_key' })
        .select();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      inserted += data?.length ?? 0; // rough count; PG doesn't split ins/upd easily without triggers
    }

    return NextResponse.json({ processed: rows.length, upserted: inserted });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Import failed' }, { status: 500 });
  }
}

function toInt(v: string, fallback?: number): number {
  if (v == null || v === '') return fallback ?? 0;
  const s = v.trim().toLowerCase();
  if (s === 'not stocked') return 0;
  const n = Number(s);
  return Number.isFinite(n) ? Math.floor(n) : (fallback ?? 0);
}


