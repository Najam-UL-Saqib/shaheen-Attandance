import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout, PageHeader } from "@/components/admin-layout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileDown, Users, AlertTriangle, AlertCircle, Info, CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";
import { naturalCompare } from "@/lib/utils";
import { countTeacherPeriods, countSectionPeriods } from "@/lib/slots";
import { computeTimetableWarnings, type Severity } from "@/lib/timetable-warnings";
import { DEFAULT_WORKING_DAYS, DEFAULT_PERIODS_PER_DAY, MAX_CONSECUTIVE_TEACHING_PERIODS } from "@/lib/schedule";

export const Route = createFileRoute("/reports")({ component: ReportsPage });

type Klass = { id: string; name: string };
type Section = { id: string; class_id: string; section_name: string; class_teacher_id: string | null };
type Subject = { id: string; name: string; code?: string | null };
type Teacher = { id: string; name: string };

const SUBJECT_ABBR: Record<string, string> = {
  English: "Eng",
  Urdu: "Urdu",
  Mathematics: "Maths",
  "General Science": "Gen Sci",
  "Social Studies": "Soc St",
  Islamiat: "Isl",
  "Computer Science": "Comp Sci",
  Physics: "Phy",
  Chemistry: "Chem",
  Biology: "Bio",
  "Pakistan Studies": "Pak St",
};
const subjLabel = (s: Subject) => s.code?.trim() || SUBJECT_ABBR[s.name] || s.name;
type Allocation = { id: string; teacher_id: string; class_id: string; section_id: string; total_periods: number };
type AllocSubject = { allocation_id: string; subject_id: string; periods: number };
type Slot = {
  class_id: string; section_id: string; teacher_id: string; subject_id: string; room_id: string | null;
  day: number; period: number; group_id: string | null;
};
type GameAssignment = { section_id: string; day: number; period: number };

