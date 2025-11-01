'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getCachedImageUrl, fetchAndCacheImageUrl } from '@/lib/imageCache';

export type InventoryCardProps = {
  imageUrl?: string;
  handle?: string;
  name: string;
  sku: string;
  location?: string;
  onHandCurrent: number;
  onHandNew: number;
  available: number;
  committed: number;
  color?: string | null;
  size?: string | null;
};

export function InventoryCard(props: InventoryCardProps) {
  const fallback = `data:image/svg+xml;utf8,${encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='160' height='120' viewBox='0 0 160 120'><rect width='100%' height='100%' fill='#f3f4f6'/></svg>"
  )}`;

  const [src, setSrc] = useState<string | undefined>(props.imageUrl);
  useEffect(() => setSrc(props.imageUrl), [props.imageUrl]);
  useEffect(() => {
    if (src || !props.handle) return;
    // Check cache first
    const cached = getCachedImageUrl(props.handle);
    if (cached !== undefined) {
      setSrc(cached || undefined);
      return;
    }
    // Fetch and cache if not found
    (async () => {
      const url = await fetchAndCacheImageUrl(props.handle!);
      if (url) setSrc(url);
    })();
  }, [props.handle, src]);

  const href = `/product/${encodeURIComponent(props.sku)}?location=${encodeURIComponent(props.location || '')}&color=${encodeURIComponent(props.color || '')}&size=${encodeURIComponent(props.size || '')}`;

  return (
    <Link 
      href={href} 
      className="card p-2 sm:p-3 hover:shadow-md active:scale-[0.98] transition-all cursor-pointer block no-underline w-full"
    >
      <div className="flex gap-2 sm:gap-3">
        <div className="flex-shrink-0">
          <div className="relative w-16 h-16 sm:w-24 sm:h-24 rounded overflow-hidden bg-gray-100 dark:bg-gray-700">
            <Image
              src={src || fallback}
              alt={props.name}
              fill
              sizes="(max-width: 640px) 64px, 96px"
              className="object-cover pointer-events-none"
              onError={() => setSrc(fallback)}
            />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm">
            <div className="font-medium truncate name text-gray-900 dark:text-gray-100">{props.name}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">SKU: {props.sku}</div>
            {props.location && (
              <div className="text-xs text-gray-500 dark:text-gray-400">{props.location}</div>
            )}
            {(props.color || props.size) && (
              <div className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">{[props.color, props.size].filter(Boolean).join(' / ')}</div>
            )}
            <div className="mt-2 grid grid-cols-3 gap-1 text-xs">
              <div>
                <span className="text-gray-500 dark:text-gray-400">Available:</span>
                <span className="ml-1 font-semibold tabular-nums text-gray-900 dark:text-gray-100">{props.available}</span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Stock:</span>
                <span className="ml-1 font-semibold tabular-nums text-gray-900 dark:text-gray-100">{props.onHandCurrent}</span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Committed:</span>
                <span className="ml-1 font-semibold tabular-nums text-gray-900 dark:text-gray-100">{props.committed}</span>
              </div>
            </div>
            <div className="mt-2">
              <span className="text-xs text-brand-600 dark:text-brand-400 font-medium">View details →</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}


