// ransomlook_search — search ransomlook.io for a keyword (domain, company,
// email, group name). Public read-only endpoint. No findings, no scope check.

import { register, type Tool } from "./registry.ts";

const BASE = "https://www.ransomlook.io/api";
const UA = "VEYRA/0.1 (authorized-security-research)";

interface Post {
  post_title: string;
  discovered: string;
  description: string;
  link: string | null;
  magnet: string | null;
  screen: string | null;
  private: boolean;
  misp_uuid: string;
  group_name: string;
}

interface Leak {
  size: string;
  records: string;
  columns: string[];
  name: string;
  indexed: string;
  meta: string;
  location: string[];
  key: string;
}

interface Group {
  name?: string;
  [k: string]: any;
}

interface SearchResponse {
  groups: Group[];
  markets: any[];
  posts: Post[];
  leaks: Leak[];
  notes: any[];
}

export const ransomlookSearch: Tool = {
  name: "ransomlook_search",
  safe: true,
  scopeRequired: false,
  description:
    "Search ransomlook.io for a keyword — a company domain (att.com), a company name, an email, " +
    "or a ransomware group name. Returns ransomware posts and leak entries that match. " +
    "Use this when the user asks 'was X breached', 'is X on a ransomware site', 'has X been leaked', " +
    "or when you are checking a target's domain for prior compromises. " +
    "Params: { query }",
  params: "{ query }",
  activity: (input: any) => `searching ransomlook for "${input?.query ?? "?"}"`,
  run: async (input: any) => {
    const q = String(input?.query ?? "").trim();
    if (!q) return "error: query is required";

    const url = `${BASE}/search?q=${encodeURIComponent(q)}`;
    let data: SearchResponse;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) return `ransomlook /api/search returned HTTP ${res.status}`;
      data = (await res.json()) as SearchResponse;
    } catch (e: any) {
      const cause = e?.cause?.code ?? e?.cause?.message ?? "";
      return `ranslook request failed: ${e?.message ?? e}${cause ? ` (${cause})` : ""}`;
    }

    const groups = data?.groups ?? [];
    const posts = data?.posts ?? [];
    const leaks = data?.leaks ?? [];
    const markets = data?.markets ?? [];

    if (groups.length + posts.length + leaks.length + markets.length === 0) {
      return `no results for "${q}" in ransomlook`;
    }

    const lines: string[] = [`Results for "${q}"`, ""];

    if (posts.length) {
      lines.push(`RANSOMWARE POSTS (${posts.length})`);
      for (const p of posts) {
        lines.push(`  [${p.group_name}] ${p.post_title}`);
        lines.push(`    discovered: ${p.discovered}`);
        if (p.description) lines.push(`    ${p.description.slice(0, 160)}`);
        lines.push(`    uuid: ${p.misp_uuid}`);
        lines.push("");
      }
    }

    if (leaks.length) {
      lines.push(`LEAKS (${leaks.length})`);
      for (const l of leaks) {
        lines.push(`  ${l.name}`);
        lines.push(`    size: ${l.size}    records: ${l.records}    indexed: ${l.indexed}`);
        if (l.columns?.length) {
          lines.push(`    columns: ${l.columns.join(", ")}`);
        }
        lines.push("");
      }
    }

    if (groups.length) {
      lines.push(`GROUPS (${groups.length})`);
      for (const g of groups) {
        lines.push(`  ${g.name ?? JSON.stringify(g).slice(0, 80)}`);
      }
      lines.push("");
    }

    if (markets.length) {
      lines.push(`MARKETS (${markets.length})`);
      for (const m of markets) {
        lines.push(`  ${JSON.stringify(m).slice(0, 120)}`);
      }
      lines.push("");
    }

    return lines.join("\n").trim();
  },
};

register(ransomlookSearch);
