import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { simulateReadingWithParams, severityForParams, resolveParams, severityFor } from "@/lib/sensor-sim";
import { useServerFn } from "@tanstack/react-start";
import { sendSms } from "@/lib/sms.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Activity, AlertTriangle, Lock, Wind, Flame } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — SecureWatch" }] }),
  component: Dashboard,
});

interface Sensor {
  id: string;
  name: string;
  unit: string;
  threshold: number;
  current_value: number;
  enabled: boolean;
}

interface AlertRow {
  id: string;
  sensor_name: string;
  value: number;
  threshold: number;
  severity: string;
  created_at: string;
}

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];
const ICONS: Record<string, typeof Activity> = {
  "Motion Detector": Activity,
  "Gas Sensor": Wind,
  "Smoke Sensor": Flame,
  "Door Lock": Lock,
};

function Dashboard() {
  const qc = useQueryClient();
  const sendSmsFn = useServerFn(sendSms);
  const sensorsQuery = useQuery({
    queryKey: ["sensors"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sensors").select("*").order("created_at");
      if (error) throw error;
      return data as Sensor[];
    },
  });

  const recentQuery = useQuery({
    queryKey: ["recent-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alert_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data as AlertRow[];
    },
  });

  const [history, setHistory] = useState<Array<Record<string, number | string>>>([]);
  const sensorsRef = useRef<Sensor[] | undefined>(undefined);
  sensorsRef.current = sensorsQuery.data;
  const sendSmsRef = useRef(sendSmsFn);
  sendSmsRef.current = sendSmsFn;
  // Throttle SMS per sensor: at most one every 60s.
  const lastSmsAtRef = useRef<Record<string, number>>({});

  const hasSensors = (sensorsQuery.data?.length ?? 0) > 0;

  useEffect(() => {
    if (!hasSensors) return;

    const tick = async () => {
      try {
        const sensors = sensorsRef.current;
        if (!sensors) return;
        const now = new Date();
        const point: Record<string, number | string> = { t: now.toLocaleTimeString() };
        const updates: Array<Promise<unknown>> = [];
        const alertsToInsert: Array<Omit<AlertRow, "id" | "created_at">> = [];

        for (const s of sensors) {
          if (!s.enabled) {
            point[s.name] = 0;
            continue;
          }
          const params = resolveParams(s as unknown as Parameters<typeof resolveParams>[0]);
          const value = simulateReadingWithParams(params);
          point[s.name] = value;
          const sev = severityForParams(value, params);
          const patch: { current_value: number; last_triggered?: string } = { current_value: value };
          if (sev !== "SAFE") {
            patch.last_triggered = now.toISOString();
            alertsToInsert.push({
              sensor_name: s.name,
              value,
              threshold: Number(s.threshold),
              severity: sev,
              unit: s.unit,
            } as Omit<AlertRow, "id" | "created_at"> & { unit: string });
          }
          updates.push(
            Promise.resolve(supabase.from("sensors").update(patch).eq("id", s.id)).catch(() => undefined),
          );
        }

        await Promise.all(updates);

        if (alertsToInsert.length > 0) {
          const { data: userData } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
          const uid = userData.user?.id;
          if (uid) {
            const rows = alertsToInsert.map((a) => {
              const { unit: _u, ...rest } = a as typeof a & { unit?: string };
              return { ...rest, user_id: uid, sms_sent: false };
            });
            await (supabase.from("alert_logs").insert(rows as never) as unknown as Promise<unknown>).then(
              () => undefined,
              () => undefined,
            );
            qc.invalidateQueries({ queryKey: ["recent-alerts"] });
            qc.invalidateQueries({ queryKey: ["alerts"] });

            const nowMs = Date.now();
            for (const a of alertsToInsert as Array<typeof alertsToInsert[number] & { unit?: string }>) {
              toast.error(`${a.sensor_name}: ${a.value} exceeded ${a.threshold}`, {
                description: `Severity: ${a.severity}`,
              });
              const last = lastSmsAtRef.current[a.sensor_name] ?? 0;
              if (a.severity === "DANGER" && nowMs - last > 60_000) {
                lastSmsAtRef.current[a.sensor_name] = nowMs;
                const unit = a.unit ?? "";
                const ts = new Date().toISOString();
                sendSmsRef.current({
                  data: {
                    message: `⚠ SecureWatch Alert: ${a.sensor_name} reading of ${a.value} ${unit} exceeded threshold of ${a.threshold} ${unit}. Severity: ${a.severity}. Time: ${ts}.`,
                  },
                }).catch(() => {});
              }
            }
          }
        }

        qc.setQueryData<Sensor[]>(["sensors"], (prev) =>
          prev?.map((s) => ({ ...s, current_value: Number(point[s.name] ?? s.current_value) })),
        );

        setHistory((h) => {
          const next = [...h, point];
          return next.slice(-20);
        });
      } catch (err) {
        // Swallow transient errors so the interval keeps running.
        console.warn("Sensor tick failed:", err);
      }
    };

    tick();
    const id = setInterval(tick, 3000);
    return () => clearInterval(id);
  }, [hasSensors, qc]);

  const sensors = sensorsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Live security sensor readings.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {sensorsQuery.isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="p-4 h-32 animate-pulse bg-muted/30" />
            ))
          : sensors.map((s) => {
              const sev = severityFor(Number(s.current_value), Number(s.threshold));
              const Icon = ICONS[s.name] ?? Activity;
              return (
                <Card
                  key={s.id}
                  className={cn(
                    "p-4 bg-card relative overflow-hidden",
                    sev === "DANGER" && "pulse-danger border-destructive",
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Icon className="w-4 h-4 text-primary" />
                      {s.name}
                    </div>
                    <SeverityBadge severity={sev} />
                  </div>
                  <div className="mt-3 text-3xl font-bold">
                    {s.name === "Door Lock"
                      ? Number(s.current_value) === 1 ? "OPEN" : "LOCKED"
                      : Number(s.current_value).toFixed(0)}
                    {s.name !== "Door Lock" && (
                      <span className="text-sm font-normal text-muted-foreground ml-1">{s.unit}</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Threshold: {s.threshold} {s.unit}
                  </div>
                </Card>
              );
            })}
      </div>

      <Card className="p-4 bg-card">
        <h2 className="font-semibold mb-3">Live readings (last ~60s)</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="t" stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} />
              <YAxis stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {sensors.map((s, i) => (
                <Line
                  key={s.id}
                  type="monotone"
                  dataKey={s.name}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4 bg-card">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4 text-warning" />
          <h2 className="font-semibold">Recent alerts</h2>
        </div>
        {(recentQuery.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No alerts yet. All sensors safe.</p>
        ) : (
          <ul className="space-y-2">
            {recentQuery.data!.map((a) => (
              <li key={a.id} className="flex items-center justify-between text-sm border-b border-border last:border-0 pb-2 last:pb-0">
                <div>
                  <span className="font-medium">{a.sensor_name}</span>
                  <span className="text-muted-foreground"> · {Number(a.value).toFixed(0)} (thr {Number(a.threshold).toFixed(0)})</span>
                </div>
                <div className="flex items-center gap-3">
                  <SeverityBadge severity={a.severity as "WARNING" | "DANGER" | "SAFE"} />
                  <span className="text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleTimeString()}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: "SAFE" | "WARNING" | "DANGER" }) {
  const cls =
    severity === "SAFE"
      ? "bg-success/20 text-success border-success/40"
      : severity === "WARNING"
        ? "bg-warning/20 text-warning border-warning/40"
        : "bg-destructive/20 text-destructive border-destructive/40";
  return <Badge variant="outline" className={cn("border", cls)}>{severity}</Badge>;
}
