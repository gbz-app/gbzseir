// Configure Supabase Auth for phone OTP with the Postgres Send-SMS hook (prototype demo mode).
// - Generates a random 6-digit TEST OTP for the admin phone (+905550000001) the first time and stores it
//   ONLY in the local scratch file given by ADMIN_OTP_FILE (never in the repo, never printed).
// Usage (after dot-sourcing secrets.ps1):
//   $env:ADMIN_OTP_FILE='C:\...\scratchpad\admin-otp.txt'; node --env-file=.env.local scripts/db/auth-setup.mjs
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomInt } from "node:crypto";

const ref = process.env.SUPABASE_PROJECT_REF || "fboythglcjofakbskstg";
const token = process.env.SUPABASE_ACCESS_TOKEN;
const otpFile = process.env.ADMIN_OTP_FILE;
if (!token || !otpFile) {
  console.error("SUPABASE_ACCESS_TOKEN and ADMIN_OTP_FILE are required");
  process.exit(2);
}

let code;
if (existsSync(otpFile)) code = readFileSync(otpFile, "utf8").trim();
if (!/^\d{6}$/.test(code || "")) {
  code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  writeFileSync(otpFile, code, "utf8");
  console.log("generated a new admin test OTP (stored in ADMIN_OTP_FILE)");
}

const patch = {
  site_url: "https://gbzsehir.vercel.app",
  uri_allow_list: ["http://localhost:3000/**", "https://gbzsehir.vercel.app/**", "https://*-gebzem-s-projects.vercel.app/**"].join(","),
  external_phone_enabled: true,
  external_email_enabled: false,
  sms_autoconfirm: false,
  sms_otp_length: 6,
  sms_otp_exp: 300,
  sms_max_frequency: 30,
  rate_limit_sms_sent: 60,
  sms_template: "Gebzem doğrulama kodun: {{ .Code }}",
  hook_send_sms_enabled: true,
  hook_send_sms_uri: "pg-functions://postgres/public/send_sms_hook",
  sms_test_otp: `905550000001=${code}`,
  sms_test_otp_valid_until: "2027-06-30T00:00:00Z",
};

const url = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
const res = await fetch(url, {
  method: "PATCH",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(patch),
});
const text = await res.text();
if (!res.ok) {
  console.error("PATCH failed", res.status, text.replaceAll(code, "******").slice(0, 2000));
  process.exit(1);
}
const body = JSON.parse(text);
const shown = {};
for (const k of Object.keys(patch)) shown[k] = k === "sms_test_otp" ? (body[k] ? "<set>" : body[k]) : body[k];
console.log(JSON.stringify(shown, null, 2));
