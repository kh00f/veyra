import { register, type Tool } from "./registry.ts";
import { runBinary, truncate, which } from "./subprocess.ts";

export const nuclei: Tool = {
  name: "nuclei",
  safe: false, // sends many requests; the user needs to see this
  scopeRequired: true,
  description:
    "Run nuclei vulnerability templates against a target URL. Defaults to the standard template set. Options: { url, severity?, tags? }",
  params: "{ url, severity?, tags? }",
  activity: (input: any) => `running nuclei against ${input?.url ?? "?"}`,
  run: async (input: any, ctx) => {
    const url = String(input?.url ?? "").trim();
    if (!url) return "error: url is required";

    const check = ctx.scopeCheck(url);
    ctx.audit({ tool: "nuclei", input, allowed: check.allowed, reason: check.reason });
    if (!check.allowed) return `refused: ${check.reason}`;

    if (!(await which("nuclei"))) {
      return "nuclei is not installed. Install: go install -v github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest && nuclei -update-templates";
    }

    const args = ["-u", url, "-silent", "-no-color", "-rate-limit", "30"];
    if (input?.severity) args.push("-severity", String(input.severity));
    if (input?.tags) args.push("-tags", String(input.tags));

    const r = await runBinary("nuclei", args, { timeoutMs: 300_000 });
    if (!r.ok && !r.stdout) return `nuclei failed: ${truncate(r.stderr, 500)}`;
    if (!r.stdout.trim()) return `${url}: no findings from nuclei templates`;
    return truncate(r.stdout.trim(), 8000);
  },
};

register(nuclei);
