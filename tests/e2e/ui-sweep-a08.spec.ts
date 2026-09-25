/**
 * Barrido A08 — Overview: enlaces y SEO (auditoría, slice de
 * `apps/studio/src/features/Overview.tsx`; NO lo edita: A7 es el owner).
 * Contrato de 3 capas por control:
 *  (1) click/edición → efecto real en el proyecto (verificado en IndexedDB);
 *  (2) auto-feedback: errores inline (role=alert + aria-invalid), badges de
 *      estado del teléfono, contadores de SEO y maxLength;
 *  (3) datos: payload del control → receptor (`navigation.items[]`,
 *      `pages[].seoTitle/seoDescription`, `whatsapp.phone`, `baseUrl`).
 * Los bugs que requirieron cambio en Overview.tsx quedan cubiertos como
 * regresiones del owner A7.
 */
import type { Server } from "node:http";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { createCleanStore, openMutableScaleStore } from "./project-helpers";
import { startStudioServer, stopStudioServer } from "./studio-server";

test.setTimeout(process.env.CI ? 120_000 : 90_000);

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

async function wipeAndOpenDashboard(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto(studioUrl);
    const deleted = await page.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          const request = indexedDB.deleteDatabase("solara-commerce-studio");
          request.addEventListener("success", () => resolve(true));
          request.addEventListener("error", () => resolve(false));
          request.addEventListener("blocked", () => resolve(false));
        }),
    );
    await page.reload();
    if (!deleted) continue;
    try {
      await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
        timeout: 30_000,
      });
      return;
    } catch {
      // El dashboard tarda en arrancar bajo carga; reintentar con base limpia.
    }
  }
  throw new Error("No se pudo limpiar la base y abrir el dashboard.");
}

async function setupCleanStore(page: Page, name: string): Promise<void> {
  await wipeAndOpenDashboard(page);
  await createCleanStore(page, name);
  await openResumenTab(page);
}

async function setupDemoStore(page: Page): Promise<string> {
  await wipeAndOpenDashboard(page);
  const projectId = await openMutableScaleStore(page, "Tienda A08 mutable");
  await openResumenTab(page);
  return projectId;
}

async function openResumenTab(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "Resumen", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Resumen", exact: true })).toBeVisible();
}

async function leaveAndReturnToResumen(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "Preparar", exact: true }).click();
  await openResumenTab(page);
}

interface StoredNavItem {
  id: string;
  label: string;
  href?: string;
  children?: Array<{ id: string; label: string; href?: string }>;
}

interface StoredProjectPayload {
  id: string;
  name: string;
  baseUrl: string;
  whatsapp: { phone: string };
  navigation: { catalogLabel: string; items: StoredNavItem[] };
  categories: Array<{ slug: string }>;
  pages: Array<{
    id: string;
    kind: string;
    title: string;
    seoTitle: string;
    seoDescription: string;
  }>;
}

interface StoredRecord {
  id: string;
  name: string;
  status: string;
  updatedAt: string;
  project: StoredProjectPayload;
}

interface ProjectLookup {
  id?: string;
  name?: string;
}

/** Lee el proyecto autoservado en IndexedDB (receptor del payload commiteado). */
async function storedProject(page: Page, lookup: ProjectLookup): Promise<StoredRecord | null> {
  return page.evaluate(
    ([id, name]) =>
      new Promise<StoredRecord | null>((resolve, reject) => {
        const request = indexedDB.open("solara-commerce-studio");
        request.addEventListener("error", () => reject(request.error));
        request.addEventListener("success", () => {
          const db = request.result;
          const all = db.transaction("projects").objectStore("projects").getAll();
          all.addEventListener("success", () => {
            const records = all.result as StoredRecord[];
            resolve(
              records.find((record) => (id ? record.id === id : record.project.name === name)) ??
                null,
            );
          });
          all.addEventListener("error", () => reject(all.error));
        });
      }),
    [lookup.id ?? null, lookup.name ?? null],
  );
}

