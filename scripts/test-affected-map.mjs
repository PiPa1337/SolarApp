// Mapeo puro de archivos cambiados -> paquetes afectados (post-cambio).
// null = cambio amplio, correr todo. [] = solo gates livianos, sin tests de paquete.
// Fuente única de verdad: scripts/test-affected-map.test.ts lo cubre.
const ROOT_ALL = new Set(["package.json", "pnpm-workspace.yaml", "tsconfig.base.json"]);

export function findChangedScriptTests(files) {
  if (!files) return [];
  return files.filter((file) =>
    /^scripts\/.+\.(?:test|spec)\.(?:ts|mjs|js)$/.test(file.replaceAll("\\", "/")),
  );
}

function mapE2EToPackages(file) {
  if (file.includes("exported-store") || file.includes("storefront-nojs")) {
    return ["@solara/exporter", "@solara/storefront-runtime"];
  }
  if (
    file.includes("catalog") ||
    file.includes("scale-store") ||
    file.includes("exporter-sentinel")
  ) {
    return ["@solara/project-schema", "@solara/exporter"];
  }
  if (file.includes("axe-") || file.includes("nojs-") || file.includes("focus-")) {
    return ["@solara/exporter"];
  }
  if (file.includes("ui-sweep") || file.includes("interaccion")) {
    return ["@solara/exporter", "@solara/modules"];
  }
  if (file.includes("editor-") || file.includes("dashboard") || file.includes("flujo-")) {
    return ["@solara/studio"];
  }
  return ["@solara/exporter"];
}

export function mapFilesToPackages(files) {
  if (!files || files.length === 0) return null;
  if (files.some((f) => ROOT_ALL.has(f))) return null;

  const pkgs = new Set();
  for (const f of files) {
    if (f.startsWith("packages/project-schema/")) pkgs.add("@solara/project-schema");
    else if (f.startsWith("packages/core/")) pkgs.add("@solara/core");
    else if (f.startsWith("packages/module-sdk/")) pkgs.add("@solara/module-sdk");
    else if (f.startsWith("packages/modules/")) pkgs.add("@solara/modules");
    else if (f.startsWith("packages/exporter/")) pkgs.add("@solara/exporter");
    else if (f.startsWith("packages/storefront-runtime/")) pkgs.add("@solara/storefront-runtime");
    else if (f.startsWith("packages/site-optimizer/")) pkgs.add("@solara/site-optimizer");
    else if (f.startsWith("packages/agent-control/")) pkgs.add("@solara/agent-control");
    else if (f.startsWith("packages/agent-contracts/")) pkgs.add("@solara/agent-contracts");
    else if (f.startsWith("packages/agent-sdk/")) pkgs.add("@solara/agent-sdk");
    else if (f.startsWith("apps/studio/")) pkgs.add("@solara/studio");
    else if (f.startsWith("tests/e2e/")) {
      for (const p of mapE2EToPackages(f)) pkgs.add(p);
    }
    // scripts/, docs/ y otros (CHANGELOG, .cmd, etc.): no disparan tests de paquete.
    // Los tests cambiados bajo scripts/ se ejecutan directamente desde test-affected.mjs.
  }
  if (pkgs.size === 0) return [];
  if (pkgs.size > 4) return null;
  return [...pkgs];
}
