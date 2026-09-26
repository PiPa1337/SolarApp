import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// e2e-smoke — smoke quick post-cambio (4 specs) con cache de build Studio
// Valida flujos criticos sin compilar Studio si no hay cambios.
// Uso: corepack pnpm test:e2e:smoke [-- args extra para playwright]
//   --smoke-full: 13 specs de cierre (catálogo, export, storefront y accesibilidad)
//   --full: solo build cacheado, no ejecuta specs (lo usa test:e2e antes del full)

const smokeSpecs = [
  "tests/e2e/catalog-modern-v2.spec.ts",
  "tests/e2e/exporter-sentinel.spec.ts",
  "tests/e2e/scale-store.spec.ts",
  "tests/e2e/storefront-nojs.spec.ts",
  "tests/e2e/ui-sweep-a27.spec.ts",
  "tests/e2e/ui-sweep-a28.spec.ts",
  "tests/e2e/ui-sweep-a29.spec.ts",
  "tests/e2e/ui-sweep-a30.spec.ts",
  "tests/e2e/nojs-coverage.spec.ts",
  "tests/e2e/focus-visible.spec.ts",
  "tests/e2e/catalog.spec.ts",
  "tests/e2e/assets.spec.ts",
  "tests/e2e/exported-store.spec.ts",
];

const quickSmokeSpecs = [
  "tests/e2e/exported-store.spec.ts",
  "tests/e2e/storefront-nojs.spec.ts",
  "tests/e2e/catalog.spec.ts",
  "tests/e2e/assets.spec.ts",
];

function maxMtimeRecursive(dir) {
  let max = 0;
  if (!existsSync(dir)) return 0;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = maxMtimeRecursive(full);
      if (sub > max) max = sub;
    } else {
      try {
        const m = statSync(full).mtimeMs;
        if (m > max) max = m;
      } catch {}
    }
  }
  return max;
}

function getSourceMaxMtime() {
  const roots = [
    resolve("apps/studio/src"),
    resolve("apps/studio/index.html"),
    resolve("apps/studio/package.json"),
    resolve("apps/studio/vite.config.ts"),
    resolve("apps/studio/vite.config.js"),
    resolve("apps/studio/tsconfig.json"),
    // Paquetes que Studio importa (cambios aqui invalidan dist)
    resolve("packages/project-schema/src"),
    resolve("packages/core/src"),
    resolve("packages/modules/src"),
    resolve("packages/exporter/src"),
    resolve("packages/storefront-runtime/src"),
    resolve("packages/module-sdk/src"),
    resolve("packages/site-optimizer/src"),
  ];
  let max = 0;
  for (const p of roots) {
    if (!existsSync(p)) continue;
    try {
      const stat = statSync(p);
      if (stat.isDirectory()) {
        const m = maxMtimeRecursive(p);
        if (m > max) max = m;
      } else {
        if (stat.mtimeMs > max) max = stat.mtimeMs;
      }
    } catch {}
  }
  // Tambien considerar public y config vite
  return max;
}

function shouldBuild() {
  const distIndex = resolve("apps/studio/dist/index.html");
  if (!existsSync(distIndex)) {
    console.log("[smoke] dist no existe -> build requerido");
    return true;
  }
  const distMtime = statSync(distIndex).mtimeMs;
  const srcMtime = getSourceMaxMtime();
  if (srcMtime === 0) {
    console.log("[smoke] no se pudo calcular mtime fuente -> build por seguridad");
    return true;
  }
  if (srcMtime > distMtime) {
    console.log(
      "[smoke] fuente mas nueva que dist (" +
        new Date(srcMtime).toLocaleTimeString() +
        " > " +
        new Date(distMtime).toLocaleTimeString() +
        ") -> build requerido",
    );
    return true;
  }
  console.log(
    "[smoke] dist vigente (dist " +
      new Date(distMtime).toLocaleTimeString() +
      " >= fuente " +
      new Date(srcMtime).toLocaleTimeString() +
      ") -> reutilizando build",
  );
  return false;
}

function spawnCmd(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const executable = process.platform === "win32" && cmd === "corepack" ? process.execPath : cmd;
    const finalArgs =
      process.platform === "win32" && cmd === "corepack"
        ? [
            join(dirname(process.execPath), "node_modules", "corepack", "dist", "corepack.js"),
            ...args,
          ]
        : args;
    const child = spawn(executable, finalArgs, { stdio: "inherit", ...opts });
    child.on("close", (code) => resolve(code));
    child.on("error", () => resolve(1));
  });
}

