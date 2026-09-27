---
name: JWT Analysis
triggers: jwt, json web token, token analysis, alg none, jwt confusion, bearer token
tools: [http_request, httpx]
---

# JWT Analysis

## Purpose

Analyze JSON Web Tokens for weak signing, algorithm confusion, missing verification, and claim mishandling.

## When to use

The user asks to test a JWT-based authentication, or you see an `Authorization: Bearer <jwt>` header.

## Methodology

1. **Decode the token.** Three parts separated by `.`. Decode each from base64url. Identify claims: `alg`, `sub`, `role`, `exp`, `iss`, `aud`.
2. **Test `alg: none`.** Re-encode the header with `"alg":"none"`, remove the signature, and re-send. If the server accepts it, that's a critical finding.
3. **Test algorithm confusion (RS256 → HS256).** Only if you have the public key. Sign the token with HS256 using the public key as the HMAC secret. If the server accepts it, that's a critical finding.
4. **Test claim tampering.** Change `role: user` to `role: admin` (or `sub`, `user_id`, `tenant`), re-sign with the same key if you have it, and see whether the server honors the change. If the server honors it *without* a valid signature, that's an authentication bypass.
5. **Test expiry.** An expired token that the server still accepts is a finding (Low/Medium depending on context).
6. **Test signature stripping.** Send `<header>.<payload>.` with an empty signature. Some libraries accept this.
7. **Check key strength.** A JWT signed with a 4-character secret can be brute-forced.

## Evidence to capture

- The original token (redact claims that are not the point of the test).
- The modified token.
- The server's response demonstrating the bypass.

## False positives

- A JWT that the server uses only for *session lookup* (server-side state) is not vulnerable to claim tampering.
- A 401 on the modified token means the server is verifying. That's good, not a finding.

## Reporting guidance

Report as authentication bypass or authorization bypass depending on the impact. CVSS AV:N/AC:L/PR:N/UI:N if unauthenticated, PR:L if authenticated.
