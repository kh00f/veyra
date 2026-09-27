import { register, type Tool } from "./registry.ts";
import { runBinary, truncate, which } from "./subprocess.ts";
import { existsSync } from "node:fs";

const DEFAULT_WORDLIST = "/usr/share/seclists/Discovery/Web-Content/common.txt";

export const ffuf: Tool = {
  name: "ffuf",
  safe: false,
  scopeRequired: true,
  description:
    "Fuzz URL paths with ffuf. Only runs a small, local wordlist at rate-limit 20. Params: { url_with_FUZZ, wordlist? }",
  params: "{ url_with_FUZZ, wordlist? }",
  activity: (input: any) => `fuzzing ${input?.url_with_FUZZ ?? "?"}`,
  run: async (input: any, ctx) => {
    const url = String(input?.url_with_FUZZ ?? "").trim();
    if (!url) return "error: url_with_FUZZ is required (must contain the literal FUZZ)";
    if (!url.includes("FUZZ")) return "error: url must contain the literal FUZZ marker";

    const check = ctx.scopeCheck(url);
    ctx.audit({ tool: "ffuf", input, allowed: check.allowed, reason: check.reason });
    if (!check.allowed) return `refused: ${check.reason}`;

    if (!(await which("ffuf"))) {
      return "ffuf is not installed. Install: go install github.com/ffuf/ffuf/v2@latest";
    }

    const wordlist = String(input?.wordlist ?? DEFAULT_WORDLIST);
    if (!existsSync(wordlist)) {
      return `wordlist not found: ${wordlist}\nInstall SecLists: sudo apt install seclists`;
    }

    const args = [
      "-u", url,
      "-w", wordlist,
      "-rate", "20",
      "-t", "10",
      "-mc", "200,204,301,302,307,401,403",
      "-s", // silent
    ];

    const r = await runBinary("ffuf", args, { timeoutMs: 300_000 });
    if (!r.ok && !r.stdout) return `ffuf failed: ${truncate(r.stderr, 500)}`;
    if (!r.stdout.trim()) return `${url}: no paths matched`;
    return truncate(r.stdout.trim(), 6000);
  },
};

register(ffuf);
