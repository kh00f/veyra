import { register, type Tool } from "./registry.ts";
import { transition } from "../findings/lifecycle.ts";

export const updateFindingTool: Tool = {
  name: "update_finding",
  safe: true,
  scopeRequired: false,
  description:
    "Advance a finding's state or add evidence. States must move forward: " +
    "DISCOVERED → POTENTIAL → VALIDATING → VALIDATED → REPORTED. " +
    "Provide finding_id and the target state ('to'). Optionally a reason and extra evidence text.",
  params: "{ finding_id, to, reason?, evidence? }",
  activity: (input: any) => `updating ${input?.finding_id ?? "?"} → ${input?.to ?? "?"}`,
  run: async (input: any, ctx) => {
    const id = String(input?.finding_id ?? "").trim();
    const to = String(input?.to ?? "").trim();
    if (!id) return "error: finding_id is required";
    if (!to) return "error: to is required (DISCOVERED|POTENTIAL|VALIDATING|VALIDATED|REPORTED)";

    try {
      const f = transition(ctx.engagementId, id, to as any, input?.reason ? String(input.reason) : undefined);
      if (input?.evidence) {
        // Evidence append: read-modify-write via the lifecycle store (silent if this fails —
        // the state change is the important part).
        try {
          const { listFindings } = await import("../findings/lifecycle.ts");
          const all = listFindings(ctx.engagementId);
          const target = all.find((x) => x.id === id);
          if (target) {
            target.evidence.push(String(input.evidence));
            const { writeFileSync } = await import("node:fs");
            const { join } = await import("node:path");
            const dir = process.env.VEYRA_ENGAGEMENTS_DIR || "./engagements";
            writeFileSync(join(dir, `${ctx.engagementId}.findings.json`), JSON.stringify(all, null, 2));
          }
        } catch { /* evidence append is best-effort */ }
      }
      ctx.audit({ tool: "update_finding", input: { finding_id: id, to }, allowed: true });
      return `finding ${f.id} is now ${f.state}.`;
    } catch (e: any) {
      return `error: ${e?.message ?? String(e)}`;
    }
  },
};

register(updateFindingTool);
