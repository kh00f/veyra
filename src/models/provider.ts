// Provider interface — adapted from SAM (github.com/richhabits/sam).
// VEYRA extends SAM's (system, prompt, key) => string shape with an
// optional `tools` parameter, because modern providers (Groq gpt-oss,
// OpenAI, Cerebras) require the OpenAI tool-calling protocol instead of
// the prompt-for-JSON trick SAM uses with small local models.

export type Tier = "local" | "free" | "premium";

export interface ToolSchema {
  name: string;
  description: string;
  /** JSON-schema for the tool's input object. */
  parameters: Record<string, any>;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface CompletionRequest {
  system: string;
  messages: { role: "user" | "assistant" | "tool"; content: string; tool_call_id?: string }[];
  tools?: ToolSchema[];
}

export interface CompletionResponse {
  /** Plain text if the model answered directly. Null if it called a tool. */
  text: string | null;
  /** The tool call, if the model decided to act. Null if it answered directly. */
  toolCall: ToolCall | null;
}

export interface Provider {
  id: string;
  tier: Tier;
  label: string;
  noKey?: boolean;
  complete: (req: CompletionRequest, key: string) => Promise<CompletionResponse>;
}
