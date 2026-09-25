import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const vitestWrapper = resolve(repoRoot, "scripts/vitest-limited.mjs");
const strict = !process.argv.includes("--report-only");
const maxWorkers = process.env.SOLARA_MUTATION_WORKERS;

const mutants = [
  {
    id: "core-amount-clamp",
    file: "packages/core/src/index.ts",
    from: "return Math.max(0, price + adjustment.cents);",
    to: "return price + adjustment.cents;",
    tests: ["packages/core/src/mutation-killers.test.ts"],
  },
  {
    id: "core-minus-100-boundary",
    file: "packages/core/src/index.ts",
    from: "if (adjustment.basisPoints < -10_000) {",
    to: "if (adjustment.basisPoints <= -10_000) {",
    tests: ["packages/core/src/mutation-killers.test.ts"],
  },
  {
    id: "money-safe-integer-guard",
    file: "packages/project-schema/src/money.ts",
    from: "if (!Number.isSafeInteger(cents)) {",
    to: "if (false) {",
    tests: [
      "packages/project-schema/src/money.test.ts",
      "packages/project-schema/src/money.property.test.ts",
    ],
  },
  {
    id: "money-auto-fraction-branch",
    file: "packages/project-schema/src/money.ts",
    from: 'const fractionDigits = display === "auto" && cents % 100 === 0 ? 0 : 2;',
    to: 'const fractionDigits = display === "auto" && cents % 100 !== 0 ? 0 : 2;',
    tests: [
      "packages/project-schema/src/money.test.ts",
      "packages/project-schema/src/money.property.test.ts",
    ],
  },
];

function runVitest(tests, env = {}) {
  const workerArgs = maxWorkers ? ["--maxWorkers", maxWorkers] : [];
  return spawnSync(
    process.execPath,
    [
      vitestWrapper,
      "run",
      ...tests,
      "--config",
      "scripts/mutation-vitest.config.mjs",
      "--configLoader",
      "runner",
      "--exclude",
      "back up/**",
      "--exclude",
      ".local-backups/**",
      ...workerArgs,
      "--reporter=dot",
    ],
    {
      cwd: repoRoot,
      env: { ...process.env, ...env },
      encoding: "utf8",
      windowsHide: true,
    },
  );
}

const uniqueTests = [...new Set(mutants.flatMap((mutant) => mutant.tests))];
const baseline = runVitest(uniqueTests);
if (baseline.status !== 0) {
  process.stdout.write(baseline.stdout ?? "");
  process.stderr.write(baseline.stderr ?? "");
  console.error("[mutation] baseline rojo; no se evalúan mutantes");
  process.exit(baseline.status ?? 1);
}
console.log(`[mutation] baseline verde (${uniqueTests.length} archivos)`);

let killed = 0;
let survived = 0;
let invalid = 0;
for (const mutant of mutants) {
  const result = runVitest(mutant.tests, {
    SOLARA_MUTATION_ID: mutant.id,
    SOLARA_MUTATION_FILE: mutant.file,
    SOLARA_MUTATION_FROM_B64: Buffer.from(mutant.from).toString("base64"),
    SOLARA_MUTATION_TO_B64: Buffer.from(mutant.to).toString("base64"),
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const marker = `[mutation-applied:${mutant.id}]`;
  if (!output.includes(marker)) {
    invalid += 1;
    console.error(`[mutation] INVALID ${mutant.id}: la mutación no se aplicó`);
    continue;
  }
  if (result.status === 0) {
    survived += 1;
    console.error(`[mutation] SURVIVED ${mutant.id}`);
  } else {
    killed += 1;
    console.log(`[mutation] KILLED ${mutant.id}`);
  }
}

const total = mutants.length;
const score = total === 0 ? 100 : Math.round((killed / total) * 1000) / 10;
console.log(
  `[mutation] score ${score}% — killed=${killed}, survived=${survived}, invalid=${invalid}`,
);
if (strict && (survived > 0 || invalid > 0)) process.exit(1);