async function readProject(page: Page, lookup: ProjectLookup): Promise<StoredProjectPayload> {
  let record: StoredRecord | null = null;
  await expect
    .poll(
      async () => {
        record = await storedProject(page, lookup);
        return record;
      },
      { timeout: 15_000 },
    )
    .not.toBeNull();
  const project = record?.project;
  expect(project?.id).toMatch(/\S+/);
  return project as StoredProjectPayload;
}

const navItems = (page: Page) => page.locator(".navigation-editor-item");
const waSection = (page: Page) => page.locator('[data-accordion-id="whatsapp"]');
const domainSection = (page: Page) => page.locator('[data-accordion-id="domain"]');
const pagesSection = (page: Page) => page.locator('[data-accordion-id="pages"]');
const homeEditor = (page: Page) =>
  pagesSection(page).locator(".page-editor").filter({ hasText: "Home" });
const fieldsetByLegend = (parent: Locator, legend: string) =>
  parent.locator("fieldset.field").filter({ hasText: legend });

test("Añadir enlace de catálogo agrega el enlace visible con destino por defecto y persiste (capa 1+2+3)", async ({
  page,
}) => {
  const projectId = await setupDemoStore(page);

  const initialCount = await navItems(page).count();
  await page.getByRole("button", { name: "Añadir enlace de catálogo", exact: true }).click();
  await expect(navItems(page)).toHaveCount(initialCount + 1);

  const item = navItems(page).nth(initialCount);
  const itemDest = item.locator(".form-grid").first().getByLabel("Destino", { exact: true });
  await expect(item.getByLabel(`Enlace ${initialCount + 1}`, { exact: true })).toHaveValue(
    "Nueva categoría",
  );

  const demo = { id: projectId };
  const project = await readProject(page, demo);
  const expectedHref = `/categorias/${project.categories[0].slug}/`;
  await expect(itemDest).toHaveValue(expectedHref);
  await expect
    .poll(async () => (await storedProject(page, demo))?.project.navigation.items)
    .toHaveLength(initialCount + 1);
  const added = (await storedProject(page, demo))?.project.navigation.items.at(-1);
  expect(added?.label).toBe("Nueva categoría");
  expect(added?.href).toBe(expectedHref);

  await item.getByRole("button", { name: "Añadir subenlace" }).click();
  const child = item.getByLabel("Subenlace 1", { exact: true });
  await expect(child).toBeVisible();
  await expect(itemDest).toHaveValue(expectedHref);
  await expect
    .poll(async () => {
      const items = (await storedProject(page, demo))?.project.navigation.items;
      return items?.at(-1)?.children?.length ?? 0;
    })
    .toBe(1);

  await leaveAndReturnToResumen(page);
  await expect(navItems(page)).toHaveCount(initialCount + 1);
  await expect(
    navItems(page).nth(initialCount).locator(".form-grid").first().getByLabel("Destino", {
      exact: true,
    }),
  ).toHaveValue(expectedHref);
});

test("label y destino del enlace: edición, validación inline y contrato de datos (capa 1+2+3)", async ({
  page,
}) => {
  const store = { name: "Tienda enlaces A08" };
  await setupCleanStore(page, store.name);

  await page.getByRole("button", { name: "Añadir enlace de catálogo", exact: true }).click();
  const item = navItems(page).first();
  const labelInput = item.getByLabel("Enlace 1", { exact: true });
  const destInput = item.getByLabel("Destino", { exact: true });

  await labelInput.fill("Mi catálogo");
  await expect
    .poll(async () => (await storedProject(page, store))?.project.navigation.items[0]?.label)
    .toBe("Mi catálogo");

  await destInput.fill("https://tienda-ejemplo.com/nuevo");
  await destInput.press("Tab");
  await expect
    .poll(async () => (await storedProject(page, store))?.project.navigation.items[0]?.href)
    .toBe("https://tienda-ejemplo.com/nuevo");

  await destInput.fill("no es una url");
  await expect(fieldsetByLegend(item, "Destino").getByTestId("ui-field-error")).toContainText(
    "Usá http(s) o una ruta interna",
  );
  await expect(destInput).toHaveAttribute("aria-invalid", "true");
  await destInput.press("Tab");
  await expect(destInput).toHaveValue("no es una url");
  await expect
    .poll(async () => (await storedProject(page, store))?.project.navigation.items[0]?.href)
    .toBe("https://tienda-ejemplo.com/nuevo");

  await destInput.fill("//doble-barra");
  await expect(fieldsetByLegend(item, "Destino").getByTestId("ui-field-error")).toContainText(
    "Usá http(s) o una ruta interna",
  );

  await destInput.fill("/envios/");
  await destInput.press("Tab");
  await expect(fieldsetByLegend(item, "Destino").getByTestId("ui-field-error")).toHaveCount(0);
  await expect
    .poll(async () => (await storedProject(page, store))?.project.navigation.items[0]?.href)
    .toBe("/envios/");

  await destInput.fill("");
  await destInput.press("Tab");
  await expect
    .poll(async () => (await storedProject(page, store))?.project.navigation.items[0]?.href)
    .toBe("");

  await leaveAndReturnToResumen(page);
  await expect(navItems(page).first().getByLabel("Enlace 1", { exact: true })).toHaveValue(
    "Mi catálogo",
  );
  await expect(navItems(page).first().getByLabel("Destino", { exact: true })).toHaveValue("");
});

