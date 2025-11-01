'use client';

import { useCallback, useState, useEffect } from 'react';

interface Props {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}

export function QuantityAdjuster({ value, onChange, min = 0, max = Number.MAX_SAFE_INTEGER, disabled }: Props) {
  const [inputValue, setInputValue] = useState<string>(value.toString());

  // Update input when value prop changes externally
  useEffect(() => {
    setInputValue(value.toString());
  }, [value]);

  const dec = useCallback(() => {
    if (disabled) return;
    onChange(Math.max(min, value - 1));
  }, [disabled, min, onChange, value]);

  const inc = useCallback(() => {
    if (disabled) return;
    onChange(Math.min(max, value + 1));
  }, [disabled, max, onChange, value]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    
    // Only update if valid number
    const num = parseInt(newValue, 10);
    if (!isNaN(num) && num >= 0) {
      onChange(Math.max(min, Math.min(max, num)));
    } else if (newValue === '') {
      onChange(min);
    }
  }, [onChange, min, max]);

  const handleBlur = useCallback(() => {
    // Reset to valid value on blur
    const num = parseInt(inputValue, 10);
    if (isNaN(num) || num < min) {
      setInputValue(min.toString());
      onChange(min);
    } else if (num > max) {
      setInputValue(max.toString());
      onChange(max);
    }
  }, [inputValue, min, max, onChange]);

  return (
    <div className="inline-flex items-center gap-2">
      <button className="btn-outline h-8 w-8 p-0" onClick={dec} disabled={disabled} aria-label="Decrease">-</button>
      <input
        type="text"
        inputMode="numeric"
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleBlur}
        disabled={disabled}
        className="w-16 text-center border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 h-8 px-2 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Quantity"
      />
      <button className="btn-outline h-8 w-8 p-0" onClick={inc} disabled={disabled} aria-label="Increase">+</button>
    </div>
  );
}


