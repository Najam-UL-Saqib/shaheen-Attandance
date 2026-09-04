-- Demo data (v2): the previous seed needed the two sections to already share a
-- period for the same subject, which auto-generated timetables almost never do.
-- This version picks a period from one section and pulls the partner section
-- into it, replacing whatever it had there (a deliberate, visible change that
-- also shows up in the Timetable-check tab).

do $$
declare
  v_c9   uuid;  v_c10 uuid;
  v_9a   uuid;  v_9b  uuid;
  v_10a  uuid;  v_10b uuid;
  v_cs   uuid;  v_bio uuid;
  v_day  int;   v_period int;
  v_tcs9 uuid;  v_tbio10 uuid;  v_tcs10 uuid;
  v_gid  uuid;
begin
  select id into v_c9  from public.classes where name = '9'  limit 1;
  select id into v_c10 from public.classes where name = '10' limit 1;
  select id into v_cs  from public.subjects where name = 'Computer Science' limit 1;
  select id into v_bio from public.subjects where name = 'Biology' limit 1;
  select id into v_9a  from public.sections where class_id = v_c9  order by section_name limit 1;
  select id into v_9b  from public.sections where class_id = v_c9  order by section_name offset 1 limit 1;
  select id into v_10a from public.sections where class_id = v_c10 order by section_name limit 1;
  select id into v_10b from public.sections where class_id = v_c10 order by section_name offset 1 limit 1;
  if v_9b is null or v_10b is null or v_cs is null or v_bio is null then
    raise notice 'seed v2 skipped: missing classes / sections / subjects';
    return;
  end if;

  -- undo any previously seeded groups on these four sections
  delete from public.timetable_slots
   where group_id in (
     select distinct group_id from public.timetable_slots
      where group_id is not null and section_id in (v_9a, v_9b, v_10a, v_10b)
   );

  ---------------------------------------------------------------------------
  -- 1. Combined: 9-A + 9-B take Computer Science together.
  ---------------------------------------------------------------------------
  select day, period, teacher_id into v_day, v_period, v_tcs9
    from public.timetable_slots
   where section_id = v_9a and subject_id = v_cs
   order by day, period limit 1;

  if v_day is not null then
    delete from public.timetable_slots
     where day = v_day and period = v_period and section_id in (v_9a, v_9b);
    v_gid := gen_random_uuid();
    insert into public.timetable_slots (class_id, section_id, day, period, teacher_id, subject_id, room_id, group_id, group_kind)
    values (v_c9, v_9a, v_day, v_period, v_tcs9, v_cs, null, v_gid, 'combined'),
           (v_c9, v_9b, v_day, v_period, v_tcs9, v_cs, null, v_gid, 'combined');
    raise notice 'combined CS for class 9 at day % period %', v_day, v_period;
  end if;

  ---------------------------------------------------------------------------
  -- 2. Section-shared elective: 10-A + 10-B split Biology / Computer Science.
  ---------------------------------------------------------------------------
  select day, period, teacher_id into v_day, v_period, v_tbio10
    from public.timetable_slots
   where section_id = v_10a and subject_id = v_bio
   order by day, period limit 1;

  select teacher_id into v_tcs10
    from public.timetable_slots
   where subject_id = v_cs and section_id in (v_10a, v_10b)
   order by day, period limit 1;

  if v_day is not null and v_tbio10 is not null and v_tcs10 is not null and v_tbio10 <> v_tcs10 then
    delete from public.timetable_slots
     where day = v_day and period = v_period and section_id in (v_10a, v_10b);
    v_gid := gen_random_uuid();
    insert into public.timetable_slots (class_id, section_id, day, period, teacher_id, subject_id, room_id, group_id, group_kind)
    values (v_c10, v_10a, v_day, v_period, v_tbio10, v_bio, null, v_gid, 'elective'),
           (v_c10, v_10a, v_day, v_period, v_tcs10,  v_cs,  null, v_gid, 'elective'),
           (v_c10, v_10b, v_day, v_period, v_tbio10, v_bio, null, v_gid, 'elective'),
           (v_c10, v_10b, v_day, v_period, v_tcs10,  v_cs,  null, v_gid, 'elective');
    raise notice 'shared elective (Bio/CS) for class 10 at day % period %', v_day, v_period;
  else
    raise notice 'elective seed skipped (day % bio % cs %)', v_day, v_tbio10, v_tcs10;
  end if;
end $$;
