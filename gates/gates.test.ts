// Each inherited gate: the parent's original failing input must be BLOCKED, the corrected
// input must PASS. Both arms, or the gate is untested.
import { test, expect } from "bun:test";
import { loadGates } from "../src/gates.ts";
import { hashBody } from "./08-duplicate-outbound.ts";
import type { Action, Transcript } from "../src/types.ts";

const gates = await loadGates();
const g = (id: string) => gates.find((x) => x.id.startsWith(id))!;
const T = (steps: Transcript["steps"] = [], sent: string[] = []): Transcript => ({ steps, sentBodies: new Set(sent) });
const blocked = (id: string, a: Action, t = T()) => g(id).check(a, t) !== null;

test("9 inherited gates load, each with a date and an incident", () => {
  const inh = gates.filter((x) => x.inherited);
  expect(inh.length).toBe(9);
  for (const x of inh) { expect(x.date).toMatch(/^2026-\d\d-\d\d$/); expect(x.incident.length).toBeGreaterThan(20); }
});

test("01 all clear over nothing", () => {
  expect(blocked("01", { kind: "claim", text: "All clear, no issues found", parsed: 0 })).toBe(true);
  expect(blocked("01", { kind: "claim", text: "All clear, no issues found" })).toBe(true);
  expect(blocked("01", { kind: "claim", text: "All clear, no issues found", parsed: 97 })).toBe(false);
});

test("02 lying suite", () => {
  expect(blocked("02", { kind: "claim", text: "tests pass", evidence: "[exit 0]" })).toBe(true);
  expect(blocked("02", { kind: "claim", text: "tests pass", evidence: " 40 pass\n 12 fail" })).toBe(true);
  expect(blocked("02", { kind: "claim", text: "tests pass", evidence: " 52 pass\n 0 fail" })).toBe(false);
});

test("03 silent success", () => {
  const post = { action: { kind: "http", method: "POST", path: "/repos/piiiico/heir/issues" } as Action, output: "{}", status: 201 };
  const get = { action: { kind: "http", method: "GET", path: "/repos/piiiico/heir/issues/1" } as Action, output: "{}", status: 200 };
  expect(blocked("03", { kind: "claim", text: "issue created" }, T([post]))).toBe(true);
  expect(blocked("03", { kind: "claim", text: "issue created" }, T([post, get]))).toBe(false);
});

test("04 existence is not identity", () => {
  const del: Action = { kind: "http", method: "DELETE", path: "/repos/piiiico/heir/git/refs/heads/x", expect: "stale-demo" };
  const fetched = (out: string) => ({ action: { kind: "http", method: "GET", path: del.path } as Action, output: out, status: 200 });
  expect(blocked("04", del)).toBe(true);
  expect(blocked("04", del, T([fetched('{"ref":"refs/heads/x","note":"live work"}')]))).toBe(true);
  expect(blocked("04", del, T([fetched('{"ref":"refs/heads/x","note":"stale-demo"}')]))).toBe(false);
});

test("05 grep -c masks failure", () => {
  expect(blocked("05", { kind: "shell", cmd: "grep -r TODO src | grep -c ." })).toBe(true);
  expect(blocked("05", { kind: "shell", cmd: "cat missing.log | wc -l" })).toBe(true);
  expect(blocked("05", { kind: "shell", cmd: "set -o pipefail; grep -r TODO src | wc -l" })).toBe(false);
  expect(blocked("05", { kind: "shell", cmd: "grep -rc TODO src" })).toBe(false); // no pipe: grep's own exit stands
});

test("06 NaN threshold", () => {
  expect(blocked("06", { kind: "http", method: "POST", path: "/x", body: { min_runs: "money/panel.json" } })).toBe(true);
  expect(blocked("06", { kind: "http", method: "POST", path: "/x", body: { min_runs: 9 } })).toBe(false);
});

test("07 completed over zero rows", () => {
  expect(blocked("07", { kind: "claim", text: "approved, completed", rows: 0 })).toBe(true);
  const failedWrite = { action: { kind: "http", method: "PATCH", path: "/x" } as Action, output: "Not Found", status: 404 };
  expect(blocked("07", { kind: "claim", text: "updated" }, T([failedWrite]))).toBe(true);
  expect(blocked("07", { kind: "claim", text: "updated", rows: 1 })).toBe(false);
});

test("08 duplicate outbound", () => {
  const a: Action = { kind: "http", method: "POST", path: "/repos/piiiico/heir/issues/1/comments", body: { body: "hi" } };
  expect(blocked("08", a, T([], [hashBody(a.path, (a as any).body)]))).toBe(true);
  expect(blocked("08", a)).toBe(false);
});

test("09 ephemeral paths", () => {
  expect(blocked("09", { kind: "http", method: "POST", path: "/x", body: { body: "full log at /tmp/run-42.log" } })).toBe(true);
  expect(blocked("09", { kind: "claim", text: "report saved to tmp/report.md" })).toBe(true);
  expect(blocked("09", { kind: "http", method: "POST", path: "/x", body: { body: "full log in ledger.jsonl" } })).toBe(false);
});
