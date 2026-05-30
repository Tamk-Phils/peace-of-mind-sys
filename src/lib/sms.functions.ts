import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  message: z.string().min(1).max(500),
});

/**
 * Send an SMS via Twilio using the credentials stored on the current user's profile.
 */
export const sendSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => Input.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("phone, sms_enabled, twilio_account_sid, twilio_auth_token, twilio_from_number")
      .single();

    if (error) throw new Error(error.message);
    if (!profile) throw new Error("Profile not found");
    if (!profile.sms_enabled) {
      return { skipped: true, reason: "SMS disabled" };
    }
    if (!profile.phone || !profile.twilio_account_sid || !profile.twilio_auth_token || !profile.twilio_from_number) {
      throw new Error("Twilio is not fully configured. Add Account SID, Auth Token, From Number and your phone in Settings.");
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${profile.twilio_account_sid}/Messages.json`;
    const body = new URLSearchParams({
      To: profile.phone,
      From: profile.twilio_from_number,
      Body: data.message,
    });
    const auth = btoa(`${profile.twilio_account_sid}:${profile.twilio_auth_token}`);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const json = (await res.json()) as { sid?: string; message?: string };
    if (!res.ok) throw new Error(`Twilio error [${res.status}]: ${json.message ?? "unknown"}`);
    return { sid: json.sid };
  });
