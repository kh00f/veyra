// Subprocess helper. Uses execFile with an args array — never a shell string.
// Every pentest tool goes through here, so command injection via model output
// is structurally impossible.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export interface RunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
  durationMs: number;
}

/** Check whether a binary exists on PATH. */
export async function which(bin: string): Promise<boolean> {
  try {
    await execFileP("which", [bin], { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run a binary with a fixed args array. No shell. Enforces a hard timeout.
 * Returns stdout+stderr and an ok flag — callers should never throw on a
 * non-zero exit; most pentest tools exit non-zero on "no results found".
 */
export async function runBinary(
  bin: string,
  args: string[],
  opts: { timeoutMs?: number; cwd?: string } = {},
): Promise<RunResult> {
  const start = Date.now();
  try {
    const { stdout, stderr } = await execFileP(bin, args, {
      timeout: opts.timeoutMs ?? 60_000,
      cwd: opts.cwd,
      maxBuffer: 32 * 1024 * 1024, // 32 MB — nuclei can be chatty
    });
    return { ok: true, stdout, stderr, code: 0, durationMs: Date.now() - start };
  } catch (e: any) {
    return {
      ok: false,
      stdout: e?.stdout ?? "",
      stderr: e?.stderr ?? e?.message ?? String(e),
      code: typeof e?.code === "number" ? e.code : null,
      durationMs: Date.now() - start,
    };
  }
}

/** Truncate long tool output so it doesn't blow the model's context window. */
export function truncate(s: string, max = 8000): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n…(truncated ${s.length - max} chars)`;
}
