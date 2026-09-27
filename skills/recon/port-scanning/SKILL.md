---
name: Port Scanning
triggers: port scan, port scanning, open ports, nmap, service discovery, which services
tools: [nmap, httpx]
---

# Port Scanning

## Purpose

Identify open TCP ports and the services listening on them. This is the boundary between "the target has a website" and "the target has an attack surface."

## When to use

The user asks to scan ports, discover services, or fingerprint a host's network exposure.

## Methodology

1. **Connect scan on top ports first.** `nmap -sT -Pn --top-ports 1000 <host>`. This needs no root and is a reasonable first pass.
2. **Interpret, don't dump.** For each open port, say what the service likely is (from the banner) and whether it's expected for the target type.
3. **Version detection only when justified.** `intensity: "version"` adds `-sV` with low intensity. Only ask for it if the banner alone is ambiguous.
4. **Never aggressive.** No `-T4`, no `-A`, no scripts. Those are noisy and can break things.

## Evidence to capture

- The full nmap output.
- For each open port: service, version if known, and a one-line note on relevance.

## False positives

- Filtered ports vs. closed ports — nmap reports these differently. Do not describe filtered as open.
- Services behind a reverse proxy — the banner may be the proxy's, not the backend's.

## Reporting guidance

Group findings by port number. Flag any service that:
- runs an outdated version,
- exposes administrative interfaces,
- or should not be reachable from the test's network position.
