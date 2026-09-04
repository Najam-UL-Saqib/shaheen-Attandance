-- Named breaks that cover a chosen set of classes, replacing the single
-- school-wide school_settings.break_after_period (kept as the fallback for
-- classes not attached to any break).
create table if not exists public.breaks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  after_period smallint not null check (after_period between 1 and 20),
  created_at timestamptz not null default now()
);

create table if not exists public.break_classes (
  break_id uuid not null references public.breaks(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  primary key (break_id, class_id)
);

-- Day overrides gain a type so a period can be a test or a school-function block,
-- not just a substitution / free / game.
alter table public.timetable_day_overrides
  add column if not exists kind text not null default 'regular'
    check (kind in ('regular', 'free', 'game', 'test', 'function'));

update public.timetable_day_overrides set kind = 'game' where is_game = true and kind = 'regular';
