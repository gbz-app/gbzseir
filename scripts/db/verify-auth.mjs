// End-to-end phone OTP check with the ANON key (demo mode):
//   /auth/v1/otp -> rpc get_demo_otp -> /auth/v1/verify -> profile row exists (via RLS as the user).
// Also checks the admin test OTP login when ADMIN_OTP_FILE is set.
// The throwaway user (+905551112233 by default) is deleted afterwards.
// Usage: node --env-file=.env.local scripts/db/verify-auth.mjs [phone]
import { readFileSync, existsSync } from "node:fs";
import { SUPABASE_URL, ANON_KEY, adminFetch } from "./lib.mjs";

const phone = process.argv[2] || "+905551112233";

async function anon(path, body, token) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token || ANON_KEY}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

export async function otpLogin(p, code) {
  const sent = await anon("/auth/v1/otp", { phone: p });
  if (sent.status !== 200) throw new Error(`otp send failed ${sent.status} ${JSON.stringify(sent.body)}`);
  let token = code;
  if (!token) {
    const r = await anon("/rest/v1/rpc/get_demo_otp", { p_phone: p });
    token = r.body;
    if (!token) throw new Error(`get_demo_otp returned ${JSON.stringify(r.body)}`);
  }
  const v = await anon("/auth/v1/verify", { type: "sms", phone: p, token });
  if (v.status !== 200 || !v.body?.access_token) throw new Error(`verify failed ${v.status} ${JSON.stringify(v.body).slice(0, 300)}`);
  return v.body;
}

const results = [];
const isMain = process.argv[1] && process.argv[1].endsWith("verify-auth.mjs");
if (isMain) {
  try {
    const s = await otpLogin(phone);
    results.push(["otp send + get_demo_otp + verify", "ok"]);
    const prof = await anon(`/rest/v1/profiles?select=id,phone,role,onboarded`, undefined, s.access_token);
    const row = Array.isArray(prof.body) ? prof.body[0] : null;
    results.push(["profile row via RLS", row && row.id === s.user.id ? `ok phone=${row.phone} role=${row.role}` : `FAIL ${JSON.stringify(prof.body)}`]);
    const otpRead = await anon(`/rest/v1/demo_otp?select=*`, undefined, s.access_token);
    results.push(["user cannot read demo_otp", otpRead.status >= 400 || (Array.isArray(otpRead.body) && otpRead.body.length === 0) ? `ok (${otpRead.status})` : "FAIL"]);
    const del = await adminFetch(`/auth/v1/admin/users/${s.user.id}`, { method: "DELETE" });
    results.push(["delete throwaway user", del.ok ? "ok" : `FAIL ${del.status}`]);
  } catch (e) {
    results.push(["user OTP flow", `FAIL ${e.message}`]);
  }

  const otpFile = process.env.ADMIN_OTP_FILE;
  if (otpFile && existsSync(otpFile)) {
    try {
      const code = readFileSync(otpFile, "utf8").trim();
      const demo = await anon("/rest/v1/rpc/get_demo_otp", { p_phone: "+905550000001" });
      const s = await otpLogin("+905550000001", code);
      const prof = await anon(`/rest/v1/profiles?select=role&id=eq.${s.user.id}`, undefined, s.access_token);
      results.push(["admin test OTP login", `ok role=${prof.body?.[0]?.role}`]);
      results.push(["get_demo_otp hides admin code", demo.body === null ? "ok" : "FAIL"]);
    } catch (e) {
      results.push(["admin test OTP login", `FAIL ${e.message}`]);
    }
  }
  for (const [k, v] of results) console.log(`${k.padEnd(36)} ${v}`);
}
