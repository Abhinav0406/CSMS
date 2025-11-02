'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import { Product, computeAvailable, computeTotal } from '@/lib/inventory';
// QuantityAdjuster removed per latest requirements; table is read-only
import { ImageWithFallback } from '@/components/ImageWithFallback';
import { InventoryCard } from '@/components/InventoryCard';
import { getCurrentSession } from '@/lib/auth';
import { fetchProducts, upsertProducts, updateOnHandNew, updateCommittedQty, upsertProductVariants, fetchAllVariants, ProductVariantRow } from '@/lib/productsApi';
import { supabase } from '@/lib/supabaseClient';
import { getCachedImageUrl, fetchAndCacheImageUrl, preloadImages } from '@/lib/imageCache';

interface Props {
  initialProducts: Product[];
}

export function ProductTable({ initialProducts }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [isEdit, setIsEdit] = useState<boolean>(false);
  const [rows, setRows] = useState<Product[]>(initialProducts);
  const STORAGE_KEY = 'csms_products_v1';
  const PAGE_SIZE = 50;
  // Initialize page from URL params, fallback to 1
  const [page, setPage] = useState<number>(() => {
    if (typeof window === 'undefined') return 1;
    const pageParam = new URLSearchParams(window.location.search).get('page');
    return pageParam ? Math.max(1, parseInt(pageParam, 10)) : 1;
  });
  const [query, setQuery] = useState<string>('');
  const [availability, setAvailability] = useState<'all' | 'in' | 'out'>('all');
  const [selectedPrefix, setSelectedPrefix] = useState<string>('');
  const [prefixDropdownOpen, setPrefixDropdownOpen] = useState<boolean>(false);
  const prefixDropdownRef = useRef<HTMLDivElement>(null);
  // Always show variants (no manual grouping needed)
  const [groupBy] = useState<'sku_color'>('sku_color');
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);
  const [variantRows, setVariantRows] = useState<ProductVariantRow[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
      if (groupBy === 'sku_color' && variantRows.length > 0) return;
      const v = await fetchAllVariants();
      if (v.length > 0) setVariantRows(v);
    })();
  }, [groupBy, variantRows.length]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
      if (prefixDropdownRef.current && !prefixDropdownRef.current.contains(event.target as Node)) {
        setPrefixDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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

  type Agg = { sku: string; location?: string; name: string; variant?: string; color?: string | null; size?: string | null; onHandCurrent: number; onHandNew: number; committed: number; incoming: number; available: number; prefix?: string };

  // Extract prefix from SKU (e.g., "PT 131" -> "PT", "PN 03" -> "PN")
  function extractPrefix(sku: string): string {
    const match = sku.trim().match(/^([A-Za-z]+)/);
    return match ? match[1].toUpperCase() : '';
  }

  // Map of one representative product per SKU (used for names/order)
  const sampleBySku = useMemo(() => {
    const m = new Map<string, Product>();
    for (const r of rows) {
      if (!m.has(r.sku)) m.set(r.sku, r);
    }
    // Preload images for all products to avoid individual API calls
    const handles = Array.from(m.values())
      .map(p => (p as any)?.handle)
      .filter((h): h is string => !!h && typeof h === 'string');
    if (handles.length > 0) {
      // Preload in background, don't block UI
      preloadImages(handles).catch(() => {});
    }
    return m;
  }, [rows]);

  const aggregated: Agg[] = useMemo(() => {
    // Variant rows (Color/Size combined) - group by SKU + Variant only (aggregate across all locations)
    const byKey = new Map<string, Agg>();
    const orderByKey = new Map<string, number>();
    if (variantRows.length > 0) {
      for (const v of variantRows) {
        const color = (v.color || '').trim();
        const size = (v.size || '').trim();
        // Group by SKU + Variant only (NOT by location)
        const variantKeyLabel = color || size || 'Unspecified';
        const k = `${v.sku}__${variantKeyLabel}`;
        const prefix = extractPrefix(v.sku);
        const a = byKey.get(k) || { sku: v.sku, location: undefined, name: sampleBySku.get(v.sku)?.name || v.sku, variant: variantKeyLabel, color: color || null, size: size || null, onHandCurrent: 0, onHandNew: 0, committed: 0, incoming: 0, available: 0, prefix };
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
        const variantKeyLabel = color || size || 'Unspecified';
        // Group by SKU + Variant only (NOT by location)
        const k = `${r.sku}__${variantKeyLabel}`;
        const prefix = extractPrefix(r.sku);
        const a = byKey.get(k) || { sku: r.sku, location: undefined, name: r.name, variant: variantKeyLabel, color, size, onHandCurrent: 0, onHandNew: 0, committed: 0, incoming: 0, available: 0, prefix };
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
    const sorted = Array.from(byKey.values()).sort((x,y)=>{
      const kx = `${x.sku}__${x.variant || ''}`;
      const ky = `${y.sku}__${y.variant || ''}`;
      const ox = orderByKey.get(kx);
      const oy = orderByKey.get(ky);
      if (ox != null && oy != null && ox !== oy) return ox - oy;
      if (ox != null && oy == null) return -1;
      if (ox == null && oy != null) return 1;
      // Group by prefix first, then by SKU, then by variant
      const prefixX = x.prefix || extractPrefix(x.sku);
      const prefixY = y.prefix || extractPrefix(y.sku);
      if (prefixX !== prefixY) return prefixX.localeCompare(prefixY);
      if (x.sku !== y.sku) return x.sku.localeCompare(y.sku);
      return (x.variant || '').localeCompare(y.variant || '');
    });
    return sorted;
  }, [rows, groupBy, variantRows, sampleBySku]);
  const pageCount = useMemo(() => Math.max(1, Math.ceil(aggregated.length / PAGE_SIZE)), [aggregated]);
  
  // Get all unique prefixes from aggregated products
  const availablePrefixes = useMemo(() => {
    const prefixSet = new Set<string>();
    aggregated.forEach((r) => {
      const prefix = r.prefix || extractPrefix(r.sku);
      if (prefix) prefixSet.add(prefix);
    });
    return Array.from(prefixSet).sort();
  }, [aggregated]);

  const filtered = useMemo(() => {
    let list = aggregated;
    
    // Filter by selected prefix first
    if (selectedPrefix) {
      list = list.filter((r) => {
        const prefix = (r.prefix || extractPrefix(r.sku) || '').toUpperCase();
        return prefix === selectedPrefix.toUpperCase();
      });
    }
    
    // Then apply search query
    const q = query.trim().toLowerCase();
    if (q.length > 0) {
      // Normalize query - remove spaces for SKU matching, keep for name/variant
      const qNormalized = q.replace(/\s+/g, '');
      list = list.filter((r) => {
        // For SKU: remove spaces for flexible matching (PT 101 = PT101)
        const sku = (r.sku || '').trim().toLowerCase().replace(/\s+/g, '');
        // For prefix: extract and search
        const prefix = (r.prefix || extractPrefix(r.sku) || '').toLowerCase();
        // For name and variant: keep spaces but normalize
        const name = (r.name || '').trim().toLowerCase();
        const variant = ((r.variant || r.color || r.size) || '').trim().toLowerCase();
        // Search in all fields - SKU uses normalized query, others use original, prefix search added
        const matchesQ = name.includes(q) || sku.includes(qNormalized) || variant.includes(q) || prefix.includes(qNormalized);
        return matchesQ;
      });
    }
    
    // Apply availability filter
    list = list.filter((r) => {
      const avail = r.onHandCurrent - r.committed;
      if (availability === 'in') return avail > 0;
      if (availability === 'out') return avail <= 0;
      return true;
    });
    
    return list;
  }, [aggregated, query, availability, selectedPrefix]);
  const filteredPageCount = useMemo(() => Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)), [filtered]);
  const data = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    const result = filtered.slice(start, start + PAGE_SIZE);
    // Reset to page 1 if current page exceeds available pages
    if (result.length === 0 && page > 1 && filtered.length > 0) {
      return filtered.slice(0, PAGE_SIZE);
    }
    return result;
  }, [filtered, page]);

  // Sync page when URL params change (e.g., when returning via browser back button)
  useEffect(() => {
    const pageParam = searchParams?.get('page');
    const newPage = pageParam ? Math.max(1, parseInt(pageParam, 10)) : 1;
    setPage((prevPage) => {
      // Only update if URL has different page value
      if (prevPage !== newPage) {
        return newPage;
      }
      return prevPage;
    });
  }, [searchParams]);

  // Reset page to 1 when filters change (but not when URL changes)
  const prevFiltersRef = useRef({ query, availability, groupBy, selectedPrefix });
  useEffect(() => {
    const filtersChanged = 
      prevFiltersRef.current.query !== query ||
      prevFiltersRef.current.availability !== availability ||
      prevFiltersRef.current.groupBy !== groupBy ||
      prevFiltersRef.current.selectedPrefix !== selectedPrefix;
    
    if (filtersChanged) {
      setPage(1);
      prevFiltersRef.current = { query, availability, groupBy, selectedPrefix };
    }
  }, [query, availability, groupBy, selectedPrefix]);

  // Sync page changes with URL params
  useEffect(() => {
    if (!pathname || !router) return;
    const currentPageParam = searchParams?.get('page');
    const currentPageInUrl = currentPageParam ? parseInt(currentPageParam, 10) : 1;
    
    // Only update URL if page state differs from URL
    if (page !== currentPageInUrl) {
      const params = new URLSearchParams(searchParams?.toString() || '');
      if (page > 1) {
        params.set('page', page.toString());
      } else {
        params.delete('page');
      }
      const newUrl = `${pathname}${params.toString() ? `?${params.toString()}` : ''}`;
      router.replace(newUrl, { scroll: false });
    }
  }, [page, pathname, router, searchParams]);

  // Helper to update page and sync with URL
  const updatePage = (newPage: number) => {
    setPage(Math.max(1, Math.min(newPage, filteredPageCount)));
  };


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
          let variantsCount = variantRows.length;
          try {
            const fresh = await fetchAllVariants();
            if (fresh.length > 0) {
              setVariantRows(fresh);
              variantsCount = fresh.length;
            }
          } catch {}
          const collapsed = collapsedNotice ? `${collapsedNotice} (products table only)` : '';
          setNotice({ type: 'success', message: `Imported ${lines.length - 1} CSV rows. Variants saved: ${variantsCount}. Products stored: ${parsedDedup.length}. ${collapsed}` });
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
        <div className={`px-3 py-2 text-sm ${notice.type === 'error' ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-b border-red-200 dark:border-red-800' : notice.type === 'warning' ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border-b border-yellow-200 dark:border-yellow-800' : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-b border-green-200 dark:border-green-800'}`}>
          {notice.message}
        </div>
      )}
      <div className="flex flex-col gap-2 p-2 sm:p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
          {query.trim() ? `Found ${filtered.length} of ${aggregated.length} items` : `${filtered.length} items`}
        </div>
        <div className="flex items-center gap-1">
          <button className="btn-outline text-xs px-2 py-1" onClick={() => updatePage(1)} disabled={page === 1} title="First">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
          <button className="btn-outline text-xs px-2 py-1" onClick={() => updatePage(page - 1)} disabled={page === 1} title="Previous">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button className="btn-outline text-xs px-2 py-1" onClick={() => updatePage(page + 1)} disabled={page === filteredPageCount} title="Next">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button className="btn-outline text-xs px-2 py-1" onClick={() => updatePage(filteredPageCount)} disabled={page === filteredPageCount} title="Last">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
          {isEdit && (
            <>
              <button className="btn-outline text-xs px-2 py-1" onClick={exportCsv}>Export</button>
              <label className="btn-primary text-xs px-2 py-1 cursor-pointer">
                Import
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
            </>
          )}
        </div>
      </div>
      <div className="px-2 sm:px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <div className="flex flex-wrap items-center gap-2">
          {/* Prefix Dropdown - Compact */}
          <div className="relative" ref={prefixDropdownRef}>
              <button
              type="button"
              className="input text-xs px-2 py-1.5 w-24 sm:w-28 font-medium flex items-center justify-between cursor-pointer hover:border-brand-400 dark:hover:border-brand-500"
              onClick={() => setPrefixDropdownOpen(!prefixDropdownOpen)}
              title="Filter by prefix"
            >
              <span className="truncate text-xs">{selectedPrefix || 'Prefix'}</span>
              <svg
                className={`w-3 h-3 flex-shrink-0 ml-1 transition-transform ${prefixDropdownOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {prefixDropdownOpen && (
              <div className="absolute z-50 w-28 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                <button
                  type="button"
                  className={`w-full px-2 py-1.5 text-xs text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                    selectedPrefix === '' ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 font-medium' : 'text-gray-700 dark:text-gray-300'
                  }`}
                onClick={() => {
                    setSelectedPrefix('');
                    setPrefixDropdownOpen(false);
                }}
              >
                  All
              </button>
                {availablePrefixes.map((prefix) => (
                  <button
                    key={prefix}
                    type="button"
                    className={`w-full px-2 py-1.5 text-xs text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                      selectedPrefix === prefix ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 font-medium' : 'text-gray-700 dark:text-gray-300'
                    }`}
                    onClick={() => {
                      setSelectedPrefix(prefix);
                      setPrefixDropdownOpen(false);
                    }}
                  >
                    {prefix}
                  </button>
                ))}
              </div>
          )}
        </div>
          {/* Search Input - Compact */}
          <input
            type="text"
            className="input text-xs px-2 py-1.5 flex-1 min-w-[120px] sm:min-w-[200px]"
            placeholder="Search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {/* Availability Dropdown - Compact */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              className="input text-xs px-2 py-1.5 w-20 sm:w-24 font-medium flex items-center justify-between cursor-pointer hover:border-brand-400 dark:hover:border-brand-500"
              onClick={() => setDropdownOpen(!dropdownOpen)}
            >
              <span className="text-xs">
                {availability === 'all' ? 'All' : availability === 'in' ? 'In' : 'Out'}
              </span>
              <svg
                className={`w-3 h-3 flex-shrink-0 ml-1 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {dropdownOpen && (
              <div className="absolute z-50 w-24 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg overflow-hidden">
                <button
                  type="button"
                  className={`w-full px-2 py-1.5 text-xs text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                    availability === 'all' ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 font-medium' : 'text-gray-700 dark:text-gray-300'
                  }`}
                  onClick={() => {
                    setAvailability('all');
                    setDropdownOpen(false);
                  }}
                >
                  All
                </button>
                <button
                  type="button"
                  className={`w-full px-2 py-1.5 text-xs text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                    availability === 'in' ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 font-medium' : 'text-gray-700 dark:text-gray-300'
                  }`}
                  onClick={() => {
                    setAvailability('in');
                    setDropdownOpen(false);
                  }}
                >
                  In stock
                </button>
                <button
                  type="button"
                  className={`w-full px-2 py-1.5 text-xs text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                    availability === 'out' ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 font-medium' : 'text-gray-700 dark:text-gray-300'
                  }`}
                  onClick={() => {
                    setAvailability('out');
                    setDropdownOpen(false);
                  }}
                >
                  Out of stock
                </button>
        </div>
            )}
      </div>
        </div>
      </div>
      {/* Mobile cards (≤640px) */}
      <div className="block sm:hidden px-2 pb-3 space-y-2">
        {data.map((p) => {
          const available = p.onHandCurrent - p.committed;
          const sample = sampleBySku.get(p.sku);
          const imageUrl = (sample?.fullImageUrl || sample?.smallImageUrl) as any;
          // Preserve current page in URL for mobile navigation too
          const params = new URLSearchParams();
          params.set('location', (p as any).location || '');
          if (p.color) params.set('color', p.color);
          if (p.size) params.set('size', p.size);
          if (page > 1) params.set('fromPage', page.toString());
          const productHref = `/product/${encodeURIComponent(p.sku)}?${params.toString()}`;
          return (
            <InventoryCard
              key={`${p.sku}__${p.variant || ''}__${page}`}
              imageUrl={imageUrl}
              handle={(sample as any)?.handle}
              name={p.name}
              sku={p.sku}
              location={p.location as any}
              onHandCurrent={p.onHandCurrent}
              onHandNew={p.onHandNew}
              available={available}
              committed={p.committed}
              color={p.color}
              size={p.size}
              href={productHref}
            />
          );
        })}
      </div>

      {/* Desktop table (≥640px) */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
            <tr>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Image</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">SKU</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Variant</th>
              <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Stock</th>
              <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Available</th>
              <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Committed</th>
              <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">New</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
            {data.map((p) => {
              const available = p.onHandCurrent - p.committed;
              const sample = sampleBySku.get(p.sku);
              // Preserve current page in URL when navigating to product detail
              const params = new URLSearchParams();
              params.set('location', (p as any).location || '');
              if (p.color) params.set('color', p.color);
              if (p.size) params.set('size', p.size);
              if (page > 1) params.set('fromPage', page.toString());
              const productHref = `/product/${encodeURIComponent(p.sku)}?${params.toString()}`;
              return (
                <Link key={`${p.sku}__${p.variant || ''}__${page}`} href={productHref} className="contents">
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                    <td className="px-2 py-2 align-middle">
                    <Thumb handle={(sample as any)?.handle} url={(sample?.smallImageUrl || sample?.fullImageUrl) as any} name={p.name} />
                  </td>
                    <td className="px-2 py-2 text-sm font-medium text-gray-900 dark:text-gray-100 align-middle">{p.name}</td>
                    <td className="px-2 py-2 text-xs text-gray-700 dark:text-gray-300 align-middle">{p.sku}</td>
                    <td className="px-2 py-2 text-xs text-gray-600 dark:text-gray-400 align-middle">{(p.color && p.color.trim()) || (p.size && p.size.trim()) || '—'}</td>
                    <td className="px-2 py-2 text-sm text-right tabular-nums font-medium text-gray-900 dark:text-gray-100 align-middle">{p.onHandCurrent}</td>
                    <td className="px-2 py-2 text-sm text-right tabular-nums font-semibold text-brand-600 dark:text-brand-400 align-middle">{available}</td>
                    <td className="px-2 py-2 text-xs text-right tabular-nums text-gray-600 dark:text-gray-400 align-middle">{p.committed}</td>
                    <td className="px-2 py-2 text-sm text-center align-middle"><span className="tabular-nums text-gray-700 dark:text-gray-300">{p.onHandNew}</span></td>
                </tr>
                </Link>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-center gap-2 p-2 sm:p-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <button className="btn-outline text-xs px-2 py-1" onClick={() => updatePage(1)} disabled={page === 1} title="First">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
        <button className="btn-outline text-xs px-2 py-1" onClick={() => updatePage(page - 1)} disabled={page === 1} title="Previous">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-xs text-gray-600 dark:text-gray-400 px-2">{page} / {pageCount}</span>
        <button className="btn-outline text-xs px-2 py-1" onClick={() => updatePage(page + 1)} disabled={page === pageCount} title="Next">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <button className="btn-outline text-xs px-2 py-1" onClick={() => updatePage(pageCount)} disabled={page === pageCount} title="Last">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>
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
    // Check cache first
    const cached = getCachedImageUrl(handle);
    if (cached !== undefined) {
      setSrc(cached || undefined);
      return;
    }
    // Fetch and cache if not found
    (async () => {
      const imageUrl = await fetchAndCacheImageUrl(handle);
      if (imageUrl) setSrc(imageUrl);
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
        const previewW = 320;
        const previewH = 320;
        const margin = 12;
        let left = rect.right + margin;
        let top = rect.top + rect.height / 2 - previewH / 2;
        const vw = window.innerWidth, vh = window.innerHeight;
        if (left + previewW > vw - 8) left = Math.max(8, vw - previewW - 8);
        if (top < 8) top = 8;
        if (top + previewH > vh - 8) top = Math.max(8, vh - previewH - 8);
        setPos({ top, left });
        setShow(true);
      }}
      onMouseLeave={() => setShow(false)}
    >
      <div className="relative w-8 h-8 sm:w-10 sm:h-10 rounded overflow-hidden bg-gray-100 dark:bg-gray-700">
        <Image src={src || fallback} alt={name} fill sizes="(max-width: 640px) 32px, 40px" className="object-cover" onError={() => setSrc(fallback)} />
      </div>
      {src && show && (
        <>
          <div
            className="fixed z-[1000]"
            style={{ top: pos.top, left: pos.left }}
          >
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-2xl p-2 rounded-lg">
              <Image src={src} alt={name} width={320} height={320} className="rounded object-contain max-w-[80vw] max-h-[80vh]" />
            </div>
            <div className="absolute left-[-8px] top-1/2 h-0 w-0 -translate-y-1/2 border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-white dark:border-r-gray-800 drop-shadow" />
          </div>
        </>
      )}
    </div>
  );
}


