## Timetable Allocation System — Build Plan

A single-admin web app for Shaheen Public School and College to manage subjects, classes, sections, teachers, workload allocations, and weekly timetables with auto-generation, room allocation, and conflict detection.

### Tech & Setup
- TanStack Start + React + Tailwind (existing template)
- Lovable Cloud (Supabase) for database + admin auth (email/password)
- shadcn/ui for tables, forms, dialogs
- Single Admin role only (per PRD)

### Database Schema (Supabase migrations)
- `subjects` — id, name (unique), code
- `classes` — id, name (unique)
- `sections` — id, class_id, section_name (unique per class)
- `class_subjects` — id, class_id, subject_id (unique pair)
- `teachers` — id, name, email, employee_id
- `rooms` — id, name, capacity
- `teacher_allocations` — id, teacher_id, class_id, section_id, total_periods
- `teacher_allocation_subjects` — id, allocation_id, subject_id, periods (child rows; sum must equal total)
- `timetable_slots` — id, class_id, section_id, day, period, teacher_id, subject_id, room_id
- `school_settings` — working_days (Mon–Fri/Sat), periods_per_day

RLS: enabled, admin-only via `has_role(auth.uid(), 'admin')` pattern with `user_roles` table.

### Pages / Routes
1. `/login` — admin sign-in
2. `/` (dashboard) — quick stats + nav
3. `/subjects` — CRUD
4. `/classes` — CRUD + manage sections inline
5. `/classes/$id/subjects` — assign global subjects to class
6. `/teachers` — CRUD
7. `/rooms` — CRUD
8. `/allocations` — teacher workload UI (select teacher → class → section → set total + per-subject periods, live remaining counter, R3/R5 validation)
9. `/timetable` — pick class+section, grid editor (day × period), per-cell teacher+subject+room picker, conflict detection, validation against allocations, **Auto-generate** button
10. `/reports/class-subject` — Table A matrix
11. `/reports/teacher-class` — Table B matrix
12. `/settings` — working days, periods per day

### Validation Rules (enforced both client-side and via DB triggers/checks where critical)
- R1 unique class name (DB unique)
- R2 sections inherit class subjects (joined at query time, no duplication)
- R3 sum(subject periods) == total_periods on allocation save
- R4 timetable assigned count ≤ allocated; checked before insert/update
- R5 decreasing total blocked if current assigned > new total, with descriptive message

### Auto-Timetable Generator
Greedy algorithm in a server function:
- Input: class+section
- For each (teacher, subject) allocation, schedule remaining periods into empty slots
- Respect: teacher not double-booked across all sections, room not double-booked, no duplicate subject in same day where possible
- Return proposed timetable for admin to review/save

### Conflict Detection
Real-time check on slot edit:
- Teacher already teaching another (class, section) at same (day, period)
- Room already used at same (day, period)
- Visual red highlight + tooltip explaining conflict

### Reports
- Table A (Class-Section × Subject): cell shows `Teacher | Allocated / Used`
- Table B (Teacher × Class-Section): cell shows `Allocated / Used`
- Used = count of matching timetable_slots

### Design
Clean admin UI: neutral palette (slate + indigo accent), Inter font, dense data tables, sticky headers, sidebar nav. No marketing flourishes.

### Out of Scope (v2)
- Multi-role (teacher/student views)
- Notifications, exports to PDF/Excel (can add later)
- Mobile-first optimization (desktop-first admin tool)

### Build Order
1. Enable Lovable Cloud + auth + schema + RLS
2. Layout + sidebar + admin login gate
3. Modules 1–4 CRUD (subjects, classes/sections, class-subjects, teachers, rooms)
4. Module 5 allocations with validation
5. Module 6 timetable grid + manual editing + conflict detection
6. Auto-generation
7. Module 7 reports
