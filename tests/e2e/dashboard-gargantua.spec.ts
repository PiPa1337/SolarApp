import type { Server } from "node:http";
import { expect, type Page, test } from "@playwright/test";
import { catalogModernCleanStore } from "@solara/project-schema/catalog-modern-template";
import { cloneProjectFromTemplate } from "@solara/project-schema/project-policy";
import {
  DEFAULT_GRAVITY_SETTINGS,
  GRAVITY_PREFERENCES_STORAGE_KEY,
} from "../../apps/studio/src/features/dashboard/gravitySettings";
import { openStudioDashboard } from "./studio-helpers";
import { startStudioServer, stopStudioServer } from "./studio-server";

let server: Server;
let url: string;

async function reduceGravityLoad(page: Page) {
  await page.addInitScript(
    ({ storageKey, activeSettings }) => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ customPresets: [], activeSettings, activeCustomPreset: null }),
      );
    },
    {
      storageKey: GRAVITY_PREFERENCES_STORAGE_KEY,
      activeSettings: {
        ...DEFAULT_GRAVITY_SETTINGS,
        renderScaleMultiplier: 0.25,
        maxFps: 30,
      },
    },
  );
}
test.beforeAll(async () => {
  const running = await startStudioServer();
  server = running.server;
  url = running.url;
});
test.afterAll(async () => stopStudioServer(server));

test.beforeEach(async ({ page }) => {
  await reduceGravityLoad(page);
});

async function seedLibrary(page: Page, count = 5) {
  const names = [
    "Blanquería y Marroquinería",
    "Luna Norte",
    "Stylo Lashes",
    "RM Descartables",
    "Casa Oliva",
    "Atelier Sur",
    "Nómada",
    "Bruma",
    "Flora Estudio",
    "Café del Mar",
    "Ámbar Objetos",
    "Origen Natural",
    "Marea Textil",
  ];
  const records = Array.from({ length: count }, (_, index) => {
    const project = cloneProjectFromTemplate(catalogModernCleanStore, {
      id: `store-gargantua-${String(index).padStart(3, "0")}`,
      name: names[index] ?? `Tienda ${String(index + 1).padStart(3, "0")}`,
      slug: `gargantua-${index}`,
      now: "2026-09-07T12:00:00.000Z",
    });
    return {
      id: project.id,
      name: project.name,
      status: project.status,
      updatedAt: project.updatedAt,
      project,
    };
  });
  // Sólo IndexedDB del contexto aislado de Playwright. Nunca toca proyectos/.
  await page.evaluate(
    (items) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("solara-commerce-studio");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction("projects", "readwrite");
          const store = tx.objectStore("projects");
          store.clear();
          for (const item of items) store.put(item);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
    records,
  );
  await page.reload();
  const expectedVisible = count + 1;
  await expect(page.locator(".dashboard-cosmic-count")).toHaveText(`${expectedVisible} visibles`);
  const notice = page.getByRole("button", { name: "Cerrar aviso" });
  if (await notice.isVisible()) await notice.click();
  await page.getByRole("heading", { name: "Tus tiendas", exact: true }).click();
}


