'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth';
import { NavBar } from '@/components/NavBar';
import { computeAvailable, handleReturn, Product } from '@/lib/inventory';
import { ImageWithFallback } from '@/components/ImageWithFallback';
import Link from 'next/link';
import { fetchProductBySkuLocation, fetchProductsBySku } from '@/lib/productsApi';
import { updateOnHandNew, updateOnHandCurrent } from '@/lib/productsApi';
import { supabase } from '@/lib/supabaseClient';

export default function ProductDetailPage() {
  const router = useRouter();
  const params = useParams();
  const search = useSearchParams();
  const [isEdit, setIsEdit] = useState<boolean>(false);
  const sku = (() => {
    const raw = (params?.sku as string) ?? '';
    try { return decodeURIComponent(raw); } catch { return raw; }
  })();
  const location = search?.get('location') || '';
  const STORAGE_KEY = 'csms_products_v1';
  const [product, setProduct] = useState<Product | undefined>(undefined);
  const [addQty, setAddQty] = useState<number>(0);
  const [variants, setVariants] = useState<Array<{ id?: string; sku: string; location: string; color?: string | null; size?: string | null; on_hand_current: number; on_hand_new: number }>>([]);
  const [variantEdits, setVariantEdits] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      const session = await getCurrentSession();
      if (!session) {
        router.replace('/login');
        return;
      }
      setIsEdit(session.role === 'Edit');
    })();
  }, [router]);

  // Load from localStorage first (any location)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const list = JSON.parse(raw) as Product[];
        const found = list.find((p) => p.sku === sku);
        if (found) setProduct(found);
      }
    } catch {}
  }, [sku]);

  // Fetch all locations for this SKU
  const [locations, setLocations] = useState<Product[]>([]);
  const [entries, setEntries] = useState<{ loc: string; add: number }[]>([]);
  useEffect(() => {
    (async () => {
      const remote = await fetchProductsBySku(sku);
      if (remote.length) {
        setLocations(remote);
        // also set first as product for header display
        const combined = combine(remote);
        setProduct(combined);
        setEntries(remote.map((r) => ({ loc: r.location, add: 0 })));
      }
    })();
  }, [sku]);

  // Fetch variants by SKU (if variants table exists)
  useEffect(() => {
    (async () => {
      try {
        if (!supabase || !sku) return;
        const { data, error } = await supabase
          .from('product_variants')
          .select('id, sku, location, color, size, on_hand_current, on_hand_new')
          .eq('sku', sku);
        if (!error && Array.isArray(data)) {
          setVariants(data as any);
          const edits: Record<string, number> = {};
          for (const v of data as any[]) {
            const key = variantKey(v);
            edits[key] = Number.isFinite(v.on_hand_new) ? v.on_hand_new : v.on_hand_current || 0;
          }
          setVariantEdits(edits);
        }
      } catch {}
    })();
  }, [sku]);

  function combine(rows: Product[]): Product {
    const base = rows[0];
    const sumKey = (k: keyof Product) => rows.reduce((acc, r) => acc + (Number(r[k]) || 0), 0);
    const currentSum = rows.reduce((acc, r) => acc + (typeof r.onHandCurrent === 'number' ? r.onHandCurrent : 0), 0);
    return {
      ...base,
      onHandCurrent: currentSum,
      onHandNew: sumKey('onHandNew'),
      committed: sumKey('committed'),
      incoming: sumKey('incoming' as any),
      unavailable: sumKey('unavailable' as any),
    };
  }

  if (!product) {
    return (
      <div className="space-y-4">
        <NavBar />
        <div className="card p-6">
          <div className="text-sm text-gray-600">Product not found. Load data via import or connect to backend.</div>
          <div className="mt-3 rounded bg-gray-50 p-3 text-xs text-gray-600">
            <div>Diagnostics</div>
            <div>SKU: <span className="font-mono">{sku || '(empty)'}</span></div>
            <div>Location (query): <span className="font-mono">{location || '(none)'}</span></div>
            <div>Supabase configured: <span className="font-mono">{supabase ? 'yes' : 'NO'}</span></div>
          </div>
          <Link href="/mv" className="btn-outline mt-4 inline-flex w-fit">Back to Master View</Link>
        </div>
      </div>
    );
  }

  const available = computeAvailable(product.onHandNew, product.committed);

  return (
    <div className="space-y-4">
      <NavBar />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="card p-4 md:col-span-1">
          <ImageWithFallback src={product.fullImageUrl} alt={product.name} width={800} height={600} className="w-full h-auto rounded" />
          {!product.fullImageUrl && (
            <FetchImageByHandle handle={(product as any).handle} onFound={(url) => {
              if (!url) return;
              setProduct((prev) => (prev ? { ...prev, fullImageUrl: url } : prev));
              try {
                const raw = localStorage.getItem('csms_products_v1');
                if (raw) {
                  const list = JSON.parse(raw) as any[];
                  const next = list.map((p) => (p.sku === product.sku && p.location === product.location ? { ...p, fullImageUrl: url } : p));
                  localStorage.setItem('csms_products_v1', JSON.stringify(next));
                }
              } catch {}
            }} />
          )}
          <div className="mt-4">
            <h2 className="text-lg font-semibold">{product.name}</h2>
            <div className="text-sm text-gray-600">SKU: {product.sku}</div>
            <div className="text-sm text-gray-600">Location: {product.location}</div>
          </div>
        </div>

        <div className="card p-4 md:col-span-2 space-y-4">
          <h3 className="text-base font-semibold">Inventory</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            <Breakdown label="On hand (current)" value={product.onHandCurrent} />
            <Breakdown label="On hand (new, planned)" value={product.onHandNew} highlight />
            <Breakdown label="Committed" value={product.committed} />
            <Breakdown label="Available" value={computeAvailable(product.onHandCurrent, product.committed)} />
          </div>

          <div className="rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 space-y-2">
            <div>
              <span className="font-semibold">On hand (current):</span> Total units physically present at this location right now (sellable + reserved).
            </div>
            <div>
              <span className="font-semibold">On hand (new):</span> The new total you plan to save after adjustments. Use Add Stock to set it to the current on-hand.
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            {isEdit && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  className="input w-40"
                  placeholder="Add quantity"
                  value={Number.isFinite(addQty) ? addQty : 0}
                  onChange={(e) => setAddQty(Math.max(0, Math.floor(Number(e.target.value || 0))))}
                />
                <button
                  className="btn-primary"
                  onClick={async () => {
                    if (!locations.length) return;
                    const total = Number.isFinite(addQty) ? addQty : 0;
                    const n = locations.length;
                    const base = Math.floor(total / n);
                    let remainder = total % n;
                    const nextEntries = locations.map((r, i) => ({
                      loc: r.location,
                      add: base + (remainder-- > 0 ? 1 : 0),
                    }));
                    setEntries(nextEntries);
                  }}
                >
                  Add Stock
                </button>
              </div>
            )}
            {isEdit && (
              <button
                className="btn-outline"
                onClick={async () => {
                  const updatedRows: Product[] = [];
                  for (const r of locations) {
                    const delta = r.onHandNew || 0;
                    const newCurrent = (r.onHandCurrent || 0) + delta;
                    try {
                      await updateOnHandCurrent(r.sku, r.location, newCurrent);
                      await updateOnHandNew(r.sku, r.location, 0);
                    } catch {}
                    updatedRows.push({ ...r, onHandCurrent: newCurrent, onHandNew: 0 });
                  }
                  setLocations(updatedRows);
                  const combined = combine(updatedRows);
                  setProduct(combined);
                  try {
                    const raw = localStorage.getItem(STORAGE_KEY);
                    if (raw) {
                      const list = JSON.parse(raw) as Product[];
                      const nextList = list.map((p) => {
                        if (p.sku !== product.sku) return p;
                        const match = updatedRows.find((r) => r.sku === p.sku && r.location === p.location);
                        return match ? { ...p, onHandCurrent: match.onHandCurrent, onHandNew: 0 } : p;
                      });
                      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextList));
                    }
                  } catch {}
                }}
              >
                Set On hand (new) = current
              </button>
            )}
            <Link href="/mv" className="btn-outline">Back to Master View</Link>
          </div>

          {/* Returns flow hidden for now per simplified UI */}
          <div className="mt-4">
            <h4 className="mb-2 text-sm font-medium">Per-location adjustment</h4>
            <PerLocationEditor
              rows={locations}
              entries={entries}
              setEntries={setEntries}
              isEdit={isEdit}
              onSaved={async (updated) => {
                setLocations(updated);
                const combined = combine(updated);
                setProduct(combined);
              }}
            />
          </div>

          {/* Variant grid (Color/Size per location) */}
          {variants.length > 0 && (
            <div className="mt-6">
              <h4 className="mb-2 text-sm font-medium">Per-variant adjustment</h4>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Color</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Size</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">On hand (current)</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">On hand (new)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {variants.map((v) => {
                      const key = variantKey(v);
                      const planned = variantEdits[key] ?? v.on_hand_new ?? v.on_hand_current ?? 0;
                      return (
                        <tr key={key}>
                          <td className="px-3 py-2 text-sm text-gray-700">{v.color || '—'}</td>
                          <td className="px-3 py-2 text-sm text-gray-700">{v.size || '—'}</td>
                          <td className="px-3 py-2 text-sm text-gray-700">{v.location}</td>
                          <td className="px-3 py-2 text-sm text-right tabular-nums">{v.on_hand_current || 0}</td>
                          <td className="px-3 py-2 text-sm text-right">
                            {isEdit ? (
                              <input
                                type="number"
                                min={0}
                                className="input w-24 text-right"
                                value={planned}
                                onChange={(e) => {
                                  const n = Math.max(0, Math.floor(Number(e.target.value || 0)));
                                  setVariantEdits((prev) => ({ ...prev, [key]: n }));
                                }}
                              />
                            ) : (
                              <span className="tabular-nums">{planned}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {isEdit && (
                <div className="mt-3 flex items-center gap-2">
                  <button
                    className="btn-primary"
                    onClick={async () => {
                      if (!supabase) return;
                      for (const v of variants) {
                        const key = variantKey(v);
                        const next = Math.max(0, Math.floor(Number(variantEdits[key] ?? v.on_hand_new ?? 0)));
                        try {
                          await supabase
                            .from('product_variants')
                            .update({ on_hand_new: next })
                            .eq('sku', v.sku)
                            .eq('location', v.location)
                            .eq('color', v.color ?? null)
                            .eq('size', v.size ?? null);
                        } catch {}
                      }
                      // refresh variants
                      try {
                        const { data } = await supabase
                          .from('product_variants')
                          .select('id, sku, location, color, size, on_hand_current, on_hand_new')
                          .eq('sku', sku);
                        setVariants((data as any) || []);
                      } catch {}
                    }}
                  >
                    Save per-variant
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PerLocationEditor({ rows, entries, setEntries, isEdit, onSaved }: { rows: Product[]; entries: { loc: string; add: number }[]; setEntries: React.Dispatch<React.SetStateAction<{ loc: string; add: number }[]>>; isEdit: boolean; onSaved: (rows: Product[]) => void }) {

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">On hand (current)</th>
            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">On hand (new, planned)</th>
            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Add qty</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {rows.map((r, idx) => {
            const add = entries[idx]?.add ?? 0;
            const planned = add || r.onHandNew || 0;
            return (
              <tr key={r.location}>
                <td className="px-3 py-2 text-sm text-gray-700">{r.location}</td>
                <td className="px-3 py-2 text-sm text-right tabular-nums">{typeof r.onHandCurrent === 'number' ? r.onHandCurrent : 0}</td>
                <td className="px-3 py-2 text-sm text-right tabular-nums">{planned}</td>
                <td className="px-3 py-2 text-sm text-right">
                  {isEdit ? (
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        className="btn-outline h-8 w-8 p-0"
                        onClick={(e) => {
                          e.preventDefault();
                          setEntries((prev) => prev.map((p, i) => (i === idx ? { ...p, add: Math.max(0, (p.add || 0) - 1) } : p)));
                        }}
                      >
                        -
                      </button>
                      <div
                        role="textbox"
                        contentEditable
                        suppressContentEditableWarning
                        className="input w-24 text-right"
                        onKeyDown={(e) => {
                          const allowed = ['Backspace','Delete','ArrowLeft','ArrowRight','Tab'];
                          if (/^[0-9]$/.test(e.key) || allowed.includes(e.key)) return;
                          e.preventDefault();
                        }}
                        onBlur={(e) => {
                          const raw = (e.target as HTMLDivElement).innerText.replace(/[^0-9]/g, '');
                          const n = Math.max(0, Math.floor(Number(raw || 0)));
                          (e.target as HTMLDivElement).innerText = String(n);
                          setEntries((prev) => prev.map((p, i) => (i === idx ? { ...p, add: n } : p)));
                        }}
                      >{add}</div>
                      <button
                        type="button"
                        className="btn-outline h-8 w-8 p-0"
                        onClick={(e) => {
                          e.preventDefault();
                          setEntries((prev) => prev.map((p, i) => (i === idx ? { ...p, add: (p.add || 0) + 1 } : p)));
                        }}
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">—</div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {isEdit && (
        <div className="mt-3 flex items-center gap-2">
          <button
            className="btn-primary"
            onClick={async () => {
              const updated: Product[] = [];
              for (let i = 0; i < rows.length; i++) {
                const r = rows[i];
                const add = entries[i]?.add ?? 0;
                try { await updateOnHandNew(r.sku, r.location, add); } catch {}
                updated.push({ ...r, onHandNew: add });
              }
              try {
                const STORAGE_KEY = 'csms_products_v1';
                const raw = localStorage.getItem(STORAGE_KEY);
                if (raw) {
                  const list = JSON.parse(raw) as Product[];
                  const nextList = list.map((p) => {
                    const idx = rows.findIndex((r) => r.sku === p.sku && r.location === p.location);
                    if (idx >= 0) {
                      const add = entries[idx]?.add ?? 0;
                      return { ...p, onHandNew: add };
                    }
                    return p;
                  });
                  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextList));
                }
              } catch {}
              onSaved(updated);
            }}
          >
            Save per-location
          </button>
        </div>
      )}
    </div>
  );
}

function FetchImageByHandle({ handle, onFound }: { handle?: string; onFound: (url: string | null) => void }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!handle || done) return;
    (async () => {
      try {
        const res = await fetch(`/api/images/${encodeURIComponent(handle)}`);
        if (res.ok) {
          const j = await res.json();
          onFound(j.firstImageUrl || null);
        }
      } catch {}
      setDone(true);
    })();
  }, [handle, done, onFound]);
  return null;
}

function Breakdown({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded border p-3 ${highlight ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function variantKey(v: { sku: string; location: string; color?: string | null; size?: string | null }): string {
  const c = (v.color || '').trim();
  const s = (v.size || '').trim();
  return `${v.sku}__${v.location}__${c}__${s}`;
}


