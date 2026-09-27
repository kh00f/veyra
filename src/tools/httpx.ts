import { register, type Tool } from "./registry.ts";
import { runBinary, truncate, which } from "./subprocess.ts";

export const httpx: Tool = {
  name: "httpx",
  safe: true,
  scopeRequired: true,
  description:
    "Probe HTTP endpoints using httpx: status, title, technologies, headers. Input is a URL or hostname; also accepts a list from stdin-style comma-separated hosts.",
  params: "{ target, tech?, title?, status? }",
  activity: (input: any) => `probing ${input?.target ?? "?"}`,
  run: async (input: any, ctx) => {
    const target = String(input?.target ?? "").trim();
    if (!target) return "error: target is required";

    const check = ctx.scopeCheck(target);
    ctx.audit({ tool: "httpx", input, allowed: check.allowed, reason: check.reason });
    if (!check.allowed) return `refused: ${check.reason}`;

    if (!(await which("httpx"))) {
      return "httpx is not installed. Install: go install -v github.com/projectdiscovery/httpx/cmd/httpx@latest";
    }

    const args = ["-silent", "-u", target];
    if (input?.tech) args.push("-tech-detect");
    if (input?.title) args.push("-title");
    if (input?.status) args.push("-status-code");
    // Default output is useful; ensure we get something even without flags.
    if (!input?.tech && !input?.title && !input?.status) args.push("-status-code", "-title", "-tech-detect");

    const r = await runBinary("httpx", args, { timeoutMs: 60_000 });
    if (!r.ok && !r.stdout) return `httpx failed: ${truncate(r.stderr, 500)}`;
    if (!r.stdout.trim()) return `${target}: no HTTP response`;
    return truncate(r.stdout.trim(), 6000);
  },
};

register(httpx);
