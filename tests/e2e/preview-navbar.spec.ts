/**
 * Regresión SF navbar: el mega-menú de categorías era invisible en el preview
 * del editor porque el estilo de rendimiento del preview aplicaba
 * `contain: layout paint` al módulo del header y recortaba el overlay del
 * mega-menú (y atrapaba el menú móvil fixed). El sitio exportado nunca recibe
 * ese estilo, por eso sólo fallaba dentro del editor.
 */
import { expect, test } from "@playwright/test";
import { startStudioServer, stopStudioServer } from "./studio-server";

test.setTimeout(120_000);

test("el mega-menú de la navbar es visible y alcanzable en el preview", async ({ page }) => {
  const running = await startStudioServer();
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(running.url);
    await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
      timeout: 30_000,
    });
    const card = page.locator(".dashboard-store-card").filter({
      has: page.getByText("Predeterminado", { exact: true }),
    });
    await card.locator(".dashboard-store-card__button").click();
    await page
      .getByRole("region", { name: /Tienda seleccionada:/ })
      .getByRole("button", { name: "Abrir tienda", exact: true })
      .click();
    await page.getByRole("button", { name: "Cerrar panel de edición" }).click();
    const desktop = page.getByRole("button", { name: "Vista de escritorio" });
    await expect(desktop).toBeEnabled();
    await desktop.click();
    await expect(desktop).toHaveAttribute("aria-pressed", "true");

    const preview = page.frameLocator('iframe[title="Vista previa desktop"]');
    const header = preview.locator('[data-solara-module="catalog-header"]');
    await expect(header).toBeVisible({ timeout: 30_000 });

    const trigger = header.locator(".catalog-desktop-nav .catalog-nav-trigger");
    await expect(trigger).toBeVisible();
    await trigger.click();

    const menu = header.locator(".catalog-nav-menu .catalog-mega-menu");
    await expect(menu).toBeVisible();

    // contain: paint recorta el dibujo y el hit-testing del overlay por fuera de
    // la caja del header: un punto dentro del menú debe resolver contenido del
    // propio menú, no del hero que queda debajo.
    const hit = await menu.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + Math.min(rect.height / 2, 48);
      const target = document.elementFromPoint(x, y);
      return target instanceof Element && element.contains(target);
    });
    expect(hit).toBe(true);
  } finally {
    await stopStudioServer(running.server);
  }
});
