-- Allow a per-date override to mark a period as a Game/PT period for that date only,
-- distinct from an override that explicitly marks the period free (teacher/subject both null).
alter table public.timetable_day_overrides
  add column is_game boolean not null default false;
