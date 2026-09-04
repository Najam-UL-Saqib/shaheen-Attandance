-- Teaching groups: a period may carry more than one lesson, and a lesson may
-- serve more than one section.
--   kind='combined'  one teacher/subject/room across several sections, one weekly slot
--   kind='elective'  several subjects in parallel inside ONE section's period (e.g. Bio / Computer)

create table if not exists public.teaching_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('combined', 'elective')),
  created_at timestamptz not null default now()
);

create table if not exists public.teaching_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.teaching_groups(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  unique (group_id, section_id, subject_id)
);

alter table public.timetable_slots
  add column if not exists group_id uuid references public.teaching_groups(id) on delete set null;

-- The blanket uniques only apply to ordinary (non-grouped) lessons now.
alter table public.timetable_slots drop constraint if exists timetable_slots_section_id_day_period_key;
drop index if exists public.timetable_slots_teacher_day_period_key;

create unique index if not exists timetable_slots_section_slot
  on public.timetable_slots (section_id, day, period) where group_id is null;

create unique index if not exists timetable_slots_teacher_slot
  on public.timetable_slots (teacher_id, day, period) where group_id is null;

-- Inside an elective block a section still can't run the same subject twice at once,
-- and a combined group still can't put its teacher in two places.
create unique index if not exists timetable_slots_grouped_section_subject
  on public.timetable_slots (section_id, day, period, subject_id) where group_id is not null;
create unique index if not exists timetable_slots_grouped_teacher
  on public.timetable_slots (teacher_id, day, period, group_id) where group_id is not null;
