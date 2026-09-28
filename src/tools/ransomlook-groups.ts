// ransomlook_groups — list of ransomware groups tracked by ransomlook.io.
// Public read-only endpoint. No findings, no scope check.

import { register, type Tool } from "./registry.ts";

const BASE = "https://www.ransomlook.io/api";
const UA = "VEYRA/0.1 (authorized-security-research)";

export const ransomlookGroups: Tool = {
  name: "ransomlook_groups",
  safe: true,
  scopeRequired: false,
  description:
    "List ransomware groups tracked by ransomlook.io. " +
    "With no argument, returns the total count and a sample. With a `filter`, " +
    "returns only groups whose name contains the filter (e.g. 'lock', 'conti'). " +
    "Use this when the user asks 'what groups exist', 'is X a known group', " +
    "or to validate a group name before referencing it. " +
    "Params: { filter? }",
  params: "{ filter? }",
  activity: (input: any) =>
    input?.filter
      ? `checking ransomlook groups for "${input.filter}"`
      : `listing ransomlook groups`,
  run: async (input: any) => {
    const url = `${BASE}/groups`;
    let groups: string[];
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) return `ransomlook /api/groups returned HTTP ${res.status}`;
      groups = (await res.json()) as string[];
    } catch (e: any) {
      const cause = e?.cause?.code ?? e?.cause?.message ?? "";
      return `ransomlook request failed: ${e?.message ?? e}${cause ? ` (${cause})` : ""}`;
    }

    if (!Array.isArray(groups)) {
      return `ransomlook returned unexpected shape: ${JSON.stringify(groups).slice(0, 200)}`;
    }

    const filter = input?.filter ? String(input.filter).toLowerCase().trim() : "";

    if (filter) {
      const matches = groups.filter((g) => g.toLowerCase().includes(filter));
      if (matches.length === 0) {
        return `no group matches "${filter}" (total groups tracked: ${groups.length})`;
      }
      return [
        `${matches.length} group${matches.length === 1 ? "" : "s"} matching "${filter}" (of ${groups.length} total):`,
        "",
        ...matches.map((g) => `  ${g}`),
      ].join("\n");
    }

    // No filter — show the total and the first 60 alphabetically for readability.
    const sorted = [...groups].sort();
    const sample = sorted.slice(0, 60);
    const lines = [
      `${groups.length} ransomware groups tracked by ransomlook.io`,
      "",
      "sample (first 60 alphabetical):",
      ...sample.map((g) => `  ${g}`),
      "",
      groups.length > sample.length
        ? `…and ${groups.length - sample.length} more. Use { filter: "..." } to search by name.`
        : "",
    ];
    return lines.join("\n").trim();
  },
};

register(ransomlookGroups);
