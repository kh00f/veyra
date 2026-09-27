// Optional local Ollama adapter. Uses Ollama's /api/chat with tools support.
// Only used when VEYRA_PROVIDER=ollama.

import type {
  CompletionRequest,
  CompletionResponse,
  Provider,
  ToolCall,
} from "./provider.ts";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2:3b";

export async function callOllama(req: CompletionRequest): Promise<CompletionResponse> {
  const body: any = {
    model: OLLAMA_MODEL,
    stream: false,
    messages: [
      { role: "system", content: req.system },
      ...req.messages,
    ],
  };
  if (req.tools && req.tools.length > 0) {
    body.tools = req.tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}: ${await res.text().catch(() => "")}`);
  const data: any = await res.json();
  const msg = data?.message;
  if (!msg) throw new Error("ollama returned no message");

  const rawCall = msg.tool_calls?.[0];
  if (rawCall?.function?.name) {
    let args: Record<string, any> = {};
    try {
      args = typeof rawCall.function.arguments === "string"
        ? JSON.parse(rawCall.function.arguments)
        : (rawCall.function.arguments ?? {});
    } catch { args = {}; }
    const call: ToolCall = { name: rawCall.function.name, arguments: args };
    return { text: null, toolCall: call };
  }

  const text = msg.content;
  if (typeof text !== "string") throw new Error("ollama returned neither text nor tool_calls");
  return { text, toolCall: null };
}

export const ollamaProvider: Provider = {
  id: "ollama",
  tier: "local",
  label: `ollama:${OLLAMA_MODEL}`,
  noKey: true,
  complete: (req) => callOllama(req),
};
