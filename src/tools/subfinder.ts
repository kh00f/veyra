import { register, type Tool } from "./registry.ts";
import { runBinary, truncate, which } from "./subprocess.ts";

export const subfinder: Tool = {
  name: "subfinder",
  safe: true,
  scopeRequired: true,
  description:
    "Enumerate subdomains for a domain using subfinder (passive sources). Returns one subdomain per line.",
  params: "{ domain }",
  activity: (input: any) => `enumerating subdomains for ${input?.domain ?? "?"}`,
  run: async (input: any, ctx) => {
    const domain = String(input?.domain ?? "").trim();
    if (!domain) return "error: domain is required";

    const check = ctx.scopeCheck(domain);
    ctx.audit({ tool: "subfinder", input, allowed: check.allowed, reason: check.reason });
    if (!check.allowed) return `refused: ${check.reason}`;

    if (!(await which("subfinder"))) {
      return "subfinder is not installed. Install: go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest";
    }

    const r = await runBinary("subfinder", ["-d", domain, "-silent"], { timeoutMs: 120_000 });
    if (!r.ok && !r.stdout) return `subfinder failed: ${truncate(r.stderr, 500)}`;
    if (!r.stdout.trim()) return `${domain}: no subdomains found`;
    return truncate(r.stdout.trim(), 6000);
  },
};

register(subfinder);
