// Provider selection. Picks exactly one provider from VEYRA_PROVIDER.
// No cascade. If the configured provider is missing its key, `complete`
// fails loudly with a clear message.

import { ollamaProvider } from "./ollama.ts";
import { openAICompatProvider } from "./openai-compat.ts";
import type { CompletionRequest, CompletionResponse, Provider } from "./provider.ts";

function pickProvider(): { provider: Provider; key: string } {
  const which = (process.env.VEYRA_PROVIDER || "groq").toLowerCase();

  switch (which) {
    case "groq": {
      const key = process.env.GROQ_API_KEY;
      if (!key) throw new Error("GROQ_API_KEY is not set. Get a free key at https://console.groq.com/keys and put it in .env");
      return {
        provider: openAICompatProvider(
          "groq",
          "https://api.groq.com/openai/v1",
          process.env.GROQ_MODEL || "openai/gpt-oss-20b",
        ),
        key,
      };
    }
    case "cerebras": {
      const key = process.env.CEREBRAS_API_KEY;
      if (!key) throw new Error("CEREBRAS_API_KEY is not set. Get a free key at https://cloud.cerebras.ai/");
      return {
        provider: openAICompatProvider(
          "cerebras",
          "https://api.cerebras.ai/v1",
          process.env.CEREBRAS_MODEL || "gpt-oss-120b",
        ),
        key,
      };
    }
    case "mistral": {
      const key = process.env.MISTRAL_API_KEY;
      if (!key) throw new Error("MISTRAL_API_KEY is not set. Get a free key at https://console.mistral.ai/");
      return {
        provider: openAICompatProvider(
          "mistral",
          "https://api.mistral.ai/v1",
          process.env.MISTRAL_MODEL || "mistral-small-latest",
        ),
        key,
      };
    }
    case "openrouter": {
      const key = process.env.OPENROUTER_API_KEY;
      if (!key) throw new Error("OPENROUTER_API_KEY is not set. Get one at https://openrouter.ai/keys");
      return {
        provider: openAICompatProvider(
          "openrouter",
          "https://openrouter.ai/api/v1",
          process.env.OPENROUTER_MODEL || "openrouter/free",
        ),
        key,
      };
    }
    case "openai-compat": {
      const url = process.env.OPENAI_COMPAT_URL;
      const key = process.env.OPENAI_COMPAT_KEY ?? "";
      const model = process.env.OPENAI_COMPAT_MODEL;
      if (!url || !model) throw new Error("OPENAI_COMPAT_URL and OPENAI_COMPAT_MODEL must be set for VEYRA_PROVIDER=openai-compat");
      return { provider: openAICompatProvider("openai-compat", url, model), key };
    }
    case "ollama":
      return { provider: ollamaProvider, key: "" };
    default:
      throw new Error(`unknown VEYRA_PROVIDER "${which}" — use groq | cerebras | mistral | openrouter | openai-compat | ollama`);
  }
}

export async function complete(req: CompletionRequest): Promise<{ response: CompletionResponse; provider: string }> {
  const { provider, key } = pickProvider();
  const response = await provider.complete(req, key);
  return { response, provider: provider.label };
}

export function currentProviderLabel(): string {
  try {
    return pickProvider().provider.label;
  } catch (e: any) {
    return `(misconfigured: ${e?.message ?? e})`;
  }
}