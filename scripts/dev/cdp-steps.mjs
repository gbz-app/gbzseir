// Multi-step UI test while signed in: open <startPath>, then run steps and report console errors.
// Steps: "tap:<text>" (a/button/[role=tab] by visible text), "tapsel:<css>", "type:<css>=<text>", "wait:<ms>",
// "shot:<name>" (viewport screenshot), "text:<needle>" (assert the page contains the text), "url" (print location).
// Usage: node cdp-steps.mjs <baseUrl> <outDir> <sessionFile|-> <projectRef> <startPath> <step> [step ...]
import { spawn } from "node:child_process";
import fs from "node:fs";

const [base, outDir, sessionFile, projectRef, startPath, ...steps] = process.argv.slice(2);
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9337 + Math.floor(Math.random() * 40);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let cookies = [];
if (sessionFile && sessionFile !== "-") {
  const session = JSON.parse(fs.readFileSync(sessionFile, "utf8"));
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  const name = `sb-${projectRef}-auth-token`;
  const CHUNK = 3180;
  cookies = value.length <= CHUNK ? [{ name, value }] : Array.from({ length: Math.ceil(value.length / CHUNK) }, (_, i) => ({ name: `${name}.${i}`, value: value.slice(i * CHUNK, (i + 1) * CHUNK) }));
}

fs.mkdirSync(outDir, { recursive: true });
const proc = spawn(EDGE, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${outDir}/cdp-profile-steps`, "--no-first-run", "about:blank"], { stdio: "ignore" });
let wsUrl = null;
for (let i = 0; i < 120 && !wsUrl; i++) {
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
const problems = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
  if (m.method === "Runtime.exceptionThrown") problems.push(`exception: ${m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text}`.slice(0, 400));
  if (m.method === "Runtime.consoleAPICalled" && (m.params.type === "error" || m.params.type === "assert"))
    problems.push(`console.${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description ?? "").join(" ")}`.slice(0, 400));
  if (m.method === "Log.entryAdded" && m.params.entry.level === "error") problems.push(`log: ${m.params.entry.text} ${m.params.entry.url ?? ""}`.slice(0, 400));
});
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.result?.value;

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");
await send("Network.enable");
await send("Network.setBypassServiceWorker", { bypass: true });
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await send("Network.clearBrowserCookies");
const host = new URL(base).hostname;
for (const c of cookies) await send("Network.setCookie", { name: c.name, value: c.value, domain: host, path: "/", secure: base.startsWith("https"), sameSite: "Lax" });
await send("Page.navigate", { url: `${base}/offline` });
await sleep(1500);
// ONBOARD=1 keeps the first-launch intro (onboarding) so it can be tested; otherwise it is marked as done.
await evaluate(
  (process.env.ONBOARD === "1" ? "localStorage.removeItem('gebzem.onboarded.v1'); sessionStorage.clear(); " : "localStorage.setItem('gebzem.onboarded.v1', new Date().toISOString()); ") +
    "localStorage.setItem('gebzem.install.dismissedAt', String(Date.now())); localStorage.setItem('gebzem.coach.yakinimda.v1','1'); 'ok'",
);
if (process.env.DARK === "1") await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
await send("Page.navigate", { url: base + startPath });
await sleep(6000);

let fails = 0;
for (const step of steps) {
  const i = step.indexOf(":");
  const kind = i === -1 ? step : step.slice(0, i);
  const arg = i === -1 ? "" : step.slice(i + 1);
  if (kind === "tap") {
    const r = await evaluate(`(() => { const want = ${JSON.stringify(arg)}; const els = [...document.querySelectorAll('a,button,[role=tab],[role=button]')].filter((e) => e.offsetParent !== null || e.getClientRects().length);
      const el = els.find((e) => e.textContent.trim() === want) || els.find((e) => e.textContent.trim().startsWith(want)) || els.find((e) => e.textContent.includes(want));
      if (!el) return 'NOT FOUND'; el.scrollIntoView({ block: 'center' }); el.click(); return 'ok ' + (el.getAttribute('href') || el.tagName); })()`);
    if (r === "NOT FOUND") fails++;
    console.log(`tap "${arg}": ${r}`);
    await sleep(900);
  } else if (kind === "tapsel") {
    const r = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(arg)}); if (!el) return 'NOT FOUND'; el.scrollIntoView({ block: 'center' }); el.click(); return 'ok'; })()`);
    if (r === "NOT FOUND") fails++;
    console.log(`tapsel ${arg}: ${r}`);
    await sleep(900);
  } else if (kind === "type") {
    // "type:<css>|<text>" - split on the last "|" (css selectors may contain "=").
    const eq = arg.lastIndexOf("|");
    const sel = arg.slice(0, eq);
    const text = arg.slice(eq + 1);
    const r = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'NOT FOUND'; el.focus();
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set; setter.call(el, ${JSON.stringify(text)});
      el.dispatchEvent(new Event('input', { bubbles: true })); return 'ok'; })()`);
    if (r === "NOT FOUND") fails++;
    console.log(`type ${sel} = "${text}": ${r}`);
    await sleep(900);
  } else if (kind === "eval") {
    console.log(`eval: ${JSON.stringify(await evaluate(arg))}`.slice(0, 300));
    await sleep(500);
  } else if (kind === "scroll") {
    await evaluate(`window.scrollTo(0, ${Number(arg) || 0}); 'ok'`);
    await sleep(700);
  } else if (kind === "wait") {
    await sleep(Number(arg) || 500);
  } else if (kind === "shot") {
    const shot = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(`${outDir}/${arg}.png`, Buffer.from(shot.result.data, "base64"));
    console.log(`shot -> ${arg}.png`);
  } else if (kind === "text") {
    const ok = await evaluate(`document.body.innerText.includes(${JSON.stringify(arg)})`);
    if (!ok) fails++;
    console.log(`${ok ? "PASS" : "FAIL"} text "${arg}"`);
  } else if (kind === "url") {
    console.log(`url: ${await evaluate("location.pathname + location.search + location.hash")}`);
  }
}
console.log(problems.length ? `PROBLEMS:\n${problems.join("\n")}` : "no console errors / exceptions");
console.log(fails ? `${fails} step(s) failed` : "all steps ok");
ws.close();
proc.kill();
process.exit(fails || problems.length ? 1 : 0);