test("teléfono WhatsApp: validación guiada, badge de estado y no-commit de inválidos (capa 1+2+3)", async ({
  page,
}) => {
  const store = { name: "Tienda WhatsApp A08" };
  await setupCleanStore(page, store.name);
  const phoneInput = waSection(page).getByLabel("Número internacional", { exact: true });

  await expect(waSection(page).locator(".ui-status-badge__label")).toHaveText("Pendiente");
  await expect(waSection(page).getByTestId("ui-field-error")).toContainText(
    "Falta completar el número de WhatsApp.",
  );

  await phoneInput.fill("12345");
  await expect(waSection(page).locator(".ui-status-badge__label")).toHaveText("Revisar formato");
  await expect(waSection(page).getByTestId("ui-field-error")).toContainText(
    "Usá entre 8 y 15 dígitos con código de país y área.",
  );
  await expect(phoneInput).toHaveAttribute("aria-invalid", "true");

  await phoneInput.fill("abc5491123456789");
  await expect(phoneInput).toHaveValue("5491123456789");
  await expect(waSection(page).locator(".ui-status-badge__label")).toHaveText("Formato correcto");
  await expect(waSection(page).getByTestId("ui-field-error")).toHaveCount(0);
  await expect
    .poll(async () => (await storedProject(page, store))?.project.whatsapp.phone)
    .toBe("5491123456789");

  await phoneInput.fill("54911 2345 6789");
  await expect(phoneInput).toHaveValue("5491123456789");

  await phoneInput.fill("");
  await expect(waSection(page).locator(".ui-status-badge__label")).toHaveText("Pendiente");
  await expect(waSection(page).getByTestId("ui-field-error")).toContainText(
    "Falta completar el número de WhatsApp.",
  );
  await expect
    .poll(async () => (await storedProject(page, store))?.project.whatsapp.phone)
    .toBe("5491123456789");

  await leaveAndReturnToResumen(page);
  await expect(phoneInput).toHaveValue("5491123456789");
});

test("URL pública: validación inline y persistencia en baseUrl (capa 1+2+3)", async ({ page }) => {
  const store = { name: "Tienda dominio A08" };
  await setupCleanStore(page, store.name);
  const urlInput = domainSection(page).getByLabel("URL pública", { exact: true });
  const initialUrl = await urlInput.inputValue();
  expect(initialUrl).toMatch(/^https:\/\/.*\.example$/);

  await urlInput.fill("sin-protocolo");
  await expect(domainSection(page).getByTestId("ui-field-error")).toContainText(
    "Ingresá una URL válida con http(s).",
  );
  await expect(urlInput).toHaveAttribute("aria-invalid", "true");
  await expect
    .poll(async () => (await storedProject(page, store))?.project.baseUrl)
    .toBe(initialUrl);

  await urlInput.fill("/buscar/");
  await expect(domainSection(page).getByTestId("ui-field-error")).toContainText(
    "Ingresá una URL válida con http(s).",
  );

  await urlInput.fill("https://tienda-ejemplo.com.ar");
  await expect(domainSection(page).getByTestId("ui-field-error")).toHaveCount(0);
  await expect
    .poll(async () => (await storedProject(page, store))?.project.baseUrl)
    .toBe("https://tienda-ejemplo.com.ar");

  await leaveAndReturnToResumen(page);
  await expect(urlInput).toHaveValue("https://tienda-ejemplo.com.ar");
});

