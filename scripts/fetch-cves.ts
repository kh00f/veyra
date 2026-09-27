#!/usr/bin/env tsx
// Fetch CVE entries from the NVD API and write them as JSON files.
//
// Reads knowledge/cve/sources.json for the product list. For each product,
// queries NVD by CPE prefix, filters by CVSS score, writes one JSON file per
// CVE to knowledge/cve/entries/, and builds knowledge/cve/index.json.
//
// NVD API v2: https://nvd.nist.gov/developers/vulnerabilities
// Rate limit: 5 req/30s without key, 50 req/30s with key (set NVD_API_KEY).
//
// Usage:
//   NVD_API_KEY=... npx tsx scripts/fetch-cves.ts
//   npx tsx scripts/fetch-cves.ts --product wordpress   (single product, for testing)

import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SOURCES = join(ROOT, "knowledge", "cve", "sources.json");
const ENTRIES_DIR = join(ROOT, "knowledge", "cve", "entries");
const INDEX_PATH = join(ROOT, "knowledge", "cve", "index.json");
const PROGRESS_PATH = join(ROOT, "knowledge", "cve", ".progress.json");

const API_KEY = process.env.NVD_API_KEY ?? "";
const NVD_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0";

// NVD rate: 5 req/30s without key → 6s between requests. 50/30s with key → 0.6s.
const DELAY_MS = API_KEY ? 700 : 6500;

interface SourceEntry { name: string; cpe: string }
interface Sources { products: SourceEntry[]; minCvss: number; maxPerProduct: number }

interface CveEntry {
  id: string;
  title: string;
  description: string;
  severity: "None" | "Low" | "Medium" | "High" | "Critical";
  score: number | null;
  vector: string | null;
  published: string;
  modified: string;
  products: string[];      // human names of affected products (from CPEs)
  cpes: string[];          // the raw CPEs
  references: string[];    // reference URLs
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function nvdQuery(params: Record<string, string | number>): Promise<any> {
  const url = new URL(NVD_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const headers: Record<string, string> = { "User-Agent": "VEYRA-CVE-Ingest/0.1" };
  if (API_KEY) headers["apiKey"] = API_KEY;

  let attempt = 0;
  while (attempt < 5) {
    attempt++;
    try {
      const res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(60_000) });
      if (res.status === 403 || res.status === 429) {
        const wait = DELAY_MS * 4 * attempt;
        process.stdout.write(`\r  rate limited, waiting ${wait / 1000}s…          `);
        await sleep(wait);
        continue;
      }
      if (!res.ok) throw new Error(`NVD ${res.status}: ${await res.text().catch(() => "")}`);
      return await res.json();
    } catch (e: any) {
      if (attempt >= 5) throw e;
      await sleep(DELAY_MS * 2);
    }
  }
  throw new Error("NVD: max retries exceeded");
}

function severityOf(score: number | null): CveEntry["severity"] {
  if (score === null) return "None";
  if (score < 4.0) return "Low";
  if (score < 7.0) return "Medium";
  if (score < 9.0) return "High";
  return "Critical";
}

function parseCve(raw: any): CveEntry | null {
  const cve = raw?.cve;
  if (!cve?.id) return null;

  // Description in English
  const desc = (cve.descriptions ?? []).find((d: any) => d.lang === "en")?.value ?? "";
  if (!desc || desc.length < 20) return null;

  // CVSS: prefer v3.1, fall back to v3.0, then v2
  const metrics = cve.metrics ?? {};
  const m31 = metrics.cvssMetricV31?.[0];
  const m30 = metrics.cvssMetricV30?.[0];
  const m2  = metrics.cvssMetricV2?.[0];
  const primary = m31 ?? m30 ?? m2;
  const score = primary?.cvssData?.baseScore ?? null;
  const vector = primary?.cvssData?.vectorString ?? null;

  // Products from CPEs
  const cpes: string[] = [];
  const products = new Set<string>();
  for (const cfg of cve.configurations ?? []) {
    for (const node of cfg.nodes ?? []) {
      for (const match of node.cpeMatch ?? []) {
        if (!match.criteria) continue;
        cpes.push(match.criteria);
        // cpe:2.3:a:vendor:product:version:...
        const parts = match.criteria.split(":");
        if (parts.length > 4) {
          const vendor = parts[3];
          const product = parts[4];
          products.add(`${vendor} ${product}`.replace(/_/g, " ").toLowerCase());
        }
      }
    }
  }

  // References
  const references: string[] = (cve.references ?? []).map((r: any) => r.url).filter(Boolean).slice(0, 6);

  return {
    id: cve.id,
    title: desc.slice(0, 140).replace(/\s+/g, " ").trim(),
    description: desc,
    severity: severityOf(score),
    score,
    vector,
    published: cve.published ?? "",
    modified: cve.lastModified ?? "",
    products: [...products].slice(0, 8),
    cpes: cpes.slice(0, 12),
    references,
  };
}

