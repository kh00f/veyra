import { register, type Tool } from "./registry.ts";
import { runBinary, truncate, which } from "./subprocess.ts";

export const dirsearch: Tool = {
  name: "dirsearch",
  safe: false,
  scopeRequired: true,
  description:
    "Brute-force URL paths with dirsearch (Python). Discovers hidden endpoints, backups, config files. Rate-limited. Params: { url, extensions?, recursive? }",
  params: "{ url, extensions?, recursive? }",
  activity: (input: any) => `running dirsearch against ${input?.url ?? "?"}`,
  run: async (input: any, ctx) => {
    const url = String(input?.url ?? "").trim();
    if (!url) return "error: url is required";

    const check = ctx.scopeCheck(url);
    ctx.audit({ tool: "dirsearch", input, allowed: check.allowed, reason: check.reason });
    if (!check.allowed) return `refused: ${check.reason}`;

    if (!(await which("dirsearch"))) {
      return "dirsearch is not installed. Install: pipx install dirsearch   (or: pip install dirsearch)";
    }

    // Conservative defaults: small wordlist, low threads, quiet output.
    // dirsearch also has a built-in --exclude-status for noise reduction.
    const args = [
      "-u", url,
      "--format=plain",
      "--quiet",
      "--threads=10",
      "--max-time=180",
      "--exclude-status=404",
    ];
    if (input?.extensions) {
      args.push(`--extensions=${String(input.extensions)}`);
    }
    if (input?.recursive) {
      args.push("-r", "--recursion-depth=2");
    }

    const r = await runBinary("dirsearch", args, { timeoutMs: 240_000 });
    if (!r.ok && !r.stdout) return `dirsearch failed: ${truncate(r.stderr, 500)}`;
    if (!r.stdout.trim()) return `${url}: no paths found`;
    return truncate(r.stdout.trim(), 6000);
  },
};

register(dirsearch);
