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

  return (
    <Image
      src={imgSrc || 'https://via.placeholder.com/300x200?text=No+Image'}
      alt={alt}
      width={width}
      height={height}
      className={className}
      onError={() => setImgSrc('https://via.placeholder.com/300x200?text=No+Image')}
    />
  );
}


