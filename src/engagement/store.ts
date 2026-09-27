// Engagement store. One JSON file per engagement under VEYRA_ENGAGEMENTS_DIR.
// Writes an audit event on create. Reads are side-effect free.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeAudit } from "../safety/audit.ts";

export interface Engagement {
  id: string;
  target: string;
  inScope: string[];
  outOfScope: string[];
  authorizedBy: string;      // who authorized this engagement
  authorizationRef: string;  // reference: contract id, program URL, ticket number
  createdAt: string;
}

const DIR = process.env.VEYRA_ENGAGEMENTS_DIR || "./engagements";

function ensureDir(): void {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
}

function pathFor(id: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error(`invalid engagement id "${id}" — use letters, digits, underscore, dash only`);
  }
  return join(DIR, `${id}.json`);
}

export function createEngagement(input: Omit<Engagement, "createdAt">): Engagement {
  ensureDir();
  const eng: Engagement = { ...input, createdAt: new Date().toISOString() };
  const path = pathFor(eng.id);
  if (existsSync(path)) throw new Error(`engagement "${eng.id}" already exists`);
  writeFileSync(path, JSON.stringify(eng, null, 2));
  writeAudit({
    engagement: eng.id,
    kind: "engagement",
    data: { action: "create", target: eng.target, authorizedBy: eng.authorizedBy, ref: eng.authorizationRef },
  });
  return eng;
}

export function loadEngagement(id: string): Engagement {
  const path = pathFor(id);
  if (!existsSync(path)) throw new Error(`engagement "${id}" not found in ${DIR}`);
  return JSON.parse(readFileSync(path, "utf8")) as Engagement;
}

export function listEngagements(): Engagement[] {
  ensureDir();
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".json") && !f.endsWith(".audit.jsonl") && !f.endsWith(".findings.json"))
    .map((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")) as Engagement)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
