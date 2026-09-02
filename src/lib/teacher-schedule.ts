// Fallback for the "max back-to-back periods a teacher may be scheduled for" rule.
// The live value is stored in school_settings.max_consecutive_periods and edited
// on the Settings tab; this constant is only used while settings are loading.
export const MAX_CONSECUTIVE_TEACHING_PERIODS = 3;

export function wouldExceedConsecutiveTeachingLimit(
  occupiedPeriods: Iterable<number>,
  candidatePeriod: number,
  maxConsecutive = MAX_CONSECUTIVE_TEACHING_PERIODS,
): boolean {
  const periods = [...new Set([...occupiedPeriods, candidatePeriod])].sort((a, b) => a - b);
  let streak = 0;
  let previous: number | undefined;

  for (const period of periods) {
    streak = previous !== undefined && period === previous + 1 ? streak + 1 : 1;
    if (streak > maxConsecutive) return true;
    previous = period;
  }

  return false;
}
