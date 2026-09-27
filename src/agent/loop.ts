// VEYRA agent loop.
// Uses the modern OpenAI tool-calling protocol. Adds:
//   - skill routing (best skill by trigger match)
//   - findings context (existing findings injected into the system prompt)
//   - plan confirmation (confirm_plan tool gates all target-touching actions)
//
// Model replies with a tool call → we execute → observe → repeat.
// Model replies with text → final answer.

import { complete } from "../models/router.ts";
import type { ToolSchema } from "../models/provider.ts";
import { allTools, getTool, type ToolContext } from "../tools/registry.ts";
import { checkScope, type Engagement } from "../safety/scope.ts";
import { writeAudit } from "../safety/audit.ts";
import { loadSkills, routeSkill, type Skill } from "../skills/loader.ts";
import { listFindings } from "../findings/lifecycle.ts";

const MAX_STEPS = Number(process.env.VEYRA_MAX_STEPS ?? 20);

export interface AgentResult {
  answer: string;
  steps: { tool: string; input: any; output: string }[];
  provider: string;
  skill: string | null;
}

export interface PlanRequest {
  intent: string;
  tools: string[];
  targets: string[];
}

function isRepetition(
  prevSteps: { tool: string; input: any }[],
  next: { tool: string; input: any },
): boolean {
  if (prevSteps.length < 2) return false;
  const last = prevSteps[prevSteps.length - 1];
  const sameTool = last.tool === next.tool;
  const sameInput = JSON.stringify(last.input) === JSON.stringify(next.input);
  return sameTool && sameInput;
}

