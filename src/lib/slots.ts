// Counting rules for grouped lessons.
//
// A combined lesson is one teacher taking several sections in a single period
// (one timetable_slots row per section, all sharing a group_id). It occupies
// ONE period of that teacher's time, not one per section. An elective block is
// one section split into parallel subjects (several rows, one group_id) — it is
// ONE period of that section's schedule, not one per option.
//
// Rows sharing a non-null group_id therefore collapse to a single occupied
// slot; ungrouped rows count individually.

export type GroupedSlot = {
  group_id: string | null;
  section_id: string;
  day: number;
  period: number;
};

// Distinct periods occupied by rows already filtered to ONE teacher.
// Combined rows (same group_id) collapse to one.
export function countTeacherPeriods(rows: GroupedSlot[]): number {
  const keys = new Set<string>();
  for (const r of rows) {
    keys.add(r.group_id ?? `${r.section_id}-${r.day}-${r.period}`);
  }
  return keys.size;
}

// Distinct periods occupied by rows already filtered to ONE section.
// Elective option rows (same group_id) collapse to one.
export function countSectionPeriods(rows: GroupedSlot[]): number {
  const keys = new Set<string>();
  for (const r of rows) {
    keys.add(r.group_id ?? `${r.day}-${r.period}`);
  }
  return keys.size;
}
