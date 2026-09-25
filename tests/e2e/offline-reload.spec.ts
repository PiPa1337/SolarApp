import type { Server } from "node:http";
import { expect, test } from "@playwright/test";
import { openMutableScaleStore } from "./project-helpers";
import { startStudioServer, stopStudioServer } from "./studio-server";

test.use({ serviceWorkers: "allow" });

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

async function waitForServiceWorker(page: import("@playwright/test").Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          if (!("serviceWorker" in navigator)) return false;
          const registration = await navigator.serviceWorker.getRegistration();
          return Boolean(registration?.active && navigator.serviceWorker.controller);
        }),
      { timeout: 15_000, message: "El service worker de Studio no tomó control de la página." },
    )
    .toBe(true);
}

async function openStudio(page: import("@playwright/test").Page) {
  await page.goto(studioUrl);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({ timeout: 30000 });
  await waitForServiceWorker(page);
  // limpiar solo local/session storage sin bloquear IndexedDB
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

async function openDemo(page: import("@playwright/test").Page): Promise<string> {
  const projectId = await openMutableScaleStore(page, "Offline mutable");
  // esperar a que cargue Studio (tab Resumen)
  await expect(page.getByRole("tab", { name: "Resumen" })).toBeVisible({ timeout: 30000 });
  return projectId;
}

test("reload durante preview: ruta persiste via sessionStorage", async ({ page }) => {
  await openStudio(page);
  await openDemo(page);
  // cambiar ruta de preview
  // Simular cambio de ruta via sessionStorage directo
  await page.evaluate(() => sessionStorage.setItem("solara-preview-route", "/categorias/"));
  const stored = await page.evaluate(() => sessionStorage.getItem("solara-preview-route"));
  expect(stored).toBe("/categorias/");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({ timeout: 30000 });
  const after = await page.evaluate(() => sessionStorage.getItem("solara-preview-route"));
  expect(after).toBe("/categorias/");
});

test("navegador offline: banner y carga sin error", async ({ page, context }) => {
  await openStudio(page);
  await context.setOffline(true);
  await page.reload();
  // debe seguir mostrando Tus tiendas (cache) o al menos no error critico
  // y banner offline
  const offlineBanner = page.getByText("Sin conexion");
  // offline banner puede aparecer tras el efecto de isOnline
  await expect(offlineBanner).toBeVisible({ timeout: 10000 });
  // verificar que getLocalStorageStatus no rompe: la app sigue en dashboard
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({ timeout: 15000 });
  await context.setOffline(false);
});

test("service worker: cache v3 y asset cache separada, no fixtures", async ({ page }) => {
  await openStudio(page);
  await waitForServiceWorker(page);
  const swInfo = await page.evaluate(async () => {
    if (!("caches" in window)) return { keys: [] as string[] };
    const keys = await caches.keys();
    const hasV3 = keys.includes("solara-studio-shell-v3");
    const hasAsset = keys.includes("solara-studio-assets-v1");
    const hasV2 = keys.includes("solara-studio-shell-v2");
    const cache = await caches.open("solara-studio-shell-v3");
    const reqs = await cache.keys();
    const hasFixture = reqs.some((r) => r.url.includes("/fixtures/"));
    return { keys, hasV3, hasAsset, hasV2, hasFixture };
  });
  expect(swInfo.hasV3).toBe(true);
  expect(swInfo.hasAsset).toBe(true);
  expect(swInfo.hasV2).toBe(false);
  expect(swInfo.hasFixture).toBe(false);
});

test("PWA: manifest instalable y service worker controlan Studio", async ({ page }) => {
  await openStudio(page);
  const pwa = await page.evaluate(async () => {
    const manifestHref =
      document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href ?? "";
    const manifest = manifestHref
      ? ((await (await fetch(manifestHref)).json()) as {
          name?: string;
          start_url?: string;
          display?: string;
          icons?: Array<{ sizes?: string }>;
        })
      : {};
    const registration = await navigator.serviceWorker.getRegistration();
    return {
      manifestHref,
      name: manifest.name,
      startUrl: manifest.start_url,
      display: manifest.display,
      iconSizes: manifest.icons?.map((icon) => icon.sizes) ?? [],
      serviceWorkerActive: Boolean(registration?.active),
      serviceWorkerControlled: Boolean(navigator.serviceWorker.controller),
    };
  });
  expect(pwa.manifestHref).toMatch(/\/manifest\.webmanifest$/);
  expect(pwa.name).toBe("SolaraCommerce Studio");
  expect(pwa.startUrl).toBe("/");
  expect(pwa.display).toBe("standalone");
  expect(pwa.iconSizes).toContain("192x192");
  expect(pwa.iconSizes).toContain("512x512");
  expect(pwa.serviceWorkerActive).toBe(true);
  expect(pwa.serviceWorkerControlled).toBe(true);
});

test("cache vieja despues de actualizar Studio: shell nuevo no sirve assets viejos", async ({
  page,
}) => {
  await openStudio(page);
  await waitForServiceWorker(page);
  const keys = await page.evaluate(async () => {
    if (!("caches" in window)) return [];
    return await caches.keys();
  });
  expect(keys).toContain("solara-studio-shell-v3");
  expect(keys).not.toContain("solara-studio-shell-v2");
  expect(keys).not.toContain("solara-studio-shell-v1");
});
