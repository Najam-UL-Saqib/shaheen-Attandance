
-- Per-date overrides to the default weekly timetable (e.g. covering an absent teacher).
-- A row with teacher_id/subject_id both null means "explicitly marked free for this date",
-- distinct from no row at all, which means "fall back to the default weekly timetable_slots".
create table public.timetable_day_overrides (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  class_id uuid not null references public.classes(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete cascade,
  period smallint not null check (period between 1 and 20),
  teacher_id uuid references public.teachers(id) on delete set null,
  subject_id uuid references public.subjects(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (section_id, date, period)
);
create trigger timetable_day_overrides_updated before update on public.timetable_day_overrides for each row execute function public.set_updated_at();
create index on public.timetable_day_overrides (teacher_id, date, period);
create index on public.timetable_day_overrides (date);
