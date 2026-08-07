import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Used by every component ported from the Lovable redesign — kept under this exact name/path
 * (`@/lib/utils`) so their `cn(...)` calls need no rewriting. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
