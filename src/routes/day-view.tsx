import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout, PageHeader } from "@/components/admin-layout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RotateCcw, Gamepad2, Coffee, AlertTriangle, UserX, ClipboardCheck, PartyPopper } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { dateToDay, wouldExceedConsecutiveTeachingLimit, MAX_CONSECUTIVE_TEACHING_PERIODS, DEFAULT_PERIODS_PER_DAY, DEFAULT_BREAK_AFTER_PERIOD } from "@/lib/schedule";
import { allBreakPositions, breakPositionsForClass, type Break, type BreakClass } from "@/lib/breaks";
import { naturalCompare } from "@/lib/utils";

export const Route = createFileRoute("/day-view")({ component: DayViewPage });

type Klass = { id: string; name: string };
type Section = { id: string; class_id: string; section_name: string };
type Teacher = { id: string; name: string };
type Subject = { id: string; name: string };
type Room = { id: string; name: string };
type ClassSubject = { class_id: string; subject_id: string };
type Allocation = { teacher_id: string; section_id: string };
type Slot = { class_id: string; section_id: string; day: number; period: number; teacher_id: string; subject_id: string; room_id: string | null };
type Override = {
  id: string;
  date: string;
  class_id: string;
  section_id: string;
  period: number;
  teacher_id: string | null;
  subject_id: string | null;
  room_id: string | null;
  is_game: boolean;
  kind: OverrideKind;
};
type OverrideKind = "regular" | "free" | "game" | "test" | "function";
type GameAssignment = { section_id: string; day: number; period: number };

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type TeacherScope = "class" | "all";

// Segmented "This class" / "All available (N)" switch. Both segments always
// visible so you can flip back and forth.
function TeacherScopeToggle({
  scope, onChange, othersCount, className = "",
}: { scope: TeacherScope; onChange: (s: TeacherScope) => void; othersCount: number; className?: string }) {
  const seg = (s: TeacherScope, label: string) => (
    <button
      type="button"
      aria-pressed={scope === s}
      onClick={() => onChange(s)}
      className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
        scope === s ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className={`inline-flex items-center gap-0.5 rounded-md border bg-muted/60 p-0.5 ${className}`}>
      {seg("class", "This class")}
      {seg("all", `All available (${othersCount})`)}
    </div>
  );
}

