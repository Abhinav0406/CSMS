'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Product, computeAvailable, computeTotal } from '@/lib/inventory';
// QuantityAdjuster removed per latest requirements; table is read-only
import { ImageWithFallback } from '@/components/ImageWithFallback';
import { getCurrentSession } from '@/lib/auth';
import { fetchProducts, upsertProducts, updateOnHandNew, updateCommittedQty } from '@/lib/productsApi';

interface Props {
  initialProducts: Product[];
}

export function ProductTable({ initialProducts }: Props) {
  const [isEdit, setIsEdit] = useState<boolean>(false);
  const [rows, setRows] = useState<Product[]>(initialProducts);
  const STORAGE_KEY = 'csms_products_v1';
  const PAGE_SIZE = 50;
  const [page, setPage] = useState<number>(1);

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

  const updateOnHand = (sku: string, next: number) => {
    // no-op in table; edits happen on product detail page now
  };

  const updateCommitted = (sku: string, next: number) => {
    // no-op; committed is read-only here
  };

  // Group by SKU (aggregate across locations)
  type Agg = { sku: string; name: string; onHandCurrent: number; onHandNew: number; committed: number; incoming: number; available: number };
  const aggregated: Agg[] = useMemo(() => {
    const bySku = new Map<string, Agg>();
    for (const p of rows) {
      const a = bySku.get(p.sku) || { sku: p.sku, name: p.name, onHandCurrent: 0, onHandNew: 0, committed: 0, incoming: 0, available: 0 };
      a.onHandCurrent += (typeof p.onHandCurrent === 'number' ? p.onHandCurrent : 0);
      a.onHandNew += p.onHandNew;
      a.committed += p.committed;
      a.incoming += p.incoming ?? 0;
      bySku.set(p.sku, a);
    }
    for (const a of bySku.values()) a.available = a.onHandCurrent - a.committed;
    return Array.from(bySku.values()).sort((x,y)=>x.sku.localeCompare(y.sku));
  }, [rows]);
  const pageCount = useMemo(() => Math.max(1, Math.ceil(aggregated.length / PAGE_SIZE)), [aggregated]);
  const data = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return aggregated.slice(start, start + PAGE_SIZE);
  }, [aggregated, page]);

  const exportCsv = () => {
    if (!isEdit) return;
    const headers = buildExportHeaders(rows);
    const lines = [headers.join(',')];
    for (const r of rows) {
      const record: Record<string, string> = { ...(r.rawRow || {}) };
      upsert(record, 'On hand (new)', String(r.onHandNew));
      upsert(record, 'On hand (current)', String(r.onHandCurrent));
      upsert(record, 'Committed (not editable)', String(r.committed));
      // Ensure Available reflects latest On hand (new) - Committed
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
      parsed.push({ sku, name, handle, location: location as any, onHandCurrent, onHandNew, committed, incoming, unavailable, returns, rawHeaders: header, rawRow });
    }
    setRows((prev) => {
      const byKey = new Map<string, Product>();
      for (const p of prev) byKey.set(keyFor(p), p);
      for (const p of parsed) byKey.set(keyFor(p), { ...(byKey.get(keyFor(p)) || {} as Product), ...p });
      const nextArr = Array.from(byKey.values());
      persist(nextArr);
      return nextArr;
    });
    try { await upsertProducts(parsed); } catch {}
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
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
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

  function buildExportHeaders(items: Product[]): string[] {
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
    return ['Handle','Title','SKU','Location','Incoming (not editable)','Unavailable (not editable)','Committed (not editable)','Available (not editable)','On hand (current)','On hand (new)'];
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-gray-600">Total: {rows.length} • Page {page} / {pageCount}</div>
        <div className="flex items-center gap-2">
          <button className="btn-outline text-xs" onClick={() => setPage(1)} disabled={page === 1}>First</button>
          <button className="btn-outline text-xs" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Prev</button>
          <button className="btn-outline text-xs" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page === pageCount}>Next</button>
          <button className="btn-outline text-xs" onClick={() => setPage(pageCount)} disabled={page === pageCount}>Last</button>
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
            </>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product Name</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
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
              return (
                <tr key={`${p.sku}`} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-sm font-medium text-gray-900">{p.name}</td>
                  <td className="px-3 py-2 text-sm text-gray-700">{p.sku}</td>
                  <td className="px-3 py-2 text-sm text-right tabular-nums">{p.onHandCurrent}</td>
                  <td className="px-3 py-2 text-sm text-right tabular-nums">{p.incoming}</td>
                  <td className="px-3 py-2 text-sm text-right tabular-nums">{p.committed}</td>
                  <td className="px-3 py-2 text-sm text-right tabular-nums">{available}</td>
                  <td className="px-3 py-2 text-sm text-center"><span className="tabular-nums">{p.onHandNew}</span></td>
                  <td className="px-3 py-2 text-right">
                    <Link className="btn-outline text-xs" href={`/product/${encodeURIComponent(p.sku)}`}>View</Link>
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


