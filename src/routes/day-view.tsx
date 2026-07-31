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
import { RotateCcw, Gamepad2, Coffee, AlertTriangle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { dateToDay, wouldExceedConsecutiveTeachingLimit } from "@/lib/schedule";
import { naturalCompare } from "@/lib/utils";

export const Route = createFileRoute("/day-view")({ component: DayViewPage });

type Klass = { id: string; name: string };
type Section = { id: string; class_id: string; section_name: string };
type Teacher = { id: string; name: string };
type Subject = { id: string; name: string };
type Room = { id: string; name: string };
type ClassSubject = { class_id: string; subject_id: string };
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
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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
  const allSlotsQ = useQuery({ queryKey: ["timetable_slots"], queryFn: async () => (await supabase.from("timetable_slots").select("*")).data as Slot[] });
  const overridesQ = useQuery({
    queryKey: ["timetable_day_overrides", selectedDate],
    queryFn: async () => (await supabase.from("timetable_day_overrides").select("*").eq("date", selectedDate)).data as Override[],
  });
  const gameQ = useQuery({ queryKey: ["game_period_assignments"], queryFn: async () => (await supabase.from("game_period_assignments").select("section_id,day,period")).data as GameAssignment[] });

  const periods = settingsQ.data?.periods_per_day ?? 6;
  const breakAfter = settingsQ.data?.break_after_period ?? 0;
  const classes = classesQ.data ?? [];
  const sections = sectionsQ.data ?? [];
  const teachers = teachersQ.data ?? [];
  const subjects = subjectsQ.data ?? [];
  const rooms = roomsQ.data ?? [];
  const cs = csQ.data ?? [];
  const allSlots = allSlotsQ.data ?? [];
  const overrides = overridesQ.data ?? [];
  const allGameAssignments = gameQ.data ?? [];

  const weekday = useMemo(() => dateToDay(selectedDate), [selectedDate]);

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

  // Build period column layout with optional break separator
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
        const eff = getEffective(sec.id, p);
        if (eff.teacherId === teacherId) result.push(p);
      }
    }
    return result;
  };

  // Map each teacher to all periods they are scheduled for on the selected day (across all sections)
  const teacherPeriodsOnDate = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const sec of sections) {
      for (let p = 1; p <= periods; p++) {
        const eff = getEffective(sec.id, p);
        if (eff.isGame || !eff.teacherId) continue;
        const existing = m.get(eff.teacherId) ?? [];
        if (!existing.includes(p)) existing.push(p);
        m.set(eff.teacherId, existing);
      }
    }
    m.forEach((v) => v.sort((a, b) => a - b));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overrideMap, defaultSlotMap, gameSet, sections, periods]);

  // Returns true when teacherId has a run of 4+ consecutive periods that includes `period`
  const isConsecutiveViolation = (teacherId: string, period: number): boolean => {
    const occupied = teacherPeriodsOnDate.get(teacherId);
    if (!occupied || occupied.length < 4) return false;
    let streak = 1;
    let maxIncludes = false;
    for (let i = 0; i < occupied.length; i++) {
      if (i === 0) { streak = 1; continue; }
      if (occupied[i] === occupied[i - 1] + 1) {
        streak++;
      } else {
        streak = 1;
      }
      if (streak >= 4) {
        const runEnd = occupied[i];
        const runStart = occupied[i - streak + 1];
        if (period >= runStart && period <= runEnd) maxIncludes = true;
      }
    }
    return maxIncludes;
  };

  const getTeacherViolationColor = (teacherId: string): string => {
    const idx = teachers.findIndex(t => t.id === teacherId);
    if (idx === -1) return "bg-amber-100 dark:bg-amber-900/40";
    const colors = [
      "bg-red-200 dark:bg-red-900/40",
      "bg-blue-200 dark:bg-blue-900/40",
      "bg-purple-200 dark:bg-purple-900/40",
      "bg-orange-200 dark:bg-orange-900/40",
      "bg-teal-200 dark:bg-teal-900/40",
      "bg-emerald-200 dark:bg-emerald-900/40",
      "bg-pink-200 dark:bg-pink-900/40",
      "bg-cyan-200 dark:bg-cyan-900/40",
      "bg-indigo-200 dark:bg-indigo-900/40",
      "bg-fuchsia-200 dark:bg-fuchsia-900/40"
    ];
    return colors[idx % colors.length];
  };

  const [edit, setEdit] = useState<{ sectionId: string; classId: string; period: number } | null>(null);
  const [editTeacher, setEditTeacher] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [editRoom, setEditRoom] = useState("");
  const [editMode, setEditMode] = useState<"regular" | "game">("regular");

  const openCell = (sectionId: string, classId: string, period: number) => {
    const eff = getEffective(sectionId, period);
    setEdit({ sectionId, classId, period });
    setEditTeacher(eff.teacherId ?? "");
    setEditSubject(eff.subjectId ?? "");
    setEditRoom(eff.roomId ?? "");
    setEditMode(eff.isGame ? "game" : "regular");
  };

  const subjectsForClass = useMemo(() => {
    if (!edit) return [] as Subject[];
    const ids = new Set(cs.filter((x) => x.class_id === edit.classId).map((x) => x.subject_id));
    return subjects.filter((s) => ids.has(s.id));
  }, [cs, subjects, edit]);

  const currentOverride = edit ? overrideMap.get(`${edit.sectionId}-${edit.period}`) : undefined;
  const editIsBaseGame = edit ? gameSet.has(`${edit.sectionId}-${edit.period}`) && !currentOverride : false;

  const saveGamePeriod = async () => {
    if (!edit) return;
    const payload = {
      date: selectedDate,
      class_id: edit.classId,
      section_id: edit.sectionId,
      period: edit.period,
      teacher_id: null,
      subject_id: null,
      room_id: null,
      is_game: true,
    };
    const { error } = await supabase.from("timetable_day_overrides").upsert(payload, { onConflict: "section_id,date,period" });
    if (error) return toast.error(error.message);
    toast.success("Marked as Game period for this date");
    setEdit(null);
    qc.invalidateQueries({ queryKey: ["timetable_day_overrides", selectedDate] });
  };

  const saveCell = async () => {
    if (!edit) return;
    if (editMode === "game") return saveGamePeriod();
    if (!editTeacher || !editSubject) return toast.error("Pick teacher and subject");

    const otherPeriods = periodsForTeacherOnDate(editTeacher, edit.sectionId, edit.period);
    if (wouldExceedConsecutiveTeachingLimit(otherPeriods, edit.period)) {
      return toast.error("Cannot save: a teacher must take a break after 3 consecutive periods.");
    }

    const conflicts: string[] = [];
    for (const sec of sections) {
      if (sec.id === edit.sectionId) continue;
      const eff = getEffective(sec.id, edit.period);
      const cls = classes.find((c) => c.id === sec.class_id);
      if (eff.teacherId === editTeacher) conflicts.push(`Teacher already teaching ${cls?.name}/${sec.section_name} at this period on this date`);
      if (editRoom && eff.roomId === editRoom) conflicts.push(`Room already used by ${cls?.name}/${sec.section_name} at this period on this date`);
    }
    if (conflicts.length && !confirm("Conflicts detected:\n• " + conflicts.join("\n• ") + "\n\nSave anyway?")) return;

    const payload = {
      date: selectedDate,
      class_id: edit.classId,
      section_id: edit.sectionId,
      period: edit.period,
      teacher_id: editTeacher,
      subject_id: editSubject,
      room_id: editRoom || null,
      is_game: false,
    };
    const { error } = await supabase.from("timetable_day_overrides").upsert(payload, { onConflict: "section_id,date,period" });
    if (error) return toast.error(error.message);
    toast.success("Saved for this date");
    setEdit(null);
    qc.invalidateQueries({ queryKey: ["timetable_day_overrides", selectedDate] });
  };

  const markFree = async () => {
    if (!edit) return;
    const payload = {
      date: selectedDate,
      class_id: edit.classId,
      section_id: edit.sectionId,
      period: edit.period,
      teacher_id: null,
      subject_id: null,
      room_id: null,
      is_game: false,
    };
    const { error } = await supabase.from("timetable_day_overrides").upsert(payload, { onConflict: "section_id,date,period" });
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

  return (
    <AdminLayout>
      <PageHeader
        title="Day View"
        description="Timetable for a specific date across all classes. Substitute a teacher without changing the default weekly schedule."
      />

      <div className="flex flex-wrap gap-3 items-end mb-6">
        <div>
          <Label className="text-xs">Date</Label>
          <Input type="date" className="w-44" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
        </div>
        <Button variant="outline" onClick={resetDay}><RotateCcw className="h-4 w-4 mr-2" />Reset day to default</Button>
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
                  )
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
                    return (
                      <td
                        key={period}
                        className={`p-2 border-b border-l align-top cursor-pointer hover:bg-accent/40 min-w-32 ${isGame
                          ? "bg-green-50 dark:bg-green-950/20 border-l-2 border-l-green-500"
                          : eff.teacherId && isConsecutiveViolation(eff.teacherId, period)
                            ? getTeacherViolationColor(eff.teacherId)
                            : eff.source === "override"
                              ? "border-l-2 border-l-amber-500 bg-amber-500/5"
                              : ""
                          }`}
                        onClick={() => openCell(sec.id, klass!.id, period)}
                      >
                        {isGame ? (
                          <div className="flex items-center gap-1 text-green-700 dark:text-green-400">
                            <Gamepad2 className="h-3 w-3" />
                            <span className="text-xs font-medium">Game</span>
                          </div>
                        ) : eff.source === "empty" ? (
                          <div className="text-xs text-muted-foreground/60">+</div>
                        ) : eff.teacherId ? (
                          <div className="space-y-0.5">
                            <div className="font-medium text-xs">{subjects.find((x) => x.id === eff.subjectId)?.name}</div>
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted-foreground">{teachers.find((x) => x.id === eff.teacherId)?.name}</span>
                              {isConsecutiveViolation(eff.teacherId, period) && (
                                <span title="Teacher has 4+ consecutive periods today">
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

      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {edit && `${classes.find((c) => c.id === edit.classId)?.name} / ${sections.find((s) => s.id === edit.sectionId)?.section_name} · Period ${edit.period}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {currentOverride
                ? "This period has a substitution for this date only."
                : editIsBaseGame
                  ? "This is normally a Game / PT period. Changes here only apply to this date."
                  : "Currently using the default weekly schedule."}
            </p>

            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={editMode === "regular" ? "default" : "outline"}
                onClick={() => setEditMode("regular")}
              >
                Regular class
              </Button>
              <Button
                type="button"
                size="sm"
                variant={editMode === "game" ? "default" : "outline"}
                className={editMode === "game" ? "bg-green-600 hover:bg-green-700" : ""}
                onClick={() => setEditMode("game")}
              >
                <Gamepad2 className="h-4 w-4 mr-1" /> Game period
              </Button>
            </div>

            {editMode === "game" ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <Gamepad2 className="h-10 w-10 text-green-500" />
                <p className="text-sm text-muted-foreground">
                  This slot will be marked as a <strong>Game / PT period</strong> for {selectedDate} only.
                  No teacher or subject assignment is needed.
                </p>
              </div>
            ) : (
              <>
                <div>
                  <Label>Teacher</Label>
                  <Select value={editTeacher} onValueChange={(v) => { setEditTeacher(v); setEditSubject(""); }}>
                    <SelectTrigger><SelectValue placeholder="Select teacher" /></SelectTrigger>
                    <SelectContent>{teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                  </Select>
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
    </AdminLayout>
  );
}
