import type { Server } from "node:http";
import { expect, test } from "@playwright/test";
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
