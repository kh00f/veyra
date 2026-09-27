// Append-only audit log. One JSONL file per engagement.
// Every scope decision and every tool call lands here. This is what makes
// the thesis defensible: "the agent did X against Y at time T, and the
// scope gate said Z."

import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const DIR = process.env.VEYRA_ENGAGEMENTS_DIR || "./engagements";

export interface AuditEvent {
  ts: string;
  engagement: string;
  tool?: string;
  input?: any;
  allowed?: boolean;
  reason?: string;
  kind: "tool_call" | "scope_decision" | "agent_step" | "engagement" | "error";
  data?: any;
}

export function auditPath(engagementId: string): string {
  return join(DIR, `${engagementId}.audit.jsonl`);
}

export function writeAudit(event: Omit<AuditEvent, "ts">): void {
  const full: AuditEvent = { ts: new Date().toISOString(), ...event };
  const path = auditPath(event.engagement);
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(path, JSON.stringify(full) + "\n");
}
