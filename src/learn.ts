// The learn loop. A correction arrives with a REAL failing transcript (replay) and a REAL
// honest transcript (control). The heir must:
//   1. show the defect is live: its current gates let the replay's final claim through (RED)
//   2. draft a gate (the heir's own model writes the code)
//   3. prove the draft: replay BLOCKED, control PASSES, plain actions untouched (GREEN)
//   4. wait for an approval bound to the exact bytes it drafted (sha256), then activate LOCALLY
//   5. upstream: open a PR to the parent repo through the GitHub connector and read it back.
// Future heirs inherit the gate only after the parent merges that PR.
import { mkdirSync, existsSync, readFileSync, renameSync, writeFileSync, copyFileSync } from "node:fs";
import { join, basename } from "node:path";
import { createHash } from "node:crypto";
import { loadGates, firstBlock } from "./gates.ts";
import { chat, github, DRAFT_MODEL } from "./connectors.ts";
import type { Action, Gate, Transcript } from "./types.ts";

const ROOT = join(import.meta.dir, "..");
const DRAFT = join(ROOT, "gates", "draft");
const LOCAL = join(ROOT, "gates", "local");
const APPROVALS = join(ROOT, "approvals");
const c = { dim: "\x1b[2m", red: "\x1b[31m", green: "\x1b[32m", yel: "\x1b[33m", off: "\x1b[0m" };

interface Replay { task: string; model?: string; at?: string; steps: Transcript["steps"]; final: Action }
const load = (p: string): Replay => JSON.parse(readFileSync(p, "utf8"));
const T = (r: Replay): Transcript => ({ steps: r.steps, sentBodies: new Set() });
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export interface Verdict { replayBlocked: string | null; controlBlocked: string | null; plainBlocked: string | null }
export function judge(g: Gate, replay: Replay, controls: Replay[]): Verdict {
  return {
    replayBlocked: g.check(replay.final, T(replay)),
    controlBlocked: controls.map((c) => { const r = g.check(c.final, T(c)); return r && `"${(c.final as any).text}" -> ${r}`; }).find((x) => x) ?? null,
    plainBlocked: g.check({ kind: "shell", cmd: "ls -la" }, { steps: [], sentBodies: new Set() }),
  };
}
export const passes = (v: Verdict) => v.replayBlocked !== null && v.controlBlocked === null && v.plainBlocked === null;

const PROMPT = (correction: string, replay: Replay, controls: Replay[], example: string) => `You write safety gates for an agent. A gate is a TypeScript module that inspects a proposed action BEFORE it runs and returns null (allow) or a short reason string (block).

Types (import from "../../src/types.ts"):
export type Action =
  | { kind: "shell"; cmd: string }
  | { kind: "http"; method: string; path: string; body?: unknown; expect?: string }
  | { kind: "claim"; text: string; evidence?: string; parsed?: number; rows?: number };
export interface Transcript { steps: { action: Action; output: string; status?: number }[]; sentBodies: Set<string> }
export interface Gate { id: string; date: string; incident: string; inherited: boolean; check(a: Action, t: Transcript): string | null }
Shell step outputs end with "[exit N]".

An existing gate, for style:
\`\`\`ts
${example}
\`\`\`

CORRECTION from the supervisor:
${correction}

FAILING transcript (must be BLOCKED at its final claim):
${JSON.stringify({ steps: replay.steps, final: replay.final }, null, 1).slice(0, 3000)}

HONEST transcripts (each final claim must PASS):
${controls.map((c) => JSON.stringify({ steps: c.steps, final: c.final }, null, 1).slice(0, 2000)).join("\n\n")}

Write gate id "10-<short-kebab-name>", date "${new Date().toISOString().slice(0, 10)}", inherited false, a one-line incident, and a header comment. Only claims should be judged; every other action returns null. Do not match on the exact wording of the failing claim; capture the CLASS (any "none / no X / nothing / 0 found" style claim). Reply with ONE \`\`\`ts code block and nothing else.`;

