import type { Server } from "node:http";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { createCleanStore } from "./project-helpers";
import { startStudioServer, stopStudioServer } from "./studio-server";

/**
 * T0.2 — Inventario de controles y estados del editor.
 * Verifica con getComputedStyle que los controles distinguen disabled, hover,
 * focus-visible y loading, y que el inventario `data-testid="ui-*"` mantiene
 * estilos coherentes por estado en todas las pantallas.
 */

let studioServer: Server;
let studioUrl: string;

test.beforeAll(async () => {
  const studio = await startStudioServer();
  studioServer = studio.server;
  studioUrl = studio.url;
});

test.afterAll(async () => {
  await stopStudioServer(studioServer);
});

async function openStore(page: Page): Promise<void> {
  await page.goto(studioUrl);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase("solara-commerce-studio");
        request.addEventListener("success", () => resolve());
        request.addEventListener("error", () => reject(request.error));
        request.addEventListener("blocked", () =>
          reject(new Error("No se pudo limpiar la base de estados del editor.")),
        );
      }),
  );
  await page.goto(studioUrl);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 20_000,
  });
  const card = page.locator(".dashboard-store-card").filter({ hasText: "Predeterminado" }).first();
  await card.locator(".dashboard-store-card__button").click();
  const baseDetail = page.getByRole("region", { name: "Tienda seleccionada: Predeterminado" });
  await baseDetail.getByRole("button", { name: "Duplicar", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Duplicar tienda" });
  await expect(dialog).toBeVisible();
  await dialog.getByTestId("ui-duplicate-name").fill("Tienda estados mutable");
  await dialog.getByRole("button", { name: "Duplicar", exact: true }).click();
  await expect(dialog).toBeHidden();
  await page
    .locator(".dashboard-store-card")
    .filter({ has: page.getByText("Tienda estados mutable", { exact: true }) })
    .last()
    .locator(".dashboard-store-card__button")
    .click();
  await expect(
    page.getByRole("region", { name: "Tienda seleccionada: Tienda estados mutable" }),
  ).toBeVisible({ timeout: 20_000 });
}

async function openSelectedStudio(page: Page): Promise<void> {
  await page
    .getByRole("region", { name: "Tienda seleccionada: Tienda estados mutable" })
    .getByRole("button", { name: "Abrir tienda" })
    .click();
  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible({
    timeout: 30_000,
  });
}

async function openStudio(page: Page): Promise<void> {
  await openStore(page);
  await openSelectedStudio(page);
}

function styleOf(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      cursor: style.cursor,
      opacity: style.opacity,
      background: `${style.backgroundColor} ${style.backgroundImage}`,
      border: style.borderColor,
      color: style.color,
    };
  });
}

async function expectEnabledButton(button: Locator, label: string) {
  await expect(button).toBeEnabled();
  const style = await styleOf(button);
  expect(style.cursor, `${label}: cursor de habilitado`).toBe("pointer");
  expect(Number(style.opacity), `${label}: opacidad de habilitado`).toBeGreaterThan(0.9);
}

async function expectDisabledButton(button: Locator, label: string) {
  await expect(button).toBeDisabled();
  const style = await styleOf(button);
  expect(style.cursor, `${label}: cursor de deshabilitado`).toBe("not-allowed");
  expect(Number(style.opacity), `${label}: opacidad de deshabilitado`).toBeLessThan(1);
}

async function expectFocusRing(element: Locator, label: string) {
  // Activa la modalidad de teclado antes de enfocar el control. Hacer un
  // Tab/Shift+Tab alrededor del elemento era inestable cuando el siguiente
  // destino era el iframe de Preview.
  await element.page().keyboard.press("Tab");
  await element.focus();
  await expect(element).toBeFocused();
  const hasRing = await element.evaluate((el) => {
    const visibleRing = (node: Element) => {
      const style = getComputedStyle(node);
      const outline = style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0;
      const shadow = style.boxShadow !== "none" && style.boxShadow !== "";
      return outline || shadow;
    };
    if (visibleRing(el)) return true;
    return el.parentElement !== null && visibleRing(el.parentElement);
  });
  expect(hasRing, `${label}: anillo de focus-visible`).toBe(true);
}

function hoverSignature(locator: Locator) {
  return locator.evaluate((el) =>
    [el, el.parentElement]
      .filter((node): node is Element => node !== null)
      .map((node) => {
        const style = getComputedStyle(node);
        return `${style.backgroundColor} ${style.backgroundImage} | ${style.borderColor}`;
      })
      .join(" § "),
  );
}

async function expectHoverChange(element: Locator, label: string) {
  await element.evaluate((node) => {
    if (node instanceof HTMLElement) node.blur();
  });
  await element.page().mouse.move(0, 0);
  const before = await hoverSignature(element);
  await element.hover();
  await expect
    .poll(() => hoverSignature(element), { message: `${label}: hover distinguible` })
    .not.toBe(before);
}

