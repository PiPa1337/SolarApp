/**
 * Auditoría Preparar PR1 (2026-08-11) — Modelo de requisitos verificado
 * contra el proyecto real. Plan: docs/superpowers/plans/2026-08-10-auditoria-preparar.md
 * (PR1: cada requisito → rutas que lee + estados vs proyecto REAL en IndexedDB).
 *
 * Contrato de 3 capas para CADA requisito activo:
 * - datos: el estado se deriva del dato real en IndexedDB (reimplementación
 *   independiente en el spec, sin usar el módulo de guidance);
 * - modelo: `getCatalogModernContentRequirements` sobre el proyecto real de
 *   IndexedDB coincide con la reimplementación (rutas sin typos, valores 1:1);
 * - UI: `data-requirement-status` del checklist coincide con el estado
 *   esperado (con el override documentado de WhatsApp sentinel → placeholder,
 *   GuidedOverview.tsx:69-75).
 *
 * Nota de UI: con 0 pendientes la lista (y el detalle de "listos") no se
 * renderiza — sólo el bloque "base lista" — así que el contrato por requisito
 * de la demo se verifica en la capa de datos/modelo (Node) y la UI se fija en
 * el bloque listo + progreso.
 *
 * Proyectos: demo ("Predeterminado", store-modo-sur-demo, seed demo) y una
 * tienda LIMPIA creada por el asistente (seed clean). Incluye una mutación
 * schema-válida en IndexedDB (descripción vacía + precio 0) para probar que el
 * estado SIGUE al dato real y no está calcado.
 */
import type { Server } from "node:http";
import { expect, type Page, test } from "@playwright/test";
import type { StoreProjectV2 } from "@solara/project-schema";
import {
  CATALOG_MODERN_PLACEHOLDER_PHONE,
  evaluateCatalogModernReadiness,
  getCatalogModernContentRequirements,
} from "@solara/project-schema/catalog-modern-guidance";
import { createCleanStore, resetStudioIndexedDb } from "./project-helpers";
import { startStudioServer, stopStudioServer } from "./studio-server";

test.setTimeout(process.env.CI ? 150_000 : 90_000);

const DEMO_PROJECT_ID = "store-modo-sur-demo";

/** Estructura mínima del proyecto real guardado en IndexedDB. */
type ProjectRecord = {
  id: string;
  name: string;
  origin?: { templateId: string; seed: string };
  identity: { brandName: string; description: string; email: string };
  whatsapp: { phone: string };
  navigation: { catalogLabel: string };
  seo: { title: string; description: string };
  pages: Array<{ id: string; kind: string; title: string }>;
  products: Array<{
    id: string;
    title: string;
    description: string;
    categoryIds: string[];
    imageIds: string[];
    status: string;
    variants: Array<{ price: number }>;
  }>;
  categories: Array<{ id: string; title: string; description: string }>;
  assets: Array<{ id: string; name: string; alt: string }>;
  sections: Array<{ id: string; settings: Record<string, string> }>;
};

/** Misma lista de textos de plantilla que el modelo (catalog-modern-guidance.ts:114-126). */
const PLACEHOLDER_PHRASES = [
  "tu nueva colección",
  "una tienda lista para contar tu historia",
  "cargá tus productos",
  "tu tienda online, lista para empezar",
  "una tienda hecha para tu marca",
  "una tienda online preparada para mostrar tus productos",
  "descubrí nuestra selección de productos",
  "conocé nuestra historia",
  "estamos para ayudarte",
  "descripcion corta de tu tienda",
  "imagen de plantilla",
  "imagen de ejemplo para reemplazar",
] as const;

/** Sentinels exactos del modelo (catalog-modern-guidance.ts:72-91): valores
 *  tipados que la plantilla siembra en clones y el checklist marca como
 *  placeholder aunque el origen ya no sea seed "clean". La reimplementación
 *  independiente los replica para no divergir del contrato vigente. */
const PLACEHOLDER_SENTINELS: ReadonlySet<string> = new Set([
  "email@gmail.com",
  "15412345",
  "direccion",
  "razonsocial",
  "descripcion corta de tu tienda.",
  "descripcion seo de tu tienda.",
  "coleccion 1",
]);

