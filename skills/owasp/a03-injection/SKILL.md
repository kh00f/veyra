---
name: A03:2021 Injection
triggers: injection, sql injection, sqli, nosql injection, command injection, os command, ldap injection, xpath injection, template injection, ssti, xss, cross-site scripting, crlf injection, header injection
tools: [http_request, httpx, ffuf]
---

# A03:2021 Injection

## Purpose

Detect cases where untrusted input is interpreted as code or query by a downstream interpreter: SQL, NoSQL, OS shell, LDAP, XPath, template engines, and the browser (XSS).

## Subclasses and quick tests

- **SQL injection** — `'`, `"`, `)`, and boolean/`SLEEP` differential tests.
- **NoSQL injection** — `{"$ne": null}`, `{"$gt": ""}` in JSON bodies.
- **Command injection** — `; id`, `| whoami`, `$(sleep 5)` in parameters that reach a shell.
- **SSTI** — `{{7*7}}`, `${7*7}`, `<%= 7*7 %>` — look for `49` in the response.
- **LDAP injection** — `*)(uid=*))(|(uid=*` in auth fields.
- **XPath injection** — `' or '1'='1` in XML-backed search.
- **CRLF / header injection** — `%0d%0aSet-Cookie:` in a parameter reflected to a header.

## Methodology

1. **Baseline.** Record status, length, and time for a benign value.
2. **Error signals.** Send metacharacters (`'`, `"`, backtick, `;`, `|`). A 500, a DB error, or a length change is a signal.
3. **Boolean differential.** `1 AND 1=1` vs `1 AND 1=2` — do the responses differ?
4. **Time-based.** `SLEEP(5)` (MySQL), `pg_sleep(5)` (Postgres), `WAITFOR DELAY` (MSSQL). If the response takes 5s longer, confirmed.
5. **Never dump.** Detection is the goal. Extraction only if explicitly authorized.

## Evidence

- The baseline request/response.
- The injection request and its unique response (error, differential, or timing).
- A measured timing pair if time-based.

## False positives

- WAF 403 on `'` is a WAF block, not injection.
- A stack trace showing "SQL" might be a static fixture.
- Timing noise: run the time-based test twice.

## Reporting

State: injection type, exact parameter, exact payload, measured evidence. Do not include extracted data unless explicitly authorized.
