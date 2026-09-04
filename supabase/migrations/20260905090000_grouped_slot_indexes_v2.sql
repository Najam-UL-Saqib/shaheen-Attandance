-- Grouped-lesson constraints, take 2.
--
-- The previous four indexes (20260904125307) keyed the exemptions off group_kind
-- ('combined' exempt from the one-teacher rule, 'elective' from the one-section
-- rule). A section-shared elective — 9-A and 9-B both split into Bio / Computer,
-- each option taught to both sections together — needs a row exempt from BOTH
-- rules at once, which a single group_kind value can't express.
--
-- New scheme: the exemptions key off `group_id IS NOT NULL`. group_kind stays,
-- but only as a UI label. Any grouped shape (combined, elective, or both) is
-- allowed, still guarded so a section never runs one subject twice in a period
-- and a teacher never teaches one section twice in a period.

drop index if exists public.timetable_slots_section_slot;
drop index if exists public.timetable_slots_elective_subject;
drop index if exists public.timetable_slots_teacher_slot;
drop index if exists public.timetable_slots_combined_teacher;

-- Ordinary lessons: strict one-per-section and one-per-teacher per period.
create unique index timetable_slots_section_slot
  on public.timetable_slots (section_id, day, period)
  where group_id is null;
create unique index timetable_slots_teacher_slot
  on public.timetable_slots (teacher_id, day, period)
  where group_id is null;

-- Grouped lessons: a section runs each subject at most once per period,
-- a teacher teaches each section at most once per period.
create unique index timetable_slots_grouped_section_subject
  on public.timetable_slots (section_id, day, period, subject_id)
  where group_id is not null;
create unique index timetable_slots_grouped_teacher_section
  on public.timetable_slots (teacher_id, day, period, section_id)
  where group_id is not null;
