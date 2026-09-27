// lookup_cve — the CVE knowledge base tool.
//
// First tries the local index built by scripts/fetch-cves.ts.
// If the CVE ID is not in the local corpus, falls back to a live query
// against the NVD API so the tool works for any CVE, not just the ones
// we ingested.

import { register, type Tool } from "./registry.ts";
import { getCve, searchCves, indexCount } from "../knowledge/cve.ts";

const NVD_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0";

// ── Live NVD fallback ───────────────────────────────────────
async function fetchFromNvd(cveId: string): Promise<any | null> {
  // Read the key here, not at module load, so a late-loaded .env still works.
  const apiKey = process.env.NVD_API_KEY ?? "";
  try {
    const url = `${NVD_URL}?cveId=${encodeURIComponent(cveId)}`;
    const headers: Record<string, string> = { "User-Agent": "VEYRA/0.1" };
    if (apiKey) headers["apiKey"] = apiKey;
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    return data?.vulnerabilities?.[0]?.cve ?? null;
  } catch {
    return null;
  }
}

function formatNvdLive(cve: any): string {
  const desc =
    (cve.descriptions ?? []).find((d: any) => d.lang === "en")?.value ??
    "(no description)";
  const metrics = cve.metrics ?? {};
  const m =
    metrics.cvssMetricV31?.[0] ??
    metrics.cvssMetricV30?.[0] ??
    metrics.cvssMetricV2?.[0];
  const score = m?.cvssData?.baseScore;
  const vector = m?.cvssData?.vectorString;
  const refs: string[] = (cve.references ?? [])
    .map((r: any) => r.url)
    .filter(Boolean)
    .slice(0, 6);

  const lines: string[] = [
    `[${cve.id}]  ${score !== undefined ? `CVSS ${score}` : "CVSS N/A"}  (live from NVD)`,
    "",
    desc,
  ];
  if (vector) lines.push("", `CVSS vector: ${vector}`);
  if (refs.length) {
    lines.push("", "References:");
    for (const r of refs) lines.push(`  ${r}`);
  }
  return lines.join("\n");
}

// ── Format a local entry ────────────────────────────────────
function formatEntry(entry: NonNullable<ReturnType<typeof getCve>>): string {
  const lines = [
    `[${entry.id}]  ${entry.severity}${
      entry.score !== null ? ` (CVSS ${entry.score})` : ""
    }`,
    "",
    entry.title,
    "",
    entry.description,
  ];
  if (entry.vector) lines.push("", `CVSS vector: ${entry.vector}`);
  if (entry.products.length) {
    lines.push("", `Affected products: ${entry.products.join(", ")}`);
  }
  if (entry.references.length) {
    lines.push("", "References:");
    for (const r of entry.references) lines.push(`  ${r}`);
  }
  lines.push("", `Published: ${entry.published}   Modified: ${entry.modified}`);
  return lines.join("\n");
}

// ── The tool ────────────────────────────────────────────────
export const lookupCve: Tool = {
  name: "lookup_cve",
  safe: true,
  scopeRequired: false,
  description:
    "Look up known vulnerabilities (CVEs) from the local NVD knowledge base, " +
    "falling back to the live NVD API for IDs not in the local corpus. " +
    "Use this when you observe a component name and version in a target's response " +
    "(e.g. 'WordPress 5.8.1', 'log4j 2.14', 'Apache 2.4.49') and want to know which " +
    "CVEs affect it. Also use it when the user mentions a specific CVE ID. " +
    "Params: { id?, product?, version?, keyword?, minScore?, limit? }",
  params: "{ id?, product?, version?, keyword?, minScore?, limit? }",
  activity: (input: any) =>
    input?.id
      ? `looking up ${input.id}`
      : input?.product
        ? `searching CVEs for ${input.product}${
            input.version ? " " + input.version : ""
          }`
        : `searching CVEs for "${input?.keyword ?? "?"}"`,
  run: async (input: any) => {
    const total = indexCount();

    // ── Exact ID lookup ─────────────────────────────────────
    if (input?.id) {
      const id = String(input.id).trim().toUpperCase();

      const entry = getCve(id);
      if (entry) return formatEntry(entry);

      const live = await fetchFromNvd(id);
      if (live) return formatNvdLive(live);

      return `no entry for "${id}" in local knowledge base (${total} CVEs loaded) and NVD returned nothing`;
    }

    // ── Search (requires a local corpus) ────────────────────
    if (total === 0) {
      return "local knowledge base is empty — run: NVD_API_KEY=... npx tsx scripts/fetch-cves.ts";
    }

    const results = searchCves({
      product: input?.product ? String(input.product) : undefined,
      version: input?.version ? String(input.version) : undefined,
      keyword: input?.keyword ? String(input.keyword) : undefined,
      minScore: typeof input?.minScore === "number" ? input.minScore : undefined,
      limit: typeof input?.limit === "number" ? input.limit : 20,
    });

    if (results.length === 0) {
      return `no CVEs matched. knowledge base has ${total} entries. try a broader product name or keyword.`;
    }

    const lines = [
      `${results.length} CVE${results.length === 1 ? "" : "s"} matched (of ${total} in knowledge base):`,
      "",
    ];
    for (const r of results) {
      lines.push(
        `[${r.id}]  ${r.severity}${
          r.score !== null ? ` (${r.score})` : ""
        }`,
      );
      lines.push(`  ${r.title}`);
      if (r.products.length) {
        lines.push(`  products: ${r.products.slice(0, 4).join(", ")}`);
      }
      lines.push("");
    }
    lines.push(
      `Use lookup_cve with an exact id (e.g. { "id": "${results[0].id}" }) to get the full entry.`,
    );
    return lines.join("\n");
  },
};

register(lookupCve);