test("el dashboard distingue estados en sus controles", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(studioUrl);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();

  const newStore = page.getByRole("button", { name: "Nueva tienda", exact: true });
  await expectEnabledButton(newStore, "Nueva tienda");
  await expectFocusRing(newStore, "Nueva tienda");
  await expectHoverChange(newStore, "Nueva tienda");

  const search = page.getByRole("searchbox", { name: "Buscar tienda" });
  await expectFocusRing(search, "Búsqueda del dashboard");
  await expectHoverChange(search, "Búsqueda del dashboard");

  const status = page.getByRole("combobox", { name: "Estado" });
  await expectFocusRing(status, "Filtro de estado");
  const sort = page.getByRole("combobox", { name: "Ordenar" });
  await expectFocusRing(sort, "Orden");

  const gridView = page.getByRole("button", { name: "Vista en grilla" });
  await expectHoverChange(gridView, "Vista en grilla");
  await expect(gridView).toHaveAttribute("aria-pressed", "true");

  const card = page.locator(".dashboard-store-card").filter({ hasText: "Predeterminado" }).first();
  const cardTransform = await card.evaluate((element) => getComputedStyle(element).transform);
  await card.hover();
  await expect
    .poll(() => card.evaluate((element) => getComputedStyle(element).transform))
    .not.toBe(cardTransform);
  await expectFocusRing(
    page.locator(".dashboard-store-card__button").filter({ hasText: "Predeterminado" }).first(),
    "Tarjeta de tienda",
  );
});

test("el detalle de tienda y el Studio distinguen disabled, hover y focus", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1920, height: 912 });
  await openStore(page);

  const detail = page.getByRole("region", { name: "Tienda seleccionada: Tienda estados mutable" });
  const backup = detail.getByRole("button", { name: "Respaldar ahora" });
  await expectEnabledButton(backup, "Respaldo ahora");
  await expectFocusRing(backup, "Respaldo ahora");
  await expectHoverChange(backup, "Respaldo ahora");

  const archive = detail.getByRole("button", { name: "Archivar" });
  await expectHoverChange(archive, "Archivar");

  await openSelectedStudio(page);

  await expectDisabledButton(page.getByRole("button", { name: "Deshacer" }), "Deshacer inicial");
  await expectDisabledButton(page.getByRole("button", { name: "Rehacer" }), "Rehacer inicial");
  await expectEnabledButton(
    page.getByRole("button", { name: "Volver a tiendas" }),
    "Volver a tiendas",
  );
  await expectFocusRing(page.getByRole("button", { name: "Volver a tiendas" }), "Volver a tiendas");

  const tab = page.getByRole("tab", { name: "Resumen", exact: true });
  await expectHoverChange(tab, "Pestaña Resumen");
  await expectFocusRing(
    page.getByRole("tab", { name: "Preparar", exact: true }),
    "Pestaña Preparar",
  );

  await tab.click();
  await expect(page.getByRole("heading", { name: "Resumen", exact: true })).toBeVisible();
  const title = page
    .locator("fieldset.field", { hasText: "Título visible" })
    .first()
    .locator("input");
  await expectFocusRing(title, "Título visible del Resumen");
  await title.fill("Casa de prueba");
  await title.blur();
  await expect(page.getByRole("button", { name: "Deshacer" })).toBeEnabled();
});

test("el catálogo y el exportador muestran estados disabled y loading", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openStudio(page);

  await page.getByRole("tab", { name: "Catálogo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Catálogo", exact: true })).toBeVisible();
  await expectDisabledButton(page.getByRole("button", { name: "Anterior" }), "Anterior página 1");
  await page.getByRole("combobox", { name: "Filas" }).selectOption("25");
  await expectEnabledButton(page.getByRole("button", { name: "Siguiente" }), "Siguiente");
  await expectDisabledButton(page.getByRole("button", { name: "Anterior" }), "Anterior página 1");

  await page.getByRole("tab", { name: "Exportar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Exportar", exact: true })).toBeVisible();
  const draft = page.getByRole("button", { name: /Exportar borrador|Generando/ });
  await expectEnabledButton(draft, "Exportar borrador");
  await draft.click();
  await expect
    .poll(() => draft.textContent(), { message: "Exportar borrador debe pasar por Generando" })
    .toBe("Generando");
  await expect(draft).toBeDisabled();
  await expect.poll(() => draft.textContent(), { timeout: 60_000 }).toBe("Exportar borrador");
  await expect(draft).toBeEnabled();
});

