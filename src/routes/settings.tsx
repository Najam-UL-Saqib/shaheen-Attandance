import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout, PageHeader } from "@/components/admin-layout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Coffee } from "lucide-react";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

function SettingsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("school_settings").select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const [days, setDays] = useState(5);
  const [periods, setPeriods] = useState(6);
  const [breakAfter, setBreakAfter] = useState(0);

  useEffect(() => {
    if (data) {
      setDays(data.working_days);
      setPeriods(data.periods_per_day);
      setBreakAfter(data.break_after_period ?? 0);
    }
  }, [data]);

  const save = async () => {
    const { error } = await supabase
      .from("school_settings")
      .update({ working_days: days, periods_per_day: periods, break_after_period: breakAfter })
      .eq("id", 1);
    if (error) return toast.error(error.message);
    toast.success("Settings saved");
    qc.invalidateQueries({ queryKey: ["settings"] });
  };

  return (
    <AdminLayout>
      <PageHeader title="Settings" description="Configure the weekly schedule shape." />
      <div className="max-w-md space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Weekly schedule</CardTitle>
            <CardDescription>Define how many days and periods make up each school week.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Working days per week (1–7)</Label>
              <Input
                type="number"
                min={1}
                max={7}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground mt-1">5 = Mon–Fri, 6 = Mon–Sat</p>
            </div>
            <div>
              <Label>Periods per day</Label>
              <Input
                type="number"
                min={1}
                max={12}
                value={periods}
                onChange={(e) => setPeriods(Number(e.target.value))}
              />
            </div>

            <Button onClick={save}>Save</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coffee className="h-5 w-5 text-muted-foreground" />
              Break configuration
            </CardTitle>
            <CardDescription>
              Optionally show a break gap in the timetable grid after a specific period. Set to 0 to disable.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Break after period (0 = no break)</Label>
              <Input
                type="number"
                min={0}
                max={periods}
                value={breakAfter}
                onChange={(e) => setBreakAfter(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {breakAfter > 0
                  ? `A break strip will appear between Period ${breakAfter} and Period ${breakAfter + 1} in the timetable.`
                  : "No break will be shown."}
              </p>
            </div>
            <Button onClick={save}>Save</Button>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
