import { spawnSync } from "node:child_process";
import { delimiter, dirname, join, resolve } from "node:path";

const command = process.platform === "win32" ? process.execPath : "corepack";
const commandArgs =
  process.platform === "win32"
    ? [join(dirname(process.execPath), "node_modules", "corepack", "dist", "corepack.js")]
    : [];
const workspaceNodePath = resolve("node_modules/.pnpm/node_modules");
const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
const releaseNodeMajor = 24;
const requestedValidationMode = process.env.SOLARA_VALIDATION_MODE?.trim().toLowerCase();
const validationMode =
  process.env.CI === "true"
    ? "strict"
    : requestedValidationMode === "strict" || requestedValidationMode === "advisory"
      ? requestedValidationMode
      : "advisory";
const runtimeOnly = process.argv.includes("--check-runtime");
const skipBuild = process.argv.includes("--skip-build");

if (nodeMajor !== releaseNodeMajor) {
  console.error(
    `El release candidate requiere Node ${releaseNodeMajor}.x; se detectó ${process.version}.`,
  );
  process.exit(1);
}
console.log(`Release ${validationMode}: runtime soportado Node ${nodeMajor}.`);
if (runtimeOnly) {
  process.exit(0);
}

function run(args) {
  const result = spawnSync(command, [...commandArgs, ...args], {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_PATH: [workspaceNodePath, process.env.NODE_PATH].filter(Boolean).join(delimiter),
      PLAYWRIGHT_MULTI_BROWSER: "1",
      SOLARA_E2E_MODE: "all",
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!skipBuild && process.env.SOLARA_SKIP_E2E_BUILD !== "1") {
  run(["pnpm", "--filter", "@solara/studio", "build"]);
}
const playwrightCli = resolve("node_modules/@playwright/test/cli.js");
const result = spawnSync(process.execPath, [playwrightCli, "test"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_PATH: [workspaceNodePath, process.env.NODE_PATH].filter(Boolean).join(delimiter),
    PLAYWRIGHT_MULTI_BROWSER: "1",
    SOLARA_E2E_MODE: "all",
  },
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
