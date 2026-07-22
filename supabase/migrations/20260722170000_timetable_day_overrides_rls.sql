-- The table was created with Row Level Security enabled and no policies,
-- which denies all access by default. Since every page in this app already
-- requires a logged-in admin (see AdminLayout), scope access to authenticated users.
alter table public.timetable_day_overrides enable row level security;

create policy "Authenticated users can view day overrides"
  on public.timetable_day_overrides for select
  to authenticated
  using (true);

create policy "Authenticated users can insert day overrides"
  on public.timetable_day_overrides for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update day overrides"
  on public.timetable_day_overrides for update
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can delete day overrides"
  on public.timetable_day_overrides for delete
  to authenticated
  using (true);
