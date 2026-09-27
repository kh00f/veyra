import { register, type Tool } from "./registry.ts";
import { createFinding } from "../findings/lifecycle.ts";

export const createFindingTool: Tool = {
  name: "create_finding",
  safe: true,
  scopeRequired: false, // it's a local write, not a network action
  description:
    "Record a security finding in the engagement. Call this when you identify a potential vulnerability. " +
    "Provide: title (short, specific), severity (None|Low|Medium|High|Critical), asset (the host you tested), " +
    "endpoint (the specific URL/route if applicable), description (what the issue is), evidence (array of strings: " +
    "the exact request, the exact response snippet, or the tool output that demonstrates it), confidence " +
    "(low|medium|high), and optionally cvss (a CVSS:3.1/ vector). Returns the finding id (VY-xxx).",
  params: "{ title, severity, asset, endpoint?, description, evidence, confidence, cvss? }",
  activity: (input: any) => `recording finding: ${input?.title ?? "?"}`,
  run: async (input: any, ctx) => {
    const title = String(input?.title ?? "").trim();
    const severity = String(input?.severity ?? "").trim();
    const asset = String(input?.asset ?? "").trim();
    const description = String(input?.description ?? "").trim();
    const confidence = String(input?.confidence ?? "medium").trim();
    const evidence = Array.isArray(input?.evidence) ? input.evidence.map(String) : [];

    if (!title) return "error: title is required";
    if (!["None", "Low", "Medium", "High", "Critical"].includes(severity)) {
      return `error: severity must be one of None|Low|Medium|High|Critical (got "${severity}")`;
    }
    if (!asset) return "error: asset is required";
    if (!description) return "error: description is required";
    if (!["low", "medium", "high"].includes(confidence)) {
      return `error: confidence must be low|medium|high (got "${confidence}")`;
    }

    const finding = createFinding(ctx.engagementId, {
      title,
      severity: severity as any,
      asset,
      endpoint: input?.endpoint ? String(input.endpoint) : undefined,
      description,
      evidence,
      confidence: confidence as any,
      cvss: input?.cvss ? String(input.cvss) : undefined,
    });

    ctx.audit({
      tool: "create_finding",
      input: { title, severity, asset, endpoint: input?.endpoint },
      allowed: true,
    });

    return `created finding ${finding.id} (${finding.severity}, state=${finding.state}). Use update_finding to advance its state when you validate it.`;
  },
};

register(createFindingTool);
