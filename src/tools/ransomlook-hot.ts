// ransomlook_hot — recent ransomware activity from ransomlook.io.
// Public read-only endpoint. No findings, no writes, no scope check.

import { register, type Tool } from "./registry.ts";

const BASE = "https://www.ransomlook.io/api";
const UA = "VEYRA/0.1 (authorized-security-research)";

interface HotRow {
  group: string;
  count: number;
  last_post: string;
}

interface HotResponse {
  days: number;
  from_date: string;
  total_posts: number;
  rows: HotRow[];
}

export const ransomlookHot: Tool = {
  name: "ransomlook_hot",
  safe: true,
  scopeRequired: false,
  description:
    "Show recent ransomware activity — the groups posting the most victims in the last N days. " +
    "Use this when the user asks 'what ransomware groups are active', 'recent ransomware activity', " +
    "'what's hot in ransomware', or wants situational awareness before hunting or defending. " +
    "Params: { days? } (default 7, API supports up to 30).",
  params: "{ days? }",
  activity: (input: any) =>
    `checking recent ransomware activity${input?.days ? ` (${input.days}d)` : ""}`,
  run: async (input: any) => {
    const days = Number(input?.days ?? 7);
    const url = `${BASE}/hot${days !== 7 ? `?days=${encodeURIComponent(String(days))}` : ""}`;

    let data: HotResponse;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) return `ransomlook /api/hot returned HTTP ${res.status}`;
      data = (await res.json()) as HotResponse;
    } catch (e: any) {
      const cause = e?.cause?.code ?? e?.cause?.message ?? "";
      return `ransomlook request failed: ${e?.message ?? e}${cause ? ` (${cause})` : ""}`;
    }

    if (!data?.rows?.length) {
      return `no activity in the last ${data?.days ?? days} days`;
    }

    const lines = [
      `Recent ransomware activity — last ${data.days} days (from ${data.from_date})`,
      `${data.total_posts} posts across ${data.rows.length} groups`,
      "",
      "group                  count   last post",
      "─".repeat(60),
    ];
    for (const r of data.rows) {
      const name = r.group.padEnd(22);
      const count = String(r.count).padStart(5);
      lines.push(`${name} ${count}   ${r.last_post}`);
    }
    lines.push("");
    lines.push("Tip: use ransomlook_search with a company domain to check if they appear.");
    return lines.join("\n");
  },
};

register(ransomlookHot);
