---
name: A08:2021 Software and Data Integrity Failures
triggers: integrity failures, insecure deserialization, deserialization, unsigned update, supply chain, ci cd, webhook signature, untrusted data, pickle, marshalling
tools: [http_request, httpx]
---

# A08:2021 Software and Data Integrity Failures

## Purpose

Detect failures to verify the integrity of code or data — deserializing untrusted data, accepting unsigned updates, webhooks without signature verification, CI/CD pipelines that pull from untrusted sources.

## What to test

1. **Insecure deserialization.**
   - Java: `rO0AB` (base64 of `\xAC\xED\x00\x05`) in cookies, params, bodies.
   - PHP: `O:8:"stdClass"` in serialized cookies.
   - Python: base64 blobs starting with `gASV` (pickle).
   - .NET: `AAEAAAD/////` (BinaryFormatter).
2. **JWT integrity** — overlaps with A07, but `alg: none` is both.
3. **Webhook signature.**
   - Is `X-Hub-Signature` verified?
   - Can you replay a webhook?
   - Can you send a webhook from outside?
4. **Update mechanisms.** Does the app check signatures on auto-update?
5. **CI/CD exposure.** Is `.github/workflows/` or `.gitlab-ci.yml` reachable? Do the build steps pull from untrusted sources?

## Methodology

1. Look for base64 blobs in cookies, headers, and POST bodies. Decode and identify.
2. If it's a serialized object, note the language and framework. Do not blindly deserialize.
3. If a webhook endpoint exists, try sending it a fake payload with no signature.
4. If CI/CD is exposed, look for secrets in the config.

## Evidence

- The base64 blob (or reference to it) with the language identified.
- For webhooks: the request with no signature and the response.
- For CI/CD: the exact file path and what's exposed.

## False positives

- Base64 blobs are often just encoding, not serialization.
- A missing webhook signature is only a finding if the endpoint processes it.

## Reporting

Deserialization findings are usually High/Critical if exploitable. Report the exact sink. For webhook signature, report the endpoint and whether the action has security impact.
