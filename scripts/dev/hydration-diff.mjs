// Production hydration diff: takes the HTML the server sent for <url> (from the browser's own network response) and the
// DOM after React has hydrated / client-rendered, and prints where their visible text + tag sequence first differ.
// Usage: node hydration-diff.mjs <url>
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [url] = process.argv.slice(2);
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9450;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "hyddiff-"));
const proc = spawn(EDGE, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "about:blank"], { stdio: "ignore" });
let wsUrl = null;
for (let i = 0; i < 120 && !wsUrl; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    wsUrl = list.find((t) => t.type === "page")?.webSocketDebuggerUrl ?? null;
  } catch {}
  if (!wsUrl) await sleep(250);
}
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0;
const pending = new Map();
let docRequestId = null;
const errors = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
  if (m.method === "Network.responseReceived" && m.params.type === "Document" && !docRequestId) docRequestId = m.params.requestId;
  if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails?.exception?.description?.split("\n")[0]);
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
const body = await send("Network.getResponseBody", { requestId: docRequestId });
const serverHtml = body.result?.body ?? "";
const clientHtml = (await send("Runtime.evaluate", { expression: "document.body.outerHTML", returnByValue: true })).result.result.value;
ws.close();
proc.kill();

// Tokenize: tag names (open/close) and trimmed text nodes; drop scripts, styles, templates, comments and attributes.
function tokens(html) {
  const s = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<template[\s\S]*?<\/template>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  const out = [];
  const re = /<\/?([a-zA-Z0-9-]+)[^>]*>|([^<]+)/g;
  let m;
  while ((m = re.exec(s))) {
    if (m[1]) out.push(`${m[0].startsWith("</") ? "/" : ""}${m[1].toLowerCase()}`);
    else {
      const t = m[2].replace(/\s+/g, " ").trim();
      if (t) out.push(`"${t.slice(0, 80)}"`);
    }
  }
  return out;
}
const bodyOnly = (h) => {
  const i = h.indexOf("<body");
  return i >= 0 ? h.slice(i) : h;
};
const a = tokens(bodyOnly(serverHtml));
const b = tokens(clientHtml);
console.log(`errors: ${errors.join(" | ") || "none"}`);
console.log(`server tokens ${a.length}, client tokens ${b.length}`);
// Report every text token present on one side only (order-insensitive), then the first positional divergence.
const count = (arr) => arr.filter((t) => t.startsWith('"')).reduce((m, t) => m.set(t, (m.get(t) || 0) + 1), new Map());
const ca = count(a), cb = count(b);
const onlyServer = [...ca].filter(([t, n]) => (cb.get(t) || 0) < n).map(([t]) => t);
const onlyClient = [...cb].filter(([t, n]) => (ca.get(t) || 0) < n).map(([t]) => t);
console.log(`\ntext only in SERVER html (${onlyServer.length}):\n  ${onlyServer.slice(0, 25).join("\n  ")}`);
console.log(`\ntext only in CLIENT dom (${onlyClient.length}):\n  ${onlyClient.slice(0, 25).join("\n  ")}`);
let i = 0;
while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++;
console.log(`\nfirst divergence at token ${i}:\n  server: ${a.slice(Math.max(0, i - 6), i + 10).join(" ")}\n  client: ${b.slice(Math.max(0, i - 6), i + 10).join(" ")}`);
try {
  fs.rmSync(profile, { recursive: true, force: true });
} catch {}