test("el inventario ui-* mantiene estilos coherentes por estado en todas las pantallas", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(studioUrl);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();

  const checkConsistency = async (context: string) => {
    const states = await page
      .locator('[data-testid="ui-button"], [data-testid="ui-icon-button"]')
      .evaluateAll((elements) =>
        elements
          .filter((el): el is HTMLButtonElement => el instanceof HTMLButtonElement)
          .map((el) => {
            const style = getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return {
              label: el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "",
              disabled: el.disabled,
              cursor: style.cursor,
              opacity: style.opacity,
              visible: rect.width > 0 && rect.height > 0,
            };
          }),
      );
    const visible = states.filter((state) => state.visible);
    expect(visible.length, `${context}: inventario visible`).toBeGreaterThan(0);
    for (const state of visible) {
      expect(state.cursor, `${context} "${state.label}": cursor por estado`).toBe(
        state.disabled ? "not-allowed" : "pointer",
      );
      if (state.disabled) {
        expect(Number(state.opacity), `${context} "${state.label}": atenuado`).toBeLessThan(1);
      } else {
        expect(Number(state.opacity), `${context} "${state.label}": sin atenuar`).toBeGreaterThan(
          0.9,
        );
      }
    }
  };

  await checkConsistency("Dashboard");
  await openStudio(page);

  for (const tabName of [
    "Preparar",
    "Resumen",
    "Catálogo",
    "Constructor",
    "Tema de la tienda",
    "Recursos",
    "SEO",
    "Exportar",
  ]) {
    await page.getByRole("tab", { name: tabName, exact: true }).click();
    await checkConsistency(`Pestaña ${tabName}`);
  }

  await page.getByRole("tab", { name: "Constructor", exact: true }).click();
  await page.locator(".section-stack .section-select").first().click();
  const inspectorInput = page.locator(".inspector input, .inspector select").first();
  await expectFocusRing(inspectorInput, "Input del inspector");
});

test("los empty states ofrecen una acción concreta y funcional (T6.2)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(studioUrl);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();

  const search = page.getByRole("searchbox", { name: "Buscar tienda" });
  await search.fill("no-existe-ninguna-tienda-qa");
  await expect(page.getByTestId("ui-empty-state")).toContainText("No hay coincidencias");
  await search.fill("");
  await expect(page.getByTestId("ui-empty-state")).toBeHidden();

  await createCleanStore(page, "Tienda vacía QA");
  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible();

  await page.getByRole("tab", { name: "Catálogo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Catálogo", exact: true })).toBeVisible();
  const emptyCsvHeader =
    "producto_id,variante_id,slug,titulo,descripcion,marca,estado,categorias,colecciones,etiquetas,imagenes,variante,sku,opciones,precio_centavos,precio_anterior_centavos,disponible,estado_stock,gtin,mpn,imagen_variante,creado_en,actualizado_en";
  await page.locator('input[aria-label="Seleccionar archivo CSV"]').setInputFiles({
    name: "catalogo-vacio.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(emptyCsvHeader, "utf8"),
  });
  await expect(page.getByRole("heading", { name: "catalogo-vacio.csv" })).toBeVisible();
  await page.getByRole("button", { name: "Reemplazar catálogo", exact: true }).click();
  // En una tienda limpia el tab muestra dos empty states legítimos: el panel de
  // categorías ("No hay categorías") y el área de productos. Se apunta al de
  // productos para ejercitar su acción.
  const catalogEmpty = page.getByTestId("ui-empty-state").filter({
    hasText: "El catálogo está vacío",
  });
  await expect(catalogEmpty).toContainText("El catálogo está vacío");
  const addProduct = catalogEmpty.getByRole("button", { name: "Agregar producto" });
  await expectEnabledButton(addProduct, "Agregar producto del empty state");
  await addProduct.click();
  await expect(page.locator("dialog.product-dialog")).toBeVisible();
  await page.locator("dialog.product-dialog").getByRole("button", { name: "Cancelar" }).click();
  await expect(page.locator("dialog.product-dialog")).toBeHidden();
  // La plantilla limpia conserva las imágenes de plantilla (renombradas como
  // "Imagen de plantilla"), por lo que el empty state de Recursos ("No hay
  // imágenes") no es alcanzable: sólo aparece al borrar todos los assets.
});

