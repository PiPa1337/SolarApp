import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const corepack = resolve(
  dirname(process.execPath),
  "node_modules",
  "corepack",
  "dist",
  "corepack.js",
);
const reportDir = resolve(
  root,
  process.env.SOLARA_PERF_REPORT_DIR ?? "test-results/performance/rm-descartables",
);

const child = spawn(
  process.execPath,
  [
    corepack,
    "pnpm",
    "exec",
    "playwright",
    "test",
    "tests/e2e/rm-performance.spec.ts",
    "--workers=1",
    "--retries=0",
    "--reporter=list",
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      SOLARA_E2E_MODE: process.env.SOLARA_E2E_MODE ?? "audit",
      SOLARA_PERF_PLAYWRIGHT_OUTPUT_DIR: resolve(reportDir, "playwright"),
    },
    stdio: "inherit",
  },
);

child.once("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.once("close", (code) => {
  if (code !== 0) process.exitCode = code ?? 1;
});
