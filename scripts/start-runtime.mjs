#!/usr/bin/env node
// Runtime entrypoint for container images without /bin/sh.
// Runs migrations first, then launches the Next.js standalone server.

import { spawn, spawnSync } from "node:child_process";

const migrate = spawnSync(process.execPath, ["scripts/migrate.mjs"], {
  stdio: "inherit",
});

if (typeof migrate.status === "number" && migrate.status !== 0) {
  process.exit(migrate.status);
}

if (migrate.error) {
  console.error("[startup] migration process failed:", migrate.error);
  process.exit(1);
}

const server = spawn(process.execPath, ["server.js"], {
  stdio: "inherit",
});

const forwardSignal = (signal) => {
  if (!server.killed) server.kill(signal);
};

process.on("SIGINT", forwardSignal);
process.on("SIGTERM", forwardSignal);

server.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

