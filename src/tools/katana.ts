import { register, type Tool } from "./registry.ts";
import { runBinary, truncate, which } from "./subprocess.ts";

export const katana: Tool = {
  name: "katana",
  safe: false,
  scopeRequired: true,
  description:
    "Crawl a target URL with katana and return discovered URLs. Depth 2, rate-limited. Params: { url, depth? }",
  params: "{ url, depth? }",
  activity: (input: any) => `crawling ${input?.url ?? "?"}`,
  run: async (input: any, ctx) => {
    const url = String(input?.url ?? "").trim();
    if (!url) return "error: url is required";

    const check = ctx.scopeCheck(url);
    ctx.audit({ tool: "katana", input, allowed: check.allowed, reason: check.reason });
    if (!check.allowed) return `refused: ${check.reason}`;

    if (!(await which("katana"))) {
      return "katana is not installed. Install: go install github.com/projectdiscovery/katana/cmd/katana@latest";
    }

    const depth = Number(input?.depth ?? 2);
    const args = [
      "-u", url,
      "-d", String(depth),
      "-silent",
      "-rl", "30",       // rate limit 30/s
      "-c", "10",        // concurrency 10
      "-nc",             // no color
    ];

    const r = await runBinary("katana", args, { timeoutMs: 180_000 });
    if (!r.ok && !r.stdout) return `katana failed: ${truncate(r.stderr, 500)}`;
    if (!r.stdout.trim()) return `${url}: no URLs discovered`;
    return truncate(r.stdout.trim(), 8000);
  },
};

register(katana);
