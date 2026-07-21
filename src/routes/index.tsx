import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout, PageHeader } from "@/components/admin-layout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, GraduationCap, Users, CalendarDays, ClipboardList, DoorOpen } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <AdminLayout>
      <PageHeader title="Dashboard" description="Overview of the school's timetable system." />
      <Stats />
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

function Stats() {
  const items = [
    { table: "subjects", label: "Subjects", icon: BookOpen },
    { table: "classes", label: "Classes", icon: GraduationCap },
    { table: "teachers", label: "Teachers", icon: Users },
    { table: "rooms", label: "Rooms", icon: DoorOpen },
    { table: "teacher_allocations", label: "Allocations", icon: ClipboardList },
    { table: "timetable_slots", label: "Timetable Slots", icon: CalendarDays },
  ] as const;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {items.map((it) => (
        <StatCard key={it.table} {...it} />
      ))}
    </div>
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
