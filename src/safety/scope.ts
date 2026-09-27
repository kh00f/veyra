// Scope enforcement. Every scopeRequired tool call passes through here.
// This is VEYRA's hard gate — no target outside the engagement's in-scope
// list can be touched, and any target in the out-of-scope list is refused
// even if it would match an in-scope wildcard.

export type { Engagement } from "../engagement/store.ts";
export { loadEngagement } from "../engagement/store.ts";

import type { Engagement } from "../engagement/store.ts";

/** Extract host from a URL or bare hostname. Returns null on unparseable input. */
export function hostOf(target: string): string | null {
  try {
    if (/^https?:\/\//i.test(target)) return new URL(target).hostname.toLowerCase();
    return target.toLowerCase().replace(/:\d+$/, "").replace(/\/.*$/, "");
  } catch {
    return null;
  }
}

/** Match a host against a scope pattern (supports `*.example.com`). */
export function hostMatches(host: string, pattern: string): boolean {
  const p = pattern.toLowerCase().trim();
  if (p.startsWith("*.")) {
    const base = p.slice(2);
    return host === base || host.endsWith("." + base);
  }
  return host === p;
}

export function checkScope(eng: Engagement, target: string): { allowed: boolean; reason: string } {
  const host = hostOf(target);
  if (!host) return { allowed: false, reason: `cannot parse host from "${target}"` };

  for (const pattern of eng.outOfScope) {
    if (hostMatches(host, pattern)) {
      return { allowed: false, reason: `"${host}" is explicitly out of scope (matches ${pattern})` };
    }
  }
  for (const pattern of eng.inScope) {
    if (hostMatches(host, pattern)) {
      return { allowed: true, reason: `"${host}" in scope (matches ${pattern})` };
    }
  }
  return { allowed: false, reason: `"${host}" is not in scope for engagement ${eng.id}` };
}
