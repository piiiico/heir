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

export async function run(task: string, maxSteps = 8, save?: string): Promise<{ blocks: string[]; final: string | null }> {
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
    if (a.kind === "claim") {
      console.log(`${c.green}DONE${c.off} ${a.text}`);
      if (save) await Bun.write(save, JSON.stringify({ task, model: MODEL, at: new Date().toISOString(), steps: t.steps, final: a }, null, 2));
      return { blocks, final: a.text };
    }
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
  if (cmd === "run") {
    const i = rest.indexOf("--save");
    const save = i >= 0 ? rest.splice(i, 2)[1] : undefined;
    await run(rest.join(" "), 8, save);
  } else if (cmd === "learn" || cmd === "activate" || cmd === "upstream") {
    const L = await import("./learn.ts");
    await (L as any)[cmd](...rest);
  }
  else if (cmd === "gates") {
    const g = await loadGates();
    for (const x of g) console.log(`${x.date}  ${x.inherited ? "inherited" : "LEARNED  "}  ${x.id}  ${c.dim}${x.incident}${c.off}`);
    const n = g.filter((x) => x.inherited).length;
    console.log(`\n${n} inherited -> ${g.length} active`);
  } else if (cmd === "replay") {
    // Re-run a SAVED transcript's steps (printed, not re-executed) and its final claim through today's gates.
    const r = JSON.parse(await Bun.file(rest[0]).text());
    const gates = await loadGates();
    console.log(`${c.yel}REPLAY${c.off} of a real run by ${r.model} at ${r.at} (${rest[0]}); outputs as recorded, nothing re-executed`);
    for (const s of r.steps) console.log(`${c.dim}heir>${c.off} ${JSON.stringify(s.action)}\n${c.dim}${s.output.split("\n").filter((l: string) => l.trim()).slice(-2).join("\n")}${c.off}`);
    console.log(`${c.dim}heir>${c.off} ${JSON.stringify(r.final)}`);
    const inh = gates.filter((x) => x.inherited), T = () => ({ steps: r.steps, sentBodies: new Set<string>() });
    const b0 = firstBlock(inh, r.final, T());
    console.log(b0 ? `${c.red}BLOCKED${c.off} by inherited gate ${b0.gate.id}` : `${c.yel}PASSED${c.off} the ${inh.length} inherited gates (this is the miss)`);
    const b = firstBlock(gates, r.final, T());
    if (b) console.log(`${c.red}BLOCKED${c.off} [gate ${b.gate.id}, ${b.gate.inherited ? "inherited" : "learned " + b.gate.date}] ${b.reason}`);
    else console.log(`${c.green}PASSED${c.off} all ${gates.length} gates: "${r.final.text}"`);
  } else if (cmd === "finale") {
    const g = await loadGates();
    const creds = (await Bun.file(rest[0] ?? "proof/zero-creds.out").text()).match(/Secrets on VM: (\d+)/)?.[1] ?? "unmeasured";
    console.log(`Secrets on VM:  ${creds} (all calls via Fly connectors)`);
    console.log(`Gates:          ${g.filter((x) => x.inherited).length} inherited -> ${g.length} active (+PR #1 to parent)`);
    console.log(`Model cost:     $${spentUsd().toFixed(2)} / $${CAP_USD.toFixed(2)} client-side cap ($1 limit set at OpenRouter)`);
  } else if (cmd === "ledger") console.log(`Spent: $${spentUsd().toFixed(4)} / $${CAP_USD.toFixed(2)} client-side circuit breaker (all models; rows in ledger.jsonl)`);
  else console.log("usage: heir run <task> [--save t.json] | heir gates | heir replay <t.json> | heir finale [zero-creds.out] | heir ledger | heir learn <replay.json> <correction.txt> <control.json>... | heir activate <id> | heir upstream <id>");
}
