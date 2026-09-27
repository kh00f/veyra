# VEYRA AI

**Autonomous AI-Assisted Penetration Testing Platform.**

VEYRA is a CLI-first, local-model-powered security agent. It runs an
agentic loop over a set of scope-enforced security tools, maintains
engagement state, and produces reproducible findings — but only against
hosts you have explicitly authorized.

## Attribution

VEYRA's architecture is derived from the open-source **SAM** project
(https://github.com/richhabits/sam). The `Tool` and `Provider` interfaces,
the markdown-skill-loader pattern, and the JSON tool-call agent protocol
are adapted from SAM. SAM's original license and attribution apply.
VEYRA is not affiliated with or endorsed by the SAM project.

## Scope & ethics

VEYRA only operates against targets listed in the current engagement's
`inScope`. Hosts matching `outOfScope` are refused even if inScope would
match them. Every scope decision and tool call is written to an append-only
audit log. You are responsible for ensuring you have written authorization
for every target you add to an engagement.

## Install

    npm install
    cp .env.example .env

Requires Node 22+ and (for the local model) Ollama:

    curl -fsSL https://ollama.com/install.sh | sh
    ollama pull llama3.2:3b

## Use

    veyra doctor
    veyra model
    veyra run --engagement example "fetch the headers of http://localhost:3000"
