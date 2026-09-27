import { register, type Tool } from "./registry.ts";
import { hostOf } from "../safety/scope.ts";
import { runBinary, truncate, which } from "./subprocess.ts";

export const nmap: Tool = {
  name: "nmap",
  safe: false, // writes packets; user should see this is happening
  scopeRequired: true,
  description:
    "Port-scan a host with nmap. Default: TCP connect scan on top-1000 ports, no scripts. Options: { host, ports?, intensity?: 'connect'|'version' }",
  params: "{ host, ports?, intensity? }",
  activity: (input: any) => `scanning ports on ${input?.host ?? "?"}`,
  run: async (input: any, ctx) => {
    const target = String(input?.host ?? "").trim();
    if (!target) return "error: host is required";

    const check = ctx.scopeCheck(target);
    ctx.audit({ tool: "nmap", input, allowed: check.allowed, reason: check.reason });
    if (!check.allowed) return `refused: ${check.reason}`;

    if (!(await which("nmap"))) {
      return "nmap is not installed. Install: sudo apt install nmap  (or brew install nmap)";
    }

    const host = hostOf(target);
    if (!host) return `error: cannot parse host from "${target}"`;

    // -sT = TCP connect (no root needed). -Pn = skip host discovery (we already know it's up).
    // No scripts, no OS detection, no aggressive timing. These are the safe defaults.
    const args = ["-sT", "-Pn", "-T3", "--top-ports", "1000", host];
    if (input?.ports) {
      args.splice(args.indexOf("--top-ports"), 2, "-p", String(input.ports));
    }
    if (input?.intensity === "version") {
      args.push("-sV", "--version-intensity", "2");
    }

    const r = await runBinary("nmap", args, { timeoutMs: 300_000 });
    if (!r.ok && !r.stdout) return `nmap failed: ${truncate(r.stderr, 500)}`;
    return truncate(r.stdout.trim(), 8000);
  },
};

register(nmap);
