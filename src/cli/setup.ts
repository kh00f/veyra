// First-run setup. Interactive, writes .env, tests the config before saving.
// Called automatically when .env is missing, or manually via `veyra setup`.

import { writeFileSync, existsSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createInterface, type Interface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { c, err, info, ok } from "./ui.ts";

// Anchor .env to the project root, so setup writes to the right place
// regardless of where veyra was launched from.
const __setupDir = dirname(fileURLToPath(import.meta.url));
const __projectRoot = join(__setupDir, "..", "..");
const ENV_PATH = join(__projectRoot, ".env");

interface ProviderChoice {
  key:
    | "openrouter"
    | "groq"
    | "cerebras"
    | "mistral"
    | "ollama"
    | "openai-compat";
  label: string;
  description: string;
  keyUrl?: string;
  keyVar?: string;
  models: { id: string; label: string }[];
}

const PROVIDERS: ProviderChoice[] = [
  {
    key: "openrouter",
    label: "OpenRouter",
    description: "free models + paid, one key (recommended)",
    keyUrl: "https://openrouter.ai/keys",
    keyVar: "OPENROUTER_API_KEY",
    models: [
      { id: "openrouter/free", label: "auto-picks an available free model (recommended)" },
      { id: "openai/gpt-oss-20b:free", label: "small, fast" },
      { id: "qwen/qwen3-coder:free", label: "strong at code" },
      { id: "meta-llama/llama-3.3-70b-instruct:free", label: "larger, better reasoning" },
    ],
  },
  {
    key: "groq",
    label: "Groq",
    description: "free, very fast",
    keyUrl: "https://console.groq.com/keys",
    keyVar: "GROQ_API_KEY",
    models: [
      { id: "openai/gpt-oss-20b", label: "small, fast (recommended)" },
      { id: "openai/gpt-oss-120b", label: "larger, better reasoning" },
      { id: "qwen/qwen3-32b", label: "balanced" },
    ],
  },
  {
    key: "cerebras",
    label: "Cerebras",
    description: "free, very fast",
    keyUrl: "https://cloud.cerebras.ai/",
    keyVar: "CEREBRAS_API_KEY",
    models: [
      { id: "gpt-oss-120b", label: "larger, better reasoning (recommended)" },
      { id: "qwen-3.8-27b", label: "balanced" },
    ],
  },
  {
    key: "mistral",
    label: "Mistral",
    description: "free tier",
    keyUrl: "https://console.mistral.ai/",
    keyVar: "MISTRAL_API_KEY",
    models: [
      { id: "mistral-small-latest", label: "small, fast (recommended)" },
      { id: "mistral-large-latest", label: "larger, better reasoning" },
    ],
  },
  {
    key: "ollama",
    label: "Ollama",
    description: "local, no API key — must be running",
    models: [
      { id: "llama3.2:3b", label: "3B, runs anywhere (recommended)" },
      { id: "qwen2.5:7b", label: "7B, better reasoning" },
      { id: "qwen2.5-coder:7b", label: "7B, code-strong" },
    ],
  },
  {
    key: "openai-compat",
    label: "Other",
    description: "any OpenAI-compatible endpoint",
    models: [],
  },
];

// ── Utilities ───────────────────────────────────────────────

function bootMark(): string {
  const e = c.magenta("◉");
  const m = c.mint;
  return [
    `  ${m("╭─────╮")}`,
    `  ${m("│")} ${e} ${e} ${m("│")}  ${c.bold(c.mint("VEYRA"))}`,
    `  ${m("│")} ${m("ᴗᴗ")}  ${m("│")}  ${c.muted("first-time setup")}`,
    `  ${m("╰─┬─┬─╯")}`,
    `    ${m("╱ ╲")}`,
  ].join("\n");
}

/**
 * Ask a question and return the trimmed answer.
 *
 * API keys are not masked. Masking requires either raw-mode byte reads
 * (which break bracketed paste in most terminals) or a muted-output
 * readline wrapper (which is fiddly). The key is typed on your own
 * machine, at first-run setup, and is written straight to .env — it is
 * never logged or sent anywhere except the provider you chose.
 */
async function askSecret(rl: Interface, prompt: string): Promise<string> {
  return (await rl.question(prompt)).trim();
}

async function ask(rl: Interface, q: string, def?: string): Promise<string> {
  const ans = (await rl.question(q)).trim();
  if (!ans && def !== undefined) return def;
  return ans;
}

async function chooseIndex(
  rl: Interface,
  q: string,
  min: number,
  max: number,
): Promise<number> {
  while (true) {
    const ans = (await rl.question(q)).trim();
    const n = Number(ans);
    if (Number.isInteger(n) && n >= min && n <= max) return n;
    console.log(`  ${c.red("✗")} enter a number between ${min} and ${max}`);
  }
}

// ── The main flow ───────────────────────────────────────────

export async function runSetup(): Promise<boolean> {
  const rl = createInterface({ input, output, terminal: true });
  try {
    console.log("");
    console.log(bootMark());
    console.log("");

    if (existsSync(ENV_PATH)) {
      info("An .env file already exists. Setup will overwrite it.");
      const confirm = (
        await rl.question("  " + c.faint("continue? (y/N) ›") + " ")
      )
        .trim()
        .toLowerCase();
      if (confirm !== "y" && confirm !== "yes") {
        info("cancelled");
        return false;
      }
      try {
        copyFileSync(ENV_PATH, ENV_PATH + ".backup");
        info(`existing .env backed up to ${ENV_PATH}.backup`);
      } catch {
        /* best-effort */
      }
    } else {
      info("No .env file found. Let's configure VEYRA.");
    }

    console.log("");
    info("Which model provider do you want to use?");
    console.log("");
    for (let i = 0; i < PROVIDERS.length; i++) {
      const p = PROVIDERS[i];
      const num = c.mint(String(i + 1).padStart(2));
      const label = c.text(p.label.padEnd(14));
      console.log(`  ${num}. ${label} ${c.muted("(" + p.description + ")")}`);
    }
    console.log("");

    const choiceIdx =
      (await chooseIndex(rl, "  Choose [1-6]: ", 1, PROVIDERS.length)) - 1;
    const chosen = PROVIDERS[choiceIdx];
    console.log("");
    ok(`${chosen.label} selected.`);

    let apiKey = "";
    if (chosen.key !== "ollama") {
      console.log("");
      if (chosen.keyUrl) {
        info("Get a free API key at:");
        console.log("    " + c.cyan(chosen.keyUrl));
        console.log("");
      }
      apiKey = (await askSecret(rl, `  Paste your ${chosen.label} API key: `)).trim();
      if (!apiKey) {
        err("no key entered");
        return false;
      }
    }

    let modelId = "";

    if (chosen.key === "openai-compat") {
      console.log("");
      const url = (
        await ask(rl, "  Base URL (e.g. https://api.example.com/v1): ")
      ).trim();
      if (!url) {
        err("no URL entered");
        return false;
      }
      const customKey = (
        await askSecret(rl, "  API key (or leave blank if none): ")
      ).trim();
      const customModel = (await ask(rl, "  Model ID (e.g. my-model-name): ")).trim();
      if (!customModel) {
        err("no model entered");
        return false;
      }
      apiKey = customKey;
      modelId = customModel;

      const envContent = [
        `# VEYRA configuration — generated by veyra setup`,
        `VEYRA_PROVIDER=openai-compat`,
        `OPENAI_COMPAT_URL=${url}`,
        `OPENAI_COMPAT_KEY=${customKey}`,
        `OPENAI_COMPAT_MODEL=${customModel}`,
        ``,
        `VEYRA_ENGAGEMENTS_DIR=./engagements`,
        `VEYRA_MAX_STEPS=20`,
        `# NVD_API_KEY=`,
        ``,
      ].join("\n");

      console.log("");
      info("Testing configuration...");
      const testResult = await testConfig(envContent);
      if (!testResult.ok) {
        err(`config test failed: ${testResult.error}`);
        const retry = (
          await rl.question("  save anyway? (y/N) › ")
        )
          .trim()
          .toLowerCase();
        if (retry !== "y" && retry !== "yes") return false;
      } else {
        ok(`Provider responded. Model: ${testResult.model}`);
      }

      writeFileSync(ENV_PATH, envContent);
      ok(`Wrote ${ENV_PATH}`);
      console.log("");
      ok("Ready.");
      return true;
    }

    if (chosen.models.length > 0) {
      console.log("");
      info("Which model?");
      console.log("");
      for (let i = 0; i < chosen.models.length; i++) {
        const m = chosen.models[i];
        const num = c.mint(String(i + 1).padStart(2));
        const id = c.text(m.id.padEnd(40));
        console.log(`  ${num}. ${id} ${c.muted("(" + m.label + ")")}`);
      }
      const customIdx = chosen.models.length + 1;
      console.log(
        `  ${c.mint(String(customIdx).padStart(2))}. ${c.text("custom".padEnd(40))} ${c.muted("(type a model ID)")}`,
      );
      console.log("");

      const modelIdx =
        (await chooseIndex(rl, `  Choose [1-${customIdx}]: `, 1, customIdx)) - 1;
      if (modelIdx === chosen.models.length) {
        modelId = (await ask(rl, "  Model ID: ")).trim();
        if (!modelId) {
          err("no model entered");
          return false;
        }
      } else {
        modelId = chosen.models[modelIdx].id;
      }
    }

    const lines = [
      `# VEYRA configuration — generated by veyra setup`,
      `VEYRA_PROVIDER=${chosen.key}`,
    ];
    if (chosen.keyVar && apiKey) lines.push(`${chosen.keyVar}=${apiKey}`);
    if (chosen.key === "groq") lines.push(`GROQ_MODEL=${modelId}`);
    else if (chosen.key === "cerebras") lines.push(`CEREBRAS_MODEL=${modelId}`);
    else if (chosen.key === "mistral") lines.push(`MISTRAL_MODEL=${modelId}`);
    else if (chosen.key === "openrouter") lines.push(`OPENROUTER_MODEL=${modelId}`);
    else if (chosen.key === "ollama") lines.push(`OLLAMA_MODEL=${modelId}`);
    lines.push(``);
    lines.push(`VEYRA_ENGAGEMENTS_DIR=./engagements`);
    lines.push(`VEYRA_MAX_STEPS=20`);
    lines.push(`# NVD_API_KEY=`);
    lines.push(``);

    const envContent = lines.join("\n");

    console.log("");
    info("Testing configuration...");

    const testResult = await testConfig(envContent);
    if (!testResult.ok) {
      err(`config test failed: ${testResult.error}`);
      console.log("");
      const retry = (
        await rl.question("  save anyway? (y/N) › ")
      )
        .trim()
        .toLowerCase();
      if (retry !== "y" && retry !== "yes") {
        info("not saved.");
        return false;
      }
    } else {
      ok(`Provider responded. Model: ${testResult.model}`);
    }

    writeFileSync(ENV_PATH, envContent);
    ok(`Wrote ${ENV_PATH}`);
    console.log("");
    ok("Ready.");
    console.log("");
    return true;
  } finally {
    rl.close();
  }
}

async function testConfig(
  envContent: string,
): Promise<{ ok: true; model: string } | { ok: false; error: string }> {
  const vars: Record<string, string> = {};
  for (const line of envContent.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    vars[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  try {
    const { complete } = await import("../models/router.ts");
    const { response, provider } = await complete({
      system: "You are a test.",
      messages: [{ role: "user", content: "Reply with the single word: ok" }],
    });
    const text = (response.text ?? "").trim().slice(0, 40);
    return { ok: true, model: `${provider} → "${text}"` };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}
