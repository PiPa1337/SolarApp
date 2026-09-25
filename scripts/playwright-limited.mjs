import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { killProcessTree, resolveTimeoutMs, spawnDetachedWatchdog } from "./test-runner-guard.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), "..");
const DEFAULT_RUN_TIMEOUT_MS = 20 * 60 * 1000;
const MAX_RUN_TIMEOUT_MS = 180 * 60 * 1000;

const playwrightCli = resolve(repoRoot, "node_modules", "@playwright", "test", "cli.js");
const child = spawn(process.execPath, [playwrightCli, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
  detached: process.platform !== "win32",
});
const watchdog = spawnDetachedWatchdog(process.pid, child.pid);

let closing = false;
const runTimeoutMs = resolveTimeoutMs(
  process.env.PLAYWRIGHT_RUN_TIMEOUT_MS,
  DEFAULT_RUN_TIMEOUT_MS,
  MAX_RUN_TIMEOUT_MS,
);

function stopChildTree() {
  if (closing) return;
  closing = true;
  killProcessTree(child.pid);
}

function stopWatchdog() {
  if (!watchdog.pid || watchdog.exitCode !== null) return;
  try {
    process.kill(watchdog.pid, "SIGTERM");
  } catch {
    // El watchdog ya terminó.
  }
}

function finish(code) {
  clearTimeout(runTimeout);
  stopChildTree();
  stopWatchdog();
  process.exit(code);
}

const runTimeout = setTimeout(() => {
  console.error(
    `[playwright-limited] Tiempo máximo excedido (${Math.round(runTimeoutMs / 60000)} min). Cerrando el árbol de Playwright.`,
  );
  finish(124);
}, runTimeoutMs);

for (const signal of ["SIGINT", "SIGTERM", ...(process.platform === "win32" ? ["SIGBREAK"] : [])]) {
  process.on(signal, () => {
    finish(130);
  });
}

child.on("error", (error) => {
  console.error(`[playwright-limited] No se pudo iniciar Playwright: ${error.message}`);
  finish(1);
});
// `exit` se usa deliberadamente en lugar de `close`: un nieto que herede stdio
// no debe mantener vivo al wrapper después de que el proceso de Playwright terminó.
child.on("exit", (code) => finish(code ?? 1));

process.on("exit", () => {
  stopChildTree();
  stopWatchdog();
});
