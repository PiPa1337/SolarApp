/** T5.3 — reduced-motion desactiva las transiciones y animaciones del editor. */
import type { Server } from "node:http";
import { expect, test } from "@playwright/test";
import { startStudioServer, stopStudioServer } from "./studio-server";

test.setTimeout(process.env.CI ? 120_000 : 60_000);

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