export async function learn(replayPath: string, correctionPath: string, ...controlPaths: string[]) {
  const attempts = Number(process.env.HEIR_DRAFT_ATTEMPTS ?? 4);
  if (controlPaths.length === 0) throw new Error("need at least one honest control transcript");
  const replay = load(replayPath), controls = controlPaths.map(load);
  const correction = readFileSync(correctionPath, "utf8").trim();
  const gates = await loadGates();
  console.log(`${c.dim}correction:${c.off} ${correction}\n`);

  // 1. RED: is the defect live against what this heir runs today?
  const live = firstBlock(gates, replay.final, T(replay));
  if (live) { console.log(`already covered by gate ${live.gate.id}: ${live.reason}`); return; }
  console.log(`${c.red}RED${c.off}   ${gates.length} active gates let the replayed claim through: "${(replay.final as any).text}"`);
  console.log(`${c.dim}      (replay of a real run by ${replay.model ?? "?"} at ${replay.at ?? "?"}: ${replayPath})${c.off}`);

  // 2-3. Draft until both arms hold, or give up.
  mkdirSync(DRAFT, { recursive: true });
  const example = readFileSync(join(ROOT, "gates", "01-all-clear-over-nothing.ts"), "utf8");
  const msgs = [{ role: "user", content: PROMPT(correction, replay, controls, example) }];
  console.log(`${c.dim}drafting with ${DRAFT_MODEL}${c.off}`);
  for (let i = 1; i <= attempts; i++) {
    const reply = await chat(msgs, DRAFT_MODEL);
    msgs.push({ role: "assistant", content: reply });
    const retry = (why: string) => msgs.push({ role: "user", content: `That draft failed: ${why}. Fix it. Reply with one \`\`\`ts block.` });
    const code = (reply.match(/```(?:ts|typescript)?\n([\s\S]*?)```/) ?? [, reply])[1]!.replace(/\.\.\/src\/types\.ts/g, "../../src/types.ts");
    const tmp = join(DRAFT, `attempt-${Date.now()}-${i}.ts`);
    writeFileSync(tmp, code);
    let g: Gate | undefined;
    try { g = (await import(tmp)).gate; } catch (e) { console.log(`${c.yel}draft ${i}${c.off} does not load: ${String(e).slice(0, 120)}`); retry(`it does not load: ${String(e).slice(0, 200)}`); continue; }
    if (!g?.check || !/^10-[a-z0-9-]+$/.test(g.id)) { console.log(`${c.yel}draft ${i}${c.off} exports no valid gate`); retry("it must export `gate` with id 10-<kebab-name> and a check function"); continue; }
    const v = judge(g, replay, controls);
    console.log(`draft ${i} ${g.id}: replay ${v.replayBlocked ? "BLOCKED" : "passes"} · control ${v.controlBlocked ? "BLOCKED" : "passes"} · plain action ${v.plainBlocked ? "BLOCKED" : "passes"}`);
    if (!passes(v)) {
      retry([!v.replayBlocked && `the failing transcript's final claim ("${(replay.final as any).text}") was NOT blocked; trace your check() by hand over its steps`, v.controlBlocked && `an honest transcript was blocked ("${v.controlBlocked}")`, v.plainBlocked && "a plain shell action was blocked"].filter(Boolean).join("; "));
      continue;
    }
    const file = join(DRAFT, `${g.id}.ts`);
    renameSync(tmp, file);
    writeFileSync(join(DRAFT, `${g.id}.json`), JSON.stringify({ replay: replayPath, controls: controlPaths, correction }, null, 2));
    console.log(`${c.green}GREEN${c.off} replay blocked: "${v.replayBlocked}"`);
    console.log(`\nDrafted, NOT active. Approval must name this sha256:\n  ${sha(readFileSync(file, "utf8"))}  gates/draft/${g.id}.ts`);
    return;
  }
  console.log(`${c.yel}no draft held both arms after ${attempts} attempts; nothing activated${c.off}`);
}

