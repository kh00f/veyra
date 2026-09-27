---
name: A06:2021 Vulnerable and Outdated Components
triggers: vulnerable components, outdated components, cve, known vulnerability, old version, outdated library, vulnerable dependency, nuclei cve, component version
tools: [http_request, httpx]
---

# A06:2021 Vulnerable and Outdated Components

## Purpose

Detect versions of software components (frameworks, libraries, CMSs, servers) with known vulnerabilities.

## What to test

1. **Banner versions.** `Server:`, `X-Powered-By:`, `X-Generator:`, `X-AspNet-Version:`, `X-Drupal-Cache:`.
2. **Framework fingerprints.** CMS-specific cookies (`wordpress_`, `PHPSESSID`, `JSESSIONID`), body markers (`/wp-content/`, `/drupal/`), generator meta tags.
3. **Static asset paths.** `/wp-includes/js/jquery/jquery.js?ver=1.12.4` reveals the jQuery version.
4. **Known CVE endpoints.** `/wp-login.php` (WordPress), `/administrator/` (Joomla), `/user/login` (Drupal).
5. **JS library versions.** From bundle paths, source maps, `package.json` if exposed.

## Methodology

1. `httpx -tech-detect` on the target — gives you the framework stack.
2. `httpx -title -status-code` on any asset that looks like a JS bundle.
3. Extract version strings from headers, HTML, and asset paths.
4. Cross-reference against public CVE databases.
5. Only test a specific CVE if it's non-destructive — never run an exploit PoC without explicit authorization.

## Evidence

- The exact banner, header, or asset path showing the version.
- The inferred component name + version.
- A reference to the CVE or advisory (URL, ID).
- A statement about whether the CVE is exploitable in this specific deployment.

## False positives

- A version banner can be spoofed or routed through a CDN.
- A CVE against a library version does not mean the CVE is reachable in this app.
- "jQuery 3.x" is not a finding by itself; "jQuery 1.12.4 with CVE-2020-11022 reachable via user input" is.

## Reporting

Report the component, version, CVE, and reachability. If you can't establish reachability, say so and lower the severity.

