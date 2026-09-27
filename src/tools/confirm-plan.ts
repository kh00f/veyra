// confirm_plan — the gate that stops the agent from touching a target before
// the operator has seen what it intends to do. The agent MUST call this before
// any target-touching tool (http_request, httpx, nmap, nuclei, ffuf, katana,
// dirsearch, subfinder).
//
// This tool itself never runs a network call. It exists so the CLI can
// intercept the call, show the plan, and prompt yes/no. If the operator
// declines, the agent loop stops with "plan declined".
//
// If the CLI does not register an onPlan hook, the tool still validates and
// returns an "accepted" message — the plan is logged to the audit trail either
// way, so the thesis can reconstruct exactly what the agent intended.

import { register, type Tool } from "./registry.ts";

export const confirmPlan: Tool = {
  name: "confirm_plan",
  safe: true,
  scopeRequired: false,
  description:
    "Describe a plan before executing it. Use this BEFORE calling any tool that " +
    "sends requests to the target or runs a pentest binary (http_request, httpx, " +
    "nmap, nuclei, ffuf, katana, dirsearch, subfinder). Do NOT use this for " +
    "informational questions about existing findings — answer those directly in text. " +
    "Provide: intent (one sentence), tools (array of tool names you plan to call), " +
    "targets (array of URLs/hosts).",
  params: "{ intent, tools, targets }",
  activity: (input: any) => `planning: ${input?.intent ?? "?"}`,
  run: async (input: any, ctx) => {
    const intent = String(input?.intent ?? "").trim();
    const tools = Array.isArray(input?.tools) ? input.tools.map(String) : [];
    const targets = Array.isArray(input?.targets) ? input.targets.map(String) : [];

    if (!intent) return "error: intent is required";

    // Scope-check every declared target now, before anything runs.
    for (const t of targets) {
      const check = ctx.scopeCheck(t);
      if (!check.allowed) {
        return `refused: plan includes out-of-scope target "${t}": ${check.reason}`;
      }
    }

    ctx.audit({
      tool: "confirm_plan",
      input: { intent, tools, targets },
      allowed: true,
      reason: "plan proposed",
    });

    return `plan accepted: ${intent}. You may now proceed with: ${
      tools.join(", ") || "(no tools)"
    }. Targets: ${targets.join(", ") || "(none)"}. Do not deviate from this plan.`;
  },
};

register(confirmPlan);
