-- The v2 seed left one real clash: the class-10 elective's Computer Science
-- teacher was still booked for a normal lesson in another section at the same
-- period. Clear any such leftover so the seeded timetable has no double-booking
-- (the freed cells just show as "empty period" in the Timetable check).

do $$
declare
  r record;
begin
  for r in
    select gs.day, gs.period, gs.teacher_id
      from public.timetable_slots gs
     where gs.group_id is not null
  loop
    delete from public.timetable_slots x
     where x.group_id is null
       and x.day = r.day and x.period = r.period and x.teacher_id = r.teacher_id;
  end loop;
end $$;
