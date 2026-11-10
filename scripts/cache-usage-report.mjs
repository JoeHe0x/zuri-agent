#!/usr/bin/env node
// Summarize `cache_usage {...}` trace lines: node scripts/cache-usage-report.mjs <trace-file>  (or pipe stdin)
import { readFileSync } from "node:fs";

const text = readFileSync(process.argv[2] || 0, "utf8");
const calls = [];
for (const line of text.split(/\r?\n/)) {
  const at = line.indexOf("cache_usage ");
  if (at < 0) continue;
  try { calls.push(JSON.parse(line.slice(at + 12))); } catch { /* not a complete JSON line */ }
}
if (!calls.length) { console.error("no cache_usage lines found"); process.exit(1); }

const sum = (key) => calls.reduce((total, call) => total + (call[key] || 0), 0);
const input = sum("input");
const rewrites = calls.slice(1).filter((call) => call.write > call.read * 0.25).length;
console.log(`calls: ${calls.length}`);
console.log(`input tokens: ${input}  cache read: ${sum("read")}  cache write: ${sum("write")}`);
console.log(`overall hit rate: ${input ? (sum("read") / input).toFixed(3) : "n/a"}`);
console.log(`steps after the first with a large rewrite (write > 25% of read): ${rewrites}`);
console.log("per call hitRate:", calls.map((call) => call.hitRate).join(" "));
