/**
 * Fábrica autónoma de tiendas por el canal oficial (controller nativo).
 *
 * Crea N tiendas con rubros/tamaños/temas deterministas usando exactamente las
 * mismas operaciones que un agente externo: plans.create -> plans.commit ->
 * stores.get -> exportProject. Cero manipulación directa de storage.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentController, dispatchAgentMethod } from "../packages/agent-control/src/index.ts";
import { createLocalProjectStorage } from "../packages/exporter/scripts/local-project-storage.mjs";
import { exportProject } from "../packages/exporter/src/index.ts";

const RUBROS = [
  "Indumentaria",
  "Hogar",
  "Tecnología",
  "Alimentos",
  "Cosmética",
  "Arte",
  "Librería",
  "Mayorista",
];

const PALETAS = ["editorial", "minimal", "calido", "industrial", "botanico"];

const SIZES = [
  { label: "mini", products: 6 },
  { label: "normal", products: 30 },
  { label: "mediana", products: 60 },
];

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
}

async function createStore(controller, index, size, rubro, paleta) {
  const storeId = `store-factory-${index}`;
  const name = `Fábrica ${rubro} ${size.label} ${index}`;
  const slug = slugify(name);
  const placeholder = await dispatchAgentMethod(controller, "assets.generatePlaceholder", {
    name: `Imagen ${name}`,
    alt: `${rubro}, imagen de producto ${index}`,
    seed: `store-factory-${index}`,
  });
  const operations = [
    {
      type: "store.create",
      storeId,
      name,
      slug,
      source: { kind: "clean" },
    },
    {
      type: "theme.applyPreset",
      presetId: paleta,
    },
    {
      type: "category.create",
      categoryId: "category-raiz",
      slug: "catalogo",
      title: "Catálogo",
    },
    {
      type: "section.updateSettings",
      sectionId: "modo-section-hero",
      settings: {
        posterAssetId: placeholder.assetId,
        backgroundImageId: placeholder.assetId,
      },
    },
  ];
  const productCount = size.products;
  for (let batch = 0; batch < Math.ceil(productCount / 25); batch++) {
    const items = [];
    const remaining = Math.min(25, productCount - batch * 25);
    for (let i = 0; i < remaining; i++) {
      const n = batch * 25 + i + 1;
      items.push({
        title: `${rubro} — Producto ${n}`,
        description: `${rubro} ${name} producto ${n} con descripción editorial determinista.`,
      });
    }
    operations.push({
      type: "product.createBatch",
      categoryId: "category-raiz",
      imageIds: [placeholder.assetId],
      skuPrefix: `F${index}-${batch}-`,
      basePriceCents: 1000 + batch * 250,
      priceStepCents: 50,
      items,
    });
  }
  const plan = await dispatchAgentMethod(controller, "plans.create", {
    idempotencyKey: `factory-${index}-${Date.now()}`,
    operations,
  });
  const planned = await dispatchAgentMethod(controller, "plans.get", {
    planId: plan.planId,
    includeProject: true,
  });
  const receipt = await dispatchAgentMethod(controller, "plans.commit", {
    planId: plan.planId,
  });
  const project = planned.project;
  if (!project) throw new Error(`sin snapshot para ${storeId}`);
  const exported = exportProject(project, { mode: "draft" });
  // Diagnóstico: qué issues críticos produce la tienda generada
  const critical = exported.audit.filter((issue) => issue.severity === "critical");
  return {
    storeId,
    name,
    version: receipt.version,
    products: project.products.length,
    files: exported.files.size,
    criticalIssues: critical.length,
    unexpectedCriticalIssues: critical.length,
    criticalSample: critical.slice(0, 3).map((issue) => issue.message ?? issue.code),
  };
}

export async function runStoreFactory({ total = 3, root } = {}) {
  const results = [];
  const ownedRoot = root === undefined;
  const applicationRoot = root ?? (await mkdtemp(join(tmpdir(), "solara-store-factory-")));
  try {
    const storage = createLocalProjectStorage({
      applicationRoot,
      projectsRoot: join(applicationRoot, "proyectos"),
      stagingRoot: join(applicationRoot, ".solara-runtime", "transactions"),
    });
    await storage.ensureRoots();
    const controller = createAgentController({ storage, applicationRoot });
    // Versión de la plantilla antes de la fábrica (para verificar que no cambia)
    let templateVersionBefore = null;
    try {
      const template = await dispatchAgentMethod(controller, "templates.get", {});
      templateVersionBefore = template?.project?.updatedAt ?? null;
    } catch {
      templateVersionBefore = null;
    }
    for (let index = 1; index <= total; index++) {
      const size = SIZES[index % SIZES.length];
      const rubro = RUBROS[index % RUBROS.length];
      const paleta = PALETAS[index % PALETAS.length];
      const startedAt = Date.now();
      const result = await createStore(controller, index, size, rubro, paleta);
      results.push({ ...result, durationMs: Date.now() - startedAt });
    }
    let templateVersionAfter = templateVersionBefore;
    try {
      const template = await dispatchAgentMethod(controller, "templates.get", {});
      templateVersionAfter = template?.project?.updatedAt ?? null;
    } catch {
      templateVersionAfter = null;
    }
    return { results, applicationRoot, templateVersionBefore, templateVersionAfter };
  } finally {
    if (ownedRoot) await rm(applicationRoot, { recursive: true, force: true });
  }
}

const isDirectRun = process.argv[1]?.endsWith("store-factory.mjs");
if (isDirectRun) {
  const total = Number(process.argv[2] ?? "3");
  const startedAt = Date.now();
  runStoreFactory({ total })
    .then(({ results }) => {
      writeFile(
        "docs/reports/agent-store-factory.json",
        JSON.stringify({ total: results.length, results }, null, 2),
      ).then(() => {
        const failed = results.filter((result) => result.unexpectedCriticalIssues > 0);
        console.log(
          JSON.stringify({
            total: results.length,
            failed: failed.length,
            durationMs: Date.now() - startedAt,
          }),
        );
        if (failed.length > 0) process.exitCode = 1;
      });
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
