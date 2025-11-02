'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth';
import { computeAvailable, handleReturn, Product } from '@/lib/inventory';
import { ImageWithFallback } from '@/components/ImageWithFallback';
import Link from 'next/link';
import { fetchProductBySkuLocation, fetchProductsBySku } from '@/lib/productsApi';
import { updateOnHandNew, updateOnHandCurrent } from '@/lib/productsApi';
import { supabase } from '@/lib/supabaseClient';
import { getCachedImageUrl, fetchAndCacheImageUrl } from '@/lib/imageCache';

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
  const filterColor = (search?.get('color') || '').trim();
  const filterSize = (search?.get('size') || '').trim();
  const STORAGE_KEY = 'csms_products_v1';
  const [product, setProduct] = useState<Product | undefined>(undefined);
  const [addQty, setAddQty] = useState<number>(0);
  const [variants, setVariants] = useState<Array<{ id?: string; sku: string; location: string; color?: string | null; size?: string | null; on_hand_current: number; on_hand_new: number }>>([]);
  const [variantEdits, setVariantEdits] = useState<Record<string, number>>({});
  const [showLocationModal, setShowLocationModal] = useState<boolean>(false);
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [locationQty, setLocationQty] = useState<number>(0);
  const [showQtyModal, setShowQtyModal] = useState<boolean>(false);
  const [recentChanges, setRecentChanges] = useState<Array<{ location: string; qty: number; timestamp: Date }>>([]);

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
      } else {
        // Fallback to localStorage if no remote data
        if (typeof window !== 'undefined') {
          try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
              const list = JSON.parse(raw) as Product[];
              const found = list.find((p) => p.sku === sku);
              if (found) setProduct(found);
            }
          } catch {}
        }
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
          // Filter out entries where both color and size are empty (not real variants)
          const validVariants = (data as any[]).filter(v => {
            const c = (v.color || '').trim();
            const s = (v.size || '').trim();
            return c !== '' || s !== '';
          });
          setVariants(validVariants);
          const edits: Record<string, number> = {};
          for (const v of validVariants) {
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
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 dark:border-brand-400 mb-4"></div>
            <div className="text-gray-600 dark:text-gray-400">Loading product...</div>
          </div>
        </div>
      </div>
    );
  }

  // If a variant filter is active, compute cards from filtered variants only
  const filteredVariants = (variants || []).filter((v) => {
    const c = (v.color || '').trim();
    const s = (v.size || '').trim();
    if (filterColor && c.toLowerCase() !== filterColor.toLowerCase()) return false;
    if (filterSize && s.toLowerCase() !== filterSize.toLowerCase()) return false;
    return true;
  });
  // When variants exist, always use variant totals for consistency
  const variantCurrent = filteredVariants.reduce((a, v) => a + (Number(v.on_hand_current) || 0), 0);
  const variantNew = filteredVariants.reduce((a, v) => a + (Number(v.on_hand_new) || 0), 0);
  const variantCommitted = filteredVariants.reduce((a, v) => a + (Number((v as any).committed) || 0), 0);
  
  // If variants exist, use variant totals; otherwise use product totals
  const hasVariants = variants.length > 0;
  const cardsOnHandCurrent = hasVariants ? variantCurrent : product.onHandCurrent;
  const cardsOnHandNew = hasVariants ? variantNew : product.onHandNew;
  const cardsCommitted = hasVariants ? variantCommitted : product.committed;
  const available = (cardsOnHandCurrent - cardsCommitted);

  const handleAddStock = async () => {
    if (locationQty > 0 && selectedLocation) {
      const idx = locations.findIndex(l => l.location === selectedLocation);
      if (idx >= 0) {
        const nextEntries = locations.map((r, i) => ({
          loc: r.location,
          add: i === idx ? (entries[i]?.add || 0) + locationQty : (entries[i]?.add || 0),
        }));
        setEntries(nextEntries);
        
        // Dynamically update locations with new stock
        const updatedLocations = locations.map((r, i) => {
          if (i === idx) {
            return {
              ...r,
              onHandNew: (r.onHandNew || 0) + locationQty
            };
          }
          return r;
        });
        setLocations(updatedLocations);
        
        // Update combined product totals immediately
        const combined = combine(updatedLocations);
        setProduct(combined);
        
        // Update variants if they exist
        if (variants.length > 0) {
          const updatedVariants = variants.map(v => {
            if (v.location === selectedLocation) {
              return {
                ...v,
                on_hand_new: (v.on_hand_new || 0) + locationQty
              };
            }
            return v;
          });
          setVariants(updatedVariants);
          
          // Update variant edits to reflect changes
          const updatedVariantEdits = { ...variantEdits };
          updatedVariants.forEach(v => {
            const key = variantKey(v);
            updatedVariantEdits[key] = v.on_hand_new || 0;
          });
          setVariantEdits(updatedVariantEdits);
        }
        
        // Track recent changes
        setRecentChanges(prev => {
          const newChanges = [{ location: selectedLocation, qty: locationQty, timestamp: new Date() }, ...prev];
          return newChanges.slice(0, 10); // Keep only last 10
        });
        
        // Check if all locations have stock added
        const allLocationsHaveStock = nextEntries.every(e => e.add > 0);
        
        setShowQtyModal(false);
        setLocationQty(0);
        setSelectedLocation('');
        
        // If all locations have stock, close modal completely. Otherwise, show location selector
        if (allLocationsHaveStock) {
          setShowLocationModal(false);
        } else {
          setShowLocationModal(true);
        }
      }
    }
  };

  return (
    <div className="space-y-3 pb-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="card p-2 sm:p-3 md:col-span-1">
          <ImageWithFallback src={product.fullImageUrl} alt={product.name} width={800} height={600} className="w-full max-w-[240px] mx-auto sm:max-w-[280px] h-auto rounded" />
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
          <div className="mt-2">
            <h2 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">{product.name}</h2>
            <div className="text-[10px] text-gray-600 dark:text-gray-400 mt-0.5">SKU: {product.sku}</div>
          </div>
        </div>

        <div className="card p-2 sm:p-3 md:col-span-2 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Inventory</h3>
          </div>
          
          {/* Compact grid - 4 metrics in 2x2 */}
          <div className="grid grid-cols-4 gap-1.5">
            <Breakdown label="Stock" value={cardsOnHandCurrent} />
            <Breakdown label="Available" value={available} />
            <Breakdown label="New" value={cardsOnHandNew} highlight />
            <Breakdown label="Committed" value={cardsCommitted} />
          </div>

          <div className={`grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap ${variants.length > 0 ? 'hidden' : ''}`}>
            {isEdit && (
              <button
                className="btn-outline text-xs py-1 px-2"
                onClick={async () => {
                  // If variant is filtered, commit variant-level new to current, and sync products totals
                  if (filterColor || filterSize) {
                    const deltasByLoc = new Map<string, number>();
                    const updatedVariants = [...variants];
                    for (let i = 0; i < updatedVariants.length; i++) {
                      const v = updatedVariants[i];
                      const c = (v.color || '').trim();
                      const s = (v.size || '').trim();
                      if (filterColor && c.toLowerCase() !== filterColor.toLowerCase()) continue;
                      if (filterSize && s.toLowerCase() !== filterSize.toLowerCase()) continue;
                      
                      const delta = Number(v.on_hand_new || 0);
                      const newCurrent = Number(v.on_hand_current || 0) + delta;
                      try {
                        await supabase
                          .from('product_variants')
                          .update({ on_hand_current: newCurrent, on_hand_new: 0 })
                          .eq('sku', sku)
                          .eq('location', v.location)
                          .eq('color', v.color ?? '')
                          .eq('size', v.size ?? '');
                      } catch {}
                      updatedVariants[i] = { ...v, on_hand_current: newCurrent, on_hand_new: 0 };
                      deltasByLoc.set(v.location, (deltasByLoc.get(v.location) || 0) + delta);
                    }
                    setVariants(updatedVariants);
                    // Update variantEdits state
                    const updatedEdits = { ...variantEdits };
                    updatedVariants.forEach(v => {
                      const key = variantKey(v);
                      updatedEdits[key] = 0;
                    });
                    setVariantEdits(updatedEdits);
                    
                    // Update products per location using accumulated deltas
                    const updated: Product[] = [];
                    for (const r of locations) {
                      const delta = deltasByLoc.get(r.location) || 0;
                      if (delta === 0) { updated.push(r); continue; }
                      const newCurrent = (r.onHandCurrent || 0) + delta;
                      try {
                        await updateOnHandCurrent(r.sku, r.location, newCurrent);
                        await updateOnHandNew(r.sku, r.location, 0);
                      } catch {}
                      updated.push({ ...r, onHandCurrent: newCurrent, onHandNew: 0 });
                    }
                    setLocations(updated);
                    const combined = combine(updated);
                    setProduct(combined);
                    return;
                  }

                  // No variant filter → commit per-location planned totals
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
                  
                  // Also update variants if they exist
                  if (variants.length > 0) {
                    const updatedVariants = variants.map(v => {
                      const locMatch = updatedRows.find(r => r.location === v.location);
                      if (locMatch) {
                        return { ...v, on_hand_current: locMatch.onHandCurrent as number, on_hand_new: 0 };
                      }
                      return v;
                    });
                    setVariants(updatedVariants);
                    // Update variantEdits state
                    const updatedEdits = { ...variantEdits };
                    updatedVariants.forEach(v => {
                      const key = variantKey(v);
                      updatedEdits[key] = 0;
                    });
                    setVariantEdits(updatedEdits);
                  }
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
            {isEdit && (
              <button
                className="btn-primary text-xs py-1 px-2"
                onClick={() => {
                  setShowLocationModal(true);
                }}
              >
                Add Stock
              </button>
            )}
            <Link href="/mv" className="btn-outline text-xs py-1 px-2">Back</Link>
          </div>

          {/* Recent Changes Log */}
          {recentChanges.length > 0 && (
            <div className="mt-2">
              <h4 className="mb-1.5 text-[10px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Recent Changes</h4>
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded border border-gray-200 dark:border-gray-700 p-2">
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {recentChanges.map((change, idx) => (
                    <div key={idx} className="text-xs flex items-center justify-between py-1 border-b border-gray-200 dark:border-gray-700 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-green-600 dark:text-green-400 font-medium">+{change.qty}</span>
                        <span className="text-gray-600 dark:text-gray-400">to {change.location}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 dark:text-gray-500 text-[10px]">
                          {change.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {isEdit && (
                          <button
                            onClick={() => {
                              const idx = locations.findIndex(l => l.location === change.location);
                              if (idx >= 0) {
                                const nextEntries = entries.map((e, i) => ({
                                  loc: e.loc,
                                  add: i === idx ? Math.max(0, (e.add || 0) - change.qty) : e.add,
                                }));
                                setEntries(nextEntries);
                                setRecentChanges(prev => prev.filter((_, i) => i !== idx));
                              }
                            }}
                            className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                            title="Undo this change"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Hide per-location totals when a specific variant is selected to avoid confusion */}
          {!filterColor && !filterSize && (
            <div className="mt-2">
              <h4 className="mb-1.5 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Locations</h4>
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
          )}

          {/* Variant grid (Color/Size per location) */}
          {variants.length > 0 && (
            <div className="mt-2">
              <h4 className="mb-1.5 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Variants</h4>
              {(filterColor || filterSize) && (
                <div className="mb-2 text-xs text-gray-600 dark:text-gray-400">Showing: {filterColor || '—'} {filterColor && filterSize ? '•' : ''} {filterSize || ''}</div>
              )}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Color</th>
                      <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Size</th>
                      <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Location</th>
                      <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Current</th>
                      <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">New</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                    {variants
                      .filter((v) => {
                        const c = (v.color || '').trim();
                        const s = (v.size || '').trim();
                        if (filterColor && c.toLowerCase() !== filterColor.toLowerCase()) return false;
                        if (filterSize && s.toLowerCase() !== filterSize.toLowerCase()) return false;
                        return true;
                      })
                      .map((v) => {
                      const key = variantKey(v);
                      const planned = variantEdits[key] ?? v.on_hand_new ?? v.on_hand_current ?? 0;
                      return (
                        <tr key={key} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <td className="px-2 py-1.5 text-xs text-gray-700 dark:text-gray-300">{v.color || '—'}</td>
                          <td className="px-2 py-1.5 text-xs text-gray-700 dark:text-gray-300">{v.size || '—'}</td>
                          <td className="px-2 py-1.5 text-xs text-gray-700 dark:text-gray-300">{v.location}</td>
                          <td className="px-2 py-1.5 text-xs text-right tabular-nums text-gray-900 dark:text-gray-100">{v.on_hand_current || 0}</td>
                          <td className="px-2 py-1.5 text-xs text-right">
                            {isEdit ? (
                              <input
                                type="number"
                                min={0}
                                className="input w-20 text-right py-1 text-xs"
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
                <div className="mt-2 flex items-center gap-2 justify-end">
                  <button
                    className="btn-primary text-xs py-1.5 px-3"
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
                    Save
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile buttons - static at bottom */}
      <div className="mt-6 grid grid-cols-2 gap-2 sm:hidden">
            {isEdit && (
              <button
                className="btn-outline text-xs px-2 py-1.5 shadow-lg"
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
            {isEdit && (
              <button
                className="btn-primary text-xs px-3 py-1.5 shadow-lg"
                onClick={() => {
                  setShowLocationModal(true);
                }}
              >
                Add Stock
              </button>
            )}
            <Link href="/mv" className="btn-outline text-xs px-2 py-1.5 shadow-lg col-span-2">Back</Link>
      </div>

      {/* Location Selection Modal */}
      {showLocationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowLocationModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Select Location</h3>
              <button
                onClick={() => setShowLocationModal(false)}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {locations.map((loc, idx) => {
                const add = entries[idx]?.add || 0;
                const newValue = add || loc.onHandNew || 0;
                return (
                  <button
                    key={loc.location}
                    onClick={() => {
                      setSelectedLocation(loc.location);
                      setShowLocationModal(false);
                      setShowQtyModal(true);
                    }}
                    className="w-full text-left px-4 py-3 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="font-medium text-gray-900 dark:text-gray-100">{loc.location}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Current: {loc.onHandCurrent} | New: {newValue}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Quantity Input Modal */}
      {showQtyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowQtyModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Add Stock to {selectedLocation}</h3>
              <button
                onClick={() => setShowQtyModal(false)}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Quantity to Add
                </label>
                {/* Quick quantity buttons */}
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {[10, 50, 100].map((qty) => (
                    <button
                      key={qty}
                      onClick={() => setLocationQty(qty)}
                      className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        locationQty === qty
                          ? 'bg-brand-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {qty}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  value={locationQty === 0 ? '' : locationQty}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '') {
                      setLocationQty(0);
                    } else {
                      const num = parseInt(val, 10);
                      if (!isNaN(num) && num >= 0) {
                        setLocationQty(num);
                      }
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && locationQty > 0) {
                      handleAddStock();
                    }
                  }}
                  className="input w-full"
                  placeholder="Or enter custom quantity"
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowQtyModal(false)}
                  className="btn-outline flex-1"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddStock}
                  disabled={!locationQty || locationQty === 0}
                  className="btn-primary flex-1"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PerLocationEditor({ rows, entries, setEntries, isEdit, onSaved }: { rows: Product[]; entries: { loc: string; add: number }[]; setEntries: React.Dispatch<React.SetStateAction<{ loc: string; add: number }[]>>; isEdit: boolean; onSaved: (rows: Product[]) => void }) {

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Location</th>
            <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Current</th>
            <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">New</th>
            <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Add</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
          {rows.map((r, idx) => {
            const add = entries[idx]?.add ?? 0;
            const planned = add || r.onHandNew || 0;
            return (
              <tr key={r.location} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <td className="px-2 py-1.5 text-xs text-gray-700 dark:text-gray-300">{r.location}</td>
                <td className="px-2 py-1.5 text-xs text-right tabular-nums text-gray-900 dark:text-gray-100">{typeof r.onHandCurrent === 'number' ? r.onHandCurrent : 0}</td>
                <td className="px-2 py-1.5 text-xs text-right tabular-nums text-gray-900 dark:text-gray-100">{planned}</td>
                <td className="px-2 py-1.5 text-xs text-right">
                  {isEdit ? (
                    <div className="inline-flex items-center gap-0.5">
                      <button
                        type="button"
                        className="btn-outline h-6 w-6 p-0 text-xs"
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
                        className="input w-16 text-right text-xs py-0.5"
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
                        className="btn-outline h-6 w-6 p-0 text-xs"
                        onClick={(e) => {
                          e.preventDefault();
                          setEntries((prev) => prev.map((p, i) => (i === idx ? { ...p, add: (p.add || 0) + 1 } : p)));
                        }}
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500 dark:text-gray-400">—</div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {isEdit && (
        <div className="mt-2 flex items-center gap-2 justify-end">
          <button
            className="btn-primary text-xs py-1.5 px-3"
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
            Save
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
      // Check cache first
      const cached = getCachedImageUrl(handle);
      if (cached !== undefined) {
        onFound(cached);
        setDone(true);
        return;
      }
      // Fetch and cache if not found
      const url = await fetchAndCacheImageUrl(handle);
      onFound(url);
      setDone(true);
    })();
  }, [handle, done, onFound]);
  return null;
}

function Breakdown({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded border p-1.5 ${highlight ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'}`}>
      <div className="text-[9px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</div>
      <div className="text-base font-bold tabular-nums text-gray-900 dark:text-gray-100">{value}</div>
    </div>
  );
}

function variantKey(v: { sku: string; location: string; color?: string | null; size?: string | null }): string {
  const c = (v.color || '').trim();
  const s = (v.size || '').trim();
  return `${v.sku}__${v.location}__${c}__${s}`;
}


