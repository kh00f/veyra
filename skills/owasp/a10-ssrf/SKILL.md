---
name: A10:2021 Server-Side Request Forgery
triggers: ssrf, server-side request forgery, internal request, cloud metadata, metadata endpoint, 169.254, imds, url parameter, fetch url, webhook ssrf
tools: [http_request, httpx, ffuf]
---

# A10:2021 Server-Side Request Forgery

## Purpose

Detect cases where the server can be made to fetch an attacker-chosen URL. Impact ranges from internal port scan to cloud credential theft (AWS IMDS, GCP metadata).

## Where it lives

- URL parameters: `?url=`, `?next=`, `?image=`, `?webhook=`, `?feed=`, `?avatar=`.
- POST body fields: image URL, RSS URL, webhook target.
- HTTP headers the app trusts: `X-Forwarded-For`, `Referer` used for image proxying.
- PDF/document generators: HTML → PDF with remote resources.
- Webhook tests: "send a test event to this URL".
- OAuth/OIDC: `redirect_uri` when mishandled.

## Methodology

1. **Find an SSR-capable endpoint.** Test each by pointing it at a server you control (or a collaborator domain). See if the request comes from the app server's IP.
2. **Test localhost.** `http://127.0.0.1:22`, `http://localhost:8080`, `http://[::1]`.
3. **Test cloud metadata.** `http://169.254.169.254/latest/meta-data/` (AWS), `http://metadata.google.internal/` (GCP), `http://169.254.169.254/metadata/instance?api-version=2021-02-01` (Azure).
4. **Test bypasses when blocked.**
   - Decimal IP: `http://2130706433/` = 127.0.0.1.
   - Octal: `http://0177.0.0.1/`.
   - Hex: `http://0x7f.0.0.1/`.
   - Redirect chain: point at `http://your-server/redirect?to=http://169.254.169.254/`.
   - DNS rebinding.
   - IPv6-mapped: `http://[::ffff:127.0.0.1]/`.
5. **Fingerprint the response.** Compare responses for existing vs non-existing internal hosts to detect a port scanner behavior.

## Evidence

- The exact request that triggered the SSRF.
- The response from the app, showing data from the internal target (metadata field, banner, internal page).
- A statement of which trust boundary was crossed (internet → internal network, app server → cloud metadata).

## False positives

- Some apps intentionally fetch user URLs (RSS readers, image proxies) — that's a design decision, not an SSRF.
- A response that returns "could not fetch" is not SSRF evidence. You need to see the internal response.

## Reporting

SSRF is High/Critical depending on impact. Report the exact URL parameter, the payload, and what was reachable. If cloud metadata was reachable, report as Critical — that's account takeover territory.
