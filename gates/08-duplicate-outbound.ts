// 2026-06-18 · Parent incident: an idle session sent a reply that an earlier session had
// already sent to the same person. The check ran when the task was picked, not when the
// message left.
// Correction: reserve each outbound body (hash) at send time; the same body twice is blocked.
import { createHash } from "node:crypto";
import type { Gate } from "../src/types.ts";

export const hashBody = (path: string, body: unknown) => createHash("sha256").update(path + "\n" + JSON.stringify(body ?? null)).digest("hex");

export const gate: Gate = {
  id: "08-duplicate-outbound",
  date: "2026-06-18",
  incident: "The same reply went out twice; the dedupe ran at pick time, not send time.",
  inherited: true,
  check(a, t) {
    if (a.kind !== "http" || a.method.toUpperCase() !== "POST") return null;
    const h = hashBody(a.path, a.body);
    if (t.sentBodies.has(h)) return "this exact body was already sent to this endpoint in this run";
    return null;
  },
};
