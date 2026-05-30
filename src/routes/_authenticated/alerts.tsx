import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/alerts")({
  head: () => ({ meta: [{ title: "Alert Logs — SecureWatch" }] }),
  component: AlertsPage,
});

interface AlertRow {
  id: string;
  sensor_name: string;
  value: number;
  threshold: number;
  severity: string;
  created_at: string;
}

const PAGE_SIZE = 20;

function AlertsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(0);
  const [sensor, setSensor] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["alerts", page, sensor, from, to],
    queryFn: async () => {
      let q = supabase
        .from("alert_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (sensor !== "all") q = q.eq("sensor_name", sensor);
      if (from) q = q.gte("created_at", new Date(from).toISOString());
      if (to) q = q.lte("created_at", new Date(to).toISOString());
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: data as AlertRow[], count: count ?? 0 };
    },
  });

  const clearAll = async () => {
    const { error } = await supabase.from("alert_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) return toast.error(error.message);
    toast.success("All alerts cleared");
    qc.invalidateQueries({ queryKey: ["alerts"] });
    qc.invalidateQueries({ queryKey: ["recent-alerts"] });
  };

  const total = data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Alert Logs</h1>
          <p className="text-sm text-muted-foreground">All security events ever recorded.</p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm">Clear all logs</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear all alert logs?</AlertDialogTitle>
              <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={clearAll}>Clear all</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <Card className="p-4 bg-card grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Sensor</label>
          <Select value={sensor} onValueChange={(v) => { setPage(0); setSensor(v); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sensors</SelectItem>
              <SelectItem value="Motion Detector">Motion Detector</SelectItem>
              <SelectItem value="Gas Sensor">Gas Sensor</SelectItem>
              <SelectItem value="Smoke Sensor">Smoke Sensor</SelectItem>
              <SelectItem value="Door Lock">Door Lock</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">From</label>
          <Input type="datetime-local" value={from} onChange={(e) => { setPage(0); setFrom(e.target.value); }} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">To</label>
          <Input type="datetime-local" value={to} onChange={(e) => { setPage(0); setTo(e.target.value); }} />
        </div>
        <div className="flex items-end">
          <Button variant="outline" size="sm" onClick={() => { setSensor("all"); setFrom(""); setTo(""); setPage(0); }}>
            Reset
          </Button>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date / Time</TableHead>
              <TableHead>Sensor</TableHead>
              <TableHead>Reading</TableHead>
              <TableHead>Threshold</TableHead>
              <TableHead>Severity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Loading...</TableCell></TableRow>
            )}
            {!isLoading && (data?.rows ?? []).length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No alerts.</TableCell></TableRow>
            )}
            {(data?.rows ?? []).map((a) => (
              <TableRow key={a.id}>
                <TableCell className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</TableCell>
                <TableCell className="font-medium">{a.sensor_name}</TableCell>
                <TableCell>{Number(a.value).toFixed(0)}</TableCell>
                <TableCell>{Number(a.threshold).toFixed(0)}</TableCell>
                <TableCell>
                  <span className={a.severity === "DANGER" ? "text-destructive font-medium" : "text-warning font-medium"}>
                    {a.severity}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="flex justify-between items-center text-sm">
        <span className="text-muted-foreground">{total} alerts · page {page + 1} of {pages}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</Button>
          <Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}
