-- Hard guarantee: a teacher can only be in one place at a time in the weekly
-- timetable. (Two lessons in one class period is already blocked by the existing
-- unique (section_id, day, period).)
create unique index if not exists timetable_slots_teacher_day_period_key
  on public.timetable_slots (teacher_id, day, period);