function ReportsPage() {
  const [showTeachers, setShowTeachers] = useState(true);
  const classesQ = useQuery({ queryKey: ["classes"], queryFn: async () => (await supabase.from("classes").select("*").order("name")).data as Klass[] });
  const sectionsQ = useQuery({ queryKey: ["sections"], queryFn: async () => (await supabase.from("sections").select("*").order("section_name")).data as Section[] });
  const subjectsQ = useQuery({ queryKey: ["subjects"], queryFn: async () => (await supabase.from("subjects").select("*").order("name")).data as Subject[] });
  const teachersQ = useQuery({ queryKey: ["teachers"], queryFn: async () => (await supabase.from("teachers").select("*").order("name")).data as Teacher[] });
  const allocsQ = useQuery({ queryKey: ["teacher_allocations"], queryFn: async () => (await supabase.from("teacher_allocations").select("*")).data as Allocation[] });
  const allocSubsQ = useQuery({ queryKey: ["teacher_allocation_subjects"], queryFn: async () => (await supabase.from("teacher_allocation_subjects").select("*")).data as AllocSubject[] });
  const slotsQ = useQuery({ queryKey: ["timetable_slots"], queryFn: async () => (await supabase.from("timetable_slots").select("class_id,section_id,teacher_id,subject_id,room_id,day,period,group_id")).data as Slot[] });
  const gamesQ = useQuery({ queryKey: ["game_period_assignments"], queryFn: async () => (await supabase.from("game_period_assignments").select("section_id,day,period")).data as GameAssignment[] });
  const settingsQ = useQuery({ queryKey: ["settings"], queryFn: async () => (await supabase.from("school_settings").select("*").eq("id", 1).maybeSingle()).data });

  const classes = classesQ.data ?? [];
  const sections = sectionsQ.data ?? [];
  const subjects = subjectsQ.data ?? [];
  const teachers = teachersQ.data ?? [];
  const allocs = allocsQ.data ?? [];
  const allocSubs = allocSubsQ.data ?? [];
  const slots = slotsQ.data ?? [];
  const games = gamesQ.data ?? [];

  const warnings = useMemo(
    () =>
      computeTimetableWarnings({
        classes, sections, subjects, teachers,
        allocations: allocs, allocationSubjects: allocSubs, slots, games,
        workingDays: settingsQ.data?.working_days ?? DEFAULT_WORKING_DAYS,
        periodsPerDay: settingsQ.data?.periods_per_day ?? DEFAULT_PERIODS_PER_DAY,
        maxConsecutive: settingsQ.data?.max_consecutive_periods ?? MAX_CONSECUTIVE_TEACHING_PERIODS,
      }),
    [classes, sections, subjects, teachers, allocs, allocSubs, slots, games, settingsQ.data],
  );
  const warnCounts = useMemo(() => {
    const c = { error: 0, warning: 0, info: 0 } as Record<Severity, number>;
    warnings.forEach((w) => { c[w.severity]++; });
    return c;
  }, [warnings]);

  // Table A: (class-section) × subject
  const classSectionRows = useMemo(() => {
    return sections
      .map((sec) => ({ sec, klass: classes.find((c) => c.id === sec.class_id) }))
      .filter((r) => r.klass)
      .sort((a, b) => naturalCompare(a.klass!.name, b.klass!.name) || naturalCompare(a.sec.section_name, b.sec.section_name));
  }, [sections, classes]);

  const cellA = (sectionId: string, classId: string, subjectId: string) => {
    // find allocation row in this section that has this subject mapped
    const matches = allocs.filter((a) => a.section_id === sectionId).filter((a) => allocSubs.some((x) => x.allocation_id === a.id && x.subject_id === subjectId));
    if (matches.length === 0) return null;
    return matches.map((a) => {
      const teacher = teachers.find((t) => t.id === a.teacher_id);
      const allocated = allocSubs.find((x) => x.allocation_id === a.id && x.subject_id === subjectId)?.periods ?? 0;
      const used = slots.filter((s) => s.section_id === sectionId && s.teacher_id === a.teacher_id && s.subject_id === subjectId).length;
      return { name: teacher?.name ?? "?", allocated, used };
    });
  };

  // per-section totals (subjects only) + game periods
  const sectionTotals = (sectionId: string) => {
    const secAllocIds = new Set(allocs.filter((a) => a.section_id === sectionId).map((a) => a.id));
    const allocated = allocSubs.filter((x) => secAllocIds.has(x.allocation_id)).reduce((sum, x) => sum + x.periods, 0);
    const used = countSectionPeriods(slots.filter((s) => s.section_id === sectionId));
    const gamePeriods = games.filter((g) => g.section_id === sectionId).length;
    return { allocated, used, gamePeriods };
  };

  // per-teacher totals for Table B
  const teacherTotals = (teacherId: string) => {
    const allocated = allocs.filter((a) => a.teacher_id === teacherId).reduce((sum, a) => sum + a.total_periods, 0);
    const used = countTeacherPeriods(slots.filter((s) => s.teacher_id === teacherId));
    return { allocated, used };
  };

  return (
    <AdminLayout>
      <PageHeader
        title="Reports"
        description="Allocation vs timetable usage across classes and teachers."
        actions={
          <Button variant="outline" size="sm" className="no-print" onClick={() => window.print()}>
            <FileDown className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
        }
      />

      <Tabs defaultValue="A" className="print-area">
        <TabsList className="no-print">
          <TabsTrigger value="A">Class/Section × Subject</TabsTrigger>
          <TabsTrigger value="B">Teacher × Class/Section</TabsTrigger>
          <TabsTrigger value="warnings" className="gap-1.5">
            Timetable check
            {warnings.length > 0 && (
              <span
                className={`rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${
                  warnCounts.error > 0
                    ? "bg-destructive text-destructive-foreground"
                    : warnCounts.warning > 0
                      ? "bg-amber-500 text-white"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {warnings.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="A">
          <div className="flex justify-end mb-2 no-print">
            <Button variant="outline" size="sm" onClick={() => setShowTeachers((v) => !v)}>
              <Users className="h-4 w-4 mr-2" />
              {showTeachers ? "Hide teacher names" : "Show teacher names"}
            </Button>
          </div>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className={`w-full border-collapse text-sm ${showTeachers ? "" : "table-fixed"}`}>
                <thead>
                  <tr className="bg-muted/50">
                    <th className="px-2 py-1.5 text-left border-b w-36">Class / Section</th>
                    {subjects.map((s) => (
                      <th key={s.id} className="border-b border-l px-1 py-1.5 text-center text-xs font-medium" title={s.name}>
                        {subjLabel(s)}
                      </th>
                    ))}
                    <th className="border-b border-l px-1 py-1.5 text-center text-xs font-medium bg-muted/70" title="Game / PT periods">Games</th>
                    <th className="border-b border-l px-1 py-1.5 text-center text-xs font-medium bg-muted/70">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {classSectionRows.map(({ sec, klass }) => {
                    const totals = sectionTotals(sec.id);
                    const classTeacher = teachers.find((t) => t.id === sec.class_teacher_id)?.name;
                    return (
                      <tr key={sec.id} className="hover:bg-muted/30">
                        <td className="px-2 py-1 border-b w-36 whitespace-nowrap">
                          <span className="font-medium">{klass!.name} – {sec.section_name}</span>
                          {classTeacher && <span className="text-[10px] text-muted-foreground ml-1.5">{classTeacher}</span>}
                        </td>
                        {subjects.map((sub) => {
                          const data = cellA(sec.id, klass!.id, sub.id);
                          if (!data) {
                            return <td key={sub.id} className="border-b border-l py-1 text-center text-muted-foreground/30">—</td>;
                          }
                          const used = data.reduce((n, d) => n + d.used, 0);
                          const allocated = data.reduce((n, d) => n + d.allocated, 0);
                          const title = data
                            .map((d) => `${d.name}: ${d.used}${d.used !== d.allocated ? ` (allocated ${d.allocated})` : ""}`)
                            .join(" · ");
                          return (
                            <td
                              key={sub.id}
                              title={title}
                              className={`border-b border-l py-1 px-1 text-center align-top tabular-nums ${used !== allocated ? "text-destructive font-medium" : ""}`}
                            >
                              <div>{used}</div>
                              {showTeachers && (
                                <div className="text-[10px] leading-tight text-muted-foreground font-normal whitespace-nowrap">
                                  {data.map((d) => d.name.split(" ")[0]).join(", ")}
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td className="border-b border-l py-1 text-center tabular-nums bg-muted/20">
                          {totals.gamePeriods > 0 ? totals.gamePeriods : <span className="text-muted-foreground/30">—</span>}
                        </td>
                        <td className={`border-b border-l py-1 text-center tabular-nums font-semibold bg-muted/20 ${totals.used !== totals.allocated ? "text-destructive" : ""}`}>
                          {totals.used}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-3 py-2 text-xs text-muted-foreground border-t">
                Each cell = weekly periods assigned for that subject. <b>Total</b> = assigned periods for the section
                (subjects only; game periods are the separate column). A red number means the timetable count doesn&apos;t
                match the allocation — hover for detail.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="B">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full border-collapse text-sm table-fixed">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="px-2 py-1.5 text-left border-b w-36">Teacher</th>
                    {classSectionRows.map(({ sec, klass }) => (
                      <th
                        key={sec.id}
                        className="border-b border-l px-1 py-1.5 text-center text-xs font-medium"
                        title={`${klass!.name} – ${sec.section_name}`}
                      >
                        {klass!.name}{sec.section_name}
                      </th>
                    ))}
                    <th className="border-b border-l px-1 py-1.5 text-center text-xs font-medium bg-muted/70">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {teachers.map((t) => {
                    const totals = teacherTotals(t.id);
                    return (
                      <tr key={t.id} className="hover:bg-muted/30">
                        <td className="px-2 py-1 font-medium border-b w-36 truncate whitespace-nowrap" title={t.name}>
                          {t.name}
                        </td>
                        {classSectionRows.map(({ sec }) => {
                          const a = allocs.find((x) => x.teacher_id === t.id && x.section_id === sec.id);
                          if (!a) return <td key={sec.id} className="border-b border-l py-1 text-center text-muted-foreground/30">—</td>;
                          const cellSlots = slots.filter((s) => s.teacher_id === t.id && s.section_id === sec.id);
                          const used = cellSlots.length;
                          const combinedWith = cellSlots
                            .filter((s) => s.group_id)
                            .flatMap((s) =>
                              slots
                                .filter((o) => o.group_id === s.group_id && o.section_id !== sec.id)
                                .map((o) => {
                                  const os = sections.find((x) => x.id === o.section_id);
                                  const oc = classes.find((c) => c.id === o.class_id);
                                  return os && oc ? `${oc.name}${os.section_name}` : null;
                                }),
                            )
                            .filter((x, i, arr): x is string => !!x && arr.indexOf(x) === i);
                          const title =
                            `allocated ${a.total_periods} · in timetable ${used}` +
                            (combinedWith.length ? ` · ${combinedWith.length} of these are combined with ${combinedWith.join(", ")}` : "");
                          return (
                            <td
                              key={sec.id}
                              title={title}
                              className={`border-b border-l py-1 text-center tabular-nums ${used !== a.total_periods ? "text-destructive font-medium" : ""}`}
                            >
                              {used}
                            </td>
                          );
                        })}
                        <td className={`border-b border-l py-1 text-center tabular-nums font-semibold bg-muted/20 ${totals.used !== totals.allocated ? "text-destructive" : ""}`}>
                          {totals.used}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-3 py-2 text-xs text-muted-foreground border-t">
                Each cell = weekly periods the teacher is assigned in that class/section. <b>Total</b> = the teacher&apos;s
                weekly workload, counting a <b>combined</b> lesson once even though it covers two sections — so a teacher who
                teaches combined classes can legitimately show a Total below their allocated figure. A red number means the
                timetable count doesn&apos;t match the allocation — hover for detail.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="warnings">
          <WarningsPanel warnings={warnings} counts={warnCounts} />
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}

function WarningsPanel({
  warnings, counts,
}: {
  warnings: ReturnType<typeof computeTimetableWarnings>;
  counts: Record<Severity, number>;
}) {
  const meta: Record<Severity, { icon: typeof AlertTriangle; ring: string; text: string; label: string }> = {
    error: { icon: AlertCircle, ring: "border-l-destructive bg-destructive/5", text: "text-destructive", label: "Must fix" },
    warning: { icon: AlertTriangle, ring: "border-l-amber-500 bg-amber-500/5", text: "text-amber-600", label: "Should check" },
    info: { icon: Info, ring: "border-l-blue-500 bg-blue-500/5", text: "text-blue-600", label: "Good to know" },
  };

  if (warnings.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <CheckCircle2 className="h-10 w-10 text-green-600" />
          <p className="text-sm font-medium">No problems found.</p>
          <p className="text-xs text-muted-foreground max-w-sm">
            Every teacher&apos;s workload matches the timetable, every subject has its periods, and no one is
            double-booked. Come back here after any timetable change.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs">
        {(["error", "warning", "info"] as Severity[]).map((sev) => {
          const M = meta[sev];
          return (
            <span key={sev} className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 ${counts[sev] === 0 ? "opacity-40" : ""}`}>
              <M.icon className={`h-3.5 w-3.5 ${M.text}`} />
              <b className="tabular-nums">{counts[sev]}</b> {M.label}
            </span>
          );
        })}
      </div>

      <div className="space-y-2">
        {warnings.map((w) => {
          const M = meta[w.severity];
          return (
            <div key={w.id} className={`rounded-md border border-l-4 p-3 ${M.ring}`}>
              <div className="flex items-start gap-2.5">
                <M.icon className={`h-4 w-4 mt-0.5 shrink-0 ${M.text}`} />
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{w.category}</div>
                  <div className="text-sm font-medium">{w.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{w.detail}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        This list updates automatically. <b>Must fix</b> items break the timetable; <b>Should check</b> items are
        usually mistakes; <b>Good to know</b> items are optional tidy-ups.
      </p>
    </div>
  );
}