const rawArgs = process.argv.slice(2);
const isFull = rawArgs.includes("--full");
const isFullSmoke = rawArgs.includes("--smoke-full");
const isDryRun = rawArgs.includes("--dry-run");
const isQuick =
  !isFull && !isFullSmoke && (rawArgs.includes("--quick") || process.env.SMOKE_QUICK !== "0");
const extraArgs = rawArgs.filter(
  (a) => a !== "--full" && a !== "--quick" && a !== "--smoke-full" && a !== "--dry-run",
);
// Contención de inestabilidad: los specs listados en unstable.json salen del
// gate diario (fallan intermitentemente bajo carga; ver TECHNICAL_DEBT.md y
// docs/TESTING.md). SMOKE_INCLUDE_UNSTABLE=1 los vuelve a incluir para el canal
// manual/semanal. Un spec se quita de la lista sólo con 10/10 corridas limpias.
let unstableSpecs = [];
const unstablePath = resolve("tests/e2e/unstable.json");
if (existsSync(unstablePath) && process.env.SMOKE_INCLUDE_UNSTABLE !== "1") {
  try {
    const parsed = JSON.parse(readFileSync(unstablePath, "utf8"));
    unstableSpecs = parsed.specs.map((entry) => entry.path);
  } catch {
    console.warn("[smoke] unstable.json inválido: se corren todos los specs");
  }
}
const baseSpecs = isQuick ? quickSmokeSpecs : smokeSpecs;
const activeSpecs = baseSpecs.filter((spec) => !unstableSpecs.includes(spec));
if (isDryRun) {
  if (isFull) {
    console.log("[smoke] dry-run --full: solo build cacheado, sin specs");
    process.exit(0);
  }
  console.log(`[smoke] dry-run modo ${isQuick ? "quick" : "full"} (${activeSpecs.length} specs):`);
  for (const spec of activeSpecs) console.log(`[smoke]   - ${spec}`);
  process.exit(0);
}
if (unstableSpecs.length > 0) {
  console.log(
    `[smoke] ⏭ ${unstableSpecs.length} specs inestables excluidos (SMOKE_INCLUDE_UNSTABLE=1 para incluirlos):`,
  );
  for (const spec of unstableSpecs) console.log(`[smoke]   - ${spec}`);
}
const needBuild = shouldBuild();
if (needBuild) {
  console.log("[smoke] ▶ corepack pnpm --filter @solara/studio build");
  const code = await spawnCmd("corepack", ["pnpm", "--filter", "@solara/studio", "build"]);
  if (code !== 0) {
    console.error(`[smoke] ✖ build fallo con codigo ${code}`);
    process.exit(code ?? 1);
  }
  console.log("[smoke] ✔ build completo");
} else {
  console.log("[smoke] ⏭ build cacheado, saltando compilacion (ahorra ~30-60s)");
}

if (isFull) {
  console.log(
    "[smoke] --full: solo build cacheado, no ejecuta smoke specs (el caller hará playwright test completo)",
  );
  process.exit(0);
}
// Construir comando playwright con workers acotados (3 por defecto, env override)
// y solo Chromium (smoke no necesita Firefox/WebKit). Quick usa retries 0 y 0 trace para ahorrar ~10s.
const smokeMode = isQuick ? "quick (4 specs)" : "full (13 specs, cierre)";
console.log(`[smoke] ▶ modo ${smokeMode}`);
const playwrightArgs = ["test", ...activeSpecs, ...extraArgs];
if (isQuick && !extraArgs.includes("--retries")) playwrightArgs.push("--retries", "0");
if (isQuick && !extraArgs.includes("--trace")) playwrightArgs.push("--trace", "off");
console.log(`[smoke] ▶ node scripts/playwright-limited.mjs ${playwrightArgs.join(" ")}`);
const env = isQuick
  ? { ...process.env, PLAYWRIGHT_WORKERS: process.env.PLAYWRIGHT_WORKERS ?? "3" }
  : undefined;
const code = await spawnCmd(
  process.execPath,
  [resolve("scripts/playwright-limited.mjs"), ...playwrightArgs],
  env ? { env } : {},
);
if (code !== 0) {
  console.error(`[smoke] ✖ smoke fallo con codigo ${code}`);
  process.exit(code ?? 1);
}
console.log(`[smoke] ✔ smoke ${smokeMode} — ${activeSpecs.length} specs paso`);