async function fetchForProduct(product: SourceEntry, minCvss: number, maxResults: number): Promise<CveEntry[]> {
  const out: CveEntry[] = [];
  let startIndex = 0;
  const pageSize = 100;

  while (out.length < maxResults) {
    const data = await nvdQuery({
      virtualMatchString: product.cpe,
      resultsPerPage: pageSize,
      startIndex,
    });
    const vulns = data?.vulnerabilities ?? [];
    if (vulns.length === 0) break;

    for (const v of vulns) {
      const parsed = parseCve(v);
      if (!parsed) continue;
      if ((parsed.score ?? 0) < minCvss) continue;
      out.push(parsed);
      if (out.length >= maxResults) break;
    }

    startIndex += vulns.length;
    if (startIndex >= (data?.totalResults ?? 0)) break;
    if (out.length >= maxResults) break;

    process.stdout.write(
      `\r    ${product.name.padEnd(30)} ${out.length} kept / ${startIndex} scanned…          `,
    );
    await sleep(DELAY_MS);
  }
  return out;
}

async function main() {
  if (!existsSync(SOURCES)) {
    console.error(`missing ${SOURCES}`);
    process.exit(1);
  }
  const cfg: Sources = JSON.parse(readFileSync(SOURCES, "utf8"));
  mkdirSync(ENTRIES_DIR, { recursive: true });

  const onlyProduct = (() => {
    const i = process.argv.indexOf("--product");
    return i >= 0 ? process.argv[i + 1] : null;
  })();

  const products = onlyProduct
    ? cfg.products.filter((p) => p.name === onlyProduct)
    : cfg.products;

  if (products.length === 0) {
    console.error(onlyProduct ? `no product named "${onlyProduct}"` : "no products configured");
    process.exit(1);
  }

  console.log(`fetching CVEs for ${products.length} product${products.length === 1 ? "" : "s"}`);
  console.log(`min cvss: ${cfg.minCvss}   max per product: ${cfg.maxPerProduct}`);
  console.log(`api key: ${API_KEY ? "yes" : "no (slower — set NVD_API_KEY to speed up)"}\n`);

  const allCves = new Map<string, CveEntry>();

  // Load previously fetched entries so re-runs are incremental.
  if (existsSync(ENTRIES_DIR)) {
    for (const f of readdirSync(ENTRIES_DIR)) {
      if (!f.endsWith(".json")) continue;
      try {
        const e: CveEntry = JSON.parse(readFileSync(join(ENTRIES_DIR, f), "utf8"));
        allCves.set(e.id, e);
      } catch { /* skip broken file */ }
    }
    if (allCves.size > 0) console.log(`  loaded ${allCves.size} existing entries\n`);
  }

  for (const product of products) {
    process.stdout.write(`  → ${product.name}\n`);
    try {
      const found = await fetchForProduct(product, cfg.minCvss, cfg.maxPerProduct);
      let newCount = 0;
      for (const cve of found) {
        if (!allCves.has(cve.id)) newCount++;
        allCves.set(cve.id, cve);
      }
      process.stdout.write(`\r    ${product.name.padEnd(30)} +${newCount} new (total ${allCves.size})                    \n`);
    } catch (e: any) {
      process.stdout.write(`\r    ${product.name.padEnd(30)} FAILED: ${e?.message ?? e}\n`);
    }
    await sleep(DELAY_MS);
  }

  // Write all entries
  console.log(`\nwriting ${allCves.size} CVE entries…`);
  let written = 0;
  for (const [id, cve] of allCves) {
    writeFileSync(join(ENTRIES_DIR, `${id}.json`), JSON.stringify(cve, null, 2));
    written++;
    if (written % 100 === 0) process.stdout.write(`\r  ${written} / ${allCves.size}…          `);
  }
  process.stdout.write(`\r  ${written} entries written.                    \n`);

  // Build the index
  console.log("building index…");
  const index = {
    generatedAt: new Date().toISOString(),
    count: allCves.size,
    entries: [...allCves.values()].map((c) => ({
      id: c.id,
      title: c.title,
      severity: c.severity,
      score: c.score,
      products: c.products,
    })),
  };
  writeFileSync(INDEX_PATH, JSON.stringify(index));
  console.log(`index written: ${INDEX_PATH} (${index.count} entries)`);

  console.log("\ndone.");
}

main().catch((e) => {
  console.error("fatal:", e?.message ?? e);
  process.exit(1);
});
