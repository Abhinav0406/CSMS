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
  href?: string; // Optional custom href for navigation with page preservation
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

  const href = props.href || `/product/${encodeURIComponent(props.sku)}?location=${encodeURIComponent(props.location || '')}&color=${encodeURIComponent(props.color || '')}&size=${encodeURIComponent(props.size || '')}`;

  return (
    <Link 
      href={href} 
      className="card p-2 sm:p-3 hover:shadow-md active:scale-[0.98] transition-all cursor-pointer block no-underline w-full"
    >
      <div className="flex gap-3 sm:gap-4">
        <div className="flex-shrink-0">
          <div className="relative w-20 h-20 sm:w-32 sm:h-32 rounded overflow-hidden bg-gray-100 dark:bg-gray-700">
            <Image
              src={src || fallback}
              alt={props.name}
              fill
              sizes="(max-width: 640px) 80px, 128px"
              className="object-cover pointer-events-none"
              onError={() => setSrc(fallback)}
            />
          </div>
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-sm sm:text-base">
              <div className="font-medium truncate name text-gray-900 dark:text-gray-100">{props.name}</div>
              <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5">SKU: {props.sku}</div>
              {props.location && (
                <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5">{props.location}</div>
              )}
              {(props.color || props.size) && (
                <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 mt-0.5">{[props.color, props.size].filter(Boolean).join(' / ')}</div>
              )}
            </div>
          </div>
          <div className="flex-shrink-0 text-right mt-auto">
            <div className="flex flex-col gap-1 text-xs sm:text-sm">
              <div className="text-gray-500 dark:text-gray-400">
                Available: <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{props.available}</span>
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                Stock: <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{props.onHandCurrent}</span>
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                Committed: <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{props.committed}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}


