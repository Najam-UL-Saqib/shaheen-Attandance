export { wouldExceedConsecutiveTeachingLimit, MAX_CONSECUTIVE_TEACHING_PERIODS } from "@/lib/teacher-schedule";

export const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// JS Date#getDay(): 0=Sun..6=Sat. This app's convention: 1=Mon..7=Sun.
export function dateToDay(dateStr: string): number {
  const jsDay = new Date(`${dateStr}T00:00:00`).getDay();
  return jsDay === 0 ? 7 : jsDay;
}
