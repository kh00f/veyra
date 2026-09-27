// OpenAI-compatible adapter with tool-calling support. Groq, Cerebras,
// Mistral, Together, OpenRouter, OpenAI all speak this shape.
//
// VEYRA patches two things SAM's version didn't handle:
//   1. Sanitizes model-internal control tokens that leak into function names
//      (Groq's gpt-oss series emits `<|channel|>commentary` mid-name).
//   2. Wraps `fetch` so a network-level failure surfaces its real cause
//      (ENOTFOUND, ECONNRESET, UND_ERR_CONNECT_TIMEOUT) instead of the
//      useless "fetch failed" message Node throws by default.

import type {
  CompletionRequest,
  CompletionResponse,
  Provider,
  ToolCall,
} from "./provider.ts";

function sanitizeToolName(raw: string): string {
  return raw.split("<|")[0].trim();
}

export async function callOpenAICompat(
  baseUrl: string,
  model: string,
  req: CompletionRequest,
  key: string,
): Promise<CompletionResponse> {
  const body: any = {
    model,
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
    body.tool_choice = "auto";
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (e: any) {
    const cause = e?.cause?.code ?? e?.cause?.message ?? e?.cause ?? "";
    throw new Error(
      `network error calling ${baseUrl}: ${e?.message ?? e}${cause ? ` (${cause})` : ""}`,
    );
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`provider ${res.status}: ${errBody.slice(0, 400)}`);
  }

  const data: any = await res.json();
  const msg = data?.choices?.[0]?.message;
  if (!msg) throw new Error("provider returned no message");

  const rawCall = msg.tool_calls?.[0];
  if (rawCall?.function?.name) {
    const name = sanitizeToolName(rawCall.function.name);
    let args: Record<string, any> = {};
    try {
      args = JSON.parse(rawCall.function.arguments || "{}");
    } catch {
      args = {};
    }
    const call: ToolCall = { name, arguments: args };
    return { text: null, toolCall: call };
  }

  const text = msg.content;
  if (typeof text !== "string") {
    throw new Error("provider returned neither text nor tool_calls");
  }
  return { text, toolCall: null };
}

export function openAICompatProvider(
  id: string,
  baseUrl: string,
  model: string,
): Provider {
  return {
    id,
    tier: "free",
    label: `${id}:${model}`,
    complete: (req, key) => callOpenAICompat(baseUrl, model, req, key),
  };
}