test("SEO: contadores con maxLength y persistencia en páginas (capa 1+2+3)", async ({ page }) => {
  const store = { name: "Tienda SEO A08" };
  await setupCleanStore(page, store.name);

  const titleInput = homeEditor(page).getByLabel("Título SEO", { exact: true });
  const titleField = fieldsetByLegend(homeEditor(page), "Título SEO");
  const initialLen = (await titleInput.inputValue()).length;
  await expect(titleField.locator("small").first()).toHaveText(`${initialLen}/70 caracteres`);
  await expect(titleInput).toHaveAttribute("maxlength", "70");

  await titleInput.fill("T".repeat(70));
  await expect(titleField.locator("small").first()).toHaveText("70/70 caracteres");
  await titleInput.press("End");
  await titleInput.pressSequentially("xyz", { delay: 5 });
  await expect(titleInput).toHaveValue("T".repeat(70));

  const descInput = homeEditor(page).getByLabel("Descripción SEO", { exact: true });
  const descField = fieldsetByLegend(homeEditor(page), "Descripción SEO");
  await expect(descField.locator("small").first()).toHaveText(
    `${(await descInput.inputValue()).length}/180 caracteres`,
  );
  await expect(descInput).toHaveAttribute("maxlength", "180");
  await descInput.fill("D".repeat(180));
  await expect(descField.locator("small").first()).toHaveText("180/180 caracteres");

  await titleInput.fill("Título SEO persistente");
  await descInput.fill("Descripción SEO persistente");
  await expect
    .poll(async () => {
      const home = (await storedProject(page, store))?.project.pages.find((p) => p.kind === "home");
      return home?.seoTitle;
    })
    .toBe("Título SEO persistente");
  await expect
    .poll(async () => {
      const home = (await storedProject(page, store))?.project.pages.find((p) => p.kind === "home");
      return home?.seoDescription;
    })
    .toBe("Descripción SEO persistente");

  await leaveAndReturnToResumen(page);
  await expect(homeEditor(page).getByLabel("Título SEO", { exact: true })).toHaveValue(
    "Título SEO persistente",
  );
  await expect(homeEditor(page).getByLabel("Descripción SEO", { exact: true })).toHaveValue(
    "Descripción SEO persistente",
  );
});

