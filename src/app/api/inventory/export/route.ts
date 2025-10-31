import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { escapeCsv } from '@/lib/csv';

export const runtime = 'nodejs';

export async function GET() {
  try {
    if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    const { data, error } = await supabase.from('inventory').select('*');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const headers = SHOPIFY_HEADERS;
    const lines: string[] = [headers.join(',')];
    for (const r of data || []) {
      const record: Record<string, any> = {
        Handle: r.handle,
        Title: r.title,
        'Option1 Name': r.option1_name,
        'Option1 Value': r.option1_value,
        'Option2 Name': r.option2_name,
        'Option2 Value': r.option2_value,
        'Option3 Name': r.option3_name,
        'Option3 Value': r.option3_value,
        SKU: r.sku,
        'HS Code': r.hs_code,
        COO: r.coo,
        Location: r.location,
        'Bin name': r.bin_name,
        Incoming: r.incoming,
        Unavailable: r.unavailable,
        Committed: r.committed,
        Available: r.available,
        'On hand (current)': r.on_hand_current,
        'On hand (new)': r.on_hand_new,
      };
      lines.push(headers.map((h) => escapeCsv(record[h])).join(','));
    }

    const csv = lines.join('\n');
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="inventory_export.csv"',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Export failed' }, { status: 500 });
  }
}

const SHOPIFY_HEADERS = [
  'Handle','Title','Option1 Name','Option1 Value','Option2 Name','Option2 Value','Option3 Name','Option3 Value','SKU','HS Code','COO','Location','Bin name','Incoming','Unavailable','Committed','Available','On hand (current)','On hand (new)'
];


