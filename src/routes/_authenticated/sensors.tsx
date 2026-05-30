import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { severityFor } from "@/lib/sensor-sim";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/sensors")({
  head: () => ({ meta: [{ title: "Sensors — SecureWatch" }] }),
  component: SensorsPage,
});

interface Sensor {
  id: string;
  name: string;
  unit: string;
  threshold: number;
  current_value: number;
  enabled: boolean;
  last_triggered: string | null;
}

function SensorsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["sensors-page"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sensors").select("*").order("created_at");
      if (error) throw error;
      return data as Sensor[];
    },
    refetchInterval: 3000,
  });

  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const saveThreshold = async (id: string) => {
    const raw = drafts[id];
    const v = Number(raw);
    if (!Number.isFinite(v) || v < 0) return toast.error("Invalid threshold");
    const { error } = await supabase.from("sensors").update({ threshold: v }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Threshold updated");
    setDrafts((d) => {
      const { [id]: _, ...rest } = d;
      return rest;
    });
    qc.invalidateQueries({ queryKey: ["sensors-page"] });
    qc.invalidateQueries({ queryKey: ["sensors"] });
  };

  const toggle = async (id: string, enabled: boolean) => {
    const { error } = await supabase.from("sensors").update({ enabled }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["sensors-page"] });
    qc.invalidateQueries({ queryKey: ["sensors"] });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sensors</h1>
        <p className="text-sm text-muted-foreground">Configure thresholds and toggle sensors on or off.</p>
      </div>
      <Card className="p-0 overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sensor</TableHead>
              <TableHead>Current</TableHead>
              <TableHead>Threshold</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last triggered</TableHead>
              <TableHead>Enabled</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Loading...</TableCell></TableRow>
            )}
            {(data ?? []).map((s) => {
              const sev = severityFor(Number(s.current_value), Number(s.threshold));
              return (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{Number(s.current_value).toFixed(0)} {s.unit}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        className="w-24 h-8"
                        value={drafts[s.id] ?? String(s.threshold)}
                        onChange={(e) => setDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
                      />
                      <Button size="sm" variant="outline" onClick={() => saveThreshold(s.id)} disabled={drafts[s.id] == null}>
                        Save
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={
                      sev === "SAFE" ? "text-success" : sev === "WARNING" ? "text-warning" : "text-destructive"
                    }>{sev}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {s.last_triggered ? new Date(s.last_triggered).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell>
                    <Switch checked={s.enabled} onCheckedChange={(v) => toggle(s.id, v)} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
