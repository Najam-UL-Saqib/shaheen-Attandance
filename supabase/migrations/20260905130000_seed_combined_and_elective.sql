-- Demo data: one combined lesson and one section-shared elective block, so the
-- new grouped-lesson features (and the Timetable-check warnings they can raise)
-- are visible in the seeded timetable.
--
-- Idempotent-ish: it removes any lesson-group it previously created (by the
-- marker group_kind rows on the target classes) before re-adding, so running
-- the migration twice is safe.

do $$
declare
  v_c9   uuid;
  v_c10  uuid;
  v_9a   uuid;  v_9b  uuid;
  v_10a  uuid;  v_10b uuid;
  v_cs   uuid;  v_bio uuid;
  v_day  int;   v_period int;
  v_teacher_cs9  uuid;
  v_teacher_bio10 uuid;
  v_teacher_cs10 uuid;
  v_gid  uuid;
begin
  select id into v_c9  from public.classes where name = '9'  limit 1;
  select id into v_c10 from public.classes where name = '10' limit 1;
  select id into v_cs  from public.subjects where name = 'Computer Science' limit 1;
  select id into v_bio from public.subjects where name = 'Biology' limit 1;
  if v_c9 is null or v_c10 is null or v_cs is null or v_bio is null then
    raise notice 'seed skipped: classes 9/10 or subjects not found';
    return;
  end if;

  select id into v_9a  from public.sections where class_id = v_c9  order by section_name limit 1;
  select id into v_9b  from public.sections where class_id = v_c9  order by section_name offset 1 limit 1;
  select id into v_10a from public.sections where class_id = v_c10 order by section_name limit 1;
  select id into v_10b from public.sections where class_id = v_c10 order by section_name offset 1 limit 1;
  if v_9b is null or v_10b is null then
    raise notice 'seed skipped: classes 9/10 need two sections';
    return;
  end if;

  -- undo a previous run
  delete from public.timetable_slots
   where group_id in (
     select distinct group_id from public.timetable_slots
      where group_id is not null and section_id in (v_9a, v_9b, v_10a, v_10b)
   );

  ---------------------------------------------------------------------------
  -- 1. Combined: 9-A + 9-B take Computer Science together, one teacher.
  ---------------------------------------------------------------------------
  select a.day, a.period into v_day, v_period
    from public.timetable_slots a
    join public.timetable_slots b
      on b.section_id = v_9b and b.day = a.day and b.period = a.period and b.subject_id = v_cs
   where a.section_id = v_9a and a.subject_id = v_cs
   order by a.day, a.period
   limit 1;

  if v_day is not null then
    select teacher_id into v_teacher_cs9
      from public.timetable_slots
     where section_id = v_9a and subject_id = v_cs and day = v_day and period = v_period
     limit 1;

    delete from public.timetable_slots
     where day = v_day and period = v_period and section_id in (v_9a, v_9b);

    v_gid := gen_random_uuid();
    insert into public.timetable_slots (class_id, section_id, day, period, teacher_id, subject_id, room_id, group_id, group_kind)
    values
      (v_c9, v_9a, v_day, v_period, v_teacher_cs9, v_cs, null, v_gid, 'combined'),
      (v_c9, v_9b, v_day, v_period, v_teacher_cs9, v_cs, null, v_gid, 'combined');
    raise notice 'seeded combined CS for class 9 at day % period %', v_day, v_period;
  else
    raise notice 'seed: no shared CS period found for class 9';
  end if;

  ---------------------------------------------------------------------------
  -- 2. Section-shared elective: 10-A and 10-B split into Biology / Computer
  --    Science at the same time, each option taught to both sections together.
  ---------------------------------------------------------------------------
  v_day := null; v_period := null;
  select a.day, a.period into v_day, v_period
    from public.timetable_slots a
    join public.timetable_slots b
      on b.section_id = v_10b and b.day = a.day and b.period = a.period and b.subject_id = v_bio
   where a.section_id = v_10a and a.subject_id = v_bio
   order by a.day, a.period
   limit 1;

  if v_day is not null then
    select teacher_id into v_teacher_bio10
      from public.timetable_slots
     where section_id = v_10a and subject_id = v_bio and day = v_day and period = v_period limit 1;
    select teacher_id into v_teacher_cs10
      from public.timetable_slots
     where section_id = v_10a and subject_id = v_cs order by day, period limit 1;
    if v_teacher_cs10 is null then
      select teacher_id into v_teacher_cs10
        from public.timetable_slots where section_id = v_10b and subject_id = v_cs order by day, period limit 1;
    end if;

    if v_teacher_bio10 is not null and v_teacher_cs10 is not null and v_teacher_bio10 <> v_teacher_cs10 then
      delete from public.timetable_slots
       where day = v_day and period = v_period and section_id in (v_10a, v_10b);

      v_gid := gen_random_uuid();
      insert into public.timetable_slots (class_id, section_id, day, period, teacher_id, subject_id, room_id, group_id, group_kind)
      values
        (v_c10, v_10a, v_day, v_period, v_teacher_bio10, v_bio, null, v_gid, 'elective'),
        (v_c10, v_10a, v_day, v_period, v_teacher_cs10,  v_cs,  null, v_gid, 'elective'),
        (v_c10, v_10b, v_day, v_period, v_teacher_bio10, v_bio, null, v_gid, 'elective'),
        (v_c10, v_10b, v_day, v_period, v_teacher_cs10,  v_cs,  null, v_gid, 'elective');
      raise notice 'seeded shared elective (Bio/CS) for class 10 at day % period %', v_day, v_period;
    else
      raise notice 'seed: could not resolve distinct Bio/CS teachers for class 10';
    end if;
  else
    raise notice 'seed: no shared Biology period found for class 10';
  end if;
end $$;