const PLACEHOLDER_SENTINEL_PATTERNS = [
  /^producto \d+$/,
  /^descripcion del producto \d+\.$/,
  /^categoria \d+$/,
  /^producto de .+ pensado para ofrecer calidad, practicidad y una excelente experiencia de compra\.$/i,
  /^.+: una propuesta pensada para mostrar calidad, practicidad y una experiencia simple de compra\. adaptá este texto con la información real de tu negocio\.$/i,
  /^(hogar|cocina|decoracion|textiles|organizacion|limpieza|exterior|oficina|regalos|novedades) \d+$/,
  /^(hogar|cocina|decoracion|textiles|organizacion|limpieza|exterior|oficina|regalos|novedades)$/,
] as const;

let server: Server;
let studioUrl: string;

test.beforeAll(async () => {
  const running = await startStudioServer();
  server = running.server;
  studioUrl = running.url;
});

test.afterAll(async () => {
  await stopStudioServer(server);
});

/** Lee el proyecto REAL de IndexedDB (los `source` de assets se vacían para
 *  no transportar data-URLs; los estados no los leen ni el modelo ni la UI). */
async function readProject(page: Page, projectId: string): Promise<ProjectRecord> {
  return page.evaluate(
    ([id]) =>
      new Promise<ProjectRecord>((resolve, reject) => {
        const request = indexedDB.open("solara-commerce-studio");
        request.addEventListener("error", () => reject(request.error));
        request.addEventListener("success", () => {
          const db = request.result;
          const all = db.transaction("projects").objectStore("projects").getAll();
          all.addEventListener("success", () => {
            const records = all.result as Array<{
              project: ProjectRecord & { assets: Array<{ source?: string }> };
            }>;
            const record = records.find((item) => item.project.id === id);
            if (!record) {
              reject(new Error(`No se encontró el proyecto ${id} en IndexedDB.`));
              return;
            }
            resolve({
              ...record.project,
              assets: record.project.assets.map((asset) => ({ ...asset, source: undefined })),
            });
          });
          all.addEventListener("error", () => reject(all.error));
        });
      }),
    [projectId],
  );
}

/** Lee el proyecto limpio recién creado por el asistente (id con uuid). */
async function readProjectByName(page: Page, name: string): Promise<ProjectRecord> {
  const project = await page.evaluate(
    (storeName) =>
      new Promise<ProjectRecord>((resolve, reject) => {
        const request = indexedDB.open("solara-commerce-studio");
        request.addEventListener("error", () => reject(request.error));
        request.addEventListener("success", () => {
          const db = request.result;
          const all = db.transaction("projects").objectStore("projects").getAll();
          all.addEventListener("success", () => {
            const records = all.result as Array<{
              project: ProjectRecord & { assets: Array<{ source?: string }> };
            }>;
            const record = records.find((item) => item.project.name === storeName);
            if (!record) {
              reject(new Error(`No se encontró la tienda ${storeName} en IndexedDB.`));
              return;
            }
            resolve({
              ...record.project,
              assets: record.project.assets.map((asset) => ({ ...asset, source: undefined })),
            });
          });
          all.addEventListener("error", () => reject(all.error));
        });
      }),
    name,
  );
  expect(project.origin?.seed).toBe("duplicate");
  return project;
}

async function openDemoStore(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 45_000,
  });
  await page.locator(`[data-store-card-id="${DEMO_PROJECT_ID}"]`).click();
  await page.getByRole("button", { name: "Abrir tienda", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible({
    timeout: 30_000,
  });
}

async function openPrepararTab(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "Preparar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Preparar tienda" })).toBeVisible();
  await expect(page.getByTestId("ui-guided-progress")).toBeVisible();
}

/** Resuelve un target del checklist en el proyecto real (port del helper del
 *  unit test de guidance: secciones/páginas/productos por id o kind). */
