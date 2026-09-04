-- Per-date combined / elective lessons in Day View.
--
-- A grouped override is several rows sharing a group_id: 'combined' = one
-- teacher across sections (one row per section), 'elective' = one section split
-- into parallel subjects (one row per option), or both. Same shape and same
-- guard rules as timetable_slots.

alter table public.timetable_day_overrides
  add column if not exists group_id uuid,
  add column if not exists group_kind text check (group_kind in ('combined', 'elective'));

-- The blanket "one override per section/date/period" only applies to ungrouped rows now.
alter table public.timetable_day_overrides
  drop constraint if exists timetable_day_overrides_section_id_date_period_key;

create unique index if not exists timetable_day_overrides_section_slot
  on public.timetable_day_overrides (section_id, date, period)
  where group_id is null;

create unique index if not exists timetable_day_overrides_grouped_section_subject
  on public.timetable_day_overrides (section_id, date, period, subject_id)
  where group_id is not null;

create unique index if not exists timetable_day_overrides_grouped_teacher_section
  on public.timetable_day_overrides (teacher_id, date, period, section_id)
  where group_id is not null;
