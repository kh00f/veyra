#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const cliPath = join(here, "..", "src", "cli", "index.ts");

const child = spawn(
  "npx",
  ["tsx", cliPath, ...process.argv.slice(2)],
  { stdio: "inherit", cwd: join(here, "..") },
);

child.on("exit", (code) => process.exit(code ?? 0));
