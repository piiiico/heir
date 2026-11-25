#!/usr/bin/env bun
// heir run "<task>"   : the child agent works a task; every action passes the gates first.
// heir gates          : list active gates (inherited + learned).
// heir ledger         : what this heir has spent.
import { loadGates, firstBlock } from "./gates.ts";
import { chat, github, spentUsd, CAP_USD, MODEL } from "./connectors.ts";
import { hashBody } from "../gates/08-duplicate-outbound.ts";
import type { Action, Transcript } from "./types.ts";

const SYSTEM = `You are "heir", a small agent running in a Linux VM. You act by replying with EXACTLY ONE JSON object and nothing else:
{"kind":"shell","cmd":"<bash command>"}
{"kind":"http","method":"GET|POST|PATCH|DELETE","path":"/repos/piiiico/heir/...","body":{...},"expect":"<text the target must contain, for destructive calls>"}
{"kind":"claim","text":"<your final answer>","evidence":"<output you rely on>","parsed":<items read, if relevant>}
http calls go to the GitHub REST API through a gateway; you hold no token. A claim ends the task.
If an action comes back BLOCKED by a gate, read the reason and propose a corrected action.`;

const c = { dim: "\x1b[2m", red: "\x1b[31m", green: "\x1b[32m", yel: "\x1b[33m", off: "\x1b[0m" };

function parseAction(s: string): Action | null {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { const a = JSON.parse(m[0]); return a && ["shell", "http", "claim"].includes(a.kind) ? a : null; } catch { return null; }
}

async function execute(a: Action): Promise<{ output: string; status?: number }> {
  if (a.kind === "shell") {
    const p = Bun.spawnSync(["bash", "-c", a.cmd], { stdout: "pipe", stderr: "pipe" });
    return { output: (p.stdout.toString() + p.stderr.toString()).slice(0, 2000) + `\n[exit ${p.exitCode}]`, status: p.exitCode ?? 0 };
  }
  if (a.kind === "http") { const r = await github(a.method.toUpperCase(), a.path, a.body); return { output: r.text.slice(0, 2000), status: r.status }; }
  return { output: "" };
}

export async function run(task: string, maxSteps = 8): Promise<{ blocks: string[]; final: string | null }> {
  const gates = await loadGates();
  const t: Transcript = { steps: [], sentBodies: new Set() };
  const msgs = [{ role: "system", content: SYSTEM }, { role: "user", content: task }];
  const blocks: string[] = [];
  for (let i = 0; i < maxSteps; i++) {
    const reply = await chat(msgs);
    msgs.push({ role: "assistant", content: reply });
    const a = parseAction(reply);
    if (!a) { msgs.push({ role: "user", content: "Reply with exactly one JSON action." }); continue; }
    console.log(`${c.dim}heir>${c.off} ${JSON.stringify(a)}`);
    const b = firstBlock(gates, a, t);
    if (b) {
      blocks.push(b.gate.id);
      const who = b.gate.inherited ? `inherited from Pico, incident ${b.gate.date}` : `learned ${b.gate.date}`;
      console.log(`${c.red}BLOCKED${c.off} [gate ${b.gate.id}, ${who}] ${b.reason}`);
      msgs.push({ role: "user", content: `BLOCKED by gate ${b.gate.id}: ${b.reason}` });
      continue;
    }
    if (a.kind === "claim") { console.log(`${c.green}DONE${c.off} ${a.text}`); return { blocks, final: a.text }; }
    if (a.kind === "http" && a.method.toUpperCase() === "POST") t.sentBodies.add(hashBody(a.path, a.body));
    const r = await execute(a);
    t.steps.push({ action: a, output: r.output, status: r.status });
    console.log(`${c.dim}${r.output.trim().split("\n").slice(-3).join("\n")}${c.off}`);
    msgs.push({ role: "user", content: `Result (status ${r.status ?? "-"}):\n${r.output}` });
  }
  console.log(`${c.yel}STOPPED${c.off} after ${maxSteps} steps`);
  return { blocks, final: null };
}

if (import.meta.main) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "run") await run(rest.join(" "));
  else if (cmd === "gates") {
    const g = await loadGates();
    for (const x of g) console.log(`${x.date}  ${x.inherited ? "inherited" : "LEARNED  "}  ${x.id}  ${c.dim}${x.incident}${c.off}`);
    const n = g.filter((x) => x.inherited).length;
    console.log(`\n${n} inherited -> ${g.length} active`);
  } else if (cmd === "ledger") console.log(`Spent: $${spentUsd().toFixed(4)} / $${CAP_USD.toFixed(2)} client-side cap (model ${MODEL})`);
  else console.log("usage: heir run <task> | heir gates | heir ledger");
}
