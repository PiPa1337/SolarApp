import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const TEST_FILE = /\.(?:test|spec)\.(?:[cm]?js|tsx?)$/i;
const EXCLUDED_PATHS = ["/node_modules/", "/dist/", "/back up/", "/.local-backups/"];
const DAILY_SMOKE_E2E = new Set([
  "/tests/e2e/exported-store.spec.ts",
  "/tests/e2e/storefront-nojs.spec.ts",
  "/tests/e2e/interacciones.spec.ts",
  "/tests/e2e/focus-visible.spec.ts",
  "/tests/e2e/exporter-sentinel.spec.ts",
]);
const excludes = process.argv
  .filter((arg) => arg.startsWith("--exclude="))
  .map((arg) => arg.slice("--exclude=".length).trim().toLowerCase())
  .filter(Boolean);
const strict = process.argv.includes("--strict");

function trackedFiles() {
  const commands = [["ls-files"], ["ls-files", "--others", "--exclude-standard"]];
  const files = [];
  for (const args of commands) {
    const result = spawnSync("git", args, { encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(result.stderr || "No se pudo enumerar archivos del repositorio.");
    }
    files.push(...result.stdout.split(/\r?\n/).filter(Boolean));
  }
  return [...new Set(files)];
}

function normalized(pathname) {
  return `/${pathname.replaceAll("\\", "/").toLowerCase()}`;
}

function layer(pathname) {
  const path = normalized(pathname);
  if (path.startsWith("/tests/e2e/")) return "e2e";
  if (path.startsWith("/apps/studio/")) return "studio";
  if (path.startsWith("/scripts/")) return "scripts";
  const packageMatch = path.match(/^\/packages\/([^/]+)\//);
  return packageMatch?.[1] ?? "other";
}

function count(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function testTitles(source) {
  return [
    ...source.matchAll(
      /(?<![\w.])(?:test|it)(?:\.(?:skip|only|todo))?\s*\(\s*["'`]([^"'`\r\n]+)["'`]/g,
    ),
  ].map((match) => match[1]);
}

const files = trackedFiles()
  .filter((pathname) => TEST_FILE.test(pathname))
  .filter((pathname) => existsSync(pathname))
  .filter((pathname) => {
    const path = normalized(pathname);
    if (EXCLUDED_PATHS.some((fragment) => path.includes(fragment))) return false;
    return !excludes.some((fragment) => path.includes(fragment));
  });

const rows = files.map((pathname) => {
  const source = readFileSync(pathname, "utf8");
  const tests = count(source, /(?<![\w.])(?:test|it)(?:\.(?:skip|only|todo))?\s*\(/g);
  const expects = count(source, /\bexpect\s*\(/g);
  const assertions = expects + count(source, /\bassert(?:\.|\s*\()/g);
  return {
    pathname,
    layer: layer(pathname),
    lines: source.split(/\r?\n/).length,
    tests,
    assertions,
    waits: count(source, /\bwaitForTimeout\s*\(/g),
    emptyCatches: count(source, /catch\s*\{\s*\}/g),
    weakAssertions: count(source, /\.(?:toBeTruthy|toBeDefined)\s*\(/g),
    skipped: count(source, /(?<![\w.])(?:test|it)\.(?:skip|todo)\s*\(/g),
    focused: count(source, /(?<![\w.])(?:test|it)\.only\s*\(/g),
    snapshots: count(source, /\.toMatch(?:Inline)?Snapshot\s*\(/g),
    titles: testTitles(source),
  };
});

const byLayer = new Map();
for (const row of rows) byLayer.set(row.layer, (byLayer.get(row.layer) ?? 0) + 1);

const duplicateTitles = new Map();
for (const row of rows) {
  for (const title of row.titles) {
    const locations = duplicateTitles.get(title) ?? [];
    locations.push(row.pathname);
    duplicateTitles.set(title, locations);
  }
}
const duplicates = [...duplicateTitles.entries()]
  .filter(([, locations]) => new Set(locations).size > 1)
  .map(([title, locations]) => ({ title, locations: [...new Set(locations)] }))
  .sort((a, b) => b.locations.length - a.locations.length || a.title.localeCompare(b.title));

const noAssertions = rows.filter((row) => row.tests > 0 && row.assertions === 0);
const unexpectedNoAssertions = noAssertions;
const focused = rows.filter((row) => row.focused > 0);
const waits = rows.filter((row) => row.waits > 0).sort((a, b) => b.waits - a.waits);
const dailySmokeWaits = waits.filter((row) => DAILY_SMOKE_E2E.has(normalized(row.pathname)));
const emptyCatches = rows.filter((row) => row.emptyCatches > 0);
const largest = [...rows].sort((a, b) => b.lines - a.lines).slice(0, 15);

console.log(`[test-audit] ${rows.length} archivos de test`);
console.log(
  `[test-audit] capas: ${[...byLayer.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, total]) => `${name}=${total}`)
    .join(", ")}`,
);
console.log(
  `[test-audit] señales: waits=${waits.reduce((sum, row) => sum + row.waits, 0)} en ${waits.length} archivos, ` +
    `catch-vacío=${emptyCatches.reduce((sum, row) => sum + row.emptyCatches, 0)}, ` +
    `weak=${rows.reduce((sum, row) => sum + row.weakAssertions, 0)}, ` +
    `skip/todo=${rows.reduce((sum, row) => sum + row.skipped, 0)}, snapshots=${rows.reduce((sum, row) => sum + row.snapshots, 0)}`,
);

if (unexpectedNoAssertions.length) {
  console.log("[test-audit] ERROR: tests funcionales sin assertion detectable:");
  for (const row of unexpectedNoAssertions) {
    console.log(`  - ${row.pathname} (${row.tests} casos)`);
  }
}
if (focused.length) {
  console.log("[test-audit] ERROR: test.only/it.only detectado:");
  for (const row of focused) console.log(`  - ${row.pathname}`);
}
if (waits.length) {
  console.log("[test-audit] mayores usuarios de waitForTimeout:");
  for (const row of waits.slice(0, 10)) console.log(`  - ${row.pathname}: ${row.waits}`);
}
if (dailySmokeWaits.length) {
  console.log("[test-audit] ERROR: el smoke diario no admite waitForTimeout:");
  for (const row of dailySmokeWaits) console.log(`  - ${row.pathname}: ${row.waits}`);
}
if (duplicates.length) {
  console.log(
    "[test-audit] títulos repetidos entre archivos (candidatos a revisar, no equivalencia automática):",
  );
  for (const item of duplicates.slice(0, 12)) {
    console.log(`  - ${JSON.stringify(item.title)} -> ${item.locations.join(", ")}`);
  }
}
console.log("[test-audit] archivos más grandes:");
for (const row of largest)
  console.log(`  - ${row.pathname}: ${row.lines} líneas / ${row.tests} casos`);

if (
  strict &&
  (focused.length > 0 || unexpectedNoAssertions.length > 0 || dailySmokeWaits.length > 0)
)
  process.exit(1);
