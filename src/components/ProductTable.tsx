'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Product, computeAvailable, computeTotal } from '@/lib/inventory';
// QuantityAdjuster removed per latest requirements; table is read-only
import { ImageWithFallback } from '@/components/ImageWithFallback';
import { getCurrentSession } from '@/lib/auth';
import { fetchProducts, upsertProducts, updateOnHandNew, updateCommittedQty, upsertProductVariants, fetchAllVariants, ProductVariantRow } from '@/lib/productsApi';
import { supabase } from '@/lib/supabaseClient';

interface Props {
  initialProducts: Product[];
}

export function ProductTable({ initialProducts }: Props) {
  const [isEdit, setIsEdit] = useState<boolean>(false);
  const [rows, setRows] = useState<Product[]>(initialProducts);
  const STORAGE_KEY = 'csms_products_v1';
  const PAGE_SIZE = 50;
  const [page, setPage] = useState<number>(1);
  const [query, setQuery] = useState<string>('');
  const [availability, setAvailability] = useState<'all' | 'in' | 'out'>('all');
  // Always show variants (no manual grouping needed)
  const [groupBy] = useState<'sku_color'>('sku_color');
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);
  const [variantRows, setVariantRows] = useState<ProductVariantRow[]>([]);

  // resolve role asynchronously
  useEffect(() => {
    (async () => {
      const s = await getCurrentSession();
      setIsEdit(s?.role === 'Edit');
    })();
  }, []);

  // load persisted rows on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Product[];
        if (Array.isArray(parsed)) setRows(parsed);
      }
    } catch {}
  }, []);

  const persist = (next: Product[]) => {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  };

  // then try Supabase (authoritative)
  useEffect(() => {
    (async () => {
      const remote = await fetchProducts();
      if (remote.length > 0) {
        setRows(remote);
        persist(remote);
      }
    })();
  }, []);

  // Load variant rows when grouping by variant, or when app starts (best effort)
  useEffect(() => {
    (async () => {
      if (groupBy === 'sku' && variantRows.length > 0) return;
      const v = await fetchAllVariants();
      if (v.length > 0) setVariantRows(v);
    })();
  }, []);

  const updateOnHand = (sku: string, next: number) => {
    // no-op in table; edits happen on product detail page now
  };

  const updateCommitted = (sku: string, next: number) => {
    // no-op; committed is read-only here
  };

  // Variant helpers
  function extractSize(rawRow?: Record<string, string>, rawHeaders?: string[]): string | undefined {
    if (!rawRow || !rawHeaders) return undefined;
    const headersLower = rawHeaders.map((h) => h.toLowerCase());
    const pairs = [
      { n: findAnyIndex(headersLower, ['option1 name']), v: findAnyIndex(headersLower, ['option1 value']) },
      { n: findAnyIndex(headersLower, ['option2 name']), v: findAnyIndex(headersLower, ['option2 value']) },
      { n: findAnyIndex(headersLower, ['option3 name']), v: findAnyIndex(headersLower, ['option3 value']) },
    ];
    for (const p of pairs) {
      if (p.n >= 0 && p.v >= 0) {
        const name = (rawRow[rawHeaders[p.n]] || '').trim().toLowerCase();
        const val = (rawRow[rawHeaders[p.v]] || '').trim();
        if (name === 'size' && val) return val;
      }
    }
    return undefined;
  }

  type Agg = { sku: string; name: string; variant?: string; color?: string | null; size?: string | null; onHandCurrent: number; onHandNew: number; committed: number; incoming: number; available: number };

  // Map of one representative product per SKU (used for names/order)
  const sampleBySku = useMemo(() => {
    const m = new Map<string, Product>();
    for (const r of rows) {
      if (!m.has(r.sku)) m.set(r.sku, r);
    }
    return m;
  }, [rows]);

  const aggregated: Agg[] = useMemo(() => {
    if (groupBy === 'sku') {
      const bySku = new Map<string, Agg>();
      const orderBySku = new Map<string, number>();
      for (const p of rows) {
        const a = bySku.get(p.sku) || { sku: p.sku, name: p.name, onHandCurrent: 0, onHandNew: 0, committed: 0, incoming: 0, available: 0 };
        a.onHandCurrent += (typeof p.onHandCurrent === 'number' ? p.onHandCurrent : 0);
        a.onHandNew += p.onHandNew;
        a.committed += p.committed;
        a.incoming += p.incoming ?? 0;
        bySku.set(p.sku, a);
        const ord = Number(((p.rawRow as any)?.['__order']) ?? Infinity);
        if (Number.isFinite(ord)) {
          const prev = orderBySku.get(p.sku);
          if (prev == null || ord < prev) orderBySku.set(p.sku, ord);
        }
      }
      for (const a of bySku.values()) a.available = a.onHandCurrent - a.committed;
      return Array.from(bySku.values()).sort((x,y)=>{
        const ox = orderBySku.get(x.sku);
        const oy = orderBySku.get(y.sku);
        if (ox != null && oy != null && ox !== oy) return ox - oy;
        if (ox != null && oy == null) return -1;
        if (ox == null && oy != null) return 1;
        return x.sku.localeCompare(y.sku);
      });
    }

    // Variant rows (Color/Size combined) - show all variants directly
    const byKey = new Map<string, Agg>();
    const orderByKey = new Map<string, number>();
    if (variantRows.length > 0) {
      for (const v of variantRows) {
        const color = (v.color || '').trim();
        const size = (v.size || '').trim();
        const keyVariant = (color || size) ? [color, size].filter(Boolean).join(' / ') : 'Unspecified';
        const k = `${v.sku}__${color}__${size}`;
        const a = byKey.get(k) || { sku: v.sku, name: sampleBySku.get(v.sku)?.name || v.sku, variant: keyVariant, color, size, onHandCurrent: 0, onHandNew: 0, committed: 0, incoming: 0, available: 0 };
        a.onHandCurrent += Number(v.on_hand_current || 0);
        a.onHandNew += Number(v.on_hand_new || 0);
        a.committed += Number(v.committed || 0);
        a.incoming += Number(v.incoming || 0);
        byKey.set(k, a);
        // Keep original order if available
        const ord = Number((((sampleBySku.get(v.sku) as any)?.rawRow) || {})['__order'] ?? Infinity);
        if (Number.isFinite(ord)) {
          const prev = orderByKey.get(k);
          if (prev == null || ord < prev) orderByKey.set(k, ord);
        }
      }
    } else {
      // Fallback: derive from imported rawRow (pre-variants-table days)
      for (const r of rows) {
        const color = (extractColor(r.rawRow, r.rawHeaders) || '').trim();
        const size = (extractSize(r.rawRow, r.rawHeaders) || '').trim();
        const keyVariant = (color || size) ? [color, size].filter(Boolean).join(' / ') : 'Unspecified';
        const k = `${r.sku}__${color}__${size}`;
        const a = byKey.get(k) || { sku: r.sku, name: r.name, variant: keyVariant, color, size, onHandCurrent: 0, onHandNew: 0, committed: 0, incoming: 0, available: 0 };
        a.onHandCurrent += (typeof r.onHandCurrent === 'number' ? r.onHandCurrent : 0);
        a.onHandNew += r.onHandNew || 0;
        a.committed += r.committed || 0;
        a.incoming += r.incoming || 0;
        byKey.set(k, a);
        const ord = Number(((r.rawRow as any)?.['__order']) ?? Infinity);
        if (Number.isFinite(ord)) {
          const prev = orderByKey.get(k);
          if (prev == null || ord < prev) orderByKey.set(k, ord);
        }
      }
    }
    for (const a of byKey.values()) a.available = a.onHandCurrent - a.committed;
    return Array.from(byKey.values()).sort((x,y)=>{
      const kx = `${x.sku}__${x.variant || ''}`;
      const ky = `${y.sku}__${y.variant || ''}`;
      const ox = orderByKey.get(kx);
      const oy = orderByKey.get(ky);
      if (ox != null && oy != null && ox !== oy) return ox - oy;
      if (ox != null && oy == null) return -1;
      if (ox == null && oy != null) return 1;
      return x.sku === y.sku ? (x.variant || '').localeCompare(y.variant || '') : x.sku.localeCompare(y.sku);
    });
  }, [rows, groupBy]);
  const pageCount = useMemo(() => Math.max(1, Math.ceil(aggregated.length / PAGE_SIZE)), [aggregated]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = aggregated.filter((r) => {
      const name = (r.name || '').toLowerCase();
      const sku = (r.sku || '').toLowerCase();
      const matchesQ = q.length === 0 || name.includes(q) || sku.includes(q);
      if (!matchesQ) return false;
      const avail = r.onHandCurrent - r.committed;
      if (availability === 'in') return avail > 0;
      if (availability === 'out') return avail <= 0;
      return true;
    });
    return list;
  }, [aggregated, query, availability]);
  const filteredPageCount = useMemo(() => Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)), [filtered]);
  const data = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  useEffect(() => { setPage(1); }, [query, availability, groupBy]);

  const exportCsv = async () => {
    if (!isEdit) return;
    try {
      // Prefer exporting from product_variants (exact variant rows)
      if (supabase) {
        const { data, error } = await supabase.from('product_variants').select('*');
        if (!error && data && data.length > 0) {
          const headers = buildVariantExportHeaders();
          const lines: string[] = [headers.join(',')];
          for (const v of data as any[]) {
            const raw: Record<string, any> = v.raw || {};
            const record: Record<string, any> = { ...raw };
            // Ensure critical fields are current
            record['SKU'] = v['SKU'] || v.sku || raw['SKU'] || '';
            record['Location'] = v['Location'] || v.location || raw['Location'] || '';
            record['On hand (current)'] = v.on_hand_current ?? raw['On hand (current)'] ?? 0;
            record['On hand (new)'] = v.on_hand_new ?? raw['On hand (new)'] ?? 0;
            record['Committed (not editable)'] = v.committed ?? raw['Committed (not editable)'] ?? 0;
            record['Incoming (not editable)'] = v.incoming ?? raw['Incoming (not editable)'] ?? 0;
            record['Unavailable (not editable)'] = v.unavailable ?? raw['Unavailable (not editable)'] ?? 0;
            // Recompute Available from new - committed
            const recomputedAvailable = Number(record['On hand (new)'] || 0) - Number(record['Committed (not editable)'] || 0);
            record['Available (not editable)'] = recomputedAvailable;
            const rowValues = headers.map((h) => escapeCsv(record[h] ?? ''));
            lines.push(rowValues.join(','));
          }
          downloadCsv(lines.join('\n'), 'csms-variants-export.csv');
          return;
        }
      }

      // Fallback to products rows export (legacy)
      const headers = buildExportHeaders(rows);
      const lines = [headers.join(',')];
      for (const r of rows) {
        const record: Record<string, string> = { ...(r.rawRow || {}) };
        upsert(record, 'On hand (new)', String(r.onHandNew));
        upsert(record, 'On hand (current)', String(r.onHandCurrent));
        upsert(record, 'Committed (not editable)', String(r.committed));
        const recomputedAvailable = r.onHandNew - r.committed;
        upsert(record, 'Available (not editable)', String(recomputedAvailable));
        if (typeof r.incoming === 'number') upsert(record, 'Incoming (not editable)', String(r.incoming));
        if (typeof r.unavailable === 'number') upsert(record, 'Unavailable (not editable)', String(r.unavailable));
        if (r.sku) upsert(record, 'SKU', r.sku);
        if (r.location) upsert(record, 'Location', r.location);
        if (r.name) upsert(record, 'Title', r.name);
        if (r.handle) upsert(record, 'Handle', r.handle);
        const rowValues = headers.map((h) => escapeCsv(record[h] ?? ''));
        lines.push(rowValues.join(','));
      }
      downloadCsv(lines.join('\n'), 'csms-products-export.csv');
    } catch {}
  };

  const importCsv = async (file: File) => {
    if (!isEdit) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return;
    const header = parseCsvLine(lines[0]).map((h) => h.trim());
    const headersLower = header.map((h) => h.toLowerCase());
    const iSku = findAnyIndex(headersLower, ['sku']);
    const iTitle = findAnyIndex(headersLower, ['title','name']);
    const iLocation = findAnyIndex(headersLower, ['location']);
    const iIncoming = findAnyIndex(headersLower, ['incoming (not editable)','incoming']);
    const iUnavailable = findAnyIndex(headersLower, ['unavailable (not editable)','unavailable']);
    const iCommitted = findAnyIndex(headersLower, ['committed (not editable)','committed']);
    const iOnHandCurrent = findAnyIndex(headersLower, ['on hand (current)','onhand (current)','onhandcurrent']);
    const iOnHandNew = findAnyIndex(headersLower, ['on hand (new)','onhand (new)','onhandnew']);
    const iHandle = findAnyIndex(headersLower, ['handle']);

    const parsed: Product[] = [];
    for (let r = 1; r < lines.length; r++) {
      const cols = parseCsvLine(lines[r]);
      if (cols.length === 0) continue;
      const sku = (iSku >= 0 ? cols[iSku] : '').trim();
      const location = (iLocation >= 0 ? cols[iLocation] : '').trim() || 'Liberty';
      if (!sku) continue;
      const name = (iTitle >= 0 ? cols[iTitle] : '').trim();
      const onHandCurrent = numOrZero(cols[iOnHandCurrent]);
      const onHandNew = iOnHandNew >= 0 ? numOrZero(cols[iOnHandNew]) : onHandCurrent;
      const committed = numOrZero(cols[iCommitted]);
      const incoming = iIncoming >= 0 ? numOrZero(cols[iIncoming]) : undefined;
      const unavailable = iUnavailable >= 0 ? numOrZero(cols[iUnavailable]) : undefined;
      const handle = iHandle >= 0 ? cols[iHandle]?.trim() : undefined;
      const returns = 0;
      const rawRow: Record<string, string> = {};
      for (let c = 0; c < header.length; c++) rawRow[header[c]] = cols[c] ?? '';
      // Capture import order for later display sorting
      rawRow['__order'] = String(r);
      parsed.push({ sku, name, handle, location: location as any, onHandCurrent, onHandNew, committed, incoming, unavailable, returns, rawHeaders: header, rawRow });
    }
    // persist header order for future exports
    try { if (typeof window !== 'undefined') localStorage.setItem('csms_last_headers', JSON.stringify(header)); } catch {}

    // collapse duplicates in the file itself by (sku, location)
    let collapsedNotice = '';
    const byCsvKey = new Map<string, Product>();
    for (const p of parsed) {
      const k = keyFor(p);
      const existing = byCsvKey.get(k);
      if (!existing) {
        byCsvKey.set(k, { ...p });
      } else {
        // aggregate numeric fields when same (sku, location) appears multiple times (e.g., color variants)
        byCsvKey.set(k, {
          ...existing,
          name: p.name || existing.name,
          handle: p.handle ?? existing.handle,
          onHandCurrent: (typeof existing.onHandCurrent === 'number' ? existing.onHandCurrent : 0) + (typeof p.onHandCurrent === 'number' ? p.onHandCurrent : 0),
          onHandNew: (existing.onHandNew || 0) + (p.onHandNew || 0),
          committed: (existing.committed || 0) + (p.committed || 0),
          incoming: (existing.incoming || 0) + (p.incoming || 0),
          unavailable: (existing.unavailable || 0) + (p.unavailable || 0),
        });
        // preserve earliest import order index
        const prev = Number(((existing.rawRow as any)?.['__order']) ?? Infinity);
        const next = Number(((p.rawRow as any)?.['__order']) ?? Infinity);
        if (Number.isFinite(next) && next < prev) {
          const merged = byCsvKey.get(k)!;
          merged.rawRow = { ...(merged.rawRow || {}), ['__order']: String(next) } as any;
          byCsvKey.set(k, merged);
        }
      }
    }
    const parsedDedup = Array.from(byCsvKey.entries()).map(([k, base]) => {
      // Build color variants for this (sku, location) from the original rows
      const variantsMap = new Map<string, { color: string; onHandCurrent: number; onHandNew: number; committed: number; incoming: number; unavailable: number }>();
      for (const p of parsed) {
        if (keyFor(p) !== k) continue;
        const color = extractColor(p.rawRow, p.rawHeaders);
        if (!color) continue;
        const v = variantsMap.get(color) || { color, onHandCurrent: 0, onHandNew: 0, committed: 0, incoming: 0, unavailable: 0 };
        v.onHandCurrent += typeof p.onHandCurrent === 'number' ? p.onHandCurrent : 0;
        v.onHandNew += p.onHandNew || 0;
        v.committed += p.committed || 0;
        v.incoming += p.incoming || 0;
        v.unavailable += p.unavailable || 0;
        variantsMap.set(color, v);
      }
      if (variantsMap.size > 0) {
        const rawRow = { ...(base.rawRow || {}) } as any;
        rawRow.variants = Array.from(variantsMap.values());
        return { ...base, rawRow };
      }
      return base;
    });
    if (parsedDedup.length !== parsed.length) {
      const dupCount = parsed.length - parsedDedup.length;
      collapsedNotice = `Collapsed ${dupCount} duplicate row(s) by SKU+Location from CSV.`;
    }

    setRows((prev) => {
      const byKey = new Map<string, Product>();
      for (const p of prev) byKey.set(keyFor(p), p);
      for (const p of parsedDedup) byKey.set(keyFor(p), { ...(byKey.get(keyFor(p)) || {} as Product), ...p });
      const nextArr = Array.from(byKey.values());
      persist(nextArr);
      return nextArr;
    });
    try {
      if (!supabase) {
        setNotice({ type: 'warning', message: 'Supabase not configured (env vars missing). Imported locally only.' });
      } else {
        await upsertProducts(parsedDedup);
        // Build and upsert variant rows keyed by (sku, location, color, size)
        const variantRows: Array<{ sku: string; location: string; color?: string | null; size?: string | null; on_hand_current?: number; on_hand_new?: number; committed?: number; incoming?: number; unavailable?: number; raw?: Record<string, any> }>
          = [];
        for (const p of parsed) {
          const color = extractColor(p.rawRow, p.rawHeaders) || null;
          const size = extractSize(p.rawRow, p.rawHeaders) || null;
          variantRows.push({
            sku: p.sku,
            location: p.location as any,
            color,
            size,
            on_hand_current: typeof p.onHandCurrent === 'number' ? p.onHandCurrent : 0,
            on_hand_new: p.onHandNew || 0,
            committed: p.committed || 0,
            incoming: p.incoming || 0,
            unavailable: p.unavailable || 0,
            raw: p.rawRow as any,
          });
        }
        try {
          await upsertProductVariants(variantRows);
          // Refresh variants list so new variant sizes/colors appear immediately
          try {
            const fresh = await fetchAllVariants();
            if (fresh.length > 0) setVariantRows(fresh);
          } catch {}
          setNotice({ type: 'success', message: `Imported ${parsedDedup.length} rows. Saved to Supabase. Variants saved.${collapsedNotice ? ' ' + collapsedNotice : ''}` });
        } catch (ve: any) {
          // Surface the precise Supabase/Postgres error to help diagnosis
          console.error('Variant upsert failed:', ve);
          const msg = ve?.message || ve?.error?.message || ve?.details || ve?.hint || 'Unknown error';
          const code = ve?.code || ve?.error?.code || '';
          setNotice({
            type: 'warning',
            message: `Variants upsert failed${code ? ` (code ${code})` : ''}: ${msg}`,
          });
        }
      }
    } catch (e: any) {
      console.error('Import upsert failed:', e);
      setNotice({ type: 'error', message: `Import failed: ${e?.message || 'Unknown error'}` });
    }
    setPage(1);
  };

  function parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === ',') {
          result.push(current);
          current = '';
        } else if (ch === '"') {
          inQuotes = true;
        } else {
          current += ch;
        }
      }
    }
    result.push(current);
    return result;
  }

  function escapeCsv(v: string): string {
    if (v == null) return '';
    if (/[",\n]/.test(v)) return `"${v.replaceAll('"','""')}"`;
    return v;
  }

  function downloadCsv(content: string, filename: string) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function numOrZero(v: string | undefined): number {
    if (!v) return 0;
    const s = v.trim().toLowerCase();
    if (s === 'not stocked') return 0;
    const n = Number(s);
    return Number.isFinite(n) ? Math.floor(n) : 0; // allow negatives
  }

  function findAnyIndex(headersLower: string[], candidates: string[]): number {
    for (const c of candidates) {
      const idx = headersLower.indexOf(c.toLowerCase());
      if (idx >= 0) return idx;
    }
    return -1;
  }

  function upsert(record: Record<string, string>, key: string, value: string) {
    record[key] = value;
  }

  function keyFor(p: Product): string {
    return `${p.sku}__${p.location}`;
  }

  function extractColor(rawRow?: Record<string, string>, rawHeaders?: string[]): string | undefined {
    if (!rawRow || !rawHeaders) return undefined;
    const headersLower = rawHeaders.map((h) => h.toLowerCase());
    const pairs = [
      { n: findAnyIndex(headersLower, ['option1 name']), v: findAnyIndex(headersLower, ['option1 value']) },
      { n: findAnyIndex(headersLower, ['option2 name']), v: findAnyIndex(headersLower, ['option2 value']) },
      { n: findAnyIndex(headersLower, ['option3 name']), v: findAnyIndex(headersLower, ['option3 value']) },
    ];
    for (const p of pairs) {
      if (p.n >= 0 && p.v >= 0) {
        const name = (rawRow[rawHeaders[p.n]] || '').trim().toLowerCase();
        const val = (rawRow[rawHeaders[p.v]] || '').trim();
        if (name === 'color' && val) return val;
      }
    }
    return undefined;
  }

  function colorsForSku(sku: string): string[] {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.sku !== sku) continue;
      const raw: any = r.rawRow || {};
      if (raw && Array.isArray(raw.variants)) {
        for (const v of raw.variants) {
          if (v && typeof v.color === 'string' && v.color.trim()) set.add(v.color.trim());
        }
      } else {
        const color = extractColor(r.rawRow, r.rawHeaders);
        if (color) set.add(color);
      }
    }
    return Array.from(set.values()).slice(0, 6);
  }

  function buildExportHeaders(items: Product[]): string[] {
    // 1) Prefer the exact last imported header order
    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem('csms_last_headers');
        if (raw) {
          const hdrs = JSON.parse(raw) as string[];
          if (Array.isArray(hdrs) && hdrs.length > 0) return hdrs;
        }
      }
    } catch {}
    // 2) Otherwise, merge rawHeaders from current rows in first-seen order
    const withRaw = items.filter((p) => p.rawHeaders && p.rawHeaders.length > 0);
    if (withRaw.length > 0) {
      const seen = new Set<string>();
      const headers: string[] = [];
      for (const p of withRaw) {
        for (const h of p.rawHeaders!) {
          if (!seen.has(h)) { seen.add(h); headers.push(h); }
        }
      }
      return headers;
    }
    // 3) Fallback default order
    return ['Handle','Title','SKU','Location','Incoming (not editable)','Unavailable (not editable)','Committed (not editable)','Available (not editable)','On hand (current)','On hand (new)'];
  }

  function buildVariantExportHeaders(): string[] {
    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem('csms_last_headers');
        if (raw) {
          const hdrs = JSON.parse(raw) as string[];
          if (Array.isArray(hdrs) && hdrs.length > 0) return hdrs;
        }
      }
    } catch {}
    // Default Shopify header order
    return ['Handle','Title','Option1 Name','Option1 Value','Option2 Name','Option2 Value','Option3 Name','Option3 Value','SKU','HS Code','COO','Location','Bin name','Incoming (not editable)','Unavailable (not editable)','Committed (not editable)','Available (not editable)','On hand (current)','On hand (new)'];
  }

  return (
    <div className="card overflow-hidden">
      {notice && (
        <div className={`px-3 py-2 text-sm ${notice.type === 'error' ? 'bg-red-50 text-red-700 border-b border-red-200' : notice.type === 'warning' ? 'bg-yellow-50 text-yellow-700 border-b border-yellow-200' : 'bg-green-50 text-green-700 border-b border-green-200'}`}>
          {notice.message}
        </div>
      )}
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-gray-600">Total: {filtered.length} • Page {page} / {filteredPageCount}</div>
        <div className="flex items-center gap-2">
          <button className="btn-outline text-xs" onClick={() => setPage(1)} disabled={page === 1}>First</button>
          <button className="btn-outline text-xs" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Prev</button>
          <button className="btn-outline text-xs" onClick={() => setPage((p) => Math.min(filteredPageCount, p + 1))} disabled={page === filteredPageCount}>Next</button>
          <button className="btn-outline text-xs" onClick={() => setPage(filteredPageCount)} disabled={page === filteredPageCount}>Last</button>
          {isEdit && (
            <>
              <button className="btn-outline text-xs" onClick={exportCsv}>Export CSV</button>
              <label className="btn-primary text-xs cursor-pointer">
                Import CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) importCsv(f);
                    e.currentTarget.value = '';
                  }}
                />
              </label>
              <button
                className="btn-outline text-xs"
                onClick={() => {
                  try {
                    if (typeof window !== 'undefined') {
                      localStorage.removeItem(STORAGE_KEY);
                    }
                    setRows([]);
                    setNotice({ type: 'success', message: 'Local cache cleared.' });
                    setPage(1);
                  } catch (e) {
                    setNotice({ type: 'error', message: 'Failed to clear local cache.' });
                  }
                }}
              >
                Clear local cache
              </button>
            </>
          )}
        </div>
      </div>
      <div className="px-3 pb-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <input
            type="text"
            className="input w-full sm:w-72"
            placeholder="Search by SKU or Name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className="input w-full sm:w-48"
            value={availability}
            onChange={(e) => setAvailability(e.target.value as any)}
          >
            <option value="all">All availability</option>
            <option value="in">In stock</option>
            <option value="out">Out of stock</option>
          </select>
          {/* grouping removed: always show variants */}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Image</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product Name</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Variant</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Colors</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">On hand (current)</th>
              {/* Location hidden: one row per SKU */}
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Incoming</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Committed</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Available</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">On hand (new)</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {data.map((p) => {
              const available = p.onHandCurrent - p.committed;
              const sample = sampleBySku.get(p.sku);
              return (
                <tr key={`${p.sku}`} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <Thumb handle={(sample as any)?.handle} url={(sample?.smallImageUrl || sample?.fullImageUrl) as any} name={p.name} />
                  </td>
                  <td className="px-3 py-2 text-sm font-medium text-gray-900">{p.name}</td>
                  <td className="px-3 py-2 text-sm text-gray-700">{p.sku}</td>
                  <td className="px-3 py-2 text-xs text-gray-700">{p.variant}</td>
                  <td className="px-3 py-2 text-xs text-gray-700">
                    <div className="flex flex-wrap gap-1">
                      {colorsForSku(p.sku).map((c) => (
                        <span key={c} className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5">{c}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-sm text-right tabular-nums">{p.onHandCurrent}</td>
                  <td className="px-3 py-2 text-sm text-right tabular-nums">{p.incoming}</td>
                  <td className="px-3 py-2 text-sm text-right tabular-nums">{p.committed}</td>
                  <td className="px-3 py-2 text-sm text-right tabular-nums">{available}</td>
                  <td className="px-3 py-2 text-sm text-center"><span className="tabular-nums">{p.onHandNew}</span></td>
                  <td className="px-3 py-2 text-right">
                    <Link className="btn-outline text-xs" href={`/product/${encodeURIComponent(p.sku)}?color=${encodeURIComponent(p.color || '')}&size=${encodeURIComponent(p.size || '')}`}>View</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-end gap-2 p-3 border-t bg-white">
        <button className="btn-outline text-xs" onClick={() => setPage(1)} disabled={page === 1}>First</button>
        <button className="btn-outline text-xs" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Prev</button>
        <span className="text-xs text-gray-600">Page {page} / {pageCount}</span>
        <button className="btn-outline text-xs" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page === pageCount}>Next</button>
        <button className="btn-outline text-xs" onClick={() => setPage(pageCount)} disabled={page === pageCount}>Last</button>
      </div>
    </div>
  );
}

function Thumb({ handle, url, name }: { handle?: string; url?: string; name: string }) {
  const [src, setSrc] = useState<string | undefined>(url);
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const ref = (useState(null) as any)[0];
  useEffect(() => { setSrc(url); }, [url]);
  useEffect(() => {
    if (src || !handle) return;
    (async () => {
      try {
        const res = await fetch(`/api/images/${encodeURIComponent(handle)}`);
        if (res.ok) {
          const j = await res.json();
          if (j.firstImageUrl) setSrc(j.firstImageUrl);
        }
      } catch {}
    })();
  }, [handle, src]);
  const fallback = `data:image/svg+xml;utf8,${encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'><rect width='100%' height='100%' fill='#f3f4f6'/></svg>"
  )}`;
  return (
    <div
      className="relative"
      onMouseEnter={(e) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const previewW = 320; // reduced size
        const previewH = 320;
        const margin = 12;
        let left = rect.right + margin;
        let top = rect.top + rect.height / 2 - previewH / 2;
        // Clamp to viewport
        const vw = window.innerWidth, vh = window.innerHeight;
        if (left + previewW > vw - 8) left = Math.max(8, vw - previewW - 8);
        if (top < 8) top = 8;
        if (top + previewH > vh - 8) top = Math.max(8, vh - previewH - 8);
        setPos({ top, left });
        setShow(true);
      }}
      onMouseLeave={() => setShow(false)}
    >
      <Image src={src || fallback} alt={name} width={40} height={40} className="rounded object-cover" />
      {src && show && (
        <>
          <div
            className="fixed z-[1000]"
            style={{ top: pos.top, left: pos.left }}
          >
            <div className="bg-white border shadow-2xl p-2 rounded-lg">
              <Image src={src} alt={name} width={320} height={320} className="rounded object-contain max-w-[80vw] max-h-[80vh]" />
            </div>
            <div className="absolute left-[-8px] top-1/2 h-0 w-0 -translate-y-1/2 border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-white drop-shadow" />
          </div>
        </>
      )}
    </div>
  );
}