function resolveTarget(project: ProjectRecord, target: string): unknown {
  let current: unknown = project;
  for (const part of target.split(".")) {
    if (typeof current !== "object" || current === null) return undefined;
    if (Array.isArray(current)) {
      if (/^\d+$/.test(part)) {
        current = (current as unknown[])[Number(part)];
        continue;
      }
      const items = current as Array<Record<string, unknown>>;
      current = items.find((item) => item.id === part) ?? items.find((item) => item.kind === part);
      continue;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Normaliza un valor del proyecto a la serialización del checklist. */
function asRequirementValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(",");
  if (typeof value === "number") return String(value);
  return typeof value === "string" ? value : "";
}

function isCleanTemplate(project: ProjectRecord): boolean {
  return (
    project.origin?.templateId === "catalog-modern" &&
    ["clean", "placeholder", "duplicate"].includes(project.origin.seed ?? "")
  );
}

/** Reimplementación INDEPENDIENTE del estado (no usa el módulo de guidance):
 *  deriva el estado únicamente del dato real del proyecto. */
function expectedStatus(project: ProjectRecord, target: string, resolved: unknown): string {
  if (target === "identity.email") {
    const raw = asRequirementValue(resolved);
    if (raw && !raw.includes("@")) return "invalid";
  }
  if (target.endsWith("variants.0.price") && Number(asRequirementValue(resolved)) <= 0) {
    return "missing";
  }
  let raw = asRequirementValue(resolved);
  if (target === "whatsapp.phone") raw = raw === CATALOG_MODERN_PLACEHOLDER_PHONE ? "" : raw;
  if (!raw.trim()) return "missing";
  const normalized = raw.trim().toLocaleLowerCase("es-AR");
  const sentinelNormalized = normalized.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (
    PLACEHOLDER_SENTINELS.has(sentinelNormalized) ||
    PLACEHOLDER_SENTINEL_PATTERNS.some((pattern) => pattern.test(sentinelNormalized))
  ) {
    return "placeholder";
  }
  if (
    isCleanTemplate(project) &&
    PLACEHOLDER_PHRASES.some((phrase) => normalized.includes(phrase))
  ) {
    return "placeholder";
  }
  return "ready";
}

/** Estado que la UI muestra: el sentinel de WhatsApp deriva a placeholder
 *  (override documentado de GuidedOverview.tsx:69-75, R7-F2). */
function expectedUiStatus(
  project: ProjectRecord,
  requirement: { id: string; target: string },
  resolved: unknown,
) {
  const status = expectedStatus(project, requirement.target, resolved);
  if (
    requirement.id === "identity.whatsapp" &&
    project.whatsapp.phone === CATALOG_MODERN_PLACEHOLDER_PHONE &&
    status === "missing"
  ) {
    return "placeholder";
  }
  return status;
}

/** Capa de datos/modelo: por CADA requisito (activo o no), el target resuelve
 *  en el proyecto real de IndexedDB, el valor coincide con lo que el modelo
 *  leyó (sin typos de ruta en el dato persistido) y el estado independiente
 *  (dato real) == estado del modelo. */
function expectModelMatchesRealData(project: ProjectRecord): void {
  const allRequirements = getCatalogModernContentRequirements(project as unknown as StoreProjectV2);
  for (const requirement of allRequirements) {
    const resolved = resolveTarget(project, requirement.target);
    expect(resolved, `target sin resolver: ${requirement.id}`).not.toBeUndefined();
    if (requirement.target.endsWith("variants.0.price")) {
      if (requirement.value === "") {
        expect(
          Number(asRequirementValue(resolved)),
          `precio 0: ${requirement.id}`,
        ).toBeLessThanOrEqual(0);
      } else {
        expect(asRequirementValue(resolved), `precio: ${requirement.id}`).toBe(requirement.value);
      }
    } else if (requirement.target === "whatsapp.phone") {
      const expected =
        requirement.value === "" &&
        asRequirementValue(resolved) === CATALOG_MODERN_PLACEHOLDER_PHONE
          ? CATALOG_MODERN_PLACEHOLDER_PHONE
          : requirement.value;
      expect(asRequirementValue(resolved), `whatsapp: ${requirement.id}`).toBe(expected);
    } else {
      expect(asRequirementValue(resolved), `valor: ${requirement.id}`).toBe(requirement.value);
    }
    if (requirement.active) {
      expect(
        expectedStatus(project, requirement.target, resolved),
        `independiente vs modelo: ${requirement.id}`,
      ).toBe(requirement.status);
    }
  }
}

async function openDoneList(page: Page): Promise<void> {
  const details = page.getByTestId("ui-guided-done");
  if ((await details.count()) > 0) {
    await details.evaluate((el) => {
      (el as HTMLDetailsElement).open = true;
    });
  }
}

/** Lee el mapa id → data-requirement-status del DOM (lista de pendientes +
 *  lista de listos abierta). */
async function readUiStatuses(page: Page): Promise<Map<string, string>> {
  await openDoneList(page);
  const entries = await page
    .locator('[data-testid="ui-guided-requirement"]')
    .evaluateAll((els) =>
      els.map((el) => [
        el.getAttribute("data-requirement-id"),
        el.getAttribute("data-requirement-status"),
      ]),
    );
  return new Map(
    entries.filter((entry): entry is [string, string] => entry[0] !== null && entry[1] !== null),
  );
}

/** Capa de UI sobre el proyecto real: estado del DOM == estado esperado por
 *  requisito visible, ids del DOM == requisitos activos (ocultos por la cota
 *  de 12 contados en "+N más") y progreso ("X de N", aria-valuenow) honesto. */
async function expectChecklistUiMatches(page: Page, project: ProjectRecord): Promise<void> {
  const readiness = evaluateCatalogModernReadiness(project as unknown as StoreProjectV2);
  const pending = readiness.requirements.filter((requirement) => requirement.status !== "ready");

  if (pending.length === 0) {
    // Sin pendientes no se renderiza la lista: sólo el bloque "base lista".
    await expect(page.getByTestId("ui-guided-ready")).toBeVisible();
    // El checklist ahora muestra la lista de listos cuando no hay pendientes (PR8):
    // todos los requisitos de la demo aparecen en el detalle colapsado.
    await expect(page.locator('[data-testid="ui-guided-done"]')).toBeVisible();
    await expect(page.locator(".guided-checklist__more")).toHaveCount(0);
  } else {
    const hiddenIds = new Set(pending.slice(12).map((requirement) => requirement.id));
    const ui = await readUiStatuses(page);
    for (const requirement of readiness.requirements) {
      if (hiddenIds.has(requirement.id)) continue;
      const expected = expectedUiStatus(
        project,
        requirement,
        resolveTarget(project, requirement.target),
      );
      expect(ui.get(requirement.id), `UI: ${requirement.id}`).toBe(expected);
    }
    const expectedVisibleIds = readiness.requirements
      .filter((requirement) => !hiddenIds.has(requirement.id))
      .map((requirement) => requirement.id)
      .sort();
    expect([...ui.keys()].sort(), "ids del DOM == activos visibles").toEqual(expectedVisibleIds);
    const more = page.locator(".guided-checklist__more");
    if (pending.length > 12) {
      await expect(more).toHaveText(`+${pending.length - 12} más`);
    } else {
      await expect(more).toHaveCount(0);
    }
  }

  await expect(page.locator(".guided-progress__copy strong")).toHaveText(
    `${readiness.ready} de ${readiness.requirements.length} requisitos listos`,
  );
  await expect(page.getByTestId("ui-guided-progress")).toHaveAttribute(
    "aria-valuenow",
    String(readiness.percent),
  );
}

test("demo: los requisitos leen datos reales y el progreso coincide (1:1 con IndexedDB)", async ({
  page,
}) => {
  await resetStudioIndexedDb(page, studioUrl);
  await openDemoStore(page);
  await openPrepararTab(page);

  const project = await readProject(page, DEMO_PROJECT_ID);
  const readiness = evaluateCatalogModernReadiness(project as unknown as StoreProjectV2);

  // Las cantidades se comparan con la fixture vigente, no con un conteo
  // histórico que dejaría de detectar cambios legítimos del catálogo.
  expect(project.products.length).toBeGreaterThan(0);
  expect(project.products.every((product) => product.status === "active")).toBe(true);
  expect(project.categories.length).toBeGreaterThan(0);
  expect(project.assets.length).toBeGreaterThan(0);
  expect(readiness.requirements.length).toBeGreaterThan(0);
  expect(readiness.ready + readiness.pending).toBe(readiness.requirements.length);
  expect(readiness.percent).toBe(
    Math.round((readiness.ready / readiness.requirements.length) * 100),
  );

  // Contrato por requisito (datos + modelo), incluyendo los placeholders que
  // la demo vigente todavía puede declarar como pendientes.
  expectModelMatchesRealData(project);
  await expectChecklistUiMatches(page, project);

  if (readiness.pending === 0) {
    await expect(page.getByTestId("ui-guided-ready")).toContainText(
      "La base está lista para revisar",
    );
    await expect(page.getByTestId("ui-guided-next")).toHaveCount(0);
  } else {
    await expect(page.getByTestId("ui-guided-ready")).toHaveCount(0);
    await expect(page.getByTestId("ui-guided-next")).toContainText("Siguiente:");
  }
});

test("limpia: cada requisito refleja su dato real (missing/placeholder/ready) y el progreso es honesto", async ({
  page,
}) => {
  const storeName = "Tienda auditoría PR1";
  await resetStudioIndexedDb(page, studioUrl);
  await createCleanStore(page, storeName);
  await openPrepararTab(page);

  const clean = await readProjectByName(page, storeName);

  // Matriz esperada requisito por requisito (seed clean + override del
  const readiness = evaluateCatalogModernReadiness(clean as unknown as StoreProjectV2);
  expect(readiness.requirements.length).toBeGreaterThan(0);
  expect(readiness.ready + readiness.pending).toBe(readiness.requirements.length);
  expect(readiness.percent).toBe(
    Math.round((readiness.ready / readiness.requirements.length) * 100),
  );

  const expectedMatrix = new Map(
    readiness.requirements.map((requirement) => [
      requirement.id,
      expectedUiStatus(clean, requirement, resolveTarget(clean, requirement.target)),
    ]),
  );

  // Divergencia documentada modelo/UI (R7-F2): el modelo deriva "missing"
  // para el sentinel; la UI lo muestra "placeholder".
  const whatsappModel = readiness.requirements.find(
    (requirement) => requirement.id === "identity.whatsapp",
  );
  expect(whatsappModel?.status).toBe("missing");
  const placeholderAsset = readiness.requirements.find(
    (requirement) => requirement.scope === "asset",
  );
  expect(placeholderAsset?.status).toBe("placeholder");
  expect(clean.whatsapp.phone).toBe("");

  expectModelMatchesRealData(clean);
  await expectChecklistUiMatches(page, clean);

  const ui = await readUiStatuses(page);
  // La cota de 12 pendientes visibles (GuidedOverview.tsx:89) oculta el resto
  // del orden del modelo: la matriz 1:1 sólo aplica a los requisitos que la
  // UI renderiza (pendientes visibles + listos del detalle).
  const hiddenByCap = new Set(
    readiness.requirements
      .filter((requirement) => requirement.status !== "ready")
      .slice(12)
      .map((requirement) => requirement.id),
  );
  for (const [requirementId, expected] of expectedMatrix) {
    if (hiddenByCap.has(requirementId)) continue;
    expect(ui.get(requirementId), `matriz: ${requirementId}`).toBe(expected);
  }
  expect(ui.get("identity.whatsapp"), "teléfono vacío en UI").toBe("missing");

  // Orden de los pendientes visibles, derivado del modelo vigente.
  const expectedPendingOrder = readiness.requirements
    .filter((requirement) => requirement.status !== "ready")
    .slice(0, 12)
    .map((requirement) => requirement.id);
  const pendingIds = await page
    .locator(".guided-checklist > ul > li")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-requirement-id")));
  expect(pendingIds).toEqual(expectedPendingOrder);
  if (readiness.pending > 12) {
    await expect(page.locator(".guided-checklist__more")).toHaveText(
      `+${readiness.pending - 12} más`,
    );
  } else {
    await expect(page.locator(".guided-checklist__more")).toHaveCount(0);
  }
  await expect(page.locator(".guided-checklist > ul > li")).toHaveCount(
    Math.min(12, readiness.pending),
  );

  // Etiquetas de estado accionables para el usuario.
  const descriptionItem = page.locator(
    '[data-testid="ui-guided-requirement"][data-requirement-id="identity.description"]',
  );
  await expect(descriptionItem).toContainText("Marca · Reemplazar texto de plantilla");
  const emailItem = page.locator(
    '[data-testid="ui-guided-requirement"][data-requirement-id="identity.email"]',
  );
  await expect(emailItem).toContainText("Marca · Falta completar");

  // Progreso honesto sobre los requisitos activos de esta tienda.
  await expect(page.locator(".guided-progress__copy strong")).toHaveText(
    `${readiness.ready} de ${readiness.requirements.length} requisitos listos`,
  );
  await expect(page.getByTestId("ui-guided-progress")).toHaveAttribute(
    "aria-valuenow",
    String(readiness.percent),
  );
});

test("mutación: vaciar descripción y precio 0 → los requisitos pasan a missing (el estado sigue al dato real)", async ({
  page,
}) => {
  await resetStudioIndexedDb(page, studioUrl);
  await mutateDemoProject(page);
  await page.reload();
  await openDemoStore(page);
  await openPrepararTab(page);

  const project = await readProject(page, DEMO_PROJECT_ID);
  const firstProduct = project.products[0];
  const secondProduct = project.products[1];
  if (!firstProduct || !secondProduct) throw new Error("La demo no tiene dos productos.");
  const readiness = evaluateCatalogModernReadiness(project as unknown as StoreProjectV2);
  expect(project.products[0]?.description).toBe("");
  expect(project.products[1]?.variants[0]?.price).toBe(0);
  expect(readiness.requirements.length).toBeGreaterThan(0);
  expect(readiness.ready).toBeLessThan(readiness.requirements.length);
  expect(readiness.pending).toBeGreaterThanOrEqual(2);
  expect(readiness.percent).toBe(
    Math.round((readiness.ready / readiness.requirements.length) * 100),
  );

  expectModelMatchesRealData(project);
  await expectChecklistUiMatches(page, project);

  const ui = await readUiStatuses(page);
  expect(ui.get(`product.${firstProduct.id}.description`)).toBe("missing");
  expect(ui.get(`product.${secondProduct.id}.price`)).toBe("missing");
  expect(ui.get(`product.${firstProduct.id}.title`)).toBe(
    readiness.requirements.find(
      (requirement) => requirement.id === `product.${firstProduct.id}.title`,
    )?.status,
  );
  expect(ui.get(`product.${firstProduct.id}.price`)).toBe(
    readiness.requirements.find(
      (requirement) => requirement.id === `product.${firstProduct.id}.price`,
    )?.status,
  );

  // Los dos pendientes aparecen con su label real y el progreso baja.
  await expect(
    page.locator(
      `[data-testid="ui-guided-requirement"][data-requirement-id="product.${firstProduct.id}.description"]`,
    ),
  ).toContainText(`Descripción: ${firstProduct.title}`);
  await expect(
    page.locator(
      `[data-testid="ui-guided-requirement"][data-requirement-id="product.${secondProduct.id}.price"]`,
    ),
  ).toContainText(`Precio: ${secondProduct.title}`);
  await expect(page.locator(".guided-progress__copy strong")).toHaveText(
    `${readiness.ready} de ${readiness.requirements.length} requisitos listos`,
  );
  await expect(page.getByTestId("ui-guided-progress")).toHaveAttribute(
    "aria-valuenow",
    String(readiness.percent),
  );
  await expect(page.getByTestId("ui-guided-next")).toContainText("Siguiente:");
});

/** Mutación schema-válida del proyecto demo en IndexedDB: descripción vacía
 *  (z.string() permite "") y precio 0 (MoneySchema nonnegative). */
async function mutateDemoProject(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          (projectId) =>
            new Promise<boolean>((resolve, reject) => {
              const request = indexedDB.open("solara-commerce-studio");
              request.addEventListener("error", () => reject(request.error));
              request.addEventListener("success", () => {
                const db = request.result;
                const transaction = db.transaction("projects", "readwrite");
                const store = transaction.objectStore("projects");
                const all = store.getAll();
                all.addEventListener("success", () => {
                  const records = all.result as Array<{
                    project: {
                      id: string;
                      products: Array<{
                        id: string;
                        description: string;
                        variants: Array<{ price: number }>;
                      }>;
                    };
                  }>;
                  const record = records.find((item) => item.project.id === projectId);
                  if (!record) {
                    resolve(false);
                    return;
                  }
                  const productOne = record.project.products[0];
                  const productTwo = record.project.products[1];
                  if (!productOne || !productTwo || !productTwo.variants[0]) {
                    resolve(false);
                    return;
                  }
                  productOne.description = "";
                  productTwo.variants[0].price = 0;
                  store.put(record);
                  transaction.addEventListener("complete", () => resolve(true));
                });
                all.addEventListener("error", () => reject(all.error));
                transaction.addEventListener("error", () => reject(transaction.error));
              });
            }),
          DEMO_PROJECT_ID,
        ),
      { timeout: 15_000, message: "No se encontró la demo para aplicar la mutación." },
    )
    .toBe(true);
}
