-- Make the "maximum consecutive teaching periods" rule configurable from the
-- Settings tab instead of being hard-coded (was MAX_CONSECUTIVE_TEACHING_PERIODS = 3
-- in src/lib/teacher-schedule.ts).
-- A teacher may not be scheduled for more than this many back-to-back periods in a day.
alter table public.school_settings
  add column if not exists max_consecutive_periods smallint not null default 3
    check (max_consecutive_periods between 1 and 20);
