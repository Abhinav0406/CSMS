'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth';
import { NavBar } from '@/components/NavBar';
import { computeAvailable, handleReturn, Product } from '@/lib/inventory';
import { ImageWithFallback } from '@/components/ImageWithFallback';
import Link from 'next/link';
import { fetchProductBySkuLocation } from '@/lib/productsApi';
import { supabase } from '@/lib/supabaseClient';

export default function ProductDetailPage() {
  const router = useRouter();
  const params = useParams();
  const search = useSearchParams();
  const sku = (() => {
    const raw = (params?.sku as string) ?? '';
    try { return decodeURIComponent(raw); } catch { return raw; }
  })();
  const location = search?.get('location') || '';
  const STORAGE_KEY = 'csms_products_v1';
  const [product, setProduct] = useState<Product | undefined>(undefined);

  useEffect(() => {
    if (!getCurrentSession()) {
      router.replace('/login');
    }
  }, [router]);

  // Load from localStorage first
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const list = JSON.parse(raw) as Product[];
        const found = list.find((p) => p.sku === sku && (!location || p.location === location));
        if (found) setProduct(found);
      }
    } catch {}
  }, [sku, location]);

  // Then fetch from Supabase (authoritative)
  useEffect(() => {
    (async () => {
      const remote = await fetchProductBySkuLocation(sku, location || undefined);
      if (remote) setProduct(remote);
    })();
  }, [sku, location]);

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
          <div className="mt-4">
            <h2 className="text-lg font-semibold">{product.name}</h2>
            <div className="text-sm text-gray-600">SKU: {product.sku}</div>
            <div className="text-sm text-gray-600">Location: {product.location}</div>
          </div>
        </div>

        <div className="card p-4 md:col-span-2 space-y-4">
          <h3 className="text-base font-semibold">Inventory Breakdown</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            <Breakdown label="On hand" value={product.onHandNew} />
            <Breakdown label="Committed" value={product.committed} />
            <Breakdown label="Available" value={available} highlight />
            <Breakdown label="Returns" value={product.returns} />
          </div>

          <div className="mt-4">
            <h4 className="mb-2 text-sm font-medium">Returns Processing</h4>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-secondary"
                onClick={() => handleReturn(product, 1, 'restocked')}
              >
                Return: Restocked (+1 On hand)
              </button>
              <button
                className="btn-outline"
                onClick={() => handleReturn(product, 1, 'not_restocked')}
              >
                Return: Not Restocked (no change)
              </button>
              <button
                className="btn-outline"
                onClick={() => handleReturn(product, 1, 'in_transit')}
              >
                Return: In Transit (pending)
              </button>
            </div>
            <div className="mt-2 text-xs text-gray-500">
              Restocked increases On hand and Available. Not restocked: no change. In transit: pending until processed.
            </div>
          </div>

          <Link href="/mv" className="btn-outline w-fit">Back to Master View</Link>
        </div>
      </div>
    </div>
  );
}

function Breakdown({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded border p-3 ${highlight ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}


