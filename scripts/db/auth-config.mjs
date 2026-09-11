// Read or patch the Supabase Auth config via the Management API.
// Usage (after dot-sourcing secrets.ps1):
//   node --env-file=.env.local scripts/db/auth-config.mjs get [key-substring]
//   node --env-file=.env.local scripts/db/auth-config.mjs patch path/to/patch.json
// Secret-looking fields are always redacted in output.
//
// OTP go-live (plan step 10, with supabase/golive/otp_golive.sql). Keep the patch file with secrets in the scratchpad:
//   { "hook_send_sms_uri": "<provider hook>", "rate_limit_sms_sent": <expected SMS per hour>,
//     "security_captcha_enabled": true, "security_captcha_provider": "turnstile", "security_captcha_secret": "<secret>" }
// Optionally "sms_test_otp": "" (drops the fixed test code of the +90 555 000 00 01 admin account).
// Enable captcha only after NEXT_PUBLIC_TURNSTILE_SITE_KEY is deployed AND the other /otp senders send a token too
// (resend on /giris/dogrula, account delete): today only the /giris form has the widget, so they would fail.
import { readFileSync } from "node:fs";

const ref = process.env.SUPABASE_PROJECT_REF || "fboythglcjofakbskstg";
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN missing");
  process.exit(2);
}
const url = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
const SECRETISH = /(secret|password|token|_key|apikey|api_key|auth_token|sms_test_otp$)/i;

function redact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (SECRETISH.test(k) && v !== null && v !== "" && typeof v !== "boolean" && typeof v !== "number") out[k] = "<redacted>";
    else out[k] = v;
  }
  return out;
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "get") {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json();
  if (!res.ok) {
    console.error(res.status, JSON.stringify(body));
    process.exit(1);
  }
  const r = redact(body);
  const filtered = arg ? Object.fromEntries(Object.entries(r).filter(([k]) => k.includes(arg))) : r;
  console.log(JSON.stringify(filtered, null, 2));
} else if (cmd === "patch") {
  const patch = JSON.parse(readFileSync(arg, "utf8"));
  const res = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("PATCH failed", res.status, text.slice(0, 2000));
    process.exit(1);
  }
  const body = JSON.parse(text);
  const r = redact(body);
  console.log(JSON.stringify(Object.fromEntries(Object.keys(patch).map((k) => [k, r[k]])), null, 2));
} else {
  console.error("usage: get [filter] | patch file.json");
  process.exit(2);
}
