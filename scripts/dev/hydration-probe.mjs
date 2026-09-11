// Loads a page several times in headless Edge (390 px, fresh profile each time) and prints the FULL text of console
// errors/exceptions, so React's dev-mode hydration diff is visible. Usage: node hydration-probe.mjs <url> [runs=3]
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [url, runsArg] = process.argv.slice(2);
const runs = Number(runsArg) || 3;
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (let run = 1; run <= runs; run++) {
  const port = 9400 + run;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "hydprobe-"));
  const proc = spawn(EDGE, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "about:blank"], { stdio: "ignore" });
  let wsUrl = null;
  for (let i = 0; i < 120 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      wsUrl = list.find((t) => t.type === "page")?.webSocketDebuggerUrl ?? null;
    } catch {}
    if (!wsUrl) await sleep(250);
  }
  if (!wsUrl) {
    console.log(`run ${run}: CDP not available`);
    proc.kill();
    continue;
  }
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let seq = 0;
  const pending = new Map();
  const problems = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
    if (m.method === "Runtime.exceptionThrown") problems.push(`exception: ${m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text}`);
    if (m.method === "Runtime.consoleAPICalled" && (m.params.type === "error" || m.params.type === "warning"))
      problems.push(`console.${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description ?? "").join(" ")}`);
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++seq;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Network.setBypassServiceWorker", { bypass: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send("Page.navigate", { url });
  await sleep(9000);
  const hyd = problems.filter((p) => /hydrat|did not match|didn't match|418|425|423/i.test(p));
  console.log(`\n=== run ${run}: ${problems.length} console problems, ${hyd.length} hydration-related`);
  for (const p of (hyd.length ? hyd : problems).slice(0, 4)) console.log(p.replace(/\n\s+at .*$/gm, "").slice(0, 3500));
  ws.close();
  proc.kill();
  await sleep(500);
  try {
    fs.rmSync(profile, { recursive: true, force: true });
  } catch {}
}
