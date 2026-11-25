import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Action, Gate, Transcript } from "./types.ts";

const ROOT = join(import.meta.dir, "..");

// gates/        = inherited from the parent (what main of the parent repo holds)
// gates/local/  = learned by THIS heir, active here only; upstream needs a merged PR
export async function loadGates(): Promise<Gate[]> {
  const out: Gate[] = [];
  for (const dir of ["gates", "gates/local"]) {
    const d = join(ROOT, dir);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d).filter((f) => /^\d\d-.*\.ts$/.test(f) && !f.endsWith(".test.ts")).sort()) {
      const m = await import(join(d, f));
      if (!m.gate?.check) throw new Error(`${dir}/${f} exports no gate`);
      // Provenance comes from WHERE the file sits, not from what the file says about itself:
      // gates/ = merged into the parent (inherited), gates/local/ = learned here, not yet upstream.
      out.push({ ...m.gate, inherited: dir === "gates" });
    }
  }
  if (out.length === 0) throw new Error("0 gates loaded: refusing to run ungated"); // gate 01 applied to ourselves
  return out;
}

export function firstBlock(gates: Gate[], a: Action, t: Transcript): { gate: Gate; reason: string } | null {
  for (const g of gates) {
    const reason = g.check(a, t);
    if (reason) return { gate: g, reason };
  }
  return null;
}
