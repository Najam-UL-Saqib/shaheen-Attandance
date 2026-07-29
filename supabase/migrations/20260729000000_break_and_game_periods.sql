
-- Add break_after_period to school_settings
-- 0 means no break; any positive integer N means a break is shown after period N.
alter table public.school_settings
  add column if not exists break_after_period smallint not null default 0 check (break_after_period between 0 and 20);

-- Game period assignments (per section / day / period)
-- A row here marks that slot as a "Game" period — no teacher or subject required.
create table if not exists public.game_period_assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete cascade,
  day smallint not null check (day between 1 and 7),
  period smallint not null check (period between 1 and 20),
  created_at timestamptz not null default now(),
  unique (section_id, day, period)
);

create index if not exists game_period_assignments_section_day on public.game_period_assignments (section_id, day);

-- RLS: same pattern as other tables (admin only)
alter table public.game_period_assignments enable row level security;

create policy "Admins can manage game_period_assignments"
  on public.game_period_assignments
  for all
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
