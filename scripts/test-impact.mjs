import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

export const PACKAGE_INFO = {
  "@solara/project-schema": { root: "packages/project-schema", deps: [] },
  "@solara/module-sdk": { root: "packages/module-sdk", deps: ["@solara/project-schema"] },
  "@solara/modules": {
    root: "packages/modules",
    deps: ["@solara/module-sdk", "@solara/project-schema"],
  },
  "@solara/core": { root: "packages/core", deps: ["@solara/modules", "@solara/project-schema"] },
  "@solara/storefront-runtime": {
    root: "packages/storefront-runtime",
    deps: ["@solara/project-schema"],
  },
  "@solara/site-optimizer": { root: "packages/site-optimizer", deps: ["@solara/project-schema"] },
  "@solara/exporter": {
    root: "packages/exporter",
    deps: [
      "@solara/core",
      "@solara/module-sdk",
      "@solara/modules",
      "@solara/project-schema",
      "@solara/site-optimizer",
      "@solara/storefront-runtime",
    ],
  },
  "@solara/agent-contracts": { root: "packages/agent-contracts", deps: [] },
  "@solara/agent-sdk": { root: "packages/agent-sdk", deps: ["@solara/agent-contracts"] },
  "@solara/agent-control": {
    root: "packages/agent-control",
    deps: ["@solara/agent-contracts", "@solara/core", "@solara/exporter", "@solara/project-schema"],
  },
  "@solara/studio": {
    root: "apps/studio",
    deps: [
      "@solara/core",
      "@solara/exporter",
      "@solara/modules",
      "@solara/project-schema",
      "@solara/storefront-runtime",
    ],
  },
};

export function expandImpactedPackages(packages) {
  if (!packages) return null;
  const impacted = new Set(packages);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, info] of Object.entries(PACKAGE_INFO)) {
      if (impacted.has(name)) continue;
      if (info.deps.some((dep) => impacted.has(dep))) {
        impacted.add(name);
        changed = true;
      }
    }
  }
  return [...impacted];
}

const QUICK_SMOKE = {
  exporter: [
    "tests/e2e/exporter-sentinel.spec.ts",
    "tests/e2e/exported-store.spec.ts",
    "tests/e2e/storefront-nojs.spec.ts",
  ],
  storefront: ["tests/e2e/exported-store.spec.ts", "tests/e2e/storefront-nojs.spec.ts"],
  studio: ["tests/e2e/editor-smoke.spec.ts", "tests/e2e/focus-visible.spec.ts"],
  schema: ["tests/e2e/exporter-sentinel.spec.ts", "tests/e2e/exported-store.spec.ts"],
  modules: ["tests/e2e/exporter-sentinel.spec.ts", "tests/e2e/focus-visible.spec.ts"],
};

export function selectQuickSmokeSpecs(files, fallbackSpecs) {
  if (!files || files.length === 0) return fallbackSpecs;
  const selected = new Set();
  for (const raw of files) {
    const file = raw.replaceAll("\\", "/");
    if (file.startsWith("packages/exporter/"))
      QUICK_SMOKE.exporter.forEach((x) => {
        selected.add(x);
      });
    else if (file.startsWith("packages/storefront-runtime/"))
      QUICK_SMOKE.storefront.forEach((x) => {
        selected.add(x);
      });
    else if (file.startsWith("apps/studio/"))
      QUICK_SMOKE.studio.forEach((x) => {
        selected.add(x);
      });
    else if (file.startsWith("packages/project-schema/") || file.startsWith("packages/core/"))
      QUICK_SMOKE.schema.forEach((x) => {
        selected.add(x);
      });
    else if (file.startsWith("packages/modules/") || file.startsWith("packages/module-sdk/"))
      QUICK_SMOKE.modules.forEach((x) => {
        selected.add(x);
      });
    else if (file.startsWith("tests/e2e/") && file.endsWith(".spec.ts")) selected.add(file);
    else if (file === "package.json" || file === "pnpm-lock.yaml" || file === "pnpm-workspace.yaml")
      return fallbackSpecs;
  }
  if (selected.size === 0) return [];
  selected.add("tests/e2e/exporter-sentinel.spec.ts");
  return [...selected];
}

function walkFiles(root, output) {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === "dist" || entry.name === "node_modules" || entry.name === "coverage")
      continue;
    const full = resolve(root, entry.name);
    if (entry.isDirectory()) walkFiles(full, output);
    else if (entry.isFile()) output.push(full);
  }
}

export function contentHash(paths, extra = []) {
  const files = [];
  for (const input of paths) {
    const full = resolve(input);
    if (!existsSync(full)) continue;
    const stat = statSync(full);
    if (stat.isDirectory()) walkFiles(full, files);
    else files.push(full);
  }
  files.sort();
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(relative(process.cwd(), file).replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  for (const value of extra) hash.update(`extra:${value}\0`);
  return hash.digest("hex");
}

export function packageTestHash(packageName) {
  const visited = new Set();
  const roots = [];
  function visit(name) {
    if (visited.has(name)) return;
    visited.add(name);
    const info = PACKAGE_INFO[name];
    if (!info) return;
    roots.push(info.root);
    info.deps.forEach(visit);
  }
  visit(packageName);
  return contentHash(
    [
      ...roots,
      "package.json",
      "pnpm-lock.yaml",
      "tsconfig.base.json",
      "scripts/vitest-limited.mjs",
    ],
    [process.version, process.platform, packageName],
  );
}
