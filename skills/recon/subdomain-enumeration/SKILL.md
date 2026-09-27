---
name: Subdomain Enumeration
triggers: subdomain, subdomains, enumerate subdomains, subdomain enumeration, passive recon, attack surface
tools: [subfinder, dns_lookup, httpx]
---

# Subdomain Enumeration

## Purpose

Discover subdomains of the target domain to map the attack surface. New subdomains are often the weakest point — forgotten staging servers, admin panels, and dev environments with weaker controls.

## When to use

The user asks to enumerate subdomains, map attack surface, or do passive reconnaissance on a domain.

## Methodology

1. **Passive first.** Run `subfinder -d <domain>` to pull subdomains from certificate transparency logs, public APIs, and passive DNS sources. This does not touch the target's own infrastructure.
2. **Resolve and probe.** For each discovered subdomain, use `dns_lookup` to confirm it resolves, then `httpx` to see if it serves HTTP/S and what it is.
3. **Deduplicate and present.** Group results by root domain. Flag any subdomain that resolves but is not obviously part of the main application — those are the interesting ones.

## Evidence to capture

- The list of discovered subdomains.
- For each: whether it resolves, what it serves, and the HTTP status/technology.
- Any subdomain that appears to be a non-production environment.

## False positives

- Wildcard DNS: if every random subdomain resolves to the same IP, you're seeing a wildcard record, not real subdomains.
- Parked domains and CDN edges — note them but deprioritize.

## Reporting guidance

Present the attack surface as a table. Highlight any subdomain that appears to be an admin panel, staging environment, or API endpoint not linked from the main site.
