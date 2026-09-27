// web_fetch — public read-only HTTP fetch. Does NOT check engagement scope,
// because reading a public URL is the same as opening it in a browser.
// Separate from http_request, which tests a scoped target.

import { register, type Tool } from "./registry.ts";
import { writeAudit } from "../safety/audit.ts";

const VEYRA_UA =
  process.env.VEYRA_USER_AGENT || "VEYRA/0.1 (authorized-security-testing)";

export const webFetch: Tool = {
  name: "web_fetch",
  safe: true,
  scopeRequired: false,
  description:
    "Fetch a public URL as a read-only reference — the same as opening it in a browser. " +
    "Use this when the user gives you a specific public URL to look at (a profile page, " +
    "a documentation page, a blog post, a GitHub README). " +
    "Do NOT use this to probe, fuzz, or test a target — for that use http_request with an engagement. " +
    "Params: { url, method? }",
  params: "{ url, method? }",
  activity: (input: any) => `fetching ${input?.url ?? "?"}`,
  run: async (input: any, ctx) => {
    const url = String(input?.url ?? "").trim();
    if (!url) return "error: url is required";
    if (!/^https?:\/\//i.test(url)) return `error: url must start with http:// or https://`;

    const method = String(input?.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      return `error: web_fetch only supports GET and HEAD (got ${method})`;
    }

    writeAudit({
      engagement: ctx.engagementId,
      kind: "tool_call",
      tool: "web_fetch",
      input: { url, method },
      allowed: true,
      reason: "public read (no scope check)",
    });

    try {
      const res = await fetch(url, {
        method,
        headers: { "User-Agent": VEYRA_UA },
        signal: AbortSignal.timeout(30_000),
        redirect: "follow",
      });
      const text = await res.text();
      const truncated =
        text.length > 6000
          ? text.slice(0, 6000) + `\n…(truncated ${text.length - 6000} chars)`
          : text;
      const headers = [...res.headers.entries()]
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n");
      return `HTTP ${res.status} ${res.statusText}\n${headers}\n\n${truncated}`;
    } catch (e: any) {
      const cause = e?.cause?.code ?? e?.cause?.message ?? e?.cause ?? "";
      return `fetch failed: ${e?.message ?? e}${cause ? ` (${cause})` : ""}`;
    }
  },
};

register(webFetch);
