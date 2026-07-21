import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout, PageHeader } from "@/components/admin-layout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/rooms")({ component: RoomsPage });

type Room = { id: string; name: string; capacity: number | null };

function RoomsPage() {
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["rooms"],
    queryFn: async () => {
      const { data, error } = await supabase.from("rooms").select("*").order("name");
      if (error) throw error;
      return data as Room[];
    },
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [cap, setCap] = useState("");

  const save = async () => {
    if (!name.trim()) return toast.error("Name required");
    const { error } = await supabase.from("rooms").insert({ name: name.trim(), capacity: cap ? Number(cap) : null });
    if (error) return toast.error(error.message);
    setOpen(false); setName(""); setCap("");
    qc.invalidateQueries({ queryKey: ["rooms"] });
  };

  const remove = async (id: string) => {
    if (!confirm("Delete room?")) return;
    const { error } = await supabase.from("rooms").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["rooms"] });
  };

  return (
    <AdminLayout>
      <PageHeader
        title="Rooms"
        description="Venues used for timetable scheduling."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Add room</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New room</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Room 101" /></div>
                <div><Label>Capacity (optional)</Label><Input type="number" value={cap} onChange={(e) => setCap(e.target.value)} /></div>
              </div>
              <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Capacity</TableHead><TableHead className="w-24 text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={3} className="py-8 text-center text-muted-foreground">No rooms yet.</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-muted-foreground">{r.capacity ?? "—"}</TableCell>
                <TableCell className="text-right"><Button size="icon" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AdminLayout>
  );
}
