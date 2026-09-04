// Plain-language checks over the whole timetable. Each returns a Warning with a
// one-line title and a one-line explanation an employee can act on directly.
//
// Pure and data-only so it can be unit tested and reused. Feed it the same rows
// the Reports page already loads.

import { countTeacherPeriods, countSectionPeriods } from "@/lib/slots";
import { wouldExceedConsecutiveTeachingLimit } from "@/lib/teacher-schedule";
import { DAY_NAMES } from "@/lib/schedule";

export type Severity = "error" | "warning" | "info";

export type Warning = {
  id: string;
  severity: Severity;
  /** short label, e.g. "Teacher over-booked" */
  category: string;
  /** one sentence: what is wrong */
  title: string;
  /** one sentence: what to do about it and where */
  detail: string;
  /** set when the issue belongs to one section, so a section editor can filter to it */
  sectionId?: string;
  /** set when the issue belongs to one teacher */
  teacherId?: string;
};

export type WarningInput = {
  classes: { id: string; name: string }[];
  sections: { id: string; class_id: string; section_name: string; class_teacher_id: string | null }[];
  subjects: { id: string; name: string }[];
  teachers: { id: string; name: string }[];
  allocations: { id: string; teacher_id: string; section_id: string; total_periods: number }[];
  allocationSubjects: { allocation_id: string; subject_id: string; periods: number }[];
  slots: {
    section_id: string; teacher_id: string; subject_id: string; room_id: string | null;
    day: number; period: number; group_id: string | null;
  }[];
  games: { section_id: string; day: number; period: number }[];
  workingDays: number;
  periodsPerDay: number;
  maxConsecutive: number;
};

const dayLabel = (d: number) => DAY_NAMES[d] ?? `Day ${d}`;

