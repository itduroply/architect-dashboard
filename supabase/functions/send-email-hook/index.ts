// Supabase Auth "Send Email" hook for the Architect Program project.
//
// Supabase Auth calls this function every time it needs to send an auth
// email (login OTP, signup confirmation, password recovery, email change).
// It sends the 6-digit code through Duroply's own mailbox over SMTP — the
// same transport the App Launcher's auth email hook uses. The SMTP code below
// is copied from Dealer Management's _shared/auth.ts sendMail().
//
// Expected secrets (set with `supabase secrets set`, never hardcode):
//  - SEND_EMAIL_HOOK_SECRET  (from Authentication → Auth Hooks, "v1,whsec_...")
//  - SMTP_HOST
//  - SMTP_PORT               (default 465, direct TLS)
//  - SMTP_USER               (also used as the sender address)
//  - SMTP_PASS
//  - SMTP_FROM_NAME          (optional, default "Duroply Design Partner+")
//
// Deploy with --no-verify-jwt: Auth signs the request with the hook secret,
// it does not send a user JWT.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const SMTP_HOST = Deno.env.get("SMTP_HOST") ?? "";
const SMTP_PORT = Number(Deno.env.get("SMTP_PORT") ?? "465");
const SMTP_USER = Deno.env.get("SMTP_USER") ?? "";
const SMTP_PASS = Deno.env.get("SMTP_PASS") ?? "";
// The Launcher project spells this secret SMTP_FORM_NAME. Read both spellings
// so the same values can be copied across as they are.
const SMTP_FROM_NAME =
  Deno.env.get("SMTP_FROM_NAME") ?? Deno.env.get("SMTP_FORM_NAME") ?? "Duroply Design Partner+";

type HookPayload = {
  user: { email: string; new_email?: string };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
    token_new?: string;
    token_hash_new?: string;
  };
};

function hookError(status: number, message: string) {
  return new Response(JSON.stringify({ error: { http_code: status, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function subjectFor(action: string) {
  switch (action) {
    case "signup":
      return "Confirm your Design Partner+ account";
    case "recovery":
      return "Your Design Partner+ recovery code";
    case "email_change":
      return "Confirm your new email for Design Partner+";
    default:
      return "Your Design Partner+ sign-in code";
  }
}

function buildEmail(token: string) {
  const text =
    `Your Design Partner+ verification code is ${token}.\r\n` +
    `It expires shortly and can be used only once. Do not share this code.\r\n` +
    `- Duroply Industries`;
  const html = `
<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; color: #1a1510;">
  <h2 style="color: #b38f4f; margin: 0 0 8px;">Design Partner+</h2>
  <p>Enter this code to sign in. It expires shortly and can be used only once.</p>
  <div style="background: #f9f6f0; border: 1px solid #e0d8c5; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
    <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px;">${token}</span>
  </div>
  <p style="color: #6f6457; font-size: 13px;">Do not share this code with anyone. If you did not try to sign in, ignore this email.</p>
  <p style="color: #6f6457; font-size: 13px;">Duroply Industries</p>
</div>`;
  return { text, html };
}

// Deno's btoa is Latin-1 only; this survives UTF-8 in a password or name.
function b64(value: string) {
  return btoa(unescape(encodeURIComponent(value)));
}

async function sendMail(to: string, subject: string, text: string, html: string) {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) throw new Error("SMTP is not configured on this project.");

  const conn = await Deno.connectTls({ hostname: SMTP_HOST, port: SMTP_PORT });
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // A socket write may accept only part of the buffer, so loop until all of
  // it is sent.
  async function writeAll(bytes: Uint8Array) {
    let sent = 0;
    while (sent < bytes.length) {
      const n = await conn.write(bytes.subarray(sent));
      if (n <= 0) throw new Error("SMTP connection closed while sending.");
      sent += n;
    }
  }

  // An SMTP reply can arrive split across reads. It is complete when its last
  // line starts with the status code followed by a space.
  async function read() {
    let reply = "";
    for (let attempt = 0; attempt < 64; attempt++) {
      const buf = new Uint8Array(4096);
      const n = await conn.read(buf);
      if (n === null) break;
      reply += decoder.decode(buf.subarray(0, n));
      if (/(?:^|\r\n)\d{3} [^\r\n]*\r\n$/.test(reply)) break;
    }
    return reply;
  }

  async function cmd(line: string, okPrefixes: string[] = []) {
    await writeAll(encoder.encode(line + "\r\n"));
    const reply = await read();
    if (okPrefixes.length && !okPrefixes.some((prefix) => reply.startsWith(prefix))) {
      throw new Error(`SMTP step failed (${line.split(" ")[0]}): ${reply.trim()}`);
    }
    return reply;
  }

  try {
    await read(); // 220 greeting
    await cmd(`EHLO ${SMTP_HOST}`, ["250"]);
    await cmd("AUTH LOGIN", ["334"]);
    await cmd(b64(SMTP_USER), ["334"]);
    await cmd(b64(SMTP_PASS), ["235"]);
    await cmd(`MAIL FROM:<${SMTP_USER}>`, ["250"]);
    await cmd(`RCPT TO:<${to}>`, ["250", "251"]);
    await cmd("DATA", ["354"]);

    const boundary = `----DuroplyDP${crypto.randomUUID().replace(/-/g, "")}`;
    const senderDomain = SMTP_USER.split("@")[1] ?? "duroply.com";
    const message = [
      `From: ${SMTP_FROM_NAME} <${SMTP_USER}>`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${crypto.randomUUID()}@${senderDomain}>`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "",
      text,
      "",
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "",
      html,
      "",
      `--${boundary}--`,
      "",
      ".",
    ].join("\r\n");

    await cmd(message, ["250"]);
    await cmd("QUIT");
  } finally {
    try { conn.close(); } catch (_) { /* already gone */ }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return hookError(405, "Method not allowed");

  const hookSecret = (Deno.env.get("SEND_EMAIL_HOOK_SECRET") ?? "").replace("v1,whsec_", "");
  if (!hookSecret) return hookError(500, "SEND_EMAIL_HOOK_SECRET is not set.");

  const payload = await req.text();
  let data: HookPayload;
  try {
    // Rejects any request that was not signed by this project's Auth server.
    data = new Webhook(hookSecret).verify(payload, Object.fromEntries(req.headers)) as HookPayload;
  } catch (err) {
    console.error("[send-email-hook] signature check failed:", err);
    return hookError(401, "Invalid hook signature.");
  }

  try {
    const { user, email_data } = data;
    const action = email_data.email_action_type;
    const subject = subjectFor(action);

    // Email change with "secure email change" on sends one code to each
    // address: token_new goes to the current email, token to the new one.
    if (action === "email_change" && email_data.token_new && user.new_email) {
      const current = buildEmail(email_data.token_new);
      await sendMail(user.email, subject, current.text, current.html);
      const next = buildEmail(email_data.token);
      await sendMail(user.new_email, subject, next.text, next.html);
    } else {
      const to = action === "email_change" && user.new_email ? user.new_email : user.email;
      const { text, html } = buildEmail(email_data.token);
      await sendMail(to, subject, text, html);
    }

    console.log(`[send-email-hook] ${action} email sent`);
    return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[send-email-hook] send failed:", err);
    return hookError(500, "Could not send the email. Please try again.");
  }
});