function CoverPicker({
  primary, others, value, onChange,
}: { primary: Teacher[]; others: Teacher[]; value: string; onChange: (v: string) => void }) {
  const [scope, setScope] = useState<TeacherScope>("class");
  const selectedIsOther = others.some((t) => t.id === value);
  const showOthers = scope === "all" || selectedIsOther;
  return (
    <div className="flex w-full flex-col gap-1.5 sm:w-64">
      {others.length > 0 && (
        <TeacherScopeToggle scope={scope} onChange={setScope} othersCount={others.length} className="self-start" />
      )}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Choose cover" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__free__">Leave free — no teacher</SelectItem>
          {primary.length > 0 && <div className="px-2 pt-1.5 pb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">From this class</div>}
          {primary.length === 0 && <div className="px-2 pt-1.5 pb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">No free teacher from this class</div>}
          {primary.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          {showOthers && others.length > 0 && (
            <>
              <div className="px-2 pt-1.5 pb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">Other available teachers</div>
              {others.filter((t) => scope === "all" || t.id === value).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

// Teacher <Select> with the "This class / All available" scope switch above it.
// Used for both the cover teacher and the (optional) test invigilator.
function TeacherPicker({
  primary, others, value, onChange, scope, onScopeChange, placeholder, noneLabel,
}: {
  primary: Teacher[]; others: Teacher[];
  value: string; onChange: (v: string) => void;
  scope: TeacherScope; onScopeChange: (s: TeacherScope) => void;
  placeholder: string; noneLabel?: string;
}) {
  const selectedIsOther = others.some((t) => t.id === value);
  const showOthers = scope === "all" || selectedIsOther;
  return (
    <div className="space-y-1.5">
      {others.length > 0 && (
        <TeacherScopeToggle scope={scope} onChange={onScopeChange} othersCount={others.length} />
      )}
      <Select
        value={value || (noneLabel ? "__none__" : "")}
        onValueChange={(v) => onChange(v === "__none__" ? "" : v)}
      >
        <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          {noneLabel && <SelectItem value="__none__">{noneLabel}</SelectItem>}
          {primary.length === 0 && others.length === 0 && (
            <div className="p-2 text-sm text-muted-foreground">No teacher is free this period.</div>
          )}
          {primary.length > 0 && <div className="px-2 pt-1.5 pb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">From this class</div>}
          {primary.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          {showOthers && others.length > 0 && (
            <>
              <div className="px-2 pt-1.5 pb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">Other available teachers</div>
              {others.filter((t) => scope === "all" || t.id === value).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

function DayViewPage() {
  const qc = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(todayStr());

  const settingsQ = useQuery({ queryKey: ["settings"], queryFn: async () => (await supabase.from("school_settings").select("*").eq("id", 1).maybeSingle()).data });
  const classesQ = useQuery({ queryKey: ["classes"], queryFn: async () => (await supabase.from("classes").select("*").order("name")).data as Klass[] });
  const sectionsQ = useQuery({ queryKey: ["sections"], queryFn: async () => (await supabase.from("sections").select("*").order("section_name")).data as Section[] });
  const teachersQ = useQuery({ queryKey: ["teachers"], queryFn: async () => (await supabase.from("teachers").select("*").order("name")).data as Teacher[] });
  const subjectsQ = useQuery({ queryKey: ["subjects"], queryFn: async () => (await supabase.from("subjects").select("*").order("name")).data as Subject[] });
  const roomsQ = useQuery({ queryKey: ["rooms"], queryFn: async () => (await supabase.from("rooms").select("*").order("name")).data as Room[] });
  const csQ = useQuery({ queryKey: ["class_subjects"], queryFn: async () => (await supabase.from("class_subjects").select("*")).data as ClassSubject[] });
  const allocsQ = useQuery({ queryKey: ["teacher_allocations"], queryFn: async () => (await supabase.from("teacher_allocations").select("teacher_id,section_id")).data as Allocation[] });
  const allSlotsQ = useQuery({ queryKey: ["timetable_slots"], queryFn: async () => (await supabase.from("timetable_slots").select("*")).data as Slot[] });
  const overridesQ = useQuery({
    queryKey: ["timetable_day_overrides", selectedDate],
    queryFn: async () => (await supabase.from("timetable_day_overrides").select("*").eq("date", selectedDate)).data as Override[],
  });
  const gameQ = useQuery({ queryKey: ["game_period_assignments"], queryFn: async () => (await supabase.from("game_period_assignments").select("section_id,day,period")).data as GameAssignment[] });
  const breaksQ = useQuery({ queryKey: ["breaks"], queryFn: async () => (await supabase.from("breaks").select("*")).data as Break[] });
  const breakClassesQ = useQuery({ queryKey: ["break_classes"], queryFn: async () => (await supabase.from("break_classes").select("*")).data as BreakClass[] });

  const periods = settingsQ.data?.periods_per_day ?? DEFAULT_PERIODS_PER_DAY;
  const defaultBreakAfter = settingsQ.data?.break_after_period ?? DEFAULT_BREAK_AFTER_PERIOD;
  const maxConsecutive = settingsQ.data?.max_consecutive_periods ?? MAX_CONSECUTIVE_TEACHING_PERIODS;
  const classes = classesQ.data ?? [];
  const sections = sectionsQ.data ?? [];
  const teachers = teachersQ.data ?? [];
  const subjects = subjectsQ.data ?? [];
  const rooms = roomsQ.data ?? [];
  const cs = csQ.data ?? [];
  const allocs = allocsQ.data ?? [];
  const allSlots = allSlotsQ.data ?? [];
  const overrides = overridesQ.data ?? [];
  const allGameAssignments = gameQ.data ?? [];
  const breaks = breaksQ.data ?? [];
  const breakClasses = breakClassesQ.data ?? [];

  const weekday = useMemo(() => dateToDay(selectedDate), [selectedDate]);
  const teacherName = (id: string | null) => teachers.find((t) => t.id === id)?.name ?? "?";
  const subjectName = (id: string | null) => subjects.find((s) => s.id === id)?.name ?? "";

  const classSectionRows = useMemo(() => {
    return sections
      .map((sec) => ({ sec, klass: classes.find((c) => c.id === sec.class_id) }))
      .filter((r) => r.klass)
      .sort((a, b) => naturalCompare(a.klass!.name, b.klass!.name) || naturalCompare(a.sec.section_name, b.sec.section_name));
  }, [sections, classes]);

  const overrideMap = useMemo(() => {
    const m = new Map<string, Override>();
    overrides.forEach((o) => m.set(`${o.section_id}-${o.period}`, o));
    return m;
  }, [overrides]);

  const defaultSlotMap = useMemo(() => {
    const m = new Map<string, Slot>();
    allSlots.filter((s) => s.day === weekday).forEach((s) => m.set(`${s.section_id}-${s.period}`, s));
    return m;
  }, [allSlots, weekday]);

  const gameSet = useMemo(() => {
    const s = new Set<string>();
    allGameAssignments.filter((g) => g.day === weekday).forEach((g) => s.add(`${g.section_id}-${g.period}`));
    return s;
  }, [allGameAssignments, weekday]);

  // Column layout = union of every class's break positions; each row shows the
  // break marker only where its own class actually breaks.
  const unionBreakPositions = allBreakPositions(classes.map((c) => c.id), breaks, breakClasses, defaultBreakAfter);
  const classBreaksAt = (classId: string | undefined, pos: number) =>
    !!classId && breakPositionsForClass(classId, breaks, breakClasses, defaultBreakAfter).includes(pos);
  const periodColumns: Array<{ type: "period"; n: number } | { type: "break"; after: number }> = [];
  for (let i = 1; i <= periods; i++) {
    periodColumns.push({ type: "period", n: i });
    if (unionBreakPositions.includes(i)) periodColumns.push({ type: "break", after: i });
  }

  type Effective = {
    source: "override" | "default" | "empty";
    overrideId: string | null;
    teacherId: string | null;
    subjectId: string | null;
    roomId: string | null;
    isGame: boolean;
    kind: OverrideKind;
  };

  const getEffective = (sectionId: string, period: number): Effective => {
    const ov = overrideMap.get(`${sectionId}-${period}`);
    if (ov) {
      const kind: OverrideKind = ov.kind ?? (ov.is_game ? "game" : "regular");
      return { source: "override", overrideId: ov.id, teacherId: ov.teacher_id, subjectId: ov.subject_id, roomId: ov.room_id, isGame: kind === "game", kind };
    }
    const def = defaultSlotMap.get(`${sectionId}-${period}`);
    if (def) return { source: "default", overrideId: null, teacherId: def.teacher_id, subjectId: def.subject_id, roomId: def.room_id, isGame: false, kind: "regular" };
    const g = gameSet.has(`${sectionId}-${period}`);
    return { source: "empty", overrideId: null, teacherId: null, subjectId: null, roomId: null, isGame: g, kind: g ? "game" : "regular" };
  };

  const periodsForTeacherOnDate = (teacherId: string, excludeSectionId?: string, excludePeriod?: number): number[] => {
    const result: number[] = [];
    for (const sec of sections) {
      for (let p = 1; p <= periods; p++) {
        if (sec.id === excludeSectionId && p === excludePeriod) continue;
        if (getEffective(sec.id, p).teacherId === teacherId) result.push(p);
      }
    }
    return result;
  };

  // teacher -> sorted periods they teach on the selected day (any section)
  const teacherPeriodsOnDate = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const sec of sections) {
      for (let p = 1; p <= periods; p++) {
        const eff = getEffective(sec.id, p);
        if (eff.isGame || !eff.teacherId) continue;
        const arr = m.get(eff.teacherId) ?? [];
        if (!arr.includes(p)) arr.push(p);
        m.set(eff.teacherId, arr);
      }
    }
    m.forEach((v) => v.sort((a, b) => a - b));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overrideMap, defaultSlotMap, gameSet, sections, periods]);

  // teachers busy in a given period (across every section), for the selected date
  const busyInPeriod = (period: number, ignoreSectionId?: string) => {
    const set = new Set<string>();
    for (const sec of sections) {
      if (sec.id === ignoreSectionId) continue;
      const t = getEffective(sec.id, period).teacherId;
      if (t) set.add(t);
    }
    return set;
  };

  const isConsecutiveViolation = (teacherId: string, period: number): boolean => {
    const occupied = teacherPeriodsOnDate.get(teacherId);
    if (!occupied || occupied.length <= maxConsecutive) return false;
    let streak = 1;
    let hit = false;
    for (let i = 0; i < occupied.length; i++) {
      if (i === 0) { streak = 1; continue; }
      streak = occupied[i] === occupied[i - 1] + 1 ? streak + 1 : 1;
      if (streak > maxConsecutive) {
        const runEnd = occupied[i];
        const runStart = occupied[i - streak + 1];
        if (period >= runStart && period <= runEnd) hit = true;
      }
    }
    return hit;
  };

  const violationColour = (teacherId: string): string => {
    const idx = teachers.findIndex((t) => t.id === teacherId);
    const colours = [
      "bg-red-200 dark:bg-red-900/40", "bg-blue-200 dark:bg-blue-900/40", "bg-purple-200 dark:bg-purple-900/40",
      "bg-orange-200 dark:bg-orange-900/40", "bg-teal-200 dark:bg-teal-900/40", "bg-emerald-200 dark:bg-emerald-900/40",
      "bg-pink-200 dark:bg-pink-900/40", "bg-cyan-200 dark:bg-cyan-900/40", "bg-indigo-200 dark:bg-indigo-900/40",
      "bg-fuchsia-200 dark:bg-fuchsia-900/40",
    ];
    return idx === -1 ? "bg-amber-100 dark:bg-amber-900/40" : colours[idx % colours.length];
  };

  // ---------- cell edit ----------
  const [edit, setEdit] = useState<{ sectionId: string; classId: string; period: number } | null>(null);
  const [editTeacher, setEditTeacher] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [editRoom, setEditRoom] = useState("");
  const [editMode, setEditMode] = useState<"regular" | "game" | "test" | "function">("regular");
  const [teacherScope, setTeacherScope] = useState<TeacherScope>("class");

  const openCell = (sectionId: string, classId: string, period: number) => {
    const eff = getEffective(sectionId, period);
    setEdit({ sectionId, classId, period });
    setEditTeacher(eff.teacherId ?? "");
    setEditSubject(eff.subjectId ?? "");
    setEditRoom(eff.roomId ?? "");
    setEditMode(eff.kind === "game" ? "game" : eff.kind === "test" ? "test" : eff.kind === "function" ? "function" : "regular");
    setTeacherScope("class");
  };

  const subjectsForClass = useMemo(() => {
    if (!edit) return [] as Subject[];
    const ids = new Set(cs.filter((x) => x.class_id === edit.classId).map((x) => x.subject_id));
    return subjects.filter((s) => ids.has(s.id));
  }, [cs, subjects, edit]);

  const currentOverride = edit ? overrideMap.get(`${edit.sectionId}-${edit.period}`) : undefined;
  const editIsBaseGame = edit ? gameSet.has(`${edit.sectionId}-${edit.period}`) && !currentOverride : false;

  // teachers to offer for the edited cell: allocated-to-this-section first, then (on request) everyone;
  // busy teachers are excluded unless it's the one already assigned here.
  const teacherOptions = useMemo(() => {
    if (!edit) return { primary: [] as Teacher[], others: [] as Teacher[] };
    const busy = busyInPeriod(edit.period, edit.sectionId);
    const allocatedHere = new Set(allocs.filter((a) => a.section_id === edit.sectionId).map((a) => a.teacher_id));
    const free = teachers.filter((t) => !busy.has(t.id) || t.id === editTeacher);
    return {
      primary: free.filter((t) => allocatedHere.has(t.id)),
      others: free.filter((t) => !allocatedHere.has(t.id)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit, teachers, allocs, editTeacher, overrideMap, defaultSlotMap]);

  const editWouldBreakConsecutive = useMemo(() => {
    if (!edit || !editTeacher) return false;
    return wouldExceedConsecutiveTeachingLimit(
      periodsForTeacherOnDate(editTeacher, edit.sectionId, edit.period),
      edit.period,
      maxConsecutive,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit, editTeacher, maxConsecutive, overrideMap, defaultSlotMap]);

  const upsertOverride = (
    payload: Partial<Override> & { section_id: string; class_id: string; period: number; kind: OverrideKind },
  ) =>
    supabase
      .from("timetable_day_overrides")
      .upsert({ date: selectedDate, is_game: payload.kind === "game", ...payload }, { onConflict: "section_id,date,period" });

  const saveGamePeriod = async () => {
    if (!edit) return;
    const { error } = await upsertOverride({ class_id: edit.classId, section_id: edit.sectionId, period: edit.period, teacher_id: null, subject_id: null, room_id: null, kind: "game" });
    if (error) return toast.error(error.message);
    toast.success("Marked as Game period for this date");
    setEdit(null);
    qc.invalidateQueries({ queryKey: ["timetable_day_overrides", selectedDate] });
  };

  const saveTestOrFunction = async (kind: "test" | "function") => {
    if (!edit) return;
    // an invigilator is optional; warn but allow going over the consecutive limit
    if (kind === "test" && editTeacher && editWouldBreakConsecutive) {
      const ok = window.confirm(
        `${teacherName(editTeacher)} would be on duty more than ${maxConsecutive} periods in a row today.\n\nAssign anyway?`,
      );
      if (!ok) return;
    }
    if (kind === "test" && editTeacher) {
      for (const sec of sections) {
        if (sec.id === edit.sectionId) continue;
        if (getEffective(sec.id, edit.period).teacherId === editTeacher) {
          const cls = classes.find((c) => c.id === sec.class_id)?.name;
          return toast.error(`${teacherName(editTeacher)} is already assigned to ${cls}/${sec.section_name} in period ${edit.period}.`);
        }
      }
    }
    const { error } = await upsertOverride({
      class_id: edit.classId, section_id: edit.sectionId, period: edit.period,
      teacher_id: kind === "test" ? editTeacher || null : null,
      subject_id: kind === "test" ? editSubject || null : null,
      room_id: null, kind,
    });
    if (error) return toast.error(error.message);
    toast.success(kind === "test" ? "Marked as a test for this date" : "Marked as a function for this date");
    setEdit(null);
    qc.invalidateQueries({ queryKey: ["timetable_day_overrides", selectedDate] });
  };

  const saveCell = async () => {
    if (!edit) return;
    if (editMode === "game") return saveGamePeriod();
    if (editMode === "test" || editMode === "function") return saveTestOrFunction(editMode);
    if (!editTeacher || !editSubject) return toast.error("Pick a teacher and a subject");

    // Hard block: a teacher cannot be in two class/sections in the same period.
    for (const sec of sections) {
      if (sec.id === edit.sectionId) continue;
      if (getEffective(sec.id, edit.period).teacherId === editTeacher) {
        const cls = classes.find((c) => c.id === sec.class_id)?.name;
        return toast.error(`${teacherName(editTeacher)} is already teaching ${cls}/${sec.section_name} in period ${edit.period}.`);
      }
    }

    // Emergency: >3 consecutive is allowed on the day, but confirm it.
    if (editWouldBreakConsecutive) {
      const ok = window.confirm(
        `${teacherName(editTeacher)} would teach more than ${maxConsecutive} periods in a row today.\n\nAssign anyway (emergency cover)?`,
      );
      if (!ok) return;
    }

    const roomClash = editRoom
      ? sections.find((sec) => sec.id !== edit.sectionId && getEffective(sec.id, edit.period).roomId === editRoom)
      : undefined;
    if (roomClash && !window.confirm(`That room is already in use this period. Save anyway?`)) return;

    const { error } = await upsertOverride({
      class_id: edit.classId, section_id: edit.sectionId, period: edit.period,
      teacher_id: editTeacher, subject_id: editSubject, room_id: editRoom || null, kind: "regular",
    });
    if (error) return toast.error(error.message);
    toast.success("Saved for this date");
    setEdit(null);
    qc.invalidateQueries({ queryKey: ["timetable_day_overrides", selectedDate] });
  };

  const markFree = async () => {
    if (!edit) return;
    const { error } = await upsertOverride({ class_id: edit.classId, section_id: edit.sectionId, period: edit.period, teacher_id: null, subject_id: null, room_id: null, kind: "free" });
    if (error) return toast.error(error.message);
    toast.success("Marked free for this date");
    setEdit(null);
    qc.invalidateQueries({ queryKey: ["timetable_day_overrides", selectedDate] });
  };

  const resetCell = async () => {
    if (!edit || !currentOverride) { setEdit(null); return; }
    const { error } = await supabase.from("timetable_day_overrides").delete().eq("id", currentOverride.id);
    if (error) return toast.error(error.message);
    toast.success("Reset to default");
    setEdit(null);
    qc.invalidateQueries({ queryKey: ["timetable_day_overrides", selectedDate] });
  };

  const resetDay = async () => {
    if (!confirm(`Reset ${selectedDate} to the default weekly timetable for all classes?`)) return;
    const { error } = await supabase.from("timetable_day_overrides").delete().eq("date", selectedDate);
    if (error) return toast.error(error.message);
    toast.success("Day reset to default");
    qc.invalidateQueries({ queryKey: ["timetable_day_overrides", selectedDate] });
  };

  // ---------- "teacher away" bulk cover ----------
  const [away, setAway] = useState<{ open: boolean; teacherId: string; fromPeriod: number; subs: Record<string, string> }>({
    open: false, teacherId: "", fromPeriod: 1, subs: {},
  });

  const awayLessons = useMemo(() => {
    if (!away.teacherId) return [] as { key: string; sectionId: string; classId: string; period: number; subjectId: string | null }[];
    const out: { key: string; sectionId: string; classId: string; period: number; subjectId: string | null }[] = [];
    for (const { sec, klass } of classSectionRows) {
      for (let p = away.fromPeriod; p <= periods; p++) {
        const eff = getEffective(sec.id, p);
        if (eff.teacherId === away.teacherId && !eff.isGame) {
          out.push({ key: `${sec.id}-${p}`, sectionId: sec.id, classId: klass!.id, period: p, subjectId: eff.subjectId });
        }
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [away.teacherId, away.fromPeriod, classSectionRows, periods, overrideMap, defaultSlotMap]);

  const availableForCover = (sectionId: string, period: number) => {
    const busy = busyInPeriod(period, sectionId);
    const allocatedHere = new Set(allocs.filter((a) => a.section_id === sectionId).map((a) => a.teacher_id));
    const free = teachers.filter((t) => !busy.has(t.id) && t.id !== away.teacherId);
    return {
      primary: free.filter((t) => allocatedHere.has(t.id)),
      others: free.filter((t) => !allocatedHere.has(t.id)),
    };
  };

  const applyAway = async () => {
    const rows = awayLessons
      .filter((l) => away.subs[l.key])
      .map((l) => ({
        date: selectedDate, class_id: l.classId, section_id: l.sectionId, period: l.period,
        teacher_id: away.subs[l.key] === "__free__" ? null : away.subs[l.key],
        subject_id: away.subs[l.key] === "__free__" ? null : l.subjectId,
        room_id: null, is_game: false, kind: away.subs[l.key] === "__free__" ? "free" : "regular",
      }));
    if (rows.length === 0) return toast.error("Choose a cover teacher for at least one period.");
    const { error } = await supabase.from("timetable_day_overrides").upsert(rows, { onConflict: "section_id,date,period" });
    if (error) return toast.error(error.message);
    toast.success(`${rows.length} period${rows.length === 1 ? "" : "s"} reassigned`);
    setAway((a) => ({ ...a, open: false, subs: {} }));
    qc.invalidateQueries({ queryKey: ["timetable_day_overrides", selectedDate] });
  };

  // Who teaches a given subject to a given section in the weekly timetable —
  // used to pre-fill the invigilator for a test on that subject.
  const subjectTeacherInSection = (sectionId: string, subjectId: string): string | null =>
    allSlots.find((s) => s.section_id === sectionId && s.subject_id === subjectId)?.teacher_id ?? null;

  // ---------- bulk "tests / function" ----------
  const [bulk, setBulk] = useState<{
    open: boolean; kind: "test" | "function"; classIds: Set<string>; subjectId: string; from: number; to: number;
  }>({ open: false, kind: "test", classIds: new Set(), subjectId: "", from: 1, to: 1 });

  // subjects studied by at least one of the picked classes (for the test's subject)
  const bulkSubjectOptions = useMemo(() => {
    if (bulk.classIds.size === 0) return subjects;
    const ids = new Set(cs.filter((x) => bulk.classIds.has(x.class_id)).map((x) => x.subject_id));
    const filtered = subjects.filter((s) => ids.has(s.id));
    return filtered.length ? filtered : subjects;
  }, [bulk.classIds, cs, subjects]);

  const bulkTargets = useMemo(() => {
    const out: { key: string; sectionId: string; classId: string; period: number }[] = [];
    if (bulk.classIds.size === 0) return out;
    const lo = Math.min(bulk.from, bulk.to);
    const hi = Math.max(bulk.from, bulk.to);
    for (const { sec } of classSectionRows) {
      if (!bulk.classIds.has(sec.class_id)) continue;
      for (let p = lo; p <= hi; p++) out.push({ key: `${sec.id}-${p}`, sectionId: sec.id, classId: sec.class_id, period: p });
    }
    return out;
  }, [bulk, classSectionRows]);

  const applyBulk = async () => {
    if (bulkTargets.length === 0) return toast.error("Pick at least one class and a period range.");
    const isTest = bulk.kind === "test";
    const label = isTest ? "Test" : "Function";
    const ok = window.confirm(
      `Mark ${bulkTargets.length} period(s) as "${label}" on ${selectedDate}?\n\nAny lesson already scheduled in those periods is replaced for this date only.`,
    );
    if (!ok) return;

    // For a test on a subject: assign that subject's section teacher as invigilator,
    // but never the same teacher twice in one period.
    const takenPerPeriod = new Map<number, Set<string>>();
    bulkTargets.forEach((t) => {
      const s = takenPerPeriod.get(t.period) ?? new Set<string>();
      busyInPeriod(t.period, t.sectionId).forEach((id) => s.add(id));
      takenPerPeriod.set(t.period, s);
    });

    const rows = bulkTargets.map((t) => {
      let teacherId: string | null = null;
      if (isTest && bulk.subjectId) {
        const cand = subjectTeacherInSection(t.sectionId, bulk.subjectId);
        const taken = takenPerPeriod.get(t.period)!;
        if (cand && !taken.has(cand)) {
          teacherId = cand;
          taken.add(cand);
        }
      }
      return {
        date: selectedDate, class_id: t.classId, section_id: t.sectionId, period: t.period,
        teacher_id: teacherId, subject_id: isTest ? bulk.subjectId || null : null,
        room_id: null, is_game: false, kind: bulk.kind,
      };
    });
    const { error } = await supabase.from("timetable_day_overrides").upsert(rows, { onConflict: "section_id,date,period" });
    if (error) return toast.error(error.message);
    const assigned = rows.filter((r) => r.teacher_id).length;
    toast.success(
      `${rows.length} period${rows.length === 1 ? "" : "s"} marked as ${label.toLowerCase()}` +
        (isTest && bulk.subjectId ? ` · ${assigned} invigilator${assigned === 1 ? "" : "s"} auto-assigned` : ""),
    );
    setBulk((b) => ({ ...b, open: false, classIds: new Set(), subjectId: "" }));
    qc.invalidateQueries({ queryKey: ["timetable_day_overrides", selectedDate] });
  };

  return (
    <AdminLayout>
      <PageHeader
        title="Day View"
        description="What actually runs on one date. Changes here are for that day only — the weekly timetable is untouched."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setBulk((b) => ({ ...b, open: true, classIds: new Set(), subjectId: "" }))}>
              <ClipboardCheck className="h-4 w-4 mr-2" />Tests / function
            </Button>
            <Button variant="outline" onClick={() => setAway((a) => ({ ...a, open: true, subs: {} }))}>
              <UserX className="h-4 w-4 mr-2" />Teacher away
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-3 items-end mb-4">
        <div>
          <Label className="text-xs">Date</Label>
          <Input type="date" className="w-44" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
        </div>
        <Button variant="outline" onClick={resetDay}><RotateCcw className="h-4 w-4 mr-2" />Reset day to default</Button>
        {overrides.length > 0 && (
          <span className="text-xs text-muted-foreground self-center">
            {overrides.length} change{overrides.length === 1 ? "" : "s"} on this date
          </span>
        )}
      </div>

      <Card>
        <CardContent className="p-0 overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="p-2 text-left border-b sticky left-0 bg-muted/50 z-10 w-40">Class / Section</th>
                {periodColumns.map((col, i) =>
                  col.type === "break" ? (
                    <th key={`break-${i}`} className="p-1 border-b border-l w-8 bg-amber-50 dark:bg-amber-950/20">
                      <Coffee className="h-3 w-3 mx-auto text-amber-500" />
                    </th>
                  ) : (
                    <th key={col.n} className="p-2 text-left border-b border-l whitespace-nowrap">Period {col.n}</th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {classSectionRows.map(({ sec, klass }) => (
                <tr key={sec.id}>
                  <td className="p-2 font-medium border-b sticky left-0 bg-card z-10">{klass!.name} – {sec.section_name}</td>
                  {periodColumns.map((col, i) => {
                    if (col.type === "break") {
                      const here = classBreaksAt(klass!.id, col.after);
                      return (
                        <td key={`break-${i}`} className={`border-b border-l w-8 ${here ? "bg-amber-50/60 dark:bg-amber-950/10" : ""}`}>
                          {here && (
                            <div className="h-full flex items-center justify-center">
                              <span className="text-[9px] text-amber-500 rotate-90 inline-block">Break</span>
                            </div>
                          )}
                        </td>
                      );
                    }
                    const period = col.n;
                    const eff = getEffective(sec.id, period);
                    const isGame = eff.isGame;
                    const overCons = eff.teacherId && (eff.kind === "regular" || eff.kind === "test")
                      ? isConsecutiveViolation(eff.teacherId, period) : false;
                    return (
                      <td
                        key={period}
                        className={`p-2 border-b border-l align-top cursor-pointer hover:bg-accent/40 min-w-32 ${
                          isGame
                            ? "bg-green-50 dark:bg-green-950/20 border-l-2 border-l-green-500"
                            : eff.kind === "test"
                              ? "bg-indigo-50 dark:bg-indigo-950/20 border-l-2 border-l-indigo-500"
                            : eff.kind === "function"
                              ? "bg-rose-50 dark:bg-rose-950/20 border-l-2 border-l-rose-500"
                            : overCons
                              ? violationColour(eff.teacherId!)
                              : eff.source === "override"
                                ? "border-l-2 border-l-amber-500 bg-amber-500/5"
                                : ""
                        }`}
                        onClick={() => openCell(sec.id, klass!.id, period)}
                      >
                        {isGame ? (
                          <div className="flex items-center gap-1 text-green-700 dark:text-green-400">
                            <Gamepad2 className="h-3 w-3" /><span className="text-xs font-medium">Game</span>
                          </div>
                        ) : eff.kind === "test" ? (
                          <div className="space-y-0.5 text-indigo-700 dark:text-indigo-300">
                            <div className="flex items-center gap-1">
                              <ClipboardCheck className="h-3 w-3" />
                              <span className="text-xs font-medium">{eff.subjectId ? `Test · ${subjectName(eff.subjectId)}` : "Test"}</span>
                            </div>
                            {eff.teacherId && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                {teacherName(eff.teacherId)}
                                {overCons && <span title={`More than ${maxConsecutive} periods in a row today`}><AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" /></span>}
                              </div>
                            )}
                          </div>
                        ) : eff.kind === "function" ? (
                          <div className="flex items-center gap-1 text-rose-700 dark:text-rose-300">
                            <PartyPopper className="h-3 w-3" /><span className="text-xs font-medium">Function</span>
                          </div>
                        ) : eff.source === "empty" ? (
                          <div className="text-xs text-muted-foreground/60">+</div>
                        ) : eff.teacherId ? (
                          <div className="space-y-0.5">
                            <div className="font-medium text-xs">{subjectName(eff.subjectId)}</div>
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted-foreground">{teacherName(eff.teacherId)}</span>
                              {overCons && (
                                <span title={`More than ${maxConsecutive} periods in a row today`}>
                                  <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                                </span>
                              )}
                            </div>
                            {eff.roomId && <div className="text-[10px] text-muted-foreground">{rooms.find((r) => r.id === eff.roomId)?.name}</div>}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground italic">Free</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* ---- single cell ---- */}
      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {edit && `${classes.find((c) => c.id === edit.classId)?.name} / ${sections.find((s) => s.id === edit.sectionId)?.section_name} · Period ${edit.period}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {currentOverride ? "This period is changed for this date only."
                : editIsBaseGame ? "Normally a Game / PT period. Changes here apply to this date only."
                : "Currently following the weekly timetable."}
            </p>

            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant={editMode === "regular" ? "default" : "outline"} onClick={() => setEditMode("regular")}>Regular class</Button>
              <Button type="button" size="sm" variant={editMode === "game" ? "default" : "outline"} className={editMode === "game" ? "bg-green-600 hover:bg-green-700" : ""} onClick={() => setEditMode("game")}>
                <Gamepad2 className="h-4 w-4 mr-1" /> Game
              </Button>
              <Button type="button" size="sm" variant={editMode === "test" ? "default" : "outline"} className={editMode === "test" ? "bg-indigo-600 hover:bg-indigo-700" : ""} onClick={() => setEditMode("test")}>
                <ClipboardCheck className="h-4 w-4 mr-1" /> Test
              </Button>
              <Button type="button" size="sm" variant={editMode === "function" ? "default" : "outline"} className={editMode === "function" ? "bg-rose-600 hover:bg-rose-700" : ""} onClick={() => setEditMode("function")}>
                <PartyPopper className="h-4 w-4 mr-1" /> Function
              </Button>
            </div>

            {editMode === "game" ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <Gamepad2 className="h-10 w-10 text-green-500" />
                <p className="text-sm text-muted-foreground">Marked as a <strong>Game / PT period</strong> for {selectedDate}. No teacher needed.</p>
              </div>
            ) : editMode === "function" ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <PartyPopper className="h-10 w-10 text-rose-500" />
                <p className="text-sm text-muted-foreground">
                  This class is busy in a <strong>school function</strong> for {selectedDate}. No lesson runs and no teacher is needed.
                </p>
              </div>
            ) : editMode === "test" ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <ClipboardCheck className="h-4 w-4 text-indigo-500" />
                  <span>This period is a <strong>test / exam</strong>.</span>
                </div>
                <div>
                  <Label className="mb-1.5 block">Subject being tested (optional)</Label>
                  <Select
                    value={editSubject || "__none__"}
                    onValueChange={(v) => {
                      const sid = v === "__none__" ? "" : v;
                      setEditSubject(sid);
                      // pre-fill the invigilator with the section's teacher for this subject
                      if (sid && edit) {
                        const t = subjectTeacherInSection(edit.sectionId, sid);
                        if (t) { setEditTeacher(t); setTeacherScope(teacherOptions.primary.some((x) => x.id === t) ? "class" : "all"); }
                      }
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="No specific subject" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No specific subject</SelectItem>
                      {subjectsForClass.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1.5 block">Invigilator (optional)</Label>
                  <TeacherPicker
                    primary={teacherOptions.primary}
                    others={teacherOptions.others}
                    value={editTeacher}
                    onChange={setEditTeacher}
                    scope={teacherScope}
                    onScopeChange={setTeacherScope}
                    placeholder="No invigilator"
                    noneLabel="No invigilator"
                  />
                  {editTeacher && editWouldBreakConsecutive && (
                    <p className="mt-1 text-xs text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      This puts {teacherName(editTeacher)} over {maxConsecutive} periods in a row — allowed, you'll be asked to confirm.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div>
                  <Label className="mb-1.5 block">Teacher</Label>
                  <TeacherPicker
                    primary={teacherOptions.primary}
                    others={teacherOptions.others}
                    value={editTeacher}
                    onChange={(v) => { setEditTeacher(v); setEditSubject(""); }}
                    scope={teacherScope}
                    onScopeChange={setTeacherScope}
                    placeholder="Select a free teacher"
                  />
                  {editWouldBreakConsecutive && (
                    <p className="mt-1 text-xs text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      This puts {teacherName(editTeacher)} over {maxConsecutive} periods in a row — allowed for emergency cover, you'll be asked to confirm.
                    </p>
                  )}
                </div>
                <div>
                  <Label>Subject</Label>
                  <Select value={editSubject} onValueChange={setEditSubject}>
                    <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                    <SelectContent>{subjectsForClass.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Room (optional)</Label>
                  <Select value={editRoom} onValueChange={setEditRoom}>
                    <SelectTrigger><SelectValue placeholder="No room" /></SelectTrigger>
                    <SelectContent>{rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="ghost" onClick={markFree}>Mark as free</Button>
            <Button variant="ghost" disabled={!currentOverride} onClick={resetCell}>Reset to default</Button>
            <Button
              onClick={saveCell}
              className={
                editMode === "game" ? "bg-green-600 hover:bg-green-700"
                : editMode === "test" ? "bg-indigo-600 hover:bg-indigo-700"
                : editMode === "function" ? "bg-rose-600 hover:bg-rose-700"
                : ""
              }
            >
              {editMode === "game" ? "Set as Game"
                : editMode === "test" ? "Set as Test"
                : editMode === "function" ? "Set as Function"
                : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- bulk tests / function ---- */}
      <Dialog open={bulk.open} onOpenChange={(v) => setBulk((b) => ({ ...b, open: v }))}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Tests / function — {selectedDate}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={bulk.kind === "test" ? "default" : "outline"} className={bulk.kind === "test" ? "bg-indigo-600 hover:bg-indigo-700" : ""} onClick={() => setBulk((b) => ({ ...b, kind: "test" }))}>
                <ClipboardCheck className="h-4 w-4 mr-1" /> Test / exam
              </Button>
              <Button type="button" size="sm" variant={bulk.kind === "function" ? "default" : "outline"} className={bulk.kind === "function" ? "bg-rose-600 hover:bg-rose-700" : ""} onClick={() => setBulk((b) => ({ ...b, kind: "function", subjectId: "" }))}>
                <PartyPopper className="h-4 w-4 mr-1" /> School function
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {bulk.kind === "test"
                ? "The chosen periods become test slots for both sections of each class. Pick the subject and its section teacher is set as invigilator automatically."
                : "The chosen classes are busy in a function for these periods — no lessons run."}
            </p>

            {bulk.kind === "test" && (
              <div>
                <Label>Subject being tested (optional)</Label>
                <Select value={bulk.subjectId || "__none__"} onValueChange={(v) => setBulk((b) => ({ ...b, subjectId: v === "__none__" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="No specific subject" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No specific subject</SelectItem>
                    {bulkSubjectOptions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Each section's teacher for this subject is assigned to invigilate. If that would put a teacher over
                  {" "}{maxConsecutive} periods in a row, the cell is flagged with a warning but still assigned.
                </p>
              </div>
            )}

            <div>
              <Label>Classes</Label>
              <div className="mt-1 flex flex-wrap gap-2">
                {classes.map((c) => (
                  <label key={c.id} className="flex items-center gap-1.5 text-sm rounded border px-2 py-1 cursor-pointer hover:bg-accent/50">
                    <input
                      type="checkbox"
                      checked={bulk.classIds.has(c.id)}
                      onChange={(e) =>
                        setBulk((b) => {
                          const n = new Set(b.classIds);
                          if (e.target.checked) n.add(c.id); else n.delete(c.id);
                          return { ...b, classIds: n };
                        })
                      }
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>From period</Label>
                <Select value={String(bulk.from)} onValueChange={(v) => setBulk((b) => ({ ...b, from: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Array.from({ length: periods }, (_, i) => i + 1).map((p) => <SelectItem key={p} value={String(p)}>Period {p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>To period</Label>
                <Select value={String(bulk.to)} onValueChange={(v) => setBulk((b) => ({ ...b, to: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Array.from({ length: periods }, (_, i) => i + 1).map((p) => <SelectItem key={p} value={String(p)}>Period {p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {bulkTargets.length > 0 && (
              <p className="text-xs text-muted-foreground">{bulkTargets.length} section-period{bulkTargets.length === 1 ? "" : "s"} will be updated.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulk((b) => ({ ...b, open: false }))}>Cancel</Button>
            <Button
              onClick={applyBulk}
              disabled={bulkTargets.length === 0}
              className={bulk.kind === "test" ? "bg-indigo-600 hover:bg-indigo-700" : "bg-rose-600 hover:bg-rose-700"}
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- teacher away (bulk cover) ---- */}
      <Dialog open={away.open} onOpenChange={(v) => setAway((a) => ({ ...a, open: v }))}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Teacher away — {selectedDate}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Teacher</Label>
              <Select value={away.teacherId} onValueChange={(v) => setAway((a) => ({ ...a, teacherId: v, subs: {} }))}>
                <SelectTrigger><SelectValue placeholder="Who is away?" /></SelectTrigger>
                <SelectContent>{teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Away from period</Label>
              <Select value={String(away.fromPeriod)} onValueChange={(v) => setAway((a) => ({ ...a, fromPeriod: Number(v), subs: {} }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: periods }, (_, i) => i + 1).map((p) => <SelectItem key={p} value={String(p)}>Period {p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {away.teacherId && (
            awayLessons.length === 0 ? (
              <p className="mt-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                {teacherName(away.teacherId)} has no classes from period {away.fromPeriod} on {selectedDate}.
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{awayLessons.length} lesson{awayLessons.length === 1 ? "" : "s"} to cover</span>
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() =>
                      setAway((a) => ({ ...a, subs: Object.fromEntries(awayLessons.map((l) => [l.key, "__free__"])) }))
                    }
                  >
                    Leave all free
                  </button>
                </div>
                <div className="max-h-[22rem] space-y-2 overflow-auto pr-1">
                  {awayLessons.map((l) => {
                    const sec = sections.find((s) => s.id === l.sectionId);
                    const cls = classes.find((c) => c.id === l.classId);
                    const { primary, others } = availableForCover(l.sectionId, l.period);
                    const chosen = away.subs[l.key];
                    return (
                      <div
                        key={l.key}
                        className={`rounded-lg border p-3 transition-colors ${chosen ? "border-primary/40 bg-primary/5" : ""}`}
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-semibold tabular-nums">P{l.period}</span>
                          <span className="text-sm font-medium">{cls?.name} / {sec?.section_name}</span>
                          <span className="text-xs text-muted-foreground">· {subjectName(l.subjectId) || "—"}</span>
                        </div>
                        <CoverPicker
                          primary={primary}
                          others={others}
                          value={chosen ?? ""}
                          onChange={(v) => setAway((a) => ({ ...a, subs: { ...a.subs, [l.key]: v } }))}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          )}

          <DialogFooter className="items-center">
            {away.teacherId && awayLessons.length > 0 && (
              <span className="mr-auto text-xs text-muted-foreground">
                {awayLessons.filter((l) => away.subs[l.key]).length} of {awayLessons.length} set
              </span>
            )}
            <Button variant="ghost" onClick={() => setAway((a) => ({ ...a, open: false }))}>Cancel</Button>
            <Button onClick={applyAway} disabled={awayLessons.length === 0}>Apply cover</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
