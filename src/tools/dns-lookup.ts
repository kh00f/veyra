// dns_lookup — resolve A, AAAA, MX, TXT, NS, CNAME for a hostname.
// Pure Node dns/promises: works on every machine, no external binary.

import { promises as dns } from "node:dns";
import { register, type Tool } from "./registry.ts";

const TYPES = ["A", "AAAA", "MX", "TXT", "NS", "CNAME"] as const;
type DnsType = (typeof TYPES)[number];

export const dnsLookup: Tool = {
  name: "dns_lookup",
  safe: true,
  scopeRequired: true,
  description: "Resolve DNS records for a hostname. Returns A, AAAA, MX, TXT, NS, and CNAME records.",
  params: "{ host }",
  activity: (input: any) => `resolving DNS for ${input?.host ?? "?"}`,
  run: async (input: any, ctx) => {
    const host = String(input?.host ?? "").trim();
    if (!host) return "error: host is required";

    const check = ctx.scopeCheck(host);
    ctx.audit({ tool: "dns_lookup", input, allowed: check.allowed, reason: check.reason });
    if (!check.allowed) return `refused: ${check.reason}`;

    const results: Record<string, string[] | string> = {};
    for (const type of TYPES) {
      try {
        let records: any;
        switch (type) {
          case "A": records = await dns.resolve4(host); break;
          case "AAAA": records = await dns.resolve6(host); break;
          case "MX": records = (await dns.resolveMx(host)).map((m: any) => `${m.priority} ${m.exchange}`); break;
          case "TXT": records = (await dns.resolveTxt(host)).map((chunks: string[]) => chunks.join("")); break;
          case "NS": records = await dns.resolveNs(host); break;
          case "CNAME": records = await dns.resolveCname(host); break;
        }
        if (records && records.length > 0) results[type] = records;
      } catch {
        // record type not present — skip silently, that's normal
      }
    }

    if (Object.keys(results).length === 0) return `${host}: no DNS records found`;
    const lines = Object.entries(results).map(([type, recs]) =>
      `${type}:\n` + (recs as string[]).map((r) => `  ${r}`).join("\n"),
    );
    return `${host}\n\n${lines.join("\n\n")}`;
  },
};

register(dnsLookup);
