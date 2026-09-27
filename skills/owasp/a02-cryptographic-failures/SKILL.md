---
name: A02:2021 Cryptographic Failures
triggers: cryptographic failures, crypto failures, weak encryption, tls misconfiguration, http not https, cleartext, weak cipher, weak hash, password storage, sensitive data exposure
tools: [http_request, httpx]
---

# A02:2021 Cryptographic Failures

## Purpose

Detect failures to protect data in transit and at rest. This replaced "Sensitive Data Exposure" in 2021 to shift focus from symptom to cause.

## What to test

1. **Transport security.**
   - HTTP not redirecting to HTTPS.
   - Weak TLS versions (TLS 1.0/1.1 accepted).
   - Weak cipher suites (RC4, 3DES, EXPORT).
   - Invalid, expired, or self-signed certificates.
   - Mixed content: HTTPS page loading HTTP resources.
2. **Cookie flags.**
   - Missing `Secure` on session cookies.
   - Missing `HttpOnly`.
   - Missing or weak `SameSite`.
3. **HSTS.**
   - Missing `Strict-Transport-Security`.
   - Short `max-age`.
   - Missing `includeSubDomains`.
4. **Data in responses.**
   - Passwords, tokens, keys, PII in JSON/HTML responses.
   - Verbose error pages exposing stack traces or DB strings.
5. **Hashing.**
   - Not directly testable from outside, but if you see MD5/SHA1 hashes in responses, note them.

## Evidence

- The request and response showing cleartext transmission or missing header.
- For TLS: the exact endpoint, TLS version, cipher suite.
- For data in responses: the specific field and value (redact if PII).

## False positives

- HSTS on a local/dev environment may be intentionally absent.
- Self-signed certificates on internal tools are a policy decision, not always a finding.
- A hash in a response is not always sensitive.

## Reporting

For missing headers, report as a hardening finding (Low). For cleartext transmission of credentials or PII, High/Critical. Never report "uses MD5" without context — that's a code-review finding, not a runtime finding.