test("vacíos de campos obligatorios: error inline en español sin rechazo global (BUG B1 → A7)", async ({
  page,
}) => {
  const store = { name: "Tienda B1 A08" };
  await setupCleanStore(page, store.name);
  await page.getByRole("button", { name: "Añadir enlace de catálogo", exact: true }).click();
  const item = navItems(page).first();

  await item.getByLabel("Enlace 1", { exact: true }).fill("Mi enlace");
  await expect(fieldsetByLegend(item, "Enlace 1").getByTestId("ui-field-error")).toHaveCount(0);

  await item.getByLabel("Enlace 1", { exact: true }).fill("");
  await expect(fieldsetByLegend(item, "Enlace 1").getByTestId("ui-field-error")).toContainText(
    "Completá",
  );
  await expect(page.getByTestId("ui-inline-error")).toHaveCount(0);
  await expect
    .poll(async () => (await storedProject(page, store))?.project.navigation.items[0]?.label)
    .toBe("Mi enlace");

  const urlInput = domainSection(page).getByLabel("URL pública", { exact: true });
  const initialUrl = await urlInput.inputValue();
  await urlInput.fill("");
  await expect(
    fieldsetByLegend(domainSection(page), "URL pública").getByTestId("ui-field-error"),
  ).toContainText("Completá");
  await expect(page.getByTestId("ui-inline-error")).toHaveCount(0);
  await expect
    .poll(async () => (await storedProject(page, store))?.project.baseUrl)
    .toBe(initialUrl);

  const descriptionInput = page.getByLabel("Descripción", { exact: true });
  await descriptionInput.fill("Descripción inicial para validar el borrador.");
  await expect
    .poll(async () => (await storedProject(page, store))?.project.identity.description)
    .toBe("Descripción inicial para validar el borrador.");
  await descriptionInput.fill("");
  const descriptionField = fieldsetByLegend(
    page.locator('[data-accordion-id="identity"]'),
    "Descripción",
  );
  const descriptionError = descriptionField.getByTestId("ui-field-error");
  await expect(descriptionError).toContainText("Completá");
  await expect(descriptionInput).toHaveAttribute("aria-invalid", "true");
  const descriptionErrorId = await descriptionError.getAttribute("id");
  expect(descriptionErrorId).toMatch(/\S+/);
  await expect(descriptionInput).toHaveAttribute("aria-describedby", descriptionErrorId as string);
  await expect(page.getByTestId("ui-inline-error")).toHaveCount(0);
  await expect
    .poll(async () => (await storedProject(page, store))?.project.identity.description)
    .toBe("Descripción inicial para validar el borrador.");

  await descriptionInput.fill("Descripción corregida.");
  await expect(descriptionField.getByTestId("ui-field-error")).toHaveCount(0);
  await expect
    .poll(async () => (await storedProject(page, store))?.project.identity.description)
    .toBe("Descripción corregida.");

  const seoInput = homeEditor(page).getByLabel("Título SEO", { exact: true });
  const initialSeoTitle = await seoInput.inputValue();
  await seoInput.fill("");
  await expect(
    fieldsetByLegend(homeEditor(page), "Título SEO").getByTestId("ui-field-error"),
  ).toContainText("Completá");
  await expect(page.getByTestId("ui-inline-error")).toHaveCount(0);
  await expect
    .poll(async () => {
      const home = (await storedProject(page, store))?.project.pages.find((p) => p.kind === "home");
      return home?.seoTitle;
    })
    .toBe(initialSeoTitle);
});

test("los límites de navegación respetan el schema y anuncian los controles deshabilitados", async ({
  page,
}) => {
  await setupCleanStore(page, "Tienda límites nav A08");

  const catalogLabel = page.getByLabel("Nombre del catálogo", { exact: true });
  await expect(catalogLabel).toHaveAttribute("maxlength", "40");
  await catalogLabel.fill("C".repeat(40));
  await expect(catalogLabel).toHaveValue("C".repeat(40));
  await expect(
    fieldsetByLegend(
      page.locator('[data-accordion-id="navigation"]'),
      "Nombre del catálogo",
    ).locator("small"),
  ).toContainText("40/40 caracteres");

  const addLink = page.getByRole("button", { name: "Añadir enlace de catálogo", exact: true });
  for (let index = 0; index < 20; index += 1) await addLink.click();
  await expect(navItems(page)).toHaveCount(20);
  await expect(addLink).toBeDisabled();
  const itemLimit = page.getByTestId("ui-navigation-items-limit");
  await expect(itemLimit).toContainText("20 enlaces");
  const itemLimitId = await itemLimit.getAttribute("id");
  expect(itemLimitId).toMatch(/\S+/);
  await expect(addLink).toHaveAttribute("aria-describedby", itemLimitId as string);

  const firstItem = navItems(page).first();
  const addChild = firstItem.getByRole("button", { name: "Añadir subenlace", exact: true });
  for (let index = 0; index < 12; index += 1) await addChild.click();
  await expect(firstItem.locator(".navigation-child-editor")).toHaveCount(12);
  await expect(addChild).toBeDisabled();
  const childLimit = firstItem.getByText("Llegaste al máximo de 12 subenlaces.", { exact: true });
  await expect(childLimit).toBeVisible();
  await expect(addChild).toHaveAttribute(
    "aria-describedby",
    /nav-children-context-.+ nav-children-limit-.+/,
  );
});
