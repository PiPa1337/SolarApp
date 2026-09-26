import type { Server } from "node:http";
import { expect, test } from "@playwright/test";
import { createCleanStore } from "./project-helpers";
import { startStudioServer, stopStudioServer } from "./studio-server";

let server: Server;
let url: string;
test.beforeAll(async () => {
  const started = await startStudioServer();
  server = started.server;
  url = started.url;
});
test.afterAll(async () => stopStudioServer(server));

test("abrir y cerrar cada área restaura el dispositivo anterior al panel principal", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1914, height: 903 });
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({ timeout: 30_000 });
  await createCleanStore(page);
  const close = page.getByRole("button", { name: "Cerrar panel de edición", exact: true });
  await close.click();
  for (const mode of ["Vista de escritorio", "Vista de tablet", "Vista móvil"]) {
    await page.getByRole("button", { name: mode, exact: true }).click();
    for (const area of [
      "Preparar",
      "Resumen",
      "Catálogo",
      "Constructor",
      "Tema de la tienda",
      "Recursos",
      "SEO",
      "Exportar",
    ]) {
      await page.getByRole("tab", { name: area, exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Vista de escritorio", exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "Vista de tablet", exact: true }),
      ).toBeEnabled();
      await expect(page.getByRole("button", { name: "Vista móvil", exact: true })).toBeEnabled();
      await expect(
        page.getByRole("button", { name: "Vista de tablet", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect
        .poll(() =>
          page.evaluate(() => {
            const pane = document.querySelector(".editor-pane")?.getBoundingClientRect();
            const frame = document.querySelector(".preview-stage iframe")?.getBoundingClientRect();
            return (
              pane &&
              frame &&
              pane.width > 768 &&
              Math.abs(frame.left - pane.right - 12) <= 1 &&
              Math.abs(frame.right - (innerWidth - 12)) <= 1
            );
          }),
        )
        .toBe(true);
      if (area === "Preparar")
        await page.screenshot({
          path: `.impeccable/review/editor-workbench/principal-${mode}.png`,
        });
      await close.click();
      await expect(page.getByRole("button", { name: mode, exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(
        page.getByRole("button", { name: "Vista de escritorio", exact: true }),
      ).toBeEnabled();
    }
  }
  await page.keyboard.press("Control+Backslash");
  await expect(page.getByRole("button", { name: "Vista de tablet", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Control+Backslash");
  await expect(page.getByRole("button", { name: "Vista móvil", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("editar un producto reemplaza el catálogo en el mismo panel sin solapar la preview", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1914, height: 903 });
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({ timeout: 30_000 });
  await createCleanStore(page);
  await expect(page.locator(".preview-stage iframe")).toBeVisible();
  const closePanel = page.getByRole("button", { name: "Cerrar panel de edición", exact: true });
  await closePanel.click();
  await page.screenshot({ path: "test-results/editor-workbench/initial.png" });
  for (const mode of ["desktop", "tablet", "mobile"] as const) {
    const label =
      mode === "desktop"
        ? "Vista de escritorio"
        : mode === "tablet"
          ? "Vista de tablet"
          : "Vista móvil";
    await page.getByRole("button", { name: label, exact: true }).click();
    // Measure the settled preset, not a frame of the iframe width transition.
    await expect
      .poll(() =>
        page.locator(".preview-stage").evaluate((stage, preset) => {
          const width = stage.querySelector("iframe")?.getBoundingClientRect().width ?? 0;
          const target = preset === "desktop" ? stage.clientWidth : preset === "tablet" ? 768 : 390;
          return Math.abs(width - target);
        }, mode),
      )
      .toBeLessThan(0.5);
    await page.getByRole("tab", { name: "Catálogo", exact: true }).click();
    const panelWidth = await page
      .locator(".editor-pane")
      .evaluate((pane) => pane.getBoundingClientRect().width);
    await page.getByRole("button", { name: "Agregar producto", exact: true }).click();
    await expect(page.getByRole("button", { name: "Vista de tablet", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator(".editor-pane")).toBeHidden();
    await expect
      .poll(() =>
        page
          .locator(".studio-inspector-dock")
          .evaluate((pane) => pane.getBoundingClientRect().width),
      )
      .toBe(panelWidth);
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const inspector = document
            .querySelector(".studio-inspector-dock")
            ?.getBoundingClientRect();
          const frame = document.querySelector(".preview-stage iframe")?.getBoundingClientRect();
          return Boolean(
            inspector && frame && inspector.right <= frame.left && frame.right <= innerWidth,
          );
        }),
      )
      .toBe(true);
    await page.screenshot({
      path: `.impeccable/review/editor-workbench/inspector-${mode}.png`,
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Cerrar editor", exact: true }).click();
    await expect(page.locator(".editor-pane")).toBeVisible();
    await expect(page.getByRole("button", { name: "Vista de tablet", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await closePanel.click();
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
  await page.getByRole("tab", { name: "Preparar", exact: true }).click();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const pane = document.querySelector(".editor-pane")?.getBoundingClientRect();
        const frame = document.querySelector(".preview-stage iframe")?.getBoundingClientRect();
        const stage = document.querySelector(".preview-stage")?.getBoundingClientRect();
        return Boolean(
          pane &&
            frame &&
            stage &&
            Math.abs(frame.left - pane.right - 12) <= 1 &&
            Math.abs(frame.right - stage.right) <= 1,
        );
      }),
    )
    .toBe(true);
});

test("recorre las ocho áreas y los tamaños del editor", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({ timeout: 30_000 });
  await createCleanStore(page);
  const areas = [
    "Preparar",
    "Resumen",
    "Catálogo",
    "Constructor",
    "Tema de la tienda",
    "Recursos",
    "SEO",
    "Exportar",
  ];
  for (const width of [1914, 1920, 1440, 1280]) {
    await page.setViewportSize({ width, height: width === 1920 ? 912 : 903 });
    for (const [index, name] of areas.entries()) {
      await page.getByRole("tab", { name, exact: true }).click();
      await expect(page.locator(".editor-pane .section-header h2")).toBeVisible();
      await expect(page.locator(".studio-tab-fallback")).toHaveCount(0);
      await expect(page.frameLocator(".preview-stage iframe").locator("h1").first()).toBeVisible();
      await page.screenshot({
        path: `.impeccable/review/editor-workbench/${width}-${index}.png`,
        animations: "disabled",
      });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
        .toBe(true);
    }
  }
});

test("secciones y recursos se editan dentro del panel único y permiten volver a la lista", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1914, height: 903 });
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({ timeout: 30_000 });
  await createCleanStore(page);
  await page.getByRole("button", { name: "Vista móvil", exact: true }).click();
  await page.getByRole("tab", { name: "Constructor", exact: true }).click();
  await page.locator(".section-stack .section-select").first().click();
  await expect(page.getByRole("complementary", { name: "Inspector de sección" })).toBeVisible();
  await expect(page.locator(".editor-pane")).toBeHidden();
  await expect(page.getByRole("button", { name: "Vista móvil", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page
    .getByRole("textbox", { name: "Mensaje", exact: true })
    .fill("Mensaje editado en el panel único");
  await page.screenshot({ path: ".impeccable/review/editor-workbench/inspector-builder.png" });
  await page.getByRole("button", { name: "Volver a Constructor", exact: true }).click();
  await expect(page.locator(".editor-pane")).toBeVisible();
  await page.locator(".section-stack .section-select").first().click();
  await expect(page.getByRole("textbox", { name: "Mensaje", exact: true })).toHaveValue(
    "Mensaje editado en el panel único",
  );
  await page.getByRole("button", { name: "Volver a Constructor", exact: true }).click();
  await expect(page.getByRole("button", { name: "Vista móvil", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("tab", { name: "Recursos", exact: true }).click();
  await page.getByTestId("ui-asset-detail-open").first().click();
  await expect(page.getByTestId("ui-asset-detail")).toBeVisible();
  await expect(page.locator(".editor-pane")).toBeHidden();
  await page.screenshot({ path: ".impeccable/review/editor-workbench/inspector-asset.png" });
  await page.getByRole("button", { name: "Volver a Recursos", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("ui-asset-detail")).toBeHidden();
  await expect(page.locator(".editor-pane")).toBeVisible();
  await expect(page.getByRole("button", { name: "Vista móvil", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Vista de tablet", exact: true }).click();
  await page.getByRole("tab", { name: "Constructor", exact: true }).click();
  await page.locator(".section-stack .section-select").first().click();
  await page.screenshot({
    path: ".impeccable/review/editor-workbench/single-constructor-tablet.png",
  });
  await page.getByRole("button", { name: "Volver a Constructor", exact: true }).click();
});
