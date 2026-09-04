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
import { RotateCcw, Gamepad2, Coffee, AlertTriangle, UserX } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { dateToDay, wouldExceedConsecutiveTeachingLimit, MAX_CONSECUTIVE_TEACHING_PERIODS, DEFAULT_PERIODS_PER_DAY, DEFAULT_BREAK_AFTER_PERIOD } from "@/lib/schedule";
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
};
type GameAssignment = { section_id: string; day: number; period: number };

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function CoverPicker({
  primary, others, value, onChange,
}: { primary: Teacher[]; others: Teacher[]; value: string; onChange: (v: string) => void }) {
  const [expand, setExpand] = useState(false);
  return (
    <div className="flex items-center gap-2 justify-end">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-52 text-sm"><SelectValue placeholder="Cover teacher" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__free__">Leave free</SelectItem>
          {primary.length > 0 && <div className="px-2 pt-1.5 pb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">From this class</div>}
          {primary.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          {expand && others.length > 0 && (
            <>
              <div className="px-2 pt-1.5 pb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">Other available teachers</div>
              {others.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </>
          )}
        </SelectContent>
      </Select>
      {!expand && others.length > 0 && (
        <button type="button" className="text-xs text-primary hover:underline whitespace-nowrap" onClick={() => setExpand(true)}>
          +{others.length} others
        </button>
      )}
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

  const periods = settingsQ.data?.periods_per_day ?? DEFAULT_PERIODS_PER_DAY;
  const breakAfter = settingsQ.data?.break_after_period ?? DEFAULT_BREAK_AFTER_PERIOD;
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

  const periodColumns: Array<{ type: "period"; n: number } | { type: "break" }> = [];
  for (let i = 1; i <= periods; i++) {
    periodColumns.push({ type: "period", n: i });
    if (breakAfter > 0 && i === breakAfter) periodColumns.push({ type: "break" });
  }

  type Effective = {
    source: "override" | "default" | "empty";
    overrideId: string | null;
    teacherId: string | null;
    subjectId: string | null;
    roomId: string | null;
    isGame: boolean;
  };

  const getEffective = (sectionId: string, period: number): Effective => {
    const ov = overrideMap.get(`${sectionId}-${period}`);
    if (ov) return { source: "override", overrideId: ov.id, teacherId: ov.teacher_id, subjectId: ov.subject_id, roomId: ov.room_id, isGame: ov.is_game };
    const def = defaultSlotMap.get(`${sectionId}-${period}`);
    if (def) return { source: "default", overrideId: null, teacherId: def.teacher_id, subjectId: def.subject_id, roomId: def.room_id, isGame: false };
    return { source: "empty", overrideId: null, teacherId: null, subjectId: null, roomId: null, isGame: gameSet.has(`${sectionId}-${period}`) };
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
  const [editMode, setEditMode] = useState<"regular" | "game">("regular");
  const [showAllTeachers, setShowAllTeachers] = useState(false);

  const openCell = (sectionId: string, classId: string, period: number) => {
    const eff = getEffective(sectionId, period);
    setEdit({ sectionId, classId, period });
    setEditTeacher(eff.teacherId ?? "");
    setEditSubject(eff.subjectId ?? "");
    setEditRoom(eff.roomId ?? "");
    setEditMode(eff.isGame ? "game" : "regular");
    setShowAllTeachers(false);
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

  const upsertOverride = (payload: Partial<Override> & { section_id: string; class_id: string; period: number }) =>
    supabase.from("timetable_day_overrides").upsert({ date: selectedDate, is_game: false, ...payload }, { onConflict: "section_id,date,period" });

  const saveGamePeriod = async () => {
    if (!edit) return;
    const { error } = await upsertOverride({ class_id: edit.classId, section_id: edit.sectionId, period: edit.period, teacher_id: null, subject_id: null, room_id: null, is_game: true });
    if (error) return toast.error(error.message);
    toast.success("Marked as Game period for this date");
    setEdit(null);
    qc.invalidateQueries({ queryKey: ["timetable_day_overrides", selectedDate] });
  };

  const saveCell = async () => {
    if (!edit) return;
    if (editMode === "game") return saveGamePeriod();
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
      teacher_id: editTeacher, subject_id: editSubject, room_id: editRoom || null, is_game: false,
    });
    if (error) return toast.error(error.message);
    toast.success("Saved for this date");
    setEdit(null);
    qc.invalidateQueries({ queryKey: ["timetable_day_overrides", selectedDate] });
  };

  const markFree = async () => {
    if (!edit) return;
    const { error } = await upsertOverride({ class_id: edit.classId, section_id: edit.sectionId, period: edit.period, teacher_id: null, subject_id: null, room_id: null, is_game: false });
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
        room_id: null, is_game: false,
      }));
    if (rows.length === 0) return toast.error("Choose a cover teacher for at least one period.");
    const { error } = await supabase.from("timetable_day_overrides").upsert(rows, { onConflict: "section_id,date,period" });
    if (error) return toast.error(error.message);
    toast.success(`${rows.length} period${rows.length === 1 ? "" : "s"} reassigned`);
    setAway((a) => ({ ...a, open: false, subs: {} }));
    qc.invalidateQueries({ queryKey: ["timetable_day_overrides", selectedDate] });
  };

  return (
    <AdminLayout>
      <PageHeader
        title="Day View"
        description="What actually runs on one date. Changes here are for that day only — the weekly timetable is untouched."
        actions={
          <Button variant="outline" onClick={() => setAway((a) => ({ ...a, open: true, subs: {} }))}>
            <UserX className="h-4 w-4 mr-2" />Teacher away
          </Button>
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
                      return (
                        <td key={`break-${i}`} className="border-b border-l bg-amber-50/60 dark:bg-amber-950/10 w-8">
                          <div className="h-full flex items-center justify-center">
                            <span className="text-[9px] text-amber-500 rotate-90 inline-block">Break</span>
                          </div>
                        </td>
                      );
                    }
                    const period = col.n;
                    const eff = getEffective(sec.id, period);
                    const isGame = eff.isGame;
                    const overCons = eff.teacherId ? isConsecutiveViolation(eff.teacherId, period) : false;
                    return (
                      <td
                        key={period}
                        className={`p-2 border-b border-l align-top cursor-pointer hover:bg-accent/40 min-w-32 ${
                          isGame
                            ? "bg-green-50 dark:bg-green-950/20 border-l-2 border-l-green-500"
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

            <div className="flex gap-2">
              <Button type="button" size="sm" variant={editMode === "regular" ? "default" : "outline"} onClick={() => setEditMode("regular")}>Regular class</Button>
              <Button type="button" size="sm" variant={editMode === "game" ? "default" : "outline"} className={editMode === "game" ? "bg-green-600 hover:bg-green-700" : ""} onClick={() => setEditMode("game")}>
                <Gamepad2 className="h-4 w-4 mr-1" /> Game period
              </Button>
            </div>

            {editMode === "game" ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <Gamepad2 className="h-10 w-10 text-green-500" />
                <p className="text-sm text-muted-foreground">Marked as a <strong>Game / PT period</strong> for {selectedDate}. No teacher needed.</p>
              </div>
            ) : (
              <>
                <div>
                  <div className="flex items-center justify-between">
                    <Label>Teacher</Label>
                    {teacherOptions.others.length > 0 && (
                      <button type="button" className="text-xs text-primary hover:underline" onClick={() => setShowAllTeachers((v) => !v)}>
                        {showAllTeachers ? "Only this class" : `Show all available (${teacherOptions.others.length})`}
                      </button>
                    )}
                  </div>
                  <Select value={editTeacher} onValueChange={(v) => { setEditTeacher(v); setEditSubject(""); }}>
                    <SelectTrigger><SelectValue placeholder="Select a free teacher" /></SelectTrigger>
                    <SelectContent>
                      {teacherOptions.primary.length === 0 && teacherOptions.others.length === 0 && (
                        <div className="p-2 text-sm text-muted-foreground">No teacher is free this period.</div>
                      )}
                      {teacherOptions.primary.length > 0 && <div className="px-2 pt-1.5 pb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">From this class</div>}
                      {teacherOptions.primary.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                      {showAllTeachers && teacherOptions.others.length > 0 && (
                        <>
                          <div className="px-2 pt-1.5 pb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">Other available teachers</div>
                          {teacherOptions.others.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                        </>
                      )}
                    </SelectContent>
                  </Select>
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
            <Button onClick={saveCell} className={editMode === "game" ? "bg-green-600 hover:bg-green-700" : ""}>
              {editMode === "game" ? "Set as Game" : "Save"}
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
            <div className="mt-2 max-h-80 overflow-auto rounded-md border">
              {awayLessons.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  {teacherName(away.teacherId)} has no classes from period {away.fromPeriod} on this date.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {awayLessons.map((l) => {
                      const sec = sections.find((s) => s.id === l.sectionId);
                      const cls = classes.find((c) => c.id === l.classId);
                      return (
                        <tr key={l.key} className="border-b last:border-0">
                          <td className="p-2 whitespace-nowrap">
                            <span className="font-medium">P{l.period}</span> · {cls?.name}/{sec?.section_name}
                            <span className="text-muted-foreground"> · {subjectName(l.subjectId) || "—"}</span>
                          </td>
                          <td className="p-2 text-right">
                            {(() => {
                              const { primary, others } = availableForCover(l.sectionId, l.period);
                              return (
                                <CoverPicker
                                  primary={primary}
                                  others={others}
                                  value={away.subs[l.key] ?? ""}
                                  onChange={(v) => setAway((a) => ({ ...a, subs: { ...a.subs, [l.key]: v } }))}
                                />
                              );
                            })()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAway((a) => ({ ...a, open: false }))}>Cancel</Button>
            <Button onClick={applyAway} disabled={awayLessons.length === 0}>Apply cover</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
