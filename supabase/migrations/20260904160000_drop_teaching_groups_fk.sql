-- The teaching_groups / teaching_group_members tables duplicated what the slot
-- rows already carry: every member row of a group shares group_id + group_kind,
-- and holds its own section / subject / teacher. Keeping a separate parent row
-- (and its FK) meant every save/delete had to touch three tables in order.
--
-- Make group_id a plain grouping uuid: rows with the same group_id form one
-- combined lesson or one elective block, and group_kind says which.

alter table public.timetable_slots
  drop constraint if exists timetable_slots_group_id_fkey;

drop table if exists public.teaching_group_members;
drop table if exists public.teaching_groups;