for (const [width, height] of [
  [1920, 912],
]) {
  test(`biblioteca sin scroll a ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openStudioDashboard(page, url);
    await seedLibrary(page);
    await expect(page.locator(".dashboard-gargantua > .dashboard-gravity-field")).toHaveAttribute(
      "data-renderer",
      "webgl2",
    );
    await expect(page.locator(".dashboard-gargantua > .dashboard-gravity-field")).toHaveCount(1);
    await expect(page.locator(".dashboard-cosmic-library > .dashboard-gravity-field")).toHaveCount(
      0,
    );
    await expect(page.locator(".dashboard-cosmic-store-groups .dashboard-store-card")).toHaveCount(
      6,
    );
    const longCardTitle = page
      .locator(".dashboard-cosmic-store-groups .dashboard-store-card strong")
      .filter({ hasText: "Blanquería y Marroquinería" });
    await expect(longCardTitle).toHaveText("Blanquería y Marroquinería");
    if (width <= 390) {
      const titleHeight = await longCardTitle.evaluate((element) => {
        const styles = getComputedStyle(element);
        return {
          height: element.getBoundingClientRect().height,
          lineHeight: Number.parseFloat(styles.lineHeight),
        };
      });
      expect(titleHeight.height).toBeGreaterThan(titleHeight.lineHeight + 1);
    }
    const gridColumns = await page
      .locator(".dashboard-cosmic-store-groups .dashboard-cosmic-store-grid")
      .evaluateAll((grids) =>
        grids.map(
          (grid) =>
            getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length,
        ),
      );
    expect(gridColumns.every((columns) => columns <= 3)).toBe(true);
    await expect(page.locator(".dashboard-cosmic-side > .dashboard-store-card")).toHaveCount(0);
    const cardHeroes = page.locator(".dashboard-cosmic-store-groups .dashboard-store-card__hero");
    await expect(cardHeroes).toHaveCount(6);
    await expect(page.getByRole("navigation", { name: "Páginas de tiendas" })).toBeVisible();
    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      const violations =
        root.scrollHeight > root.clientHeight + 1 || root.scrollWidth > root.clientWidth + 1;
      const panels = [
        ...document.querySelectorAll<HTMLElement>(
          ".dashboard-cosmic-command-bar, .dashboard-cosmic-results, .dashboard-cosmic-store-groups, .dashboard-store-detail.is-open",
        ),
      ];
      return {
        hasOverflow:
          violations ||
          panels.some(
            (el) =>
              el.getBoundingClientRect().width > 0 &&
              (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1),
          ),
      };
    });
    expect(overflow.hasOverflow, JSON.stringify(overflow)).toBe(false);
  });
}




test("desktop ajusta la grilla a la cantidad real de tiendas", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openStudioDashboard(page, url);
  await seedLibrary(page, 1);
  await page.getByRole("button", { name: "Vista en grilla", exact: true }).click();

  const grid = page.locator(".dashboard-cosmic-store-groups .dashboard-cosmic-store-grid");
  await expect
    .poll(() =>
      grid.evaluate(
        (element) => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length,
      ),
    )
    .toBe(2);

  const cards = await grid
    .locator(".dashboard-store-card")
    .evaluateAll((elements) =>
      elements.map((element) => Math.round(element.getBoundingClientRect().width)),
    );
  expect(cards).toHaveLength(2);
  expect(cards[0]).toBeGreaterThan(350);
  expect(cards[0]).toBe(cards[1]);
});


test("el teclado separa revisar estado de abrir la tienda", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openStudioDashboard(page, url);
  await seedLibrary(page);
  await expect(page.locator(".dashboard-cosmic-shortcuts")).toBeVisible();
  await expect(page.locator(".dashboard-cosmic-actions__legend")).toContainText("Seleccionar");
  await expect(page.locator(".dashboard-cosmic-actions__legend")).toContainText("Abrir");

  const detail = page.getByRole("region", { name: /Tienda seleccionada:/ });
  if (await detail.isVisible())
    await detail.getByRole("button", { name: "Cerrar detalle" }).click();
  const card = page.locator("[data-store-card-id]").first();
  await card.focus();
  await page.keyboard.press("Enter");
  await expect(detail).toBeVisible();
  await detail.getByRole("button", { name: "Abrir tienda", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Preparar", exact: true })).toBeVisible();
});

test("abrir una tienda atraviesa Gargantua antes de montar Studio", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openStudioDashboard(page, url);
  await seedLibrary(page);

  await page.locator(".dashboard-store-card__button").first().click();
  await page
    .getByRole("region", { name: /Tienda seleccionada:/ })
    .getByRole("button", { name: "Abrir tienda", exact: true })
    .click();
  const launch = page.getByTestId("gargantua-launch");
  await expect(launch).toBeVisible({ timeout: 2_000 });
  const launchBeforeContent = await launch.evaluate(
    (element) => getComputedStyle(element, "::before").content,
  );
  expect(["", "none"]).toContain(launchBeforeContent);
  await expect(page.locator(".dashboard-gargantua-transition__readout")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Preparar", exact: true })).toBeVisible({
    timeout: 10000,
  });
  await expect(page.getByTestId("gargantua-launch")).toHaveCount(0);
  await expect(page.getByTestId("store-route-curtain")).toHaveCount(0, { timeout: 2_000 });
});
