// 2026-08-15 · Parent incident: the email sender's success path fell off the end of a try
// block and the caller read "sent". Separately, SMTP accepted mail that later bounced (554)
// and nobody looked for 17 days. Acceptance by the next hop is not the effect.
// Correction: a claim that something was sent/created/delivered must cite a SEPARATE read-back
// of the target (a GET after the POST), not the write call's own response.
import type { Gate } from "../src/types.ts";

export const gate: Gate = {
  id: "03-silent-success",
  date: "2026-08-15",
  incident: "Send path reported success without effect; a 554 bounce sat unread 17 days.",
  inherited: true,
  check(a, t) {
    if (a.kind !== "claim" || !/\b(sent|created|opened|posted|delivered|merged|deployed)\b/i.test(a.text)) return null;
    const lastWrite = t.steps.map((s, i) => ({ s, i })).filter(({ s }) => s.action.kind === "http" && s.action.method !== "GET").pop();
    if (!lastWrite) return "nothing was written, so nothing can have been sent";
    const readBack = t.steps.slice(lastWrite.i + 1).some((s) => s.action.kind === "http" && s.action.method === "GET" && (s.status ?? 0) < 400);
    if (!readBack) return "read the target back with a separate GET before claiming the effect";
    return null;
  },
};
