---
name: A04:2021 Insecure Design
triggers: insecure design, design flaw, business logic, threat model, rate limit, no rate limiting, race condition, business logic error, workflow bypass, missing controls
tools: [http_request, httpx]
---

# A04:2021 Insecure Design

## Purpose

Detect flaws in the design of the application, not in its implementation. The category exists because some vulnerabilities cannot be fixed by a patch — the workflow itself is wrong.

## What to test

1. **Rate limiting.** Password reset, OTP verification, login, coupon redemption — every endpoint that should be throttled, and isn't.
2. **Business logic.**
   - Negative quantities in checkout.
   - Price manipulation via parameter tampering.
   - Coupon reuse or stacking.
   - Workflow steps skipped via direct URL.
   - Free-trial extension by resetting a flag.
3. **Race conditions.** Two concurrent requests that should be serialized (redeem-once coupon, withdraw-once balance).
4. **Trust boundaries.** Client-supplied values that the server trusts (role, price, discount, user id).
5. **Password reset design.**
   - Token in URL vs body.
   - Token entropy.
   - Token reuse.
   - Reset link that reveals the email exists.

## Methodology

1. **Enumerate every state-changing operation.** Checkout, signup, password reset, invite, upgrade, cancel.
2. **Test the numeric edges.** Zero, negative, fractional, huge numbers.
3. **Test the ordering.** Do step 3 without step 2. Do step 3 twice.
4. **Test the timing.** Send two identical requests at once. See if both succeed when only one should.
5. **Test what the client sends.** Change a `price` field, a `role` field. Does the server accept it?

## Evidence

- The two (or more) requests that show the flaw.
- The response(s) showing the effect.
- A note on what the intended behavior was (from the UI or docs) vs what happened.

## False positives

- Rate limit not firing after 5 attempts may be intentional (per-IP vs per-account).
- Race condition needs a real-world effect to be a finding; two 200 OKs alone are not.

## Reporting

Describe the workflow, the intended rule, the broken rule, and the impact. Business logic findings are usually Medium-High unless money or account state is affected.