export function computeTimetableWarnings(input: WarningInput): Warning[] {
  const {
    classes, sections, subjects, teachers, allocations, allocationSubjects, slots, games,
    workingDays, periodsPerDay, maxConsecutive,
  } = input;

  const out: Warning[] = [];
  const teacherName = (id: string) => teachers.find((t) => t.id === id)?.name ?? "A teacher";
  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? "a subject";
  const sectionLabel = (id: string) => {
    const sec = sections.find((s) => s.id === id);
    const cls = classes.find((c) => c.id === sec?.class_id);
    return sec && cls ? `${cls.name} – ${sec.section_name}` : "a class";
  };

  // ---- 1. teacher workload: over / under filled -----------------------------
  for (const t of teachers) {
    const allocated = allocations.filter((a) => a.teacher_id === t.id).reduce((n, a) => n + a.total_periods, 0);
    const placed = countTeacherPeriods(slots.filter((s) => s.teacher_id === t.id));
    if (allocated === 0 && placed === 0) {
      out.push({
        id: `teacher-no-alloc-${t.id}`, severity: "info", category: "Unused teacher", teacherId: t.id,
        title: `${t.name} has no workload and no lessons.`,
        detail: `If ${t.name} teaches here, add their periods on the Teacher workload page; otherwise they can be removed.`,
      });
      continue;
    }
    if (placed > allocated) {
      out.push({
        id: `teacher-over-${t.id}`, severity: "error", category: "Teacher over-booked", teacherId: t.id,
        title: `${t.name} is in the timetable for ${placed} periods but is only allocated ${allocated}.`,
        detail: `Remove ${placed - allocated} lesson${placed - allocated === 1 ? "" : "s"} from the Weekly timetable, or raise ${t.name}'s workload on the Teacher workload page.`,
      });
    } else if (placed < allocated) {
      out.push({
        id: `teacher-under-${t.id}`, severity: "warning", category: "Teacher under-filled", teacherId: t.id,
        title: `${t.name} has ${placed} of ${allocated} allocated periods placed.`,
        detail: `${allocated - placed} period${allocated - placed === 1 ? " is" : "s are"} still missing — add ${t.name}'s remaining lessons in the Weekly timetable.`,
      });
    }
  }

  // ---- 2. per-subject coverage in a section --------------------------------
  for (const a of allocations) {
    for (const as of allocationSubjects.filter((x) => x.allocation_id === a.id)) {
      const placed = slots.filter(
        (s) => s.section_id === a.section_id && s.teacher_id === a.teacher_id && s.subject_id === as.subject_id,
      ).length;
      if (placed === as.periods) continue;
      const where = `${sectionLabel(a.section_id)} · ${subjectName(as.subject_id)}`;
      if (placed < as.periods) {
        out.push({
          id: `subj-under-${a.id}-${as.subject_id}`, severity: "warning", category: "Subject short of periods",
          sectionId: a.section_id, teacherId: a.teacher_id,
          title: `${where}: ${placed} of ${as.periods} periods placed.`,
          detail: `Open the Weekly timetable for this section and add ${as.periods - placed} more ${subjectName(as.subject_id)} period${as.periods - placed === 1 ? "" : "s"} with ${teacherName(a.teacher_id)}.`,
        });
      } else {
        out.push({
          id: `subj-over-${a.id}-${as.subject_id}`, severity: "error", category: "Subject over its periods",
          sectionId: a.section_id, teacherId: a.teacher_id,
          title: `${where}: ${placed} periods placed but only ${as.periods} allocated.`,
          detail: `Remove ${placed - as.periods} ${subjectName(as.subject_id)} period${placed - as.periods === 1 ? "" : "s"} from this section, or raise the allocation on the Teacher workload page.`,
        });
      }
    }
  }

  // ---- 3. clashes: teacher / section / room in the same slot --------------
  const bySlot = new Map<string, typeof slots>();
  for (const s of slots) {
    const key = `${s.day}-${s.period}`;
    bySlot.set(key, [...(bySlot.get(key) ?? []), s]);
  }
  for (const [key, group] of bySlot) {
    const [day, period] = key.split("-").map(Number);
    const when = `${dayLabel(day)} period ${period}`;

    // teacher in two different lesson-groups at once
    const byTeacher = new Map<string, Set<string>>();
    for (const s of group) {
      const g = byTeacher.get(s.teacher_id) ?? new Set<string>();
      g.add(s.group_id ?? `${s.section_id}`);
      byTeacher.set(s.teacher_id, g);
    }
    for (const [tid, groups] of byTeacher) {
      if (groups.size > 1) {
        const secs = [...new Set(group.filter((s) => s.teacher_id === tid).map((s) => sectionLabel(s.section_id)))];
        out.push({
          id: `clash-teacher-${tid}-${key}`, severity: "error", category: "Teacher double-booked", teacherId: tid,
          title: `${teacherName(tid)} is booked in ${secs.join(" and ")} at the same time (${when}).`,
          detail: `A teacher can only be in one place. Move one of these lessons to a free period, or combine the two sections if it is really one class.`,
        });
      }
    }

    // section running two separate lessons (not one grouped block)
    const bySection = new Map<string, Set<string>>();
    for (const s of group) {
      const g = bySection.get(s.section_id) ?? new Set<string>();
      g.add(s.group_id ?? `sub:${s.subject_id}`);
      bySection.set(s.section_id, g);
    }
    for (const [sid, groups] of bySection) {
      if (groups.size > 1 && !group.some((s) => s.section_id === sid && s.group_id)) {
        out.push({
          id: `clash-section-${sid}-${key}`, severity: "error", category: "Class double-booked", sectionId: sid,
          title: `${sectionLabel(sid)} has two lessons in ${when}.`,
          detail: `Delete one of them in the Weekly timetable, or make them an elective block if pupils split between the two.`,
        });
      }
    }

    // room used by two sections at once
    const byRoom = new Map<string, Set<string>>();
    for (const s of group) {
      if (!s.room_id) continue;
      const g = byRoom.get(s.room_id) ?? new Set<string>();
      g.add(s.section_id);
      byRoom.set(s.room_id, g);
    }
    for (const [rid, secs] of byRoom) {
      if (secs.size > 1) {
        out.push({
          id: `clash-room-${rid}-${key}`, severity: "warning", category: "Room double-booked",
          title: `One room is assigned to ${secs.size} classes in ${when}.`,
          detail: `Give one of the lessons a different room, or clear the room if it isn't needed.`,
        });
      }
    }
  }

  // ---- 4. consecutive-period limit ---------------------------------------
  for (const t of teachers) {
    for (let d = 1; d <= workingDays; d++) {
      const periods = [...new Set(slots.filter((s) => s.teacher_id === t.id && s.day === d).map((s) => s.period))].sort((a, b) => a - b);
      if (periods.length <= maxConsecutive) continue;
      // find the longest run
      let run = 1, longest = 1;
      for (let i = 1; i < periods.length; i++) {
        run = periods[i] === periods[i - 1] + 1 ? run + 1 : 1;
        longest = Math.max(longest, run);
      }
      if (longest > maxConsecutive && wouldExceedConsecutiveTeachingLimit(periods, periods[0], maxConsecutive)) {
        out.push({
          id: `consec-${t.id}-${d}`, severity: "warning", category: "Too many periods in a row", teacherId: t.id,
          title: `${t.name} teaches ${longest} periods back-to-back on ${dayLabel(d)} (limit is ${maxConsecutive}).`,
          detail: `Give ${t.name} a gap by moving one lesson to another period or day, or raise the limit on the Settings page if this is intended.`,
        });
      }
    }
  }

  // ---- 5. gaps: a section with an empty slot inside the school day -------
  for (const sec of sections) {
    const cls = classes.find((c) => c.id === sec.class_id);
    const filled = new Set<string>();
    slots.filter((s) => s.section_id === sec.id).forEach((s) => filled.add(`${s.day}-${s.period}`));
    games.filter((g) => g.section_id === sec.id).forEach((g) => filled.add(`${g.day}-${g.period}`));
    let gapCount = 0;
    let firstGap = "";
    for (let d = 1; d <= workingDays; d++) {
      for (let p = 1; p <= periodsPerDay; p++) {
        if (!filled.has(`${d}-${p}`)) {
          gapCount++;
          if (!firstGap) firstGap = `${dayLabel(d)} period ${p}`;
        }
      }
    }
    if (gapCount > 0 && cls) {
      out.push({
        id: `gap-${sec.id}`, severity: "warning", category: "Empty periods", sectionId: sec.id,
        title: `${cls.name} – ${sec.section_name} has ${gapCount} empty period${gapCount === 1 ? "" : "s"} (first: ${firstGap}).`,
        detail: `Open the Weekly timetable for this section and fill the blank cells, or mark them as Game / break if that is intended.`,
      });
    }
  }

  // ---- 6. section total over the week's capacity -----------------------
  for (const sec of sections) {
    const cls = classes.find((c) => c.id === sec.class_id);
    if (!cls) continue;
    const lessons = countSectionPeriods(slots.filter((s) => s.section_id === sec.id));
    const gamePeriods = games.filter((g) => g.section_id === sec.id).length;
    const capacity = workingDays * periodsPerDay;
    const filled = lessons + gamePeriods;
    if (filled > capacity) {
      out.push({
        id: `cap-over-${sec.id}`, severity: "error", category: "Week over-filled", sectionId: sec.id,
        title: `${cls.name} – ${sec.section_name} has ${filled} lessons/games, more than the ${capacity} periods in the week.`,
        detail: `Remove some lessons for this section, or increase Periods per day / Working days on the Settings page.`,
      });
    }
  }

  // ---- 7. section has no class teacher ---------------------------------
  for (const sec of sections) {
    const cls = classes.find((c) => c.id === sec.class_id);
    if (cls && !sec.class_teacher_id) {
      out.push({
        id: `no-ct-${sec.id}`, severity: "info", category: "No class teacher", sectionId: sec.id,
        title: `${cls.name} – ${sec.section_name} has no class teacher.`,
        detail: `Assign one on the Classes & sections page so the reports and registers show who is responsible for this section.`,
      });
    }
  }

  const rank: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || a.category.localeCompare(b.category));
}
