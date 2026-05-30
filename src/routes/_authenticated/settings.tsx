import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { sendSms } from "@/lib/sms.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — SecureWatch" }] }),
  component: SettingsPage,
});

interface Profile {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  sms_enabled: boolean;
  twilio_account_sid: string | null;
  twilio_auth_token: string | null;
  twilio_from_number: string | null;
}

function SettingsPage() {
  const qc = useQueryClient();
  const sendSmsFn = useServerFn(sendSms);
  const { data } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").single();
      if (error) throw error;
      return data as Profile;
    },
  });

  const [form, setForm] = useState<Partial<Profile>>({});
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const set = (k: keyof Profile, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!data) return;
    const { error } = await supabase.from("profiles").update({
      name: form.name,
      phone: form.phone,
      sms_enabled: form.sms_enabled ?? false,
      twilio_account_sid: form.twilio_account_sid,
      twilio_auth_token: form.twilio_auth_token,
      twilio_from_number: form.twilio_from_number,
      updated_at: new Date().toISOString(),
    }).eq("id", data.id);
    if (error) return toast.error(error.message);
    toast.success("Profile saved");
    qc.invalidateQueries({ queryKey: ["profile"] });
  };

  const changePassword = async () => {
    if (password.length < 6) return toast.error("Password must be at least 6 characters");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return toast.error(error.message);
    setPassword("");
    toast.success("Password updated");
  };

  const testSms = async () => {
    try {
      await sendSmsFn({ data: { message: "✅ SecureWatch test alert — your Twilio configuration works." } });
      toast.success("Test SMS sent");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send SMS");
    }
  };

  if (!data) return <p className="text-muted-foreground">Loading...</p>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Profile, security, and SMS alert configuration.</p>
      </div>

      <Card className="p-5 bg-card space-y-4">
        <h2 className="font-semibold">Profile</h2>
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={data.email ?? ""} disabled />
        </div>
        <div>
          <Label htmlFor="phone">Phone (E.164, e.g. +15551234567)</Label>
          <Input id="phone" value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
        </div>
      </Card>

      <Card className="p-5 bg-card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">SMS alerts (Twilio)</h2>
          <div className="flex items-center gap-2">
            <Label htmlFor="sms-enabled" className="text-sm">Enable</Label>
            <Switch id="sms-enabled" checked={!!form.sms_enabled} onCheckedChange={(v) => set("sms_enabled", v)} />
          </div>
        </div>
        <div>
          <Label htmlFor="sid">Account SID</Label>
          <Input id="sid" value={form.twilio_account_sid ?? ""} onChange={(e) => set("twilio_account_sid", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="token">Auth Token</Label>
          <Input id="token" type="password" value={form.twilio_auth_token ?? ""} onChange={(e) => set("twilio_auth_token", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="from">From Number</Label>
          <Input id="from" value={form.twilio_from_number ?? ""} onChange={(e) => set("twilio_from_number", e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button onClick={save}>Save</Button>
          <Button variant="outline" onClick={testSms}>Send test SMS</Button>
        </div>
      </Card>

      <Card className="p-5 bg-card space-y-4">
        <h2 className="font-semibold">Change password</h2>
        <div>
          <Label htmlFor="pwd">New password</Label>
          <Input id="pwd" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button onClick={changePassword}>Update password</Button>
      </Card>
    </div>
  );
}