test("el formulario de Resumen valida con errores inline y aria-describedby (T6.2)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // openStore sólo abre el panel de detalle; el tab Resumen vive en el Studio.
  await openStudio(page);
  await page.getByRole("tab", { name: "Resumen", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Resumen", exact: true })).toBeVisible();

  const fieldsetOf = (input: Locator) =>
    input.locator("xpath=ancestor::fieldset[contains(@class, 'field')]");

  const name = page.getByLabel("Nombre de la tienda");
  const originalName = await name.inputValue();
  await name.fill("");
  const nameField = fieldsetOf(name);
  await expect(nameField.getByTestId("ui-field-error")).toContainText(
    "Completá el nombre de la tienda.",
  );
  await expect(name).toHaveAttribute("aria-invalid", "true");
  const nameDescribedBy = await name.getAttribute("aria-describedby");
  expect(nameDescribedBy, "el input de nombre referencia el mensaje").not.toBeNull();
  await expect(page.locator(`#${nameDescribedBy}`)).toHaveText("Completá el nombre de la tienda.");
  await name.fill(originalName);
  await expect(nameField.getByTestId("ui-field-error")).toHaveCount(0);

  const phone = page.getByLabel("Número internacional");
  const originalPhone = await phone.inputValue();
  const validPhone = originalPhone || "5491123456789";
  await phone.fill("12");
  const phoneField = fieldsetOf(phone);
  await expect(phoneField.getByTestId("ui-field-error")).toContainText("Usá entre 8 y 15 dígitos");
  await expect(phone).toHaveAttribute("aria-invalid", "true");
  await phone.fill(validPhone);
  await expect(phoneField.getByTestId("ui-field-error")).toHaveCount(0);

  const url = page.getByLabel("URL pública");
  const originalUrl = await url.inputValue();
  await url.fill("no-es-una-url");
  const urlField = fieldsetOf(url);
  await expect(urlField.getByTestId("ui-field-error")).toContainText(
    "Ingresá una URL válida con http(s).",
  );
  const urlDescribedBy = (await url.getAttribute("aria-describedby"))?.trim().split(/\s+/) ?? [];
  expect(urlDescribedBy, "la URL conserva ayuda y error en aria-describedby").toHaveLength(2);
  await expect(page.locator(`#${urlDescribedBy[0]}`)).toContainText("canonical y feeds");
  await expect(page.locator(`#${urlDescribedBy[1]}`)).toContainText("http(s)");
  await url.fill(originalUrl);
  await expect(urlField.getByTestId("ui-field-error")).toHaveCount(0);

  const slug = page.getByLabel("Slug interno");
  const originalSlug = await slug.inputValue();
  const slugField = fieldsetOf(slug);
  await slug.fill("slug inválido");
  await expect(slugField.getByTestId("ui-field-error")).toContainText(
    "minúsculas, números y guiones",
  );
  await expect(slug).toHaveAttribute("aria-invalid", "true");
  await slug.fill("tienda-segura");
  await expect(slugField.getByTestId("ui-field-error")).toHaveCount(0);
  await expect(slug).toHaveValue("tienda-segura");
  await slug.fill(originalSlug);
  await expect(slugField.getByTestId("ui-field-error")).toHaveCount(0);
});

test("los destinos de navegación validan el borrador con error inline y no commitean valores inválidos (F3)", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openStudio(page);
  await page.getByRole("tab", { name: "Resumen", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Resumen", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Navegación y textos", exact: true }).click();
  await expect(page.getByRole("region", { name: "Navegación y textos" })).toBeVisible();
  await page.getByRole("button", { name: "Añadir enlace de catálogo", exact: true }).click();

  const fieldsetOf = (input: Locator) =>
    input.locator("xpath=ancestor::fieldset[contains(@class, 'field')]");

  const destination = page.getByLabel("Destino").first();
  const original = await destination.inputValue();
  const destinationField = fieldsetOf(destination);

  // Un destino inválido muestra error inline del borrador y NO llega al schema
  // (sin error global en la barra de guardado).
  await destination.fill("foo");
  await destination.blur();
  await expect(destinationField.getByTestId("ui-field-error")).toContainText(
    "Usá http(s) o una ruta interna",
  );
  await expect(destination).toHaveAttribute("aria-invalid", "true");
  const destinationDescribedBy = await destination.getAttribute("aria-describedby");
  expect(destinationDescribedBy, "el destino referencia el mensaje de error").not.toBeNull();
  await expect(page.locator(`#${destinationDescribedBy}`)).toContainText(
    "Usá http(s) o una ruta interna",
  );
  await expect(page.getByTestId("ui-inline-error")).toHaveCount(0);

  // El borrador inválido sobrevive a editar otro campo (no se revierte ni se pierde).
  const name = page.getByLabel("Nombre de la tienda");
  const originalName = await name.inputValue();
  await name.fill(`${originalName}x`);
  await name.fill(originalName);
  await expect(destination).toHaveValue("foo");
  await expect(destinationField.getByTestId("ui-field-error")).toHaveCount(1);

  // Un destino válido commitea al salir y limpia el error.
  await destination.fill("https://ejemplo.com");
  await destination.blur();
  await expect(destinationField.getByTestId("ui-field-error")).toHaveCount(0);
  await expect(destination).toHaveValue("https://ejemplo.com");

  // Restaurar el enlace original para no alterar la tienda.
  await destination.fill(original);
  await destination.blur();
  await expect(destination).toHaveValue(original);
  await expect(destinationField.getByTestId("ui-field-error")).toHaveCount(0);
});
