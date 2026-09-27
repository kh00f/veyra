// CVE knowledge base. Reads the pre-built index at load time; reads
// individual entry files lazily on lookup. Pure JSON — no DB, no network.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const INDEX_PATH = join(ROOT, "knowledge", "cve", "index.json");
const ENTRIES_DIR = join(ROOT, "knowledge", "cve", "entries");

export interface CveIndexEntry {
  id: string;
  title: string;
  severity: "None" | "Low" | "Medium" | "High" | "Critical";
  score: number | null;
  products: string[];
}

export interface CveEntry extends CveIndexEntry {
  description: string;
  vector: string | null;
  published: string;
  modified: string;
  cpes: string[];
  references: string[];
}

let _index: CveIndexEntry[] | null = null;
const _cache = new Map<string, CveEntry>();

export function indexCount(): number {
  return loadIndex().length;
}

export function loadIndex(): CveIndexEntry[] {
  if (_index) return _index;
  if (!existsSync(INDEX_PATH)) return (_index = []);
  try {
    const raw = JSON.parse(readFileSync(INDEX_PATH, "utf8"));
    _index = raw?.entries ?? [];
  } catch {
    _index = [];
  }
  return _index;
}

export function getCve(id: string): CveEntry | null {
  const norm = id.toUpperCase();
  if (_cache.has(norm)) return _cache.get(norm)!;
  const path = join(ENTRIES_DIR, `${norm}.json`);
  if (!existsSync(path)) return null;
  try {
    const entry: CveEntry = JSON.parse(readFileSync(path, "utf8"));
    _cache.set(norm, entry);
    return entry;
  } catch {
    return null;
  }
}

// ── Search ──────────────────────────────────────────────────

export interface SearchArgs {
  id?: string;
  product?: string;
  version?: string;
  keyword?: string;
  minScore?: number;
  limit?: number;
}

export function searchCves(args: SearchArgs): CveIndexEntry[] {
  const index = loadIndex();
  const limit = Math.max(1, Math.min(args.limit ?? 20, 100));

  if (args.id) {
    const hit = index.find((e) => e.id.toUpperCase() === args.id!.toUpperCase());
    return hit ? [hit] : [];
  }

  let pool = index;

  if (args.minScore !== undefined) {
    pool = pool.filter((e) => (e.score ?? 0) >= args.minScore!);
  }

  if (args.product) {
    const needle = args.product.toLowerCase();
    pool = pool.filter((e) =>
      e.products.some((p) => p.includes(needle) || needle.includes(p)),
    );
  }

  if (args.keyword) {
    const words = args.keyword.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    if (words.length > 0) {
      pool = pool
        .map((e) => {
          const hay = (e.title + " " + e.products.join(" ")).toLowerCase();
          const score = words.reduce((acc, w) => acc + (hay.includes(w) ? 1 : 0), 0);
          return { e, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || (b.e.score ?? 0) - (a.e.score ?? 0))
        .map((x) => x.e);
    }
  }

  // If version filtering requested, prefer entries whose description
  // or title mention that version. Best-effort — CVE version ranges are
  // in the CPE, not in a form we index here.
  if (args.version) {
    const v = args.version.toLowerCase();
    pool = pool.sort((a, b) => {
      const aMatch = a.title.toLowerCase().includes(v) ? 1 : 0;
      const bMatch = b.title.toLowerCase().includes(v) ? 1 : 0;
      return bMatch - aMatch;
    });
  }

  // Default order: highest score first.
  return pool
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit);
}

// ── Startup sanity check ────────────────────────────────────
export function cveKbStatus(): { ready: boolean; count: number; hint?: string } {
  if (!existsSync(INDEX_PATH)) {
    return {
      ready: false,
      count: 0,
      hint: "knowledge base not built — run: NVD_API_KEY=... npx tsx scripts/fetch-cves.ts",
    };
  }
  const count = loadIndex().length;
  if (count === 0) {
    return { ready: false, count: 0, hint: "index is empty" };
  }
  return { ready: true, count };
}
