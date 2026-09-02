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
import { Coffee, Palette, RotateCcw } from "lucide-react";
import {
  THEME_COLOR_KEYS,
  THEME_COLOR_LABELS,
  THEME_PRESETS,
  useThemeColors,
  type ThemeColorKey,
} from "@/hooks/use-theme-colors";

const DEFAULT_COLOR_HEX: Record<ThemeColorKey, string> = {
  background: "#fdfdfe",
  primary: "#3d4f9e",
  sidebar: "#1e2436",
  tabActive: "#3d4f9e",
  tableHeader: "#eef0f7",
  tableStripe: "#f8f9fc",
};

export const Route = createFileRoute("/settings")({ component: SettingsPage });

function SettingsPage() {
  const qc = useQueryClient();
  const { colors, setColor, applyPreset, reset } = useThemeColors();
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("school_settings").select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const [days, setDays] = useState(5);
  const [periods, setPeriods] = useState(8);
  const [breakAfter, setBreakAfter] = useState(0);
  const [maxConsecutive, setMaxConsecutive] = useState(3);

  useEffect(() => {
    if (data) {
      setDays(data.working_days);
      setPeriods(data.periods_per_day);
      setBreakAfter(data.break_after_period ?? 0);
      setMaxConsecutive(data.max_consecutive_periods ?? 3);
    }
  }, [data]);

  const save = async () => {
    const base = { working_days: days, periods_per_day: periods, break_after_period: breakAfter };
    let { error } = await supabase
      .from("school_settings")
      .update({ ...base, max_consecutive_periods: maxConsecutive })
      .eq("id", 1);

    // Fall back gracefully if the max_consecutive_periods migration has not been applied yet.
    if (error && /max_consecutive_periods/.test(error.message)) {
      ({ error } = await supabase.from("school_settings").update(base).eq("id", 1));
      if (!error) {
        toast.warning("Saved. Run the latest DB migration to persist the consecutive-periods limit.");
        qc.invalidateQueries({ queryKey: ["settings"] });
        return;
      }
    }
    if (error) return toast.error(error.message);
    toast.success("Settings saved");
    qc.invalidateQueries({ queryKey: ["settings"] });
  };

  return (
    <AdminLayout>
      <PageHeader title="Settings" description="Configure the weekly schedule shape." />
      <div className="max-w-2xl space-y-6">
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
            <div>
              <Label>Max consecutive periods per teacher</Label>
              <Input
                type="number"
                min={1}
                max={periods}
                value={maxConsecutive}
                onChange={(e) => setMaxConsecutive(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                A teacher may not be scheduled for more than this many back-to-back periods in a day
                (enforced in the Timetable and Day View editors and the auto-generator).
              </p>
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-muted-foreground" />
              Appearance
            </CardTitle>
            <CardDescription>
              Customize the colors used for tabs, table columns, and rows. Changes apply
              instantly and are saved to this browser.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <Label className="mb-2 block">Presets</Label>
              <div className="flex flex-wrap gap-2">
                {THEME_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => applyPreset(preset.colors)}
                    className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
                    title={preset.name}
                  >
                    <span className="flex -space-x-1">
                      <span
                        className="h-3.5 w-3.5 rounded-full border border-background"
                        style={{ backgroundColor: preset.colors.primary }}
                      />
                      <span
                        className="h-3.5 w-3.5 rounded-full border border-background"
                        style={{ backgroundColor: preset.colors.sidebar }}
                      />
                    </span>
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {THEME_COLOR_KEYS.map((key) => (
                <div key={key} className="flex items-center justify-between gap-3 rounded-md border p-2.5">
                  <div>
                    <div className="text-sm font-medium">{THEME_COLOR_LABELS[key]}</div>
                    <div className="text-xs text-muted-foreground">
                      {colors[key] ?? DEFAULT_COLOR_HEX[key]}
                    </div>
                  </div>
                  <input
                    type="color"
                    value={colors[key] ?? DEFAULT_COLOR_HEX[key]}
                    onChange={(e) => setColor(key, e.target.value)}
                    className="h-8 w-10 cursor-pointer rounded border border-input bg-transparent p-0.5"
                  />
                </div>
              ))}
            </div>

            <Button variant="outline" onClick={reset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset to defaults
            </Button>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
