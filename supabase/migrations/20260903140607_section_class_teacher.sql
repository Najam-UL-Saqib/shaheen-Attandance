-- Each class-section has one "class teacher" (form/homeroom teacher).
alter table public.sections
  add column if not exists class_teacher_id uuid references public.teachers(id) on delete set null;

-- Seed: give every section a class teacher drawn from the teachers already
-- allocated to it, keeping the assignment one-section-per-teacher where possible.
do $$
declare
  sec record;
  chosen uuid;
begin
  for sec in
    select s.id
    from public.sections s
    join public.classes c on c.id = s.class_id
    where s.class_teacher_id is null
    order by c.name, s.section_name
  loop
    select ta.teacher_id
      into chosen
    from public.teacher_allocations ta
    join public.teachers t on t.id = ta.teacher_id
    where ta.section_id = sec.id
      and not exists (
        select 1 from public.sections s2 where s2.class_teacher_id = ta.teacher_id
      )
    order by ta.total_periods desc, t.name
    limit 1;

    if chosen is null then
      select ta.teacher_id
        into chosen
      from public.teacher_allocations ta
      join public.teachers t on t.id = ta.teacher_id
      where ta.section_id = sec.id
      order by ta.total_periods desc, t.name
      limit 1;
    end if;

    update public.sections set class_teacher_id = chosen where id = sec.id;
  end loop;
end $$;
