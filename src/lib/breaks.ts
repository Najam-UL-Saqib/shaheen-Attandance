export type Break = { id: string; name: string; after_period: number };
export type BreakClass = { break_id: string; class_id: string };

/**
 * The "break after period N" positions for a class:
 * the after_period of every custom break the class belongs to, or — if it
 * belongs to none — the school-wide default (when that is > 0).
 */
export function breakPositionsForClass(
  classId: string,
  breaks: Break[],
  breakClasses: BreakClass[],
  defaultAfter: number,
): number[] {
  const custom = breakClasses
    .filter((bc) => bc.class_id === classId)
    .map((bc) => breaks.find((b) => b.id === bc.break_id)?.after_period)
    .filter((n): n is number => typeof n === "number" && n > 0);
  if (custom.length) return [...new Set(custom)].sort((a, b) => a - b);
  return defaultAfter > 0 ? [defaultAfter] : [];
}

/** Union of every class's break positions — the shared column layout for a whole-school grid. */
export function allBreakPositions(
  classIds: string[],
  breaks: Break[],
  breakClasses: BreakClass[],
  defaultAfter: number,
): number[] {
  const s = new Set<number>();
  for (const cid of classIds) {
    breakPositionsForClass(cid, breaks, breakClasses, defaultAfter).forEach((p) => s.add(p));
  }
  return [...s].sort((a, b) => a - b);
}
