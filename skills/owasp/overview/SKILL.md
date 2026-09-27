---
name: OWASP Top 10 — Overview
triggers: owasp, owasp top 10, top 10, owasp 2021, full web assessment, web application security review, standard web checklist
tools: [http_request, httpx, nmap, nuclei, ffuf, katana, dirsearch]
---

# OWASP Top 10 — Overview

## Purpose

Run a structured assessment against the OWASP Top 10:2021 categories. This is the map; the ten category skills are the terrain. Use this skill to plan a full pass, and switch to a specific category skill when you have a hypothesis.

## The ten categories

| ID | Category | Primary symptom |
|---|---|---|
| A01 | Broken Access Control | You can access or modify what you shouldn't |
| A02 | Cryptographic Failures | Data exposed in transit or at rest without adequate protection |
| A03 | Injection | User input reaches an interpreter (SQL, OS, LDAP, XPath, template) |
| A04 | Insecure Design | The threat model is wrong before any code was written |
| A05 | Security Misconfiguration | Default credentials, open cloud storage, verbose errors |
| A06 | Vulnerable and Outdated Components | Known CVEs in libraries, frameworks, or the base image |
| A07 | Identification and Authentication Failures | Weak auth: credential stuffing, session fixation, no lockout |
| A08 | Software and Data Integrity Failures | Untrusted deserialization, unsigned updates, CI/CD tampering |
| A09 | Security Logging and Monitoring Failures | Nobody would notice the attack |
| A10 | Server-Side Request Forgery | The server can be made to fetch an attacker-chosen URL |

## Methodology

1. **Reconnaissance first.** Map the surface with `httpx`, `katana`, `dirsearch`. Know what's there before testing categories.
2. **Pick the categories that fit the app.** A static site has no A03. An API with no auth has A07 before A01.
3. **Test one category at a time.** Do not shotgun.
4. **Record findings as you go.** One finding per concrete issue, with evidence.
5. **Stop when you have coverage, not when you have volume.**

## Reporting

Group findings by category. Note which categories were tested and found clean, and which were not tested (with the reason). This is more valuable than a false-positive list.
