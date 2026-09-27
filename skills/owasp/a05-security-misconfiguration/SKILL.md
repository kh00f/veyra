---
name: A05:2021 Security Misconfiguration
triggers: security misconfiguration, misconfiguration, default credentials, default password, admin admin, exposed admin, directory listing, verbose errors, stack trace, debug mode, spring boot actuator, exposed git, exposed env, .env, backup file, phpinfo, cors wildcard
tools: [http_request, httpx, dirsearch]
---

# A05:2021 Security Misconfiguration

## Purpose

Detect configuration errors: defaults left on, unnecessary features enabled, verbose errors, exposed admin panels, missing security headers.

## What to test

1. **Default credentials.** `admin/admin`, `admin/password`, `root/root`, `test/test`.
2. **Exposed admin panels.** `/admin`, `/manager`, `/console`, `/actuator`, `/phpmyadmin`, `/.git/`, `/.env`, `/backup.zip`, `/server-status`.
3. **Directory listing.** Paths that return an index of files.
4. **Verbose errors.** Force a 500 (bad parameter, malformed JSON). Look for stack traces, DB strings, file paths.
5. **Debug endpoints.** `?debug=1`, `/debug`, `/graphql` introspection.
6. **Security headers.** Missing `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`.
7. **CORS.** `Access-Control-Allow-Origin: *` with credentials.
8. **Cloud defaults.** Public S3 buckets, open Firebase, exposed `.well-known`.

## Methodology

1. `dirsearch` with the default wordlist and `--extensions=php,env,git,zip,bak,sql`.
2. `httpx -status-code -title -tech-detect` on the root.
3. Manually probe known misconfig paths: `/.git/HEAD`, `/.env`, `/actuator/health`.
4. Force an error (send malformed JSON to an API endpoint) and read the response.
5. Enumerate headers on every response.

## Evidence

- The exact path and status code.
- The response body snippet showing the misconfiguration (redact secrets).
- For default creds: the login request/response showing successful auth.

## False positives

- Custom 404 pages that look like directory listings.
- `.git/` that 200s but returns 404 content.
- Actuator endpoints that are intentionally public for monitoring.

## Reporting

Report severity per item: exposed `.env` with secrets = Critical. Missing CSP = Low. Directory listing = Low-Medium. Default creds = Critical. Never include the actual secret values in the finding — describe their presence.
