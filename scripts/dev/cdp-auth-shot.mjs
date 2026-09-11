// Full-page mobile screenshots while signed in: injects the @supabase/ssr auth cookie (base64url, chunked) from a
// saved session file. Service workers are bypassed. Tokens are never printed.
// Usage: node cdp-auth-shot.mjs <baseUrl> <outDir> <sessionFile> <projectRef> <path1> [path2 ...]
import { spawn } from "node:child_process";
import fs from "node:fs";

const [base, outDir, sessionFile, projectRef, ...paths] = process.argv.slice(2);
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9335;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const session = JSON.parse(fs.readFileSync(sessionFile, "utf8"));
const value = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
const name = `sb-${projectRef}-auth-token`;
const CHUNK = 3180;
const cookies = value.length <= CHUNK ? [{ name, value }] : Array.from({ length: Math.ceil(value.length / CHUNK) }, (_, i) => ({ name: `${name}.${i}`, value: value.slice(i * CHUNK, (i + 1) * CHUNK) }));

fs.mkdirSync(outDir, { recursive: true });
const proc = spawn(EDGE, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${outDir}/cdp-profile-auth`, "--no-first-run", "about:blank"], { stdio: "ignore" });
let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    wsUrl = list.find((t) => t.type === "page")?.webSocketDebuggerUrl ?? null;
  } catch {}
  if (!wsUrl) await sleep(250);
}
if (!wsUrl) {
  console.error("CDP not available");
  proc.kill();
  process.exit(1);
}
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
const viewport = (height) => send("Emulation.setDeviceMetricsOverride", { width: 390, height, deviceScaleFactor: 1, mobile: true });

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Network.setBypassServiceWorker", { bypass: true });
await viewport(844);
await send("Emulation.setUserAgentOverride", {
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
});
await send("Network.clearBrowserCookies");
const host = new URL(base).hostname;
for (const c of cookies) {
  await send("Network.setCookie", { name: c.name, value: c.value, domain: host, path: "/", secure: base.startsWith("https"), sameSite: "Lax" });
}
await send("Page.navigate", { url: `${base}/offline` });
await sleep(2000);
await send("Runtime.evaluate", {
  expression: "localStorage.setItem('gebzem.onboarded.v1', new Date().toISOString()); localStorage.setItem('gebzem.install.dismissedAt', String(Date.now())); 'ok'",
});

for (const p of paths) {
  await viewport(844);
  await send("Page.navigate", { url: base + p });
  await sleep(7000);
  const loc = await send("Runtime.evaluate", { expression: "location.pathname", returnByValue: true });
  const metrics = await send("Page.getLayoutMetrics");
  const r = metrics.result;
  const height = Math.min(Math.ceil((r.cssContentSize ?? r.contentSize).height), 5000);
  await viewport(height);
  await sleep(1200);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  const file = `auth${p.replace(/[^a-z0-9]+/gi, "-").replace(/-$/g, "")}-m.png`;
  fs.writeFileSync(`${outDir}/${file}`, Buffer.from(shot.result.data, "base64"));
  console.log(`${p} -> ${file} (height ${height}, landed on ${loc.result.result.value})`);
}
ws.close();
proc.kill();
process.exit(0);