// An approval is a file someone with authority writes: {sha256, approver, via, at}. It binds to the
// exact drafted bytes; editing the draft after approval voids it.
export async function activate(id: string) {
  const file = join(DRAFT, `${id}.ts`);
  if (!existsSync(file)) throw new Error(`no draft ${id}`);
  const ap = join(APPROVALS, `${id}.json`);
  if (!existsSync(ap)) { console.log(`${c.yel}WAITING${c.off} for approvals/${id}.json`); return; }
  const a = JSON.parse(readFileSync(ap, "utf8"));
  if (a.sha256 !== sha(readFileSync(file, "utf8"))) { console.log(`${c.red}REFUSED${c.off} approval sha does not match the draft`); return; }
  const meta = JSON.parse(readFileSync(join(DRAFT, `${id}.json`), "utf8"));
  const g: Gate = (await import(file)).gate;
  const v = judge(g, load(meta.replay), meta.controls.map(load)); // re-run both arms at activation, not just at draft time
  if (!passes(v)) { console.log(`${c.red}REFUSED${c.off} draft no longer holds both arms`); return; }
  mkdirSync(LOCAL, { recursive: true });
  copyFileSync(file, join(LOCAL, `${id}.ts`));
  writeFileSync(join(LOCAL, `${id}.json`), JSON.stringify({ ...meta, approval: a }, null, 2));
  const n = (await loadGates()).length;
  console.log(`${c.green}ACTIVE${c.off} ${id} in gates/local/ (approved by ${a.approver} via ${a.via}) · ${n} gates active`);
}

// PR to the parent repo through the GitHub connector. Every write is followed by a read-back.
export async function upstream(id: string, repo = "piiiico/heir") {
  const src = join(LOCAL, `${id}.ts`);
  if (!existsSync(src)) throw new Error(`${id} is not active locally`);
  const meta = JSON.parse(readFileSync(join(LOCAL, `${id}.json`), "utf8"));
  const R = `/repos/${repo}`;
  const must = async (m: string, p: string, b?: unknown, ok = [200, 201]) => {
    const r = await github(m, p, b);
    console.log(`${c.dim}${m} ${p} -> ${r.status}${c.off}`);
    if (!ok.includes(r.status)) throw new Error(`${m} ${p} ${r.status}: ${r.text.slice(0, 200)}`);
    return JSON.parse(r.text);
  };
  const main = await must("GET", `${R}/git/ref/heads/main`);
  const branch = `heir/${id}-${Date.now().toString(36)}`;
  await must("POST", `${R}/git/refs`, { ref: `refs/heads/${branch}`, sha: main.object.sha });
  // The PR copy sits one directory higher, so its import path (and therefore its hash) differs from the
  // approved local file. The approval names both, so a reader can hash the PR file and still check it.
  const up = readFileSync(src, "utf8").replace(/\.\.\/\.\.\/src\/types\.ts/g, "../src/types.ts");
  const approval = { ...meta.approval, upstream_sha256: sha(up), upstream_note: "sha256 = the approved file in gates/local/; upstream_sha256 = this PR's copy, whose import path is rewritten from ../../src/types.ts to ../src/types.ts" };
  const files: [string, string][] = [
    [`gates/${id}.ts`, up],
    [`replays/${basename(meta.replay)}`, readFileSync(meta.replay, "utf8")],
    ...meta.controls.map((p: string): [string, string] => [`replays/${basename(p)}`, readFileSync(p, "utf8")]),
    [`approvals/${id}.json`, JSON.stringify(approval, null, 2)],
  ];
  for (const [path, text] of files)
    await must("PUT", `${R}/contents/${path}`, { message: `heir: learned gate ${id}`, branch, content: Buffer.from(text).toString("base64") });
  const body = [
    `A heir learned this gate while running. It is active in that heir only; heirs started from main inherit it after this merges.`,
    ``, `**Correction:** ${meta.correction}`, ``,
    `**Evidence:** \`replays/${basename(meta.replay)}\` is a real transcript whose final claim passed all inherited gates. The gate blocks it and lets ${meta.controls.map((p: string) => `\`replays/${basename(p)}\``).join(", ")} (honest runs) through.`,
    ``, `**Local approval:** ${meta.approval.approver} via ${meta.approval.via}, sha256 \`${approval.sha256}\` (this PR's copy: \`${approval.upstream_sha256}\`, import path rewritten).`,
    ``, `Opened by heir (AI agent) through a Fly Sprites connector; the heir holds no GitHub token.`,
  ].join("\n");
  const pr = await must("POST", `${R}/pulls`, { title: `Learned gate ${id}`, head: branch, base: "main", body });
  // Gate 03, applied to ourselves: the POST's own response is not the effect.
  const back = await must("GET", `${R}/pulls/${pr.number}`);
  const got = await must("GET", `${R}/pulls/${pr.number}/files`);
  console.log(`${c.green}PR #${back.number}${c.off} ${back.state} · ${got.length} files · ${back.html_url}`);
}