export async function runAgent(
  engagement: Engagement,
  userTask: string,
  onStep?: (msg: string) => void,
  forcedSkillId?: string,
  onPlan?: (plan: PlanRequest) => Promise<boolean>,
): Promise<AgentResult> {
  const ctx: ToolContext = {
    engagementId: engagement.id,
    scopeCheck: (target) => checkScope(engagement, target),
    audit: (e) =>
      writeAudit({
        engagement: engagement.id,
        kind: "tool_call",
        tool: e.tool,
        input: e.input,
        allowed: e.allowed,
        reason: e.reason,
      }),
  };

  // ── Skill routing ─────────────────────────────────────────
  const skills = loadSkills();
  let skill: Skill | null = null;
  if (forcedSkillId) {
    skill = skills.find((s) => s.id === forcedSkillId) ?? null;
    if (!skill) throw new Error(`skill "${forcedSkillId}" not found`);
  } else {
    skill = routeSkill(userTask, skills);
  }

  if (skill) {
    writeAudit({
      engagement: engagement.id,
      kind: "agent_step",
      data: { step: -1, routed_skill: skill.id, trigger_match: true },
    });
    onStep?.(`using skill: ${skill.name}`);
  }

  // ── Existing findings context ─────────────────────────────
  const existing = listFindings(engagement.id);
  const findingsContext: string[] = [];
  if (existing.length > 0) {
    findingsContext.push(
      ``,
      `── EXISTING FINDINGS (${existing.length}) ──`,
      `The following findings have already been recorded for this engagement.`,
      `When the user refers to a finding ("the first one", "VY-001", "the .env finding"),`,
      `use this list. If the user asks for evidence or a PoC, quote the evidence entries`,
      `verbatim — do NOT re-run tools to regenerate them.`,
      ``,
    );
    for (const f of existing) {
      findingsContext.push(`[${f.id}] ${f.title}`);
      findingsContext.push(`  severity: ${f.severity}   state: ${f.state}   asset: ${f.asset}`);
      if (f.endpoint) findingsContext.push(`  endpoint: ${f.endpoint}`);
      findingsContext.push(`  description: ${f.description}`);
      if (f.evidence.length) {
        findingsContext.push(`  evidence:`);
        for (const e of f.evidence) findingsContext.push(`    - ${e}`);
      }
      findingsContext.push(``);
    }
    findingsContext.push(`── END EXISTING FINDINGS ──`);
  }

  // ── System prompt ─────────────────────────────────────────
  const systemParts = [
    `You are VEYRA, an authorized penetration-testing AI agent.`,
    `Engagement: ${engagement.id}`,
    `Target: ${engagement.target}`,
    `In scope: ${engagement.inScope.join(", ")}`,
    `Out of scope: ${engagement.outOfScope.join(", ") || "(none)"}`,
  ];

  if (findingsContext.length > 0) {
    systemParts.push(...findingsContext);
  }

  if (skill) {
    systemParts.push(
      ``,
      `── ACTIVE SKILL: ${skill.name} ──`,
      skill.body,
      `── END SKILL ──`,
    );
  }

  systemParts.push(
    ``,
    `Use the provided tools to accomplish the user's task.`,
    `Never touch a target outside the scope above.`,
    ``,
    `BEFORE calling any tool that touches the target (http_request, httpx, nmap,`,
    `nuclei, ffuf, katana, dirsearch, subfinder), first call confirm_plan with a`,
    `one-line intent, the list of tools you intend to use, and the target URLs.`,
    ``,
    `If the user is asking about an existing finding (e.g. "show me the URL",`,
    `"what was the evidence", "give me the PoC"), answer directly from the`,
    `EXISTING FINDINGS block above — do NOT re-run tools. Quote the evidence`,
    `verbatim. Only run new tools if the user asks you to gather new data.`,
    ``,
    `When you identify a security issue, call create_finding with:`,
    `  - title: short and specific (not "security issue found")`,
    `  - severity: None|Low|Medium|High|Critical — use CVSS if you can assign one`,
    `  - asset: the host you tested`,
    `  - endpoint: the specific URL/route, if applicable`,
    `  - description: what the issue is and why it matters`,
    `  - evidence: an array of strings — include the exact request and the exact`,
    `    response snippet or tool output that demonstrates it. Do not include`,
    `    findings without evidence.`,
    `  - confidence: low|medium|high`,
    `Do not describe findings in prose. Record them with create_finding.`,
    ``,
    `If you need to advance a finding's state (e.g. from POTENTIAL to VALIDATED`,
    `after reproducing it), call update_finding.`,
    ``,
    `If a skill's methodology requires capabilities you do not have (e.g. creating`,
    `multiple user accounts, using a browser, intercepting with a proxy), say so`,
    `explicitly in your final answer and stop. Do not attempt to work around missing`,
    `capabilities by probing unrelated endpoints.`,
    ``,
    `When you have completed the task or determined you cannot proceed further,`,
    `STOP CALLING TOOLS and reply with plain text. Do not keep probing the same`,
    `endpoints. If no findings, say so plainly.`,
  );

  const system = systemParts.join("\n");

  // ── Tools exposed to the model ────────────────────────────
  // If the active skill declares an allowlist, only those tools are visible.
  // confirm_plan is always visible so the gate can fire.
  const visibleTools = (() => {
    const base = skill?.tools
      ? allTools().filter((t) => skill!.tools!.includes(t.name))
      : allTools();
    if (!base.find((t) => t.name === "confirm_plan")) {
      const cp = allTools().find((t) => t.name === "confirm_plan");
      if (cp) return [...base, cp];
    }
    return base;
  })();

  const tools: ToolSchema[] = visibleTools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: {
      type: "object",
      properties: paramsToSchema(t.params),
      required: requiredParams(t.params),
    },
  }));

  const messages: { role: "user" | "assistant" | "tool"; content: string; tool_call_id?: string }[] = [
    { role: "user", content: userTask },
  ];

  const steps: { tool: string; input: any; output: string }[] = [];
  let provider = "?";

  for (let i = 0; i < MAX_STEPS; i++) {
    const { response, provider: p } = await complete({ system, messages, tools });
    provider = p;

    // Final answer.
    if (response.text !== null) {
      writeAudit({
        engagement: engagement.id,
        kind: "agent_step",
        data: { step: i, final: response.text.slice(0, 500) },
      });
      return { answer: response.text, steps, provider, skill: skill?.id ?? null };
    }

    const call = response.toolCall!;
    writeAudit({
      engagement: engagement.id,
      kind: "agent_step",
      data: { step: i, tool: call.name, input: call.arguments },
    });

    // ── Plan confirmation hook ──────────────────────────────
    if (call.name === "confirm_plan" && onPlan) {
      const intent = String((call.arguments as any)?.intent ?? "");
      const planTools = Array.isArray((call.arguments as any)?.tools)
        ? (call.arguments as any).tools.map(String)
        : [];
      const planTargets = Array.isArray((call.arguments as any)?.targets)
        ? (call.arguments as any).targets.map(String)
        : [];

      const approved = await onPlan({ intent, tools: planTools, targets: planTargets });

      if (!approved) {
        writeAudit({
          engagement: engagement.id,
          kind: "agent_step",
          data: { step: i, plan_declined: true, intent },
        });
        return {
          answer: "Plan declined by operator. Nothing was executed against the target.",
          steps,
          provider,
          skill: skill?.id ?? null,
        };
      }

      // Approve: record the plan in the transcript and continue.
      messages.push({
        role: "assistant",
        content: "",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...({ tool_calls: [{ id: "call_0", type: "function", function: { name: "confirm_plan", arguments: JSON.stringify(call.arguments) } }] } as any),
      });
      messages.push({
        role: "tool",
        content: `plan accepted: ${intent}. You may now proceed with: ${planTools.join(", ") || "(no tools)"}. Targets: ${planTargets.join(", ") || "(none)"}. Do not deviate from this plan.`,
        tool_call_id: "call_0",
      });
      steps.push({
        tool: "confirm_plan",
        input: call.arguments,
        output: `accepted: ${intent}`,
      });
      continue;
    }

    // ── Loop breaker ────────────────────────────────────────
    if (isRepetition(steps, call)) {
      writeAudit({
        engagement: engagement.id,
        kind: "agent_step",
        data: { step: i, breaker: "repetition", tool: call.name },
      });
      return {
        answer:
          `Stopped: the agent repeated the same tool call (${call.name}) twice. ` +
          `This usually means the task needs a different approach or more context.`,
        steps,
        provider,
        skill: skill?.id ?? null,
      };
    }

    // ── Normal tool execution ───────────────────────────────
    const tool = getTool(call.name);
    let output: string;
    if (!tool) {
      output = `error: unknown tool "${call.name}". Available: ${visibleTools.map((t) => t.name).join(", ")}`;
    } else if (skill?.tools && !skill.tools.includes(call.name) && call.name !== "confirm_plan") {
      output = `error: tool "${call.name}" is not allowed by the active skill "${skill.name}"`;
    } else {
      onStep?.(tool.activity(call.arguments));
      try {
        output = await tool.run(call.arguments, ctx);
      } catch (e: any) {
        output = `error: ${e?.message ?? String(e)}`;
      }
    }
    steps.push({ tool: call.name, input: call.arguments, output: output.slice(0, 500) });

    messages.push({
      role: "assistant",
      content: "",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...({ tool_calls: [{ id: "call_0", type: "function", function: { name: call.name, arguments: JSON.stringify(call.arguments) } }] } as any),
    });
    messages.push({ role: "tool", content: output.slice(0, 8000), tool_call_id: "call_0" });
  }

  return {
    answer: "(max steps reached without final answer)",
    steps,
    provider,
    skill: skill?.id ?? null,
  };
}

function paramsToSchema(params: string): Record<string, any> {
  const out: Record<string, any> = {};
  const inner = params.replace(/^\{|\}$/g, "").trim();
  if (!inner) return out;
  for (const raw of inner.split(",")) {
    const name = raw.trim().replace(/\?$/, "");
    if (!name) continue;
    out[name] = { type: "string" };
  }
  return out;
}

function requiredParams(params: string): string[] {
  const inner = params.replace(/^\{|\}$/g, "").trim();
  if (!inner) return [];
  return inner
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && !s.endsWith("?"))
    .map((s) => s.replace(/\?$/, ""));
}