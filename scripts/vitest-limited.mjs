import { spawn } from "node:child_process";
import { availableParallelism } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  killProcessTree,
  readCliNumberOption,
  resolveTimeoutMs,
  spawnDetachedWatchdog,
} from "./test-runner-guard.mjs";

const DEFAULT_WORKERS = availableParallelism();
const MAX_CONFIGURABLE_WORKERS = 64;
const DEFAULT_RUN_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_RUN_TIMEOUT_MS = 60 * 60 * 1000;

function workerLimit(value) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_WORKERS;
  return Math.min(parsed, MAX_CONFIGURABLE_WORKERS);
}

function hasOption(args, name) {
  return args.some((arg) => arg === name || arg.startsWith(`${name}=`));
}

const workers = workerLimit(process.env.SOLARA_TEST_WORKERS);
const forwardedArgs = process.argv.slice(2);
const singleThread = forwardedArgs.some((arg) => arg.includes("singleThread"));
const args = [...forwardedArgs];

if (!singleThread && !hasOption(args, "--maxWorkers")) {
  args.push("--maxWorkers", String(workers));
}
if (!singleThread && !hasOption(args, "--minWorkers")) {
  args.push("--minWorkers", "1");
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vitestCli = resolve(repoRoot, "node_modules", "vitest", "vitest.mjs");
const testTimeoutMs = readCliNumberOption(args, "--testTimeout");
const inferredRunTimeoutMs = Math.max(
  DEFAULT_RUN_TIMEOUT_MS,
  testTimeoutMs ? testTimeoutMs * 2 : 0,
);
const runTimeoutMs = resolveTimeoutMs(
  process.env.SOLARA_VITEST_RUN_TIMEOUT_MS,
  inferredRunTimeoutMs,
  MAX_RUN_TIMEOUT_MS,
);
const child = spawn(process.execPath, [vitestCli, ...args], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
  detached: process.platform !== "win32",
});
const watchdog = spawnDetachedWatchdog(process.pid, child.pid);
let closing = false;

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
    `[vitest-limited] Tiempo máximo excedido (${Math.round(runTimeoutMs / 1000)} s). Cerrando el árbol de Vitest.`,
  );
  finish(124);
}, runTimeoutMs);

for (const signal of ["SIGINT", "SIGTERM", ...(process.platform === "win32" ? ["SIGBREAK"] : [])]) {
  process.on(signal, () => finish(130));
}

child.on("error", (error) => {
  console.error(`[vitest-limited] No se pudo iniciar Vitest: ${error.message}`);
  finish(1);
});
child.on("exit", (code) => finish(code ?? 1));

process.on("exit", () => {
  stopChildTree();
  stopWatchdog();
});
