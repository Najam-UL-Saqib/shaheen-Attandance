import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminLayout, PageHeader } from "@/components/admin-layout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BookOpen, GraduationCap, Users, CalendarDays, ClipboardList, DoorOpen,
  CheckCircle2, Circle, ArrowRight, CalendarClock, BarChart3,
} from "lucide-react";

export const Route = createFileRoute("/")({ component: Index });

function Index() {
  return (
    <AdminLayout>
      <PageHeader
        title="Dashboard"
        description="Start here. Work down the setup steps, then build the timetable and run each day."
      />
      <div className="space-y-8">
        <SetupChecklist />
        <QuickActions />
        <Stats />
      </div>
    </AdminLayout>
  );
}

function useCount(table: string) {
  return useQuery({
    queryKey: ["count", table],
    queryFn: async () => {
      const { count, error } = await supabase.from(table as never).select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });
}

// ---------------- setup checklist ----------------

function SetupChecklist() {
  const subjects = useCount("subjects");
  const classes = useCount("classes");
  const sections = useCount("sections");
  const teachers = useCount("teachers");
  const rooms = useCount("rooms");
  const classSubjects = useCount("class_subjects");
  const allocations = useCount("teacher_allocations");
  const slots = useCount("timetable_slots");

  const steps = [
    {
      to: "/subjects", label: "Add the subjects you teach", icon: BookOpen,
      done: (subjects.data ?? 0) > 0,
      detail: (subjects.data ?? 0) > 0 ? `${subjects.data} subjects` : "No subjects yet",
    },
    {
      to: "/classes", label: "Add classes and their sections", icon: GraduationCap,
      done: (classes.data ?? 0) > 0 && (sections.data ?? 0) > 0,
      detail:
        (classes.data ?? 0) > 0
          ? `${classes.data} classes · ${sections.data ?? 0} sections`
          : "No classes yet",
    },
    {
      to: "/classes", label: "Choose which subjects each class studies", icon: ClipboardList,
      done: (classSubjects.data ?? 0) > 0,
      detail: (classSubjects.data ?? 0) > 0 ? `${classSubjects.data} class-subject links` : "Not set",
    },
    {
      to: "/teachers", label: "Add teachers", icon: Users,
      done: (teachers.data ?? 0) > 0,
      detail: (teachers.data ?? 0) > 0 ? `${teachers.data} teachers` : "No teachers yet",
    },
    {
      to: "/rooms", label: "Add rooms (optional)", icon: DoorOpen,
      done: (rooms.data ?? 0) > 0,
      optional: true,
      detail: (rooms.data ?? 0) > 0 ? `${rooms.data} rooms` : "None — you can skip this",
    },
    {
      to: "/allocations", label: "Give each teacher their weekly workload", icon: ClipboardList,
      done: (allocations.data ?? 0) > 0,
      detail: (allocations.data ?? 0) > 0 ? `${allocations.data} allocations` : "Not started",
    },
    {
      to: "/timetable", label: "Build the weekly timetable", icon: CalendarDays,
      done: (slots.data ?? 0) > 0,
      detail: (slots.data ?? 0) > 0 ? `${slots.data} lessons placed` : "Empty",
    },
  ];

  const doneCount = steps.filter((s) => s.done || s.optional).length;
  const pct = Math.round((doneCount / steps.length) * 100);

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Setup steps</h2>
        <span className="text-xs text-muted-foreground">{doneCount} of {steps.length} done</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted mb-4 overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="rounded-lg border divide-y">
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <Link
              key={i}
              to={s.to}
              className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40 transition-colors"
            >
              {s.done ? (
                <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
              ) : (
                <Circle className={`h-5 w-5 shrink-0 ${s.optional ? "text-muted-foreground/40" : "text-muted-foreground"}`} />
              )}
              <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <div className={`text-sm ${s.done ? "text-muted-foreground line-through decoration-muted-foreground/40" : "font-medium"}`}>
                  {s.label}
                </div>
                <div className="text-xs text-muted-foreground">{s.detail}</div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// ---------------- quick actions ----------------

function QuickActions() {
  const actions = [
    { to: "/day-view", label: "Run today", detail: "Cover absences, tests, functions", icon: CalendarClock },
    { to: "/timetable", label: "Edit the timetable", detail: "Adjust the weekly plan", icon: CalendarDays },
    { to: "/reports", label: "View reports", detail: "Load per class and per teacher", icon: BarChart3 },
  ];
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Quick actions</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.to}
              to={a.to}
              className="rounded-lg border p-4 hover:bg-accent/40 hover:border-primary/40 transition-colors"
            >
              <Icon className="h-5 w-5 text-primary mb-2" />
              <div className="text-sm font-medium">{a.label}</div>
              <div className="text-xs text-muted-foreground">{a.detail}</div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// ---------------- stats ----------------

function Stats() {
  const items = [
    { table: "subjects", label: "Subjects", icon: BookOpen },
    { table: "classes", label: "Classes", icon: GraduationCap },
    { table: "teachers", label: "Teachers", icon: Users },
    { table: "rooms", label: "Rooms", icon: DoorOpen },
    { table: "teacher_allocations", label: "Allocations", icon: ClipboardList },
    { table: "timetable_slots", label: "Timetable lessons", icon: CalendarDays },
  ] as const;
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">At a glance</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {items.map((it) => (
          <StatCard key={it.table} {...it} />
        ))}
      </div>
    </section>
  );
}

function StatCard({ table, label, icon: Icon }: { table: string; label: string; icon: React.ComponentType<{ className?: string }> }) {
  const { data } = useCount(table);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold">{data ?? "—"}</div>
      </CardContent>
    </Card>
  );
}
