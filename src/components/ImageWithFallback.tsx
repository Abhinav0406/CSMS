'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

interface Props {
  src?: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
}

export function ImageWithFallback({ src, alt, width, height, className }: Props) {
  const [imgSrc, setImgSrc] = useState<string | undefined>(src);

  useEffect(() => setImgSrc(src), [src]);

  const FALLBACK = `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='0 0 ${width} ${height}'>
      <rect width='100%' height='100%' fill='#f3f4f6'/>
      <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#9ca3af' font-size='12' font-family='Arial, sans-serif'>No Image</text>
    </svg>`
  )}`;

  return (
    <Image
      src={imgSrc || FALLBACK}
      alt={alt}
      width={width}
      height={height}
      className={className}
      onError={() => setImgSrc(FALLBACK)}
    />
  );
}


