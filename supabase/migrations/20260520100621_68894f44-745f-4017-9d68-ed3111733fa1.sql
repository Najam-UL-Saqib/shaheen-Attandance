
-- Roles
create type public.app_role as enum ('admin');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- Auto-assign the first signup as admin
create or replace function public.handle_new_user_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created_admin
  after insert on auth.users
  for each row execute function public.handle_new_user_admin();

-- Helper for timestamps
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- Subjects
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger subjects_updated before update on public.subjects for each row execute function public.set_updated_at();

-- Classes
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger classes_updated before update on public.classes for each row execute function public.set_updated_at();

-- Sections
create table public.sections (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  section_name text not null,
  created_at timestamptz not null default now(),
  unique (class_id, section_name)
);

-- Class-Subject mapping
create table public.class_subjects (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  unique (class_id, subject_id)
);

-- Teachers
create table public.teachers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  employee_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger teachers_updated before update on public.teachers for each row execute function public.set_updated_at();

-- Rooms
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  capacity int,
  created_at timestamptz not null default now()
);

-- Teacher allocations (per teacher/class/section)
create table public.teacher_allocations (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete cascade,
  total_periods int not null check (total_periods >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (teacher_id, class_id, section_id)
);
create trigger teacher_allocations_updated before update on public.teacher_allocations for each row execute function public.set_updated_at();

-- Subject splits within an allocation
create table public.teacher_allocation_subjects (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null references public.teacher_allocations(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  periods int not null check (periods >= 0),
  unique (allocation_id, subject_id)
);

-- Timetable slots
create table public.timetable_slots (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete cascade,
  day smallint not null check (day between 1 and 7),
  period smallint not null check (period between 1 and 20),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (section_id, day, period)
);
create index on public.timetable_slots (teacher_id, day, period);
create index on public.timetable_slots (room_id, day, period);

-- School settings (single row)
create table public.school_settings (
  id int primary key default 1,
  working_days smallint not null default 5 check (working_days between 1 and 7),
  periods_per_day smallint not null default 6 check (periods_per_day between 1 and 20),
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);
insert into public.school_settings (id) values (1) on conflict do nothing;
