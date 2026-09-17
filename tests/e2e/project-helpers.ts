import { expect, type Page } from "@playwright/test";
import { createProjectArchive } from "@solara/exporter";
import { catalogScaleStore } from "@solara/project-schema/scale-fixture";

export async function createCleanStore(page: Page, name = "Tienda de prueba"): Promise<void> {
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "Nueva tienda", exact: true }).click();
  await page.getByLabel("Nueva tienda").fill(name);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Crear tienda desde plantilla", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible({
    timeout: 20_000,
  });
}

export async function resetStudioIndexedDb(
  page: Page,
  studioUrl: string,
  headingTimeout = 20_000,
): Promise<void> {
  await page.goto(studioUrl);
  await page.evaluate(
    () =>
      new Promise<void>((resolveDelete, reject) => {
        const request = indexedDB.deleteDatabase("solara-commerce-studio");
        request.addEventListener("success", () => resolveDelete());
        request.addEventListener("error", () => reject(request.error));
        request.addEventListener("blocked", () => reject(new Error("La base quedó bloqueada.")));
      }),
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: headingTimeout,
  });
}

/** Importa la fixture de escala como tienda mutable, sin usar Predeterminado. */
export async function openMutableScaleStore(
  page: Page,
  name = "Tienda de escala mutable",
): Promise<string> {
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 10_000,
  });
  const fixture = structuredClone(catalogScaleStore);
  fixture.name = name;
  const createDialog = page.getByRole("button", { name: "Nueva tienda", exact: true });
  await createDialog.click();
  await page.getByLabel("Seleccionar tienda para importar").setInputFiles({
    name: "catalog-scale.solara.json",
    mimeType: "application/json",
    buffer: Buffer.from(createProjectArchive(fixture), "utf8"),
  });
  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Volver a tiendas" }).click();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();

  const copy = page.locator(".dashboard-store-card").filter({ hasText: name }).first();
  const id = await copy.locator(".dashboard-store-card__button").getAttribute("data-store-card-id");
  if (!id) throw new Error(`No se pudo identificar la copia mutable "${name}".`);
  await copy.locator(".dashboard-store-card__button").click();
  await page.getByRole("button", { name: "Abrir tienda", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible();
  return id;
}
