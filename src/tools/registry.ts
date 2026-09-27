// Tool interface — copied from SAM (docs/BUILD-A-TOOL.md). VEYRA adds one field:
// `scopeRequired` — whether the tool contacts a target and must therefore be scope-checked.

export interface Tool {
  name: string;                 // snake_case, unique
  safe: boolean;                // true = no side effects, runs without approval
  scopeRequired: boolean;       // true = must pass the scope gate (network/active tools)
  description: string;          // shown to the model
  params: string;               // shape hint, e.g. "{ url }"
  activity: (input: any) => string;
  run: (input: any, ctx: ToolContext) => Promise<string>;
}

export interface ToolContext {
  engagementId: string;
  scopeCheck: (target: string) => { allowed: boolean; reason: string };
  audit: (event: { tool: string; input: any; allowed: boolean; reason?: string }) => void;
}

const registry = new Map<string, Tool>();

export function register(tool: Tool): void {
  if (registry.has(tool.name)) throw new Error(`duplicate tool: ${tool.name}`);
  registry.set(tool.name, tool);
}

export function getTool(name: string): Tool | undefined {
  return registry.get(name);
}

export function allTools(): Tool[] {
  return [...registry.values()];
}

export function toolCatalogue(): string {
  return allTools()
    .map((t) => `- ${t.name}${t.safe ? "" : " (requires approval)"}: ${t.description}  params: ${t.params}`)
    .join("\n");
}
