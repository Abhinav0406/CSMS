'use client';

import { useCallback } from 'react';

interface Props {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}

export function QuantityAdjuster({ value, onChange, min = 0, max = Number.MAX_SAFE_INTEGER, disabled }: Props) {
  const dec = useCallback(() => {
    if (disabled) return;
    onChange(Math.max(min, value - 1));
  }, [disabled, min, onChange, value]);

  const inc = useCallback(() => {
    if (disabled) return;
    onChange(Math.min(max, value + 1));
  }, [disabled, max, onChange, value]);

  return (
    <div className="inline-flex items-center gap-2">
      <button className="btn-outline h-8 w-8 p-0" onClick={dec} disabled={disabled} aria-label="Decrease">-</button>
      <span className="min-w-8 text-center">{value}</span>
      <button className="btn-outline h-8 w-8 p-0" onClick={inc} disabled={disabled} aria-label="Increase">+</button>
    </div>
  );
}


