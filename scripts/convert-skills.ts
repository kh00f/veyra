#!/usr/bin/env tsx
// Skill format converter. Rewrites skills/<cat>/<name>/SKILL.md into the
// format VEYRA's loader expects: a single --- front matter with name,
// triggers, tools. Preserves the body verbatim.
//
// Idempotent: running it twice on an already-converted file is a no-op
// (detects the presence of `triggers:` and skips).
//
// Usage:
//   npx tsx scripts/convert-skills.ts --dry-run
//   npx tsx scripts/convert-skills.ts

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SKILLS_DIR = join(process.cwd(), "skills");
const DRY_RUN = process.argv.includes("--dry-run");

// ── Trigger table ────────────────────────────────────────────
// The slug is the folder name (e.g. "idor", "sqli", "xss"). We build
// triggers from this table plus the slug itself.
const TRIGGERS: Record<string, string[]> = {
  idor: [
    "idor", "insecure direct object reference",
    "object-level authorization", "horizontal privilege",
    "access another user", "bola",
  ],
  sqli: [
    "sqli", "sql injection", "sqlmap",
    "database injection", "error-based sqli", "blind sqli",
  ],
  xss: [
    "xss", "cross-site scripting", "script injection",
    "reflected xss", "stored xss", "dom xss", "html injection",
  ],
  ssrf: [
    "ssrf", "server-side request forgery",
    "internal request", "metadata endpoint",
  ],
  csrf: [
    "csrf", "cross-site request forgery",
    "state-changing get", "anti-csrf token",
  ],
  "auth-bypass": [
    "auth bypass", "authentication bypass", "broken authentication",
    "login bypass", "forgot password bypass",
  ],
  ato: [
    "ato", "account takeover", "account compromise",
    "password reset", "session hijack",
  ],
  "business-logic": [
    "business logic", "logic flaw", "workflow bypass",
    "state machine", "race condition",
  ],
  graphql: [
    "graphql", "introspection", "graphql idor",
    "graphql mutation", "query batching",
  ],
  "api-misconfig": [
    "api misconfiguration", "mass assignment",
    "exposed api", "swagger", "openapi leak",
  ],
  "open-redirect": [
    "open redirect", "url redirect", "redirect chain",
  ],
  "file-upload": [
    "file upload", "unrestricted upload", "content-type bypass",
  ],
  "path-traversal": [
    "path traversal", "directory traversal", "lfi",
    "local file inclusion", "zip slip",
  ],
  "subdomain-enumeration": [
    "subdomain", "subdomains", "enumerate subdomains",
    "subdomain enumeration", "passive recon", "attack surface",
  ],
  "port-scanning": [
    "port scan", "port scanning", "open ports",
    "nmap", "service discovery", "which services",
  ],
  "tech-fingerprinting": [
    "fingerprint", "what server", "what technology",
    "tech stack", "what framework", "identify technology",
  ],
  "security-headers": [
    "security headers", "headers check", "csp", "hsts",
    "x-frame-options", "content-security-policy", "missing headers",
  ],
};

// ── Tool allowlist table ─────────────────────────────────────
// What each skill is allowed to use. Anything not listed = no restriction.
const TOOLS: Record<string, string[]> = {
  idor: ["http_request", "httpx", "ffuf", "dirsearch"],
  sqli: ["http_request", "httpx", "ffuf"],
  xss:  ["http_request", "httpx", "katana"],
  ssrf: ["http_request", "httpx"],
  csrf: ["http_request", "httpx", "katana"],
  "auth-bypass": ["http_request", "httpx", "ffuf"],
  ato: ["http_request", "httpx"],
  "business-logic": ["http_request", "httpx"],
  graphql: ["http_request", "httpx"],
  "api-misconfig": ["http_request", "httpx", "ffuf", "dirsearch"],
  "open-redirect": ["http_request", "httpx"],
  "file-upload": ["http_request", "httpx"],
  "path-traversal": ["http_request", "httpx", "ffuf"],
  "subdomain-enumeration": ["subfinder", "dns_lookup", "httpx"],
  "port-scanning": ["nmap", "httpx"],
  "tech-fingerprinting": ["httpx", "http_request", "nmap"],
  "security-headers": ["http_request", "httpx"],
};

