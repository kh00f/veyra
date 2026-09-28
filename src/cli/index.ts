#!/usr/bin/env node
// VEYRA CLI. Interactive REPL by default. Non-interactive commands remain
// available for scripting (doctor, model, skills, tools, findings, run).

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config as loadEnv } from "dotenv";

// Resolve the project root from this file's location. .env lives there,
// not in whatever cwd the user happened to launch us from.
const __cliDir = dirname(fileURLToPath(import.meta.url));
const __projectRoot = join(__cliDir, "..", "..");
const ENV_PATH = join(__projectRoot, ".env");

import { runSetup } from "./setup.ts";
import { createInterface, type Interface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { currentProviderLabel, complete } from "../models/router.ts";
import { loadEngagement } from "../engagement/store.ts";
import { createEngagement, listEngagements } from "../engagement/store.ts";
import { runAgent } from "../agent/loop.ts";
import { listFindings, getFinding } from "../findings/lifecycle.ts";
import { which } from "../tools/subprocess.ts";
import { loadSkills } from "../skills/loader.ts";
import { cveKbStatus } from "../knowledge/cve.ts";
import {
  banner,
  c,
  err,
  finding,
  info,
  ok,
  pickGreeting,
  prompt,
  rule,
  Spinner,
  step,
  bootAnimation,
} from "./ui.ts";

// Register every tool by importing it.
import "../tools/http-request.ts";
import "../tools/dns-lookup.ts";
import "../tools/subfinder.ts";
import "../tools/httpx.ts";
import "../tools/nmap.ts";
import "../tools/nuclei.ts";
import "../tools/ffuf.ts";
import "../tools/katana.ts";
import "../tools/dirsearch.ts";
import "../tools/create-finding.ts";
import "../tools/update-finding.ts";
import "../tools/confirm-plan.ts";
import "../tools/web-fetch.ts";
import "../tools/lookup-cve.ts";
import "../tools/ransomlook-hot.ts";
import "../tools/ransomlook-search.ts";
import "../tools/ransomlook-groups.ts";

const VERSION = "0.1.0";
const argv = process.argv.slice(2);
const cmd = argv[0] ?? "shell";

// ─────────────────────────────────────────────────────────────
//  Interactive REPL
// ─────────────────────────────────────────────────────────────

async function shell() {
  await bootAnimation();
  const greeting = pickGreeting();
  console.log(banner(VERSION, currentProviderLabel(), greeting));

  const rl = createInterface({ input, output, terminal: true });
  let currentEngagement: string | null = null;

  while (true) {
    const raw = (await rl.question(prompt() + " ")).trim();
    if (!raw) continue;

    if (raw.startsWith("/")) {
      const result = await handleSlash(raw, rl, currentEngagement);
      if (result === "exit") {
        rl.close();
        console.log("");
        return;
      }
      if (result && result.startsWith("engagement:")) {
        currentEngagement = result.slice("engagement:".length);
      }
      continue;
    }

    if (!currentEngagement) {
      const target = (
        await rl.question(
          "  " + c.faint("target (URL or host, blank to just ask a question) ›") + " ",
        )
      ).trim();

      if (!target) {
        await askGeneral(raw);
        continue;
      }

      const host = deriveHost(target);
      if (!host) {
        err(`cannot parse host from "${target}"`);
        continue;
      }

      const today = new Date().toISOString().slice(0, 10);
      const engId = `scan-${host.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}-${today}`;
      try {
        loadEngagement(engId);
        ok(`reusing engagement ${engId}`);
      } catch {
        createEngagement({
          id: engId,
          target: host,
          inScope: [host],
          outOfScope: [],
          authorizedBy: "interactive session",
          authorizationRef: "interactive-attestation",
        });
        ok(`created engagement ${engId} · in scope: ${host}`);
      }
      currentEngagement = engId;
    }

    const eng = loadEngagement(currentEngagement);
    const beforeFindings = listFindings(eng.id).length;

    const spinner = new Spinner();
    spinner.start("thinking");

    try {
      const result = await runAgent(
        eng,
        raw,
        (msg) => {
          spinner.setText(msg);
        },
        undefined,
        async (plan) => {
          spinner.stop();
          console.log("");
          info(`plan     ${c.mint(plan.intent)}`);
          if (plan.tools.length) info(`tools    ${c.cyan(plan.tools.join(", "))}`);
          if (plan.targets.length) info(`targets  ${c.text(plan.targets.join(", "))}`);
          console.log("");
          const answer = (
            await rl.question("  " + c.faint("proceed? (y/N) ›") + " ")
          ).trim().toLowerCase();
          if (answer === "y" || answer === "yes") {
            spinner.start("running");
            return true;
          }
          return false;
        },
      );
      spinner.stop();

      for (const s of result.steps) {
        if (s.tool === "confirm_plan") continue;
        const preview = JSON.stringify(s.input).slice(0, 90);
        step(`${c.text(s.tool)}  ${c.faint(preview)}`);
      }

      rule();
      console.log("\n" + indent(result.answer) + "\n");

      const afterFindings = listFindings(eng.id);
      const newOnes = afterFindings.slice(beforeFindings);
      if (newOnes.length > 0) {
        rule();
        info(`${newOnes.length} new finding${newOnes.length === 1 ? "" : "s"}`);
        console.log("");
        for (const f of newOnes) finding(f.id, f.state, f.severity, f.title);
        console.log("");
      }

      const parts = [`${result.steps.length} tool call${result.steps.length === 1 ? "" : "s"}`];
      if (newOnes.length) {
        parts.push(`${newOnes.length} finding${newOnes.length === 1 ? "" : "s"}`);
      }
      parts.push(result.provider);
      if (result.skill) parts.push(`skill ${result.skill}`);
      info(`[${parts.join(" · ")}]`);
      console.log("");
    } catch (e: any) {
      spinner.stop();
      err(`run failed: ${e?.message ?? e}`);
      console.log("");
    }
  }
}

function indent(s: string): string {
  return s
    .split("\n")
    .map((l) => "  " + l)
    .join("\n");
}

async function askGeneral(question: string) {
  const spinner = new Spinner();
  spinner.start("thinking");
  try {
    const { response, provider } = await complete({
      system:
        "You are VEYRA, a security-focused assistant. Answer the user's question directly and concisely. You are specialised in penetration testing, bug bounty, and application security, but you can answer general questions too.",
      messages: [{ role: "user", content: question }],
    });
    spinner.stop();
    rule();
    console.log("\n" + indent(response.text ?? "(no response)") + "\n");
    info(`[${provider}]`);
    console.log("");
  } catch (e: any) {
    spinner.stop();
    err(`failed: ${e?.message ?? e}`);
  }
}

async function handleSlash(
  raw: string,
  rl: Interface,
  currentEngagement: string | null,
): Promise<string | null> {
  const [name, ...rest] = raw.slice(1).split(/\s+/);
  const arg = rest.join(" ");

  switch (name) {
    case "help":
      console.log(`
  commands:
    /help                 this list
    /target <host|url>    create or switch to an engagement for a target
    /engagement <id>      switch to an existing engagement
    /engagements          list all engagements
    /findings [eng-id]    list findings (defaults to current engagement)
    /finding <id>         show one finding
    /skills               list loaded skills
    /tools                list tools and installation status
    /cve <id|keyword>     look up a CVE from the local knowledge base
    /model                show current provider and model
    /ask <question>       ask a general question (no target required)
    /clear                clear the screen
    /setup                run interactive provider setup
    /exit                 quit
    /ransomlook <search|hot|groups> [arg]   check ransomlook.io
`);
      return null;

    case "exit":
    case "quit":
      return "exit";

    case "setup": {
      const done = await runSetup();
      if (done) {
        console.log("");
        info("setup complete — restart veyra for the new config to take effect");
        console.log("");
      }
      return null;
    }

    case "clear":
      process.stdout.write("\x1b[2J\x1b[H");
      return null;

    case "ask":
      if (!arg) {
        err("usage: /ask <question>");
        return null;
      }
      await askGeneral(arg);
      return null;

    case "target": {
      if (!arg) {
        err("usage: /target <host or url>");
        return null;
      }
      const host = deriveHost(arg);
      if (!host) {
        err(`cannot parse host from "${arg}"`);
        return null;
      }
      const today = new Date().toISOString().slice(0, 10);
      const engId = `scan-${host.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}-${today}`;
      try {
        loadEngagement(engId);
        ok(`reusing engagement ${engId}`);
      } catch {
        createEngagement({
          id: engId,
          target: host,
          inScope: [host],
          outOfScope: [],
          authorizedBy: "interactive session",
          authorizationRef: "interactive-attestation",
        });
        ok(`created engagement ${engId} · in scope: ${host}`);
      }
      return `engagement:${engId}`;
    }

    case "engagement": {
      if (!arg) {
        err("usage: /engagement <id>");
        return null;
      }
      try {
        loadEngagement(arg);
        ok(`switched to ${arg}`);
        return `engagement:${arg}`;
      } catch (e: any) {
        err(e?.message ?? String(e));
        return null;
      }
    }

    case "engagements": {
      const all = listEngagements();
      if (all.length === 0) {
        info("(none)");
        return null;
      }
      for (const e of all) {
        const marker = e.id === currentEngagement ? c.mint("●") : c.faint("○");
        console.log("  " + marker + " " + c.text(e.id.padEnd(40)) + " " + c.muted(e.target));
      }
      return null;
    }

    case "findings": {
      const engId = arg || currentEngagement;
      if (!engId) {
        err("no engagement selected. use /target or /engagement.");
        return null;
      }
      const all = listFindings(engId);
      if (all.length === 0) {
        info("(no findings)");
        return null;
      }
      console.log("");
      for (const f of all) finding(f.id, f.state, f.severity, f.title);
      console.log("");
      return null;
    }

    case "finding": {
      const engId = currentEngagement;
      if (!engId) {
        err("no engagement selected.");
        return null;
      }
      if (!arg) {
        err("usage: /finding <id>");
        return null;
      }
      const f = getFinding(engId, arg);
      if (!f) {
        err(`finding ${arg} not found in ${engId}`);
        return null;
      }
      console.log("\n" + indent(JSON.stringify(f, null, 2)) + "\n");
      return null;
    }

    case "cve": {
      if (!arg) {
        err("usage: /cve <CVE-ID | keyword>");
        return null;
      }
      await lookupCve(arg);
      return null;
    }


        case "ransomlook":
    case "darkweb": {
      if (!arg) {
        err("usage: /ransomlook <search|hot|groups> [arg]");
        return null;
      }
      await ransomlookCommand(arg);
      return null;
    }


    case "skills": {
      const all = loadSkills();
      const byCat = new Map<string, typeof all>();
      for (const s of all) {
        if (!byCat.has(s.category)) byCat.set(s.category, []);
        byCat.get(s.category)!.push(s);
      }
      console.log("");
      for (const [cat, list] of byCat) {
        console.log("  " + c.mint(cat));
        for (const s of list) {
          console.log("    " + c.text(s.id.padEnd(35)) + " " + c.muted(s.name));
        }
      }
      console.log("");
      return null;
    }

    case "tools": {
      console.log("");
      const builtins = [
        "http_request",
        "dns_lookup",
        "web_fetch",
        "lookup_cve",
        "ransomlook_hot",
        "ransomlook_search",
        "ransomlook_groups",
        "create_finding",
        "update_finding",
        "confirm_plan",
      ];
      console.log("  " + c.mint("built-in"));
      for (const t of builtins) {
        console.log("    " + c.mint("✓") + " " + c.text(t));
      }
      console.log("");
      console.log("  " + c.mint("pentest binaries"));
      const bins = ["subfinder", "httpx", "nmap", "nuclei", "ffuf", "katana", "dirsearch"];
      for (const b of bins) {
        const present = await which(b);
        const mark = present ? c.mint("✓") : c.red("✗");
        const label = present ? c.muted("installed") : c.muted("missing");
        console.log("    " + mark + " " + c.text(b.padEnd(14)) + " " + label);
      }
      console.log("");
      return null;
    }

    case "model":
      console.log("");
      info(`provider  ${c.cyan(process.env.VEYRA_PROVIDER || "groq")}`);
      info(`model     ${c.cyan(currentProviderLabel())}`);
      console.log("");
      return null;

    default:
      err(`unknown command /${name}. try /help`);
      return null;
  }
}

async function lookupCve(query: string) {
  const { getTool } = await import("../tools/registry.ts");
  const tool = getTool("lookup_cve");
  if (!tool) {
    err("lookup_cve tool is not registered.");
    return;
  }
  const fakeCtx = {
    engagementId: "cli",
    scopeCheck: () => ({ allowed: true, reason: "" }),
    audit: () => {},
  };
  const trimmed = query.trim();
  const isId = /^CVE-\d{4}-\d+$/i.test(trimmed);
  const input = isId ? { id: trimmed } : { keyword: trimmed, limit: 15 };
  const output = await tool.run(input, fakeCtx as any);

  console.log("");
  const isFailure =
    output.startsWith("no entry") ||
    output.startsWith("no CVEs") ||
    output.startsWith("local knowledge");
  if (isFailure) {
    err(output);
    return;
  }
  console.log(indent(output));
  console.log("");
}

async function ransomlookCommand(arg: string) {
  const { getTool } = await import("../tools/registry.ts");
  const [sub, ...rest] = arg.split(/\s+/);
  const query = rest.join(" ").trim();
  const fakeCtx = {
    engagementId: "cli",
    scopeCheck: () => ({ allowed: true, reason: "" }),
    audit: () => {},
  };
  let tool;
  let input: any;
  if (sub === "hot") {
    tool = getTool("ransomlook_hot");
    input = query ? { days: Number(query) } : {};
  } else if (sub === "groups") {
    tool = getTool("ransomlook_groups");
    input = query ? { filter: query } : {};
  } else if (sub === "search") {
    tool = getTool("ransomlook_search");
    input = { query };
  } else {
    // shorthand: /ransomlook att.com == /ransomlook search att.com
    tool = getTool("ransomlook_search");
    input = { query: arg.trim() };
  }
  if (!tool) {
    err("ransomlook tool not registered");
    return;
  }
  const output = await tool.run(input, fakeCtx as any);
  console.log("");
  console.log(indent(output));
  console.log("");
}



function deriveHost(target: string): string | null {
  try {
    if (/^https?:\/\//i.test(target)) {
      const u = new URL(target);
      return u.port
        ? `${u.hostname}:${u.port}`.toLowerCase()
        : u.hostname.toLowerCase();
    }
    return target.toLowerCase().replace(/\/.*$/, "");
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
//  Non-interactive commands
// ─────────────────────────────────────────────────────────────

async function doctor() {
  console.log("VEYRA doctor\n");
  console.log(`node            ${process.versions.node}`);
  console.log(`provider        ${process.env.VEYRA_PROVIDER || "(unset)"}`);
  console.log(`model           ${currentProviderLabel()}`);
  try {
    const { response, provider } = await complete({
      system: "You are a test.",
      messages: [{ role: "user", content: "Reply with the single word: ok" }],
    });
    const trimmed = (response.text ?? "(tool call)").trim().slice(0, 40);
    console.log(`provider check  ok (${provider}) → "${trimmed}"`);
  } catch (e: any) {
    console.log(`provider check  FAILED — ${e?.message ?? e}`);
    process.exit(1);
  }
  const dir = process.env.VEYRA_ENGAGEMENTS_DIR || "./engagements";
  console.log(
    `engagements dir ${dir} (${existsSync(dir) ? "exists" : "will be created"})`,
  );
  console.log(`skills loaded   ${loadSkills().length}`);

  const cveStatus = cveKbStatus();
  console.log(
    `cve knowledge   ${cveStatus.ready ? `${cveStatus.count} entries` : `NOT BUILT (${cveStatus.hint})`}`,
  );

  console.log("\npentest binaries:");
  for (const bin of ["subfinder", "httpx", "nmap", "nuclei", "ffuf", "katana", "dirsearch"]) {
    const present = await which(bin);
    console.log(`  ${bin.padEnd(12)} ${present ? "installed" : "MISSING"}`);
  }
  process.exit(0);
}

function version() {
  console.log(`veyra ${VERSION}`);
}

function listSkills() {
  const all = loadSkills();
  const byCat = new Map<string, typeof all>();
  for (const s of all) {
    if (!byCat.has(s.category)) byCat.set(s.category, []);
    byCat.get(s.category)!.push(s);
  }
  console.log(`VEYRA skills (${all.length})\n`);
  for (const [cat, list] of byCat) {
    console.log(`${cat}:`);
    for (const s of list) {
      console.log(`  ${s.id.padEnd(35)} ${s.name}`);
    }
    console.log();
  }
}

async function runNonInteractive(args: string[]) {
  const engIdx = args.indexOf("--engagement");
  if (engIdx < 0 || !args[engIdx + 1]) {
    console.error('usage: veyra run --engagement <id> "<task>"');
    process.exit(1);
  }
  const engId = args[engIdx + 1];
  const task = args.slice(engIdx + 2).join(" ").trim();
  if (!task) {
    console.error("no task given");
    process.exit(1);
  }
  const eng = loadEngagement(engId);
  console.log(`engagement ${eng.id} · target ${eng.target}`);
  console.log(`in scope: ${eng.inScope.join(", ")}`);
  console.log(`task: ${task}\n`);
  const result = await runAgent(eng, task, (msg) => step(msg));
  console.log(`\n${result.answer}\n`);
  info(`[${result.steps.length} tool calls · ${result.provider}]`);
}

async function main() {
  // Load .env from the install root BEFORE anything reads process.env.
  // Because ESM hoists imports, this is the first executable statement in
  // the whole program.
  loadEnv({ path: ENV_PATH });
  // Also allow a cwd-local .env to override (useful during development).
  loadEnv();

  const needsSetup = !existsSync(ENV_PATH);

  if (needsSetup && (cmd === "shell" || cmd === "" || cmd === "setup")) {
    const done = await runSetup();
    if (!done) {
      err("setup aborted — VEYRA cannot start without configuration");
      process.exit(1);
    }
    if (cmd === "setup") return;
  }

  switch (cmd) {
    case "shell":
    case "":
      return shell();
    case "setup": {
      const okSetup = await runSetup();
      process.exit(okSetup ? 0 : 1);
    }
    case "doctor":
      return doctor();
    case "version":
      return version();
    case "skills":
      return listSkills();
    case "run":
      return runNonInteractive(argv.slice(1));
    case "help":
    default:
      console.log(`
  VEYRA — Autonomous AI-Assisted Penetration Testing Platform

  just run \`veyra\` to open the interactive session.
  non-interactive commands:
    veyra setup                      run interactive provider setup
    veyra doctor                     check config, provider, tools, CVE KB
    veyra skills                     list loaded skills
    veyra run --engagement <id> ...  run one task, no REPL
    veyra version                    print version
`);
      return;
  }
}

main().catch((e) => {
  err(`fatal: ${e?.message ?? e}`);
  process.exit(1);
});
