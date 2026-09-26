/**
 * T5.1-T5.4 — Micro-interacciones del editor: hover de filas/cards, indicador
 * de guardado animado, reduced-motion global y presupuesto de render del
 * catálogo con la tienda demo (50 productos).
 * T1 — fill-mode de los presets de entrada del storefront: el hover de una
 * card del preview sigue vivo después del reveal de la animación.
 */
import type { Server } from "node:http";
import { expect, type Page, test } from "@playwright/test";
import { openMutableScaleStore } from "./project-helpers";
import { startStudioServer, stopStudioServer } from "./studio-server";

test.setTimeout(process.env.CI ? 120_000 : 60_000);

/**
 * Presupuesto de render de la tabla del catálogo con 50 productos, en
 * milisegundos. Metodología: medición con performance.now() sobre la tabla
 * completa en una ejecución de referencia local (Chromium, misma máquina del
 * plan), peor muestra ~1000 ms; budget = peor muestra × 1.5 = 1500 ms con
 * margen de estabilidad para suites completas.
 */
const CATALOG_TABLE_BUDGET_MS = 1500;

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

async function openStore(page: Page, tab: string, mutable = false) {
  await page.goto(studioUrl);
  await page.evaluate(
    () =>
      new Promise<void>((resolveDelete, reject) => {
        const request = indexedDB.deleteDatabase("solara-commerce-studio");
        request.addEventListener("success", () => resolveDelete());
        request.addEventListener("error", () => reject(request.error));
      }),
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
  if (mutable) {
    await openMutableScaleStore(page, "T5 motion mutable");
  } else {
    await page.locator('[data-store-card-id="store-modo-sur-demo"]').click();
    await page.getByRole("button", { name: "Abrir tienda", exact: true }).click();
  }
  await page.getByRole("tab", { name: tab, exact: true }).click();
  await expect(page.getByRole("heading", { name: tab })).toBeVisible();
}

test("las filas del catálogo y las cards del dashboard responden al hover (T5.1)", async ({
  page,
}) => {
  await openStore(page, "Catálogo", true);
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(50);

  // La primera fila puede quedar bajo el encabezado sticky de la tabla;
  // se usa una fila más abajo y se la fuerza a viewport (el scroll del
  // catálogo es un contenedor interno, no la ventana).
  const rowBackground = await rows
    .nth(5)
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  await rows.nth(5).scrollIntoViewIfNeeded();
  await rows.nth(5).hover();
  // El hover de fila usa una transición CSS de 160 ms (background); leer el
  // estilo justo después del hover devuelve el valor interpolado inicial y la
  // comparación falla. Se espera a que la transición se asiente.
  await expect
    .poll(() => rows.nth(5).evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe(rowBackground);

  await page.getByRole("button", { name: "Volver a tiendas", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
  const card = page.locator(".dashboard-store-card").first();
  await expect(card).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  const cardTransform = await card.evaluate((element) => getComputedStyle(element).transform);
  await card.hover();
  // Igual que la fila: la elevación usa una transición de 160 ms y leer el
  // transform inmediatamente devuelve el valor inicial ("none").
  await expect
    .poll(() => card.evaluate((element) => getComputedStyle(element).transform))
    .not.toBe(cardTransform);
});

test("con reduced-motion las transiciones y animaciones del editor quedan anuladas (T5.3)", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(studioUrl);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();

  const card = page.locator(".dashboard-store-card").first();
  await expect(card).toBeVisible();
  // La card usa estilos inline de motion; bajo reduced-motion el transform de
  // hover queda anulado por el bloque CSS global (T5.3).
  await card.hover();
  expect(await card.evaluate((element) => getComputedStyle(element).transform)).toBe("none");

  const spinnerAnimation = await page.evaluate(() => {
    const spinner = document.createElement("span");
    spinner.className = "save-spinner";
    document.body.append(spinner);
    const name = getComputedStyle(spinner).animationName;
    spinner.remove();
    return name;
  });
  expect(spinnerAnimation).toBe("none");

  await page.locator('[data-store-card-id="store-modo-sur-demo"]').click();
  await page.getByRole("button", { name: "Abrir tienda", exact: true }).click();
  await page.getByRole("tab", { name: "Catálogo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Catálogo" })).toBeVisible();

  expect(
    await page
      .locator("tbody tr")
      .first()
      .evaluate((element) => getComputedStyle(element).transitionDuration),
  ).toBe("0s");
  // El editor-pane usa estilos inline de motion; los elementos CSS-driven
  // (botones, filas, cards) son los que el bloque reduced-motion anula.
  expect(
    await page
      .getByRole("button", { name: "Agregar producto" })
      .evaluate((element) => getComputedStyle(element).transitionDuration),
  ).toBe("0s");

  await page.getByRole("button", { name: "Tarjetas", exact: true }).click();
  expect(
    await page
      .locator(".catalog-card")
      .first()
      .evaluate((element) => getComputedStyle(element).transitionDuration),
  ).toBe("0s");
});

test("el indicador de guardado pulsa mientras guarda y anima el check al confirmar (T5.2)", async ({
  page,
}) => {
  await openStore(page, "Constructor", true);
  await page.getByRole("button", { name: "Portada Hero audiovisual", exact: true }).click();

  await page.evaluate(() => {
    const probe = window as Window & { __solaraSawSaving?: boolean };
    probe.__solaraSawSaving = false;
    const indicator = document.querySelector(".save-indicator");
    if (!(indicator instanceof Element)) return;
    const observer = new MutationObserver(() => {
      if (indicator.classList.contains("save-indicator--saving")) {
        probe.__solaraSawSaving = true;
      }
    });
    observer.observe(indicator, { attributes: true, attributeFilter: ["class"] });
  });

  await page
    .getByRole("textbox", { name: "Título", exact: true })
    .fill("Título con microinteracciones");
  await expect(page.getByText("Cambios pendientes", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Guardado/)).toBeVisible();

  const sawSaving = await page.evaluate(
    () => (window as { __solaraSawSaving?: boolean }).__solaraSawSaving === true,
  );
  expect(sawSaving).toBe(true);

  const checkAnimation = await page.evaluate(() => {
    const check = document.querySelector(".save-indicator--saved .save-check");
    return check instanceof Element ? getComputedStyle(check).animationName : "";
  });
  expect(checkAnimation).toBe("save-check-in");
});

test("el catálogo con 50 productos renderiza la tabla dentro del presupuesto (T5.4)", async ({
  page,
}) => {
  await openStore(page, "Resumen", true);
  const elapsed = await page.evaluate(async () => {
    const waitFor = async (predicate: () => boolean, timeoutMs = 30_000): Promise<boolean> => {
      const deadline = performance.now() + timeoutMs;
      while (!predicate()) {
        if (performance.now() > deadline) return false;
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      return true;
    };
    const tab = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (element) => element.textContent?.trim() === "Catálogo",
    );
    const start = performance.now();
    tab?.click();
    const ready = await waitFor(() => [...document.querySelectorAll("tbody tr")].length === 50);
    return ready ? performance.now() - start : Number.POSITIVE_INFINITY;
  });
  console.log(
    `perf: catálogo 50 filas ${elapsed.toFixed(0)} ms (budget ${CATALOG_TABLE_BUDGET_MS} ms)`,
  );
  expect(elapsed).toBeLessThanOrEqual(CATALOG_TABLE_BUDGET_MS);
});

test("el hover de una card sobrevive al reveal del preset de entrada (T1)", async ({ page }) => {
  await openStore(page, "Constructor");
  // El panel de edición queda abierto sobre el preview y taparía el puntero;
  // se cierra para que el iframe reciba el hover real.
  await page.getByRole("button", { name: "Cerrar panel de edición", exact: true }).click();
  const preview = page.frameLocator('iframe[title="Vista previa desktop"]');

  // El home de la tienda demo (Catalog Modern) usa el preset "stagger" en los
  // grids de productos; se espera el reveal antes de probar el hover.
  const grid = preview
    .locator('[data-motion-root][data-motion-preset="stagger"] .catalog-product-grid')
    .first();
  await grid.scrollIntoViewIfNeeded();
  const root = grid.locator("xpath=ancestor::*[@data-motion-root]").first();
  await expect(root).toHaveAttribute("data-motion-visible", "true", { timeout: 15_000 });

  const card = grid.locator(".catalog-product-card").first();
  await card.evaluate(async (element) => {
    const animations = element.getAnimations();
    if (animations.length > 0) {
      await Promise.race([
        Promise.all(animations.map((animation) => animation.finished)),
        new Promise((resolve) => setTimeout(resolve, 5_000)),
      ]);
    }
  });

  // El hover del módulo escala la imagen (transition de transform); con
  // fill-mode "both" el keyframe final congelado no lo impide en este árbol,
  // pero la animación queda aplicada para siempre sobre la card: se aserta
  // además que no quede ninguna animación congelada tras el reveal.
  const image = card.locator(".catalog-product-card-image");
  const transformBefore = await image.evaluate((element) => getComputedStyle(element).transform);
  await card.hover();
  await expect
    .poll(() => image.evaluate((element) => getComputedStyle(element).transform))
    .not.toBe(transformBefore);

  await expect.poll(() => card.evaluate((element) => element.getAnimations().length)).toBe(0);
});
