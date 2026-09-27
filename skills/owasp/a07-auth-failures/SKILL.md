---
name: A07:2021 Identification and Authentication Failures
triggers: auth failures, authentication failures, broken authentication, login bypass, weak password, credential stuffing, session fixation, session hijacking, no lockout, mfa bypass, password reset, jwt, token
tools: [http_request, httpx]
---

# A07:2021 Identification and Authentication Failures

## Purpose

Detect weaknesses in how the application confirms identity.

## What to test

1. **Credential policy.** Minimum length? Breach check? Common passwords allowed?
2. **Login response.** Does the app reveal "user not found" vs "wrong password"?
3. **Rate limiting on login.** Try 10 wrong passwords. Does it lock?
4. **Session management.**
   - Session ID entropy.
   - Session ID rotation on login.
   - Logout invalidates server-side.
   - Cookie flags (`Secure`, `HttpOnly`, `SameSite`).
5. **Password reset.**
   - Token entropy.
   - Token expiry.
   - Token reuse.
   - Reset link leaks email existence.
6. **JWT.**
   - `alg: none` accepted?
   - Algorithm confusion (RS256 → HS256)?
   - Expiry checked?
   - Signature stripped (`header.payload.`)?
7. **MFA bypass.** Is MFA enforced on every authentication path? Password reset? OAuth link?
8. **Default credentials.** Already covered in A05, but relevant here.

## Methodology

1. Enumerate every auth path: login, register, password reset, MFA, OAuth callback, "remember me".
2. For each, test the failure cases (bad credentials, expired token, malformed token).
3. Capture the session cookie lifecycle. Check rotation on login.
4. Decode any JWT. Tamper with `sub`, `role`, `exp`.
5. Check the response on lockout — is there any?

## Evidence

- The request that bypassed a control.
- The response showing the effect (session issued, token accepted, reset link returned).
- For missing controls: a note on what the app should have done.

## False positives

- Password-reset tokens that expire in 5 minutes are fine; the finding is when they don't expire.
- No lockout for a password manager user is a design decision, not always a vuln. Severity depends on the threat model.

## Reporting

Auth findings are usually High or Critical. Report the exact bypass path and whether it affects all users or only specific ones (e.g. accounts without MFA).
