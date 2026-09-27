---
name: Technology Fingerprinting
triggers: fingerprint, what server, what technology, tech stack, what framework, identify technology
tools: [httpx, http_request, nmap]
---

# Technology Fingerprinting

## Purpose

Identify the technologies behind a web application: server software, framework, language, CMS, and any third-party components.

## When to use

The user asks what a target runs, or you need to know the stack before choosing an attack.

## Methodology

1. **HTTP headers first.** `http_request` returns the real headers. Look at `Server`, `X-Powered-By`, `X-Generator`, `Set-Cookie` names, `Via`, `X-AspNet-Version`.
2. **httpx with tech detection.** `httpx -tech-detect -title -status-code <url>` adds fingerprinting from response bodies and known signatures.
3. **Cross-check.** Never trust a single signal. A `Server: nginx` header can be spoofed; cookies and error pages usually can't be.

## Evidence to capture

- The raw headers.
- The httpx tech-detect output.
- Your conclusion: language, framework, server, any obvious third-party components.

## False positives

- CDNs overwrite `Server` headers. A `Server: cloudflare` says nothing about the backend.
- Framework detection by cookie name is strong but not absolute.

## Reporting guidance

State the stack plainly, then state the *implications*: e.g. "Laravel detected → known deserialization issues, look for debug mode; PHP 7.4 → EOL, check for CVE-specific behavior."
