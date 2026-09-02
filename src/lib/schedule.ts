export { wouldExceedConsecutiveTeachingLimit, MAX_CONSECUTIVE_TEACHING_PERIODS } from "@/lib/teacher-schedule";

export const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Fallback values used only while school_settings is still loading or missing a row.
// The real values live in the school_settings table and are edited on the Settings tab.
export const DEFAULT_WORKING_DAYS = 5;
export const DEFAULT_PERIODS_PER_DAY = 8;
export const DEFAULT_BREAK_AFTER_PERIOD = 0;

// JS Date#getDay(): 0=Sun..6=Sat. This app's convention: 1=Mon..7=Sun.
export function dateToDay(dateStr: string): number {
  const jsDay = new Date(`${dateStr}T00:00:00`).getDay();
  return jsDay === 0 ? 7 : jsDay;
}
