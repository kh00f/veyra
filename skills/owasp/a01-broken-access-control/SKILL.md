---
name: A01:2021 Broken Access Control
triggers: broken access control, access control, bac, authorization bypass, missing authorization, idor, directory traversal, forced browsing, csrf, privilege escalation
tools: [http_request, httpx, ffuf, dirsearch]
---

# A01:2021 Broken Access Control

## Purpose

Detect failures where the application does not properly enforce who can do what. This is the #1 category for a reason: it is common, high-impact, and testable without exotic tooling.

## Subclasses

- **IDOR** — user A reads/writes user B's resource by changing an identifier.
- **Missing function-level access control** — an admin endpoint reachable by a normal user, or by no user at all.
- **Forced browsing** — sensitive paths reachable without the intended link.
- **Path traversal** — `../` escapes the intended directory.
- **CSRF** — state-changing request without anti-CSRF token.
- **CORS misconfiguration** — permissive CORS lets another origin read authenticated responses.
- **Privilege escalation** — role change via a request the user should not be able to make.

## Methodology

1. **Enumerate endpoints.** `dirsearch` for hidden paths, `httpx` for linked ones, `katana` if crawling.
2. **Test unauthenticated access.** For every discovered endpoint, try it with no session.
3. **Test horizontal privilege.** If you have two accounts, replay account A's requests as B.
4. **Test vertical privilege.** Normal-user session against an admin path.
5. **Test method tampering.** `GET /admin` may 403 but `POST /admin` may 200.
6. **Check path traversal.** `/files/../../etc/passwd`, encoded variants (`%2e%2e%2f`).
7. **Check CORS.** Send `Origin: https://evil.com`. Look at `Access-Control-Allow-Origin` and `Access-Control-Allow-Credentials`.

## Evidence

- The exact request (method, URL, headers, session role).
- The response (status, body snippet showing unauthorized data or effect).
- A statement of which access-control boundary was crossed.

## False positives

- 403 vs 200-with-error-page. If the body says "access denied", that's access control working.
- Public endpoints are not broken access control. A public profile is public.
- CORS wildcard without credentials is low-impact; with credentials it's critical.

## Reporting

Report the specific boundary crossed, the exact reproduction, and the impact in terms of what the attacker gains. If it chains (IDOR → ATO), report the chain.
