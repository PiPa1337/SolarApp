import { execSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, resolve } from "node:path";
import { findChangedScriptTests, mapFilesToPackages } from "./test-affected-map.mjs";
import { expandImpactedPackages, packageTestHash } from "./test-impact.mjs";

const args = process.argv.slice(2);
const shouldRunAll = args.includes("--all") || args.includes("--full");
const disableCache = args.includes("--no-cache") || process.env.SOLARA_TEST_CACHE === "0";
let baseRef = "HEAD";
for (const arg of args) if (arg.startsWith("--base=")) baseRef = arg.slice(7);

function getChangedFiles() {
  if (shouldRunAll) return null;
  try {
    let out = "";
    try {
      out = execSync(`git diff --name-only ${baseRef}...HEAD`, { encoding: "utf8", stdio: "pipe" });
    } catch {
      out = execSync("git diff --name-only HEAD", { encoding: "utf8", stdio: "pipe" });
    }
    const files = out
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);
    for (const command of ["git diff --name-only", "git diff --name-only --cached"]) {
      try {
        files.push(
          ...execSync(command, { encoding: "utf8", stdio: "pipe" })
            .split("\n")
            .map((value) => value.trim())
            .filter(Boolean),
        );
      } catch {}
    }
    return [...new Set(files)];
  } catch {
    return null;
  }
}

function runCorepack(args, options = {}) {
  const executable = process.platform === "win32" ? process.execPath : "corepack";
  const finalArgs =
    process.platform === "win32"
      ? [
          resolve(process.execPath, "..", "node_modules", "corepack", "dist", "corepack.js"),
          ...args,
        ]
      : args;
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(executable, finalArgs, { stdio: "inherit", ...options });
    child.on("close", (code) => resolveRun(code ?? 1));
    child.on("error", rejectRun);
  });
}

const cachePath = resolve("node_modules", ".cache", "solara-tests", "affected.json");

function readCache() {
  if (disableCache) return {};
  try {
    return JSON.parse(readFileSync(cachePath, "utf8"));
  } catch {
    return {};
  }
}

function persistCache(cache) {
  if (disableCache) return;
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}

async function runPackage(packageName, workerBudget, cache) {
  const hash = packageTestHash(packageName);
  if (cache[packageName] === hash) {
    console.log(`[affected] SKIP ${packageName}: hash sin cambios, resultado reutilizado`);
    return 0;
  }
  console.log(`[affected] RUN ${packageName} (${workerBudget} workers)`);
  const code = await runCorepack(["pnpm", "--filter", packageName, "test"], {
    env: { ...process.env, SOLARA_TEST_WORKERS: String(workerBudget) },
  });
  if (code === 0) cache[packageName] = hash;
  return code;
}

async function main() {
  const changed = getChangedFiles();
  const directPackages = mapFilesToPackages(changed);
  const changedScriptTests = findChangedScriptTests(changed);

  if (changedScriptTests.length > 0) {
    console.log(`[affected] Tests de scripts afectados: ${changedScriptTests.join(", ")}`);
    const code = await runCorepack([
      "pnpm",
      "exec",
      "vitest",
      "run",
      ...changedScriptTests,
      "--maxWorkers",
      String(availableParallelism()),
    ]);
    if (code !== 0) process.exit(code);
  }

  if (!directPackages) {
    console.log("[affected] Cambios amplios o --all -> suite normal completa");
    const code = await runCorepack([
      "pnpm",
      "-r",
      "--workspace-concurrency=1",
      "--if-present",
      "test",
    ]);
    process.exit(code);
  }
  if (directPackages.length === 0) {
    if (changedScriptTests.length === 0)
      console.log("[affected] Solo infra/docs -> sin tests de paquete");
    return;
  }

  const impacted = expandImpactedPackages(directPackages);
  console.log(`[affected] Directos: ${directPackages.join(", ")}`);
  console.log(`[affected] Impacto transitivo: ${impacted.join(", ")}`);

  const totalWorkers = Math.max(1, availableParallelism());
  const workerBudget = Math.max(1, Math.floor(totalWorkers / impacted.length));
  const cache = readCache();
  const results = await Promise.all(
    impacted.map((packageName) => runPackage(packageName, workerBudget, cache)),
  );
  persistCache(cache);
  const failure = results.find((code) => code !== 0);
  if (failure !== undefined) process.exit(failure);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
