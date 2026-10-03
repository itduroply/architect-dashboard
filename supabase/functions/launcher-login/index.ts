// Supabase Edge Function: launcher-login (Architect Program project)
//
// The login OTP is sent and checked by the App Launcher project. After the
// user verifies it there, the browser holds a Launcher access token. This
// function:
//   1. asks the Launcher who that token belongs to,
//   2. checks the email has an active users_profile row here,
//   3. returns a one-time token_hash that the browser exchanges for a normal
//      Architect Program session (supabase.auth.verifyOtp).
// generateLink only creates the token; it does not send any email.
//
// Expected secrets:
//  - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (provided by Supabase)
//  - LAUNCHER_SUPABASE_URL
//  - LAUNCHER_SUPABASE_ANON_KEY

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { autoRefreshToken: false, persistSession: false } },
);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { launcherAccessToken } = await req.json().catch(() => ({}));
    if (!launcherAccessToken) return json({ error: "Launcher sign-in is missing." }, 400);

    const launcherUrl = Deno.env.get("LAUNCHER_SUPABASE_URL");
    const launcherAnonKey = Deno.env.get("LAUNCHER_SUPABASE_ANON_KEY");
    if (!launcherUrl || !launcherAnonKey) {
      return json({ error: "Launcher connection is not configured." }, 500);
    }

    // 1. Ask the Launcher's Auth server who this token belongs to. A forged or
    //    expired token is rejected here.
    const whoRes = await fetch(`${launcherUrl}/auth/v1/user`, {
      headers: { apikey: launcherAnonKey, Authorization: `Bearer ${launcherAccessToken}` },
    });
    if (!whoRes.ok) return json({ error: "Your Launcher sign-in has expired. Please try again." }, 401);
    const launcherUser = await whoRes.json();
    const email = String(launcherUser?.email ?? "").trim().toLowerCase();
    if (!email) return json({ error: "Launcher sign-in has no email." }, 401);

    // 2. Same checks the login page runs: profile must exist and be active.
    const { data: profiles, error: profileError } = await admin
      .from("users_profile")
      .select("id, email, auth_user_id, status")
      .ilike("email", email)
      .limit(2);
    if (profileError) throw profileError;
    if (!profiles || profiles.length === 0) {
      return json({ error: "No account is registered with this email." }, 403);
    }
    if (profiles.length > 1) {
      return json({ error: "More than one account uses this email. Contact administration support." }, 409);
    }
    const profile = profiles[0];
    if (profile.status === "inactive") {
      return json({ error: "Your profile has been deactivated. Contact administration support." }, 403);
    }

    // 3. One-time token for the Architect Program session. No email is sent.
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: profile.email,
    });
    if (linkError || !link?.properties?.hashed_token) {
      console.error("[launcher-login] generateLink failed:", linkError);
      return json({ error: "Could not open your session. Please try again." }, 500);
    }

    return json({ token_hash: link.properties.hashed_token });
  } catch (err) {
    console.error("[launcher-login] unhandled:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
