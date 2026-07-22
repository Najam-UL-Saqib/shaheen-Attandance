import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Sorts "1", "2", ..., "10", "11" in numeric order instead of lexicographic
// ("1", "10", "11", "2", ...), while still sorting non-numeric names alphabetically.
export function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}
