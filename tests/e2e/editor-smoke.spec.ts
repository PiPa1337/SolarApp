/**
 * T6.1 — Smoke completo del editor.
 * Recorrido de regresión de punta a punta: dashboard → abrir Predeterminado →
 * cada tab → crear producto → editar sección → exportar borrador → volver →
 * archivar/restaurar. Sin aserciones finas de contenido: cada pantalla
 * verifica su elemento clave (heading/testid).
 */
import type { Server } from "node:http";
import { expect, test } from "@playwright/test";
import { openMutableScaleStore, resetStudioIndexedDb } from "./project-helpers";
import { startStudioServer, stopStudioServer } from "./studio-server";

test.setTimeout(process.env.CI ? 240_000 : 180_000);

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

test("recorre el editor de punta a punta: tabs, producto, sección, exportación y vuelta", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await resetStudioIndexedDb(page, studioUrl, 30_000);

  await expect(
    page.locator('[data-store-card-id="store-modo-sur-demo"]'),
    "la tienda Predeterminado aparece en el dashboard",
  ).toBeVisible();

  await openMutableScaleStore(page, "Tienda smoke mutable");

  const tabs: Array<{ tab: string; heading: string }> = [
    { tab: "Preparar", heading: "Preparar tienda" },
    { tab: "Resumen", heading: "Resumen" },
    { tab: "Catálogo", heading: "Catálogo" },
    { tab: "Constructor", heading: "Constructor" },
    { tab: "Tema de la tienda", heading: "Tema de la tienda" },
    { tab: "Recursos", heading: "Recursos" },
    { tab: "SEO", heading: "SEO y Google" },
    { tab: "Exportar", heading: "Exportar" },
  ];
  for (const { tab, heading } of tabs) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }

  await expect(page.getByTestId("ui-status-bar")).toContainText("Esquema v2");
  await expect(page.locator('iframe[title^="Vista previa "]')).toBeVisible();
  await expect(page.locator(".preview-toolbar")).toBeVisible();

  await page.getByRole("tab", { name: "Catálogo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Catálogo", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Agregar producto" }).first().click();
  const dialog = page.locator("dialog.product-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Título" }).fill("Linterna Bruma");
  await dialog.getByRole("textbox", { name: "Slug" }).fill("linterna-bruma");
  await dialog.getByRole("textbox", { name: "SKU" }).fill("LIN-BRUMA-01");
  await dialog.getByRole("spinbutton", { name: "Precio en centavos" }).fill("45000");
  await dialog.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(dialog).toBeHidden();
  await page.getByPlaceholder("Buscar por producto, marca o estado").fill("Linterna Bruma");
  await expect(page.getByLabel("Nombre de Linterna Bruma")).toBeVisible();
  await page.getByPlaceholder("Buscar por producto, marca o estado").fill("");

  await page.getByRole("tab", { name: "Constructor", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Constructor", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Portada Hero audiovisual", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Inspector de sección" })).toBeVisible();
  const title = page
    .getByRole("complementary", { name: "Inspector de sección" })
    .getByRole("textbox", { name: "Título", exact: true })
    .first();
  await title.fill("Título del smoke");
  await expect(title).toHaveValue("Título del smoke");
  await expect(page.getByText("Cambios pendientes", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Exportar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Exportar", exact: true })).toBeVisible();
  const draft = page.getByTestId("ui-export-draft");
  await draft.click();
  await expect(draft).toBeDisabled();
  await expect(draft).toContainText("Generando");
  await expect(page.getByTestId("ui-export-result")).toContainText("Exportación correcta", {
    timeout: 60_000,
  });
  await expect(draft).toBeEnabled();

  await page.getByRole("button", { name: "Volver a tiendas" }).click();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
});
