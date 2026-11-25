// 2026-08-19 · Parent incident: told to delete "task <id>", the parent checked that the id
// existed. It did — but it was a different, live task. The real target was found by content.
// Correction: before a destructive call on an id, the fetched object must MATCH the
// description (action.expect), not merely exist.
import type { Gate } from "../src/types.ts";

const DESTRUCTIVE = /^(DELETE)$/i;
const CLOSING = /"state"\s*:\s*"closed"/;

export const gate: Gate = {
  id: "04-existence-is-not-identity",
  date: "2026-08-19",
  incident: "A destructive instruction named an id that existed but was a different object.",
  inherited: true,
  check(a, t) {
    if (a.kind !== "http") return null;
    const destructive = DESTRUCTIVE.test(a.method) || (a.method.toUpperCase() === "PATCH" && CLOSING.test(JSON.stringify(a.body ?? {})));
    if (!destructive) return null;
    if (!a.expect) return "destructive call without `expect`: say what the object must contain";
    const fetched = t.steps.find((s) => s.action.kind === "http" && s.action.method === "GET" && s.action.path === a.path);
    if (!fetched) return `GET ${a.path} first and check it is the object you mean`;
    if (!fetched.output.includes(a.expect)) return `the object at ${a.path} does not contain "${a.expect}": it exists, but it is not the one described`;
    return null;
  },
};