function slugOf(folder: string): string {
  return folder.replace(/^hunt-/, "");
}

function parseFrontMatter(raw: string): { meta: Record<string, string>; body: string; hadFrontMatter: boolean } {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw.trim(), hadFrontMatter: false };
  const meta: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { meta, body: m[2].trim(), hadFrontMatter: true };
}

function findDuplicateFrontMatter(body: string): { cleaned: string; removed: boolean } {
  // Some skills have a second front-matter block embedded in the middle. Remove it.
  const midPattern = /\n---\nname:.*?\n---\n/s;
  if (midPattern.test(body)) {
    return { cleaned: body.replace(midPattern, "\n"), removed: true };
  }
  return { cleaned: body, removed: false };
}

interface Report { path: string; action: "converted" | "skipped-already-ok" | "skipped-no-front-matter"; notes: string[] }
const reports: Report[] = [];

function convertOne(categoryDir: string, skillDir: string): void {
  const full = join(SKILLS_DIR, categoryDir, skillDir, "SKILL.md");
  if (!existsSync(full)) return;

  const raw = readFileSync(full, "utf8");
  const { meta, body, hadFrontMatter } = parseFrontMatter(raw);

  if (!hadFrontMatter) {
    reports.push({ path: full, action: "skipped-no-front-matter", notes: [] });
    return;
  }

  // Already converted?
  if (raw.includes("\ntriggers:") || raw.startsWith("---\ntriggers:") || /^---\n[\s\S]*?\ntriggers:/.test(raw)) {
    reports.push({ path: full, action: "skipped-already-ok", notes: [] });
    return;
  }

  const slug = slugOf(skillDir);
  const triggers = TRIGGERS[slug] ?? [slug.replace(/-/g, " ")];
  const tools = TOOLS[slug] ?? [];

  // Preserve the original name (hunt-idor) but also derive a human name.
  const humanName = meta.name
    ? meta.name.replace(/^hunt-/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : skillDir;

  const { cleaned, removed } = findDuplicateFrontMatter(body);

  const newFront = [
    "---",
    `name: ${humanName}`,
    `triggers: ${triggers.join(", ")}`,
    tools.length ? `tools: [${tools.join(", ")}]` : "",
    `# original: ${meta.name ?? skillDir}`,
    meta.sources ? `# sources: ${meta.sources}` : "",
    meta.report_count ? `# reports: ${meta.report_count}` : "",
    "---",
  ].filter(Boolean).join("\n");

  const out = `${newFront}\n\n${cleaned.trim()}\n`;
  const notes: string[] = [];
  if (removed) notes.push("removed duplicate front matter");
  notes.push(`triggers: ${triggers.length}, tools: ${tools.length}`);

  if (!DRY_RUN) writeFileSync(full, out);
  reports.push({ path: full, action: "converted", notes });
}

function walk() {
  if (!existsSync(SKILLS_DIR)) {
    console.error(`no skills/ directory at ${SKILLS_DIR}`);
    process.exit(1);
  }
  for (const category of readdirSync(SKILLS_DIR)) {
    const catPath = join(SKILLS_DIR, category);
    try {
      const entries = readdirSync(catPath, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) convertOne(category, e.name);
      }
    } catch {
      // not a directory — skip
    }
  }
}

walk();

const converted = reports.filter((r) => r.action === "converted");
const skippedOk = reports.filter((r) => r.action === "skipped-already-ok");
const skippedBad = reports.filter((r) => r.action === "skipped-no-front-matter");

console.log(`${DRY_RUN ? "[dry-run] " : ""}skill conversion report\n`);
for (const r of reports) {
  const rel = r.path.replace(process.cwd() + "/", "");
  console.log(`  ${r.action.padEnd(28)} ${rel}${r.notes.length ? "  — " + r.notes.join("; ") : ""}`);
}
console.log(`\n${converted.length} converted · ${skippedOk.length} already ok · ${skippedBad.length} skipped`);
if (DRY_RUN && converted.length) console.log(`\nrun without --dry-run to apply.`);
