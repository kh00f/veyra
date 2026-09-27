// Finding lifecycle: DISCOVERED → POTENTIAL → VALIDATING → VALIDATED → REPORTED.
// Findings live in engagements/<id>.findings.json as a flat array.
// Every transition writes an audit event so the thesis can reconstruct exactly
// when a finding moved and why.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeAudit } from "../safety/audit.ts";

export type State = "DISCOVERED" | "POTENTIAL" | "VALIDATING" | "VALIDATED" | "REPORTED";

export interface Finding {
  id: string;                 // VY-001, VY-002, ...
  title: string;
  state: State;
  severity: "None" | "Low" | "Medium" | "High" | "Critical";
  cvss?: string;              // CVSS:3.1/AV:.../...
  asset: string;              // the host the finding is about
  endpoint?: string;          // the specific URL/route
  description: string;
  evidence: string[];         // free-form evidence refs (Phase 3 will link files)
  confidence: "low" | "medium" | "high";
  discoveredAt: string;
  updatedAt: string;
  history: { state: State; at: string; reason?: string }[];
}

const DIR = process.env.VEYRA_ENGAGEMENTS_DIR || "./engagements";

function findingsPath(engagementId: string): string {
  return join(DIR, `${engagementId}.findings.json`);
}

function readAll(engagementId: string): Finding[] {
  const p = findingsPath(engagementId);
  if (!existsSync(p)) return [];
  return JSON.parse(readFileSync(p, "utf8")) as Finding[];
}

function writeAll(engagementId: string, findings: Finding[]): void {
  writeFileSync(findingsPath(engagementId), JSON.stringify(findings, null, 2));
}

function nextId(existing: Finding[]): string {
  const n = existing.length + 1;
  return `VY-${String(n).padStart(3, "0")}`;
}

export function listFindings(engagementId: string): Finding[] {
  return readAll(engagementId);
}

export function getFinding(engagementId: string, id: string): Finding | undefined {
  return readAll(engagementId).find((f) => f.id === id);
}

export function createFinding(
  engagementId: string,
  input: Omit<Finding, "id" | "state" | "discoveredAt" | "updatedAt" | "history">,
): Finding {
  const all = readAll(engagementId);
  const now = new Date().toISOString();
  const finding: Finding = {
    ...input,
    id: nextId(all),
    state: "DISCOVERED",
    discoveredAt: now,
    updatedAt: now,
    history: [{ state: "DISCOVERED", at: now }],
  };
  all.push(finding);
  writeAll(engagementId, all);
  writeAudit({
    engagement: engagementId,
    kind: "engagement",
    data: { action: "finding.create", id: finding.id, title: finding.title, severity: finding.severity },
  });
  return finding;
}

const ALLOWED: Record<State, State[]> = {
  DISCOVERED: ["POTENTIAL"],
  POTENTIAL: ["VALIDATING", "DISCOVERED"],
  VALIDATING: ["VALIDATED", "POTENTIAL"],
  VALIDATED: ["REPORTED", "VALIDATING"],
  REPORTED: [],
};

export function transition(
  engagementId: string,
  findingId: string,
  to: State,
  reason?: string,
): Finding {
  const all = readAll(engagementId);
  const f = all.find((x) => x.id === findingId);
  if (!f) throw new Error(`finding "${findingId}" not found in engagement ${engagementId}`);
  if (!ALLOWED[f.state].includes(to)) {
    throw new Error(`illegal transition ${f.state} → ${to} for ${findingId}`);
  }
  const now = new Date().toISOString();
  f.state = to;
  f.updatedAt = now;
  f.history.push({ state: to, at: now, reason });
  writeAll(engagementId, all);
  writeAudit({
    engagement: engagementId,
    kind: "engagement",
    data: { action: "finding.transition", id: findingId, to, reason },
  });
  return f;
}
