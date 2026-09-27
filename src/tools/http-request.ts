// http_request — the simplest scope-respecting tool.
// VEYRA's tools are all built on this template: declare scopeRequired,
// call ctx.scopeCheck before the network call, and audit the decision.

import { register, type Tool } from "./registry.ts";

export const httpRequest: Tool = {
  name: "http_request",
  safe: true,
  scopeRequired: true,
  description: "Send an HTTP request to an authorized URL and return status, headers, and body (truncated).",
  params: "{ url, method?, headers?, body? }",
  activity: (input: any) => `requesting ${input?.url ?? "?"}`,
  run: async (input: any, ctx) => {
    const url = String(input?.url ?? "");
    if (!url) return "error: url is required";
    const check = ctx.scopeCheck(url);
    ctx.audit({ tool: "http_request", input, allowed: check.allowed, reason: check.reason });
    if (!check.allowed) return `refused: ${check.reason}`;

    const method = String(input?.method ?? "GET").toUpperCase();
    const headers = input?.headers && typeof input.headers === "object" ? input.headers : {};
    const body = input?.body ?? undefined;

    const res = await fetch(url, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : (typeof body === "string" ? body : JSON.stringify(body)),
      signal: AbortSignal.timeout(30_000),
      redirect: "manual",
    });
    const text = await res.text();
    const truncated = text.length > 4000 ? text.slice(0, 4000) + `\n…(truncated ${text.length - 4000} chars)` : text;
    const headerLines = [...res.headers.entries()].map(([k, v]) => `${k}: ${v}`).join("\n");
    return `HTTP ${res.status} ${res.statusText}\n${headerLines}\n\n${truncated}`;
  },
};

register(httpRequest);
