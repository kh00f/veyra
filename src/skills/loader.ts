// Skill loader. Each skill is a folder under skills/ with a SKILL.md.
// Front matter declares: name, triggers, tools (allowlist), tier.
// The body is the methodology, injected into the agent's system prompt
// when the router selects this skill for a task.
//
// Adapted from SAM (server/skills.ts) — same parsing rules, same scoring.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, "..", "..", "skills");

export interface Skill {
  id: string;
  name: string;
  triggers: string[];
  tools?: string[];     // if set, the agent may only use these tools while this skill is active
  category: string;     // e.g. "web", "api", "recon"
  body: string;
}

export function parseFrontMatter(raw: string): { meta: Record<string, string | string[]>; body: string } {
  const meta: Record<string, string | string[]> = {};
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta, body: raw.trim() };
  let listKey: string | null = null;
  for (const line of m[1].split("\n")) {
    const item = line.match(/^\s*-\s+(.*)$/);
    if (listKey && item) { (meta[listKey] as string[]).push(unquote(item[1])); continue; }
    listKey = null;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (val === "") { meta[key] = []; listKey = key; }
    else if (val.startsWith("[") && val.endsWith("]")) {
      meta[key] = val.slice(1, -1).split(",").map(unquote).filter(Boolean);
    } else meta[key] = unquote(val);
  }
  return { meta, body: m[2].trim() };
}

const unquote = (s: string) => s.trim().replace(/^["']|["']$/g, "");

function asList(v: string | string[] | undefined): string[] {
  if (Array.isArray(v)) return v.filter(Boolean);
  if (typeof v === "string" && v.trim()) return v.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

export function loadSkills(): Skill[] {
  if (!existsSync(SKILLS_DIR)) return [];
  const skills: Skill[] = [];
  for (const category of readdirSync(SKILLS_DIR)) {
    const catPath = join(SKILLS_DIR, category);
    if (!existsSync(catPath)) continue;
    for (const dir of readdirSync(catPath)) {
      const path = join(catPath, dir, "SKILL.md");
      if (!existsSync(path)) continue;
      const { meta, body } = parseFrontMatter(readFileSync(path, "utf8"));
      const declared = asList(meta.tools);
      skills.push({
        id: `${category}/${dir}`,
        name: (typeof meta.name === "string" && meta.name) || dir,
        triggers: asList(meta.triggers),
        tools: declared.length ? declared : undefined,
        category,
        body,
      });
    }
  }
  return skills;
}

/**
 * Pick the best skill for a message by trigger-word overlap.
 * Scoring is weighted by trigger phrase length (word count), not by hit count —
 * a three-word phrase is stronger evidence than a common single word.
 * Same rule as SAM.
 */
export function routeSkill(message: string, skills: Skill[]): Skill | null {
  const text = message.toLowerCase();
  let best: { skill: Skill; score: number } | null = null;
  for (const s of skills) {
    const score = s.triggers.reduce(
      (acc, t) => (text.includes(t.toLowerCase()) ? acc + t.trim().split(/\s+/).length : acc),
      0,
    );
    if (score > 0 && (!best || score > best.score)) best = { skill: s, score };
  }
  return best?.skill ?? null;
}
