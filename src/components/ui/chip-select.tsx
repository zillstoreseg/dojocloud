'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ChipOption {
  value: string;
  label: string;
}

/**
 * Multi-select as a field of toggleable chips.
 *
 * A native multi-select is unusable on touch and hides the options behind an
 * interaction; specialties are the first thing a coach is asked about, so they
 * are all visible at once. The same component backs the public directory
 * filter later, which keeps the two lists looking like the same idea.
 */
export function ChipSelect({
  options,
  value,
  onChange,
  max,
  name,
  disabled,
  className,
}: {
  options: ChipOption[];
  value: string[];
  onChange: (next: string[]) => void;
  /** Hard cap; chips beyond it go disabled rather than silently ignoring taps. */
  max?: number;
  name?: string;
  disabled?: boolean;
  className?: string;
}) {
  const atMax = max !== undefined && value.length >= max;

  function toggle(option: string) {
    if (value.includes(option)) {
      onChange(value.filter((v) => v !== option));
    } else if (!atMax) {
      onChange([...value, option]);
    }
  }

  return (
    <div className={cn('flex flex-wrap gap-2', className)} role="group">
      {options.map((option) => {
        const selected = value.includes(option.value);
        const blocked = !selected && atMax;
        return (
          <button
            key={option.value}
            type="button"
            role="checkbox"
            aria-checked={selected}
            disabled={disabled || blocked}
            onClick={() => toggle(option.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-all duration-micro ease-brand',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              selected
                ? 'border-primary bg-primary text-primary-foreground shadow-soft'
                : 'border-input bg-card hover:border-primary/40 hover:bg-accent',
              blocked && 'cursor-not-allowed opacity-40 hover:border-input hover:bg-card',
            )}
          >
            {selected ? <Check className="size-3.5" /> : null}
            {option.label}
          </button>
        );
      })}
      {/* Mirrors the selection for anything reading the surrounding form. */}
      {name ? <input type="hidden" name={name} value={value.join(',')} /> : null}
    </div>
  );
}

/** Single-choice variant, styled identically so a form reads consistently. */
export function ChipRadio({
  options,
  value,
  onChange,
  name,
  className,
}: {
  options: ChipOption[];
  value: string | null;
  onChange: (next: string) => void;
  name?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)} role="radiogroup">
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-all duration-micro ease-brand',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              selected
                ? 'border-primary bg-primary text-primary-foreground shadow-soft'
                : 'border-input bg-card hover:border-primary/40 hover:bg-accent',
            )}
          >
            {selected ? <Check className="size-3.5" /> : null}
            {option.label}
          </button>
        );
      })}
      {name ? <input type="hidden" name={name} value={value ?? ''} /> : null}
    </div>
  );
}
