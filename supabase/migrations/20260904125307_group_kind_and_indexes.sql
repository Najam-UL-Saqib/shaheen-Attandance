-- Denormalise the group kind onto the slot so the partial unique indexes can use it.
alter table public.timetable_slots
  add column if not exists group_kind text check (group_kind in ('combined', 'elective'));

drop index if exists public.timetable_slots_section_slot;
drop index if exists public.timetable_slots_teacher_slot;
drop index if exists public.timetable_slots_grouped_section_subject;
drop index if exists public.timetable_slots_grouped_teacher;

-- One lesson per section per period — except inside an elective block, where each
-- subject in the block gets its own row.
create unique index timetable_slots_section_slot
  on public.timetable_slots (section_id, day, period)
  where group_kind is distinct from 'elective';
create unique index timetable_slots_elective_subject
  on public.timetable_slots (section_id, day, period, subject_id)
  where group_kind = 'elective';

-- One teacher per period — except a combined group, which teaches several
-- sections at once (one row per section).
create unique index timetable_slots_teacher_slot
  on public.timetable_slots (teacher_id, day, period)
  where group_kind is distinct from 'combined';
create unique index timetable_slots_combined_teacher
  on public.timetable_slots (teacher_id, day, period, section_id)
  where group_kind = 'combined';
