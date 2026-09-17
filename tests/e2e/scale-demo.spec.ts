import { expect, test } from "@playwright/test";
import { startStudioServer, stopStudioServer } from "./studio-server";

test("muestra y abre Predeterminado al iniciar Studio", async ({ page }) => {
  const running = await startStudioServer();
  try {
    await page.goto(running.url);
    await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
    const demo = page.getByRole("button", { name: /Predeterminado/ });
    await expect(demo).toBeVisible();
    await expect(demo).toContainText("33 productos");

    await demo.click();
    await page.getByRole("button", { name: "Abrir tienda", exact: true }).click();
    await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible();
    await page.getByRole("tab", { name: "Catálogo", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Catálogo" })).toBeVisible();
    await expect(page.getByText("33 productos y 41 variantes.")).toBeVisible();
    await expect(page.locator(".category-tree strong")).toHaveText([
      "Hogar",
      "Cocina",
      "Decoración",
      "Textiles",
      "Organización",
      "Limpieza",
    ]);

    await page.goto(running.url);
    await expect(page.getByRole("button", { name: /Predeterminado/ })).toHaveCount(1);
  } finally {
    await stopStudioServer(running.server);
  }
});
