---
name: A09:2021 Security Logging and Monitoring Failures
triggers: logging failures, monitoring failures, no logging, no alert, log injection, log forging, insufficient logging, audit log, siem
tools: [http_request, httpx]
---

# A09:2021 Security Logging and Monitoring Failures

## Purpose

Detect cases where an attack would go unnoticed. This category is inherently hard to test from outside, because absence of logging is invisible. It's usually found through review, not through scanning.

## What you can test from outside

1. **Log injection / log forging.** If a parameter you control appears in a log, can you inject newlines (`%0a%0d`) to forge log entries?
2. **Error path handling.** Does the app return a generic error to the user while logging the detail, or does it leak the detail and log nothing?
3. **Rate limit silence.** Send 100 login attempts. Does the app respond identically each time (no lockout, no increasing delay) — suggesting no alerting?
4. **Response timing uniformity.** Timing differences can reveal whether the app checks authentication state before or after logging.

## What you cannot test from outside

- Whether logs are actually shipped to a SIEM.
- Whether alerts fire on specific patterns.
- Whether the retention window is adequate.
- Whether logs contain PII (which is itself a problem).

## Methodology

1. If you find any input reflection into logs, test for CRLF injection.
2. Send a batch of unauth'd requests to a sensitive endpoint and watch for behavior change (rate limit, lockout, response-time increase).
3. Note the absence of any behavioral signal as a *potential* finding, not a confirmed one.

## Evidence

- The behavior you observed (identical responses, no lockout after N attempts).
- A statement of what you would expect to see if logging were adequate.

## False positives

- Many apps log centrally and never expose the logging to the response. Absence of visible behavior ≠ absence of logging.
- This is the OWASP category with the highest rate of "found nothing" — that's fine.

## Reporting

Report as Low by default. Only report as Medium+ if you can demonstrate an actual attack path that would be invisible. Be honest that this is a partial-coverage category from a black-box test.
