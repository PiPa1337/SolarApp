import type { Server } from "node:http";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { openMutableScaleStore } from "./project-helpers";
import { startStudioServer, stopStudioServer } from "./studio-server";

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

async function openDashboard(page: Page): Promise<void> {
  await page.goto(studioUrl);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 20_000,
  });
}

async function openDefaultStore(page: Page): Promise<void> {
  await openDashboard(page);
  const card = page.locator(".dashboard-store-card").filter({
    has: page.getByText("Predeterminado", { exact: true }),
  });
  await expect(card).toBeVisible();
  await card.locator(".dashboard-store-card__button").click();
  await page
    .getByRole("region", { name: /Tienda seleccionada:/ })
    .getByRole("button", { name: "Abrir tienda", exact: true })
    .click();
  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible();
}



test("el skip-link del Studio llega al panel de edición", async ({ page }) => {
  await openDefaultStore(page);
  await page.getByRole("tab", { name: "Resumen", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Resumen" })).toBeVisible();

  const skip = page.getByRole("link", { name: "Saltar al panel de edición" });
  await skip.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-studio-editor-pane]")).toBeFocused();
});

test("los tabs del Studio usan tablist/tab/tabpanel con aria-selected", async ({ page }) => {
  await openDefaultStore(page);

  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible();
  const tablist = page.getByRole("tablist", { name: "Áreas de la tienda" });
  await expect(tablist).toBeVisible();
  await expect(tablist).toHaveAttribute("aria-orientation", "vertical");

  const preparar = page.getByRole("tab", { name: "Preparar", exact: true });
  const resumen = page.getByRole("tab", { name: "Resumen", exact: true });
  await expect(preparar).toHaveAttribute("aria-selected", "true");
  await expect(resumen).toHaveAttribute("aria-selected", "false");

  const panel = page.getByRole("tabpanel");
  await resumen.click();
  await expect(resumen).toHaveAttribute("aria-selected", "true");
  await expect(preparar).toHaveAttribute("aria-selected", "false");
  await expect(page.getByRole("heading", { name: "Resumen" })).toBeVisible();
  await expect(panel).toHaveAttribute("aria-labelledby", (await resumen.getAttribute("id")) ?? "");
  await expect(resumen).toHaveAttribute("aria-controls", (await panel.getAttribute("id")) ?? "");
  await expect(preparar).not.toHaveAttribute("aria-controls");
});

test("el teclado mueve y activa los tabs con flechas y Enter/Espacio", async ({ page }) => {
  await openDefaultStore(page);

  const preparar = page.getByRole("tab", { name: "Preparar", exact: true });
  const resumen = page.getByRole("tab", { name: "Resumen", exact: true });
  const catalogo = page.getByRole("tab", { name: "Catálogo", exact: true });

  await preparar.focus();
  await page.keyboard.press("ArrowDown");
  await expect(resumen).toBeFocused();
  await expect(resumen).toHaveAttribute("aria-selected", "true");
  await expect(preparar).toHaveAttribute("tabindex", "-1");
  await expect(resumen).toHaveAttribute("tabindex", "0");

  await page.keyboard.press("ArrowRight");
  await expect(catalogo).toBeFocused();
  await expect(catalogo).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowUp");
  await expect(resumen).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(preparar).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Preparar tienda" })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(resumen).toBeFocused();
  await page.keyboard.press(" ");
  await expect(page.getByRole("heading", { name: "Resumen" })).toBeVisible();
});





test("cada control visible del dashboard y del Studio tiene nombre accesible", async ({ page }) => {
  await openDashboard(page);
  const unlabeledDashboard = await unlabeledControls(page);
  expect(unlabeledDashboard, "controles del dashboard sin nombre accesible").toEqual([]);

  await openDefaultStore(page);
  const unlabeledStudio = await unlabeledControls(page);
  expect(unlabeledStudio, "controles del Studio sin nombre accesible").toEqual([]);
});

async function unlabeledControls(page: Page): Promise<string[]> {
  return page
    .locator("button, a, input, select, textarea, [role='tab'], [role='tablist']")
    .evaluateAll((elements) =>
      elements
        .filter((element) => {
          const style = getComputedStyle(element);
          return style.display !== "none" && style.visibility !== "hidden";
        })
        .filter((element) => {
          const labelledBy =
            element
              .getAttribute("aria-labelledby")
              ?.split(/\s+/)
              .map((id) => document.getElementById(id)?.textContent?.trim())
              .filter(Boolean)
              .join(" ") || undefined;
          const explicitLabel =
            (element.id
              ? document
                  .querySelector(`label[for="${CSS.escape(element.id)}"]`)
                  ?.textContent?.trim()
              : "") || undefined;
          const label =
            element.getAttribute("aria-label") ??
            labelledBy ??
            explicitLabel ??
            element.getAttribute("title") ??
            element.textContent?.trim() ??
            (element as HTMLInputElement).placeholder ??
            (element as HTMLInputElement).value;
          return !label;
        })
        .map((element) => element.outerHTML.slice(0, 160)),
    );
}


test("el ConfirmDialog de eliminar enlace enfoca, atrapa el foco, cancela con Escape y devuelve el foco (T6.4)", async ({
  page,
}) => {
  await openDashboard(page);
  await openMutableScaleStore(page, "Tienda a11y eliminar enlace");
  await page.getByRole("tab", { name: "Resumen", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Resumen" })).toBeVisible();

  const deleteLink = page.getByRole("button", { name: /^Eliminar enlace / }).first();
  // El primer enlace eliminado puede no ser el primero de la lista; se recuerda
  // su nombre accesible para verificar que ese enlace desapareció.
  const deletedLabel = (await deleteLink.getAttribute("aria-label")) ?? "";
  await deleteLink.click();

  const dialog = page.getByRole("dialog", { name: "Eliminar enlace de navegación" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("data-testid", "ui-confirm-dialog");
  const descriptionId = await dialog.getAttribute("aria-describedby");
  expect(descriptionId).toMatch(/\S+/);
  await expect(dialog.locator(".confirm-dialog__body")).toHaveAttribute("id", descriptionId ?? "");

  const cancel = dialog.getByRole("button", { name: "Cancelar" });
  const confirm = dialog.getByRole("button", { name: "Eliminar enlace" });
  await expect(cancel, "en un diálogo peligroso el foco inicial va a Cancelar").toBeFocused();

  for (let tab = 0; tab < 8; tab += 1) await page.keyboard.press("Tab");
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            document
              .querySelector("[data-testid='ui-confirm-dialog']")
              ?.contains(document.activeElement) ?? false,
        ),
      { message: "el foco no escapa del diálogo de confirmación" },
    )
    .toBe(true);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(deleteLink, "Escape devuelve el foco al botón que abrió el diálogo").toBeFocused();

  await deleteLink.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(
    page.getByTestId("ui-toast").filter({ hasText: "Enlace de navegación eliminado" }),
  ).toBeVisible();
  // La prueba usa una copia mutable: la operación debe sacar el enlace de la
  // navegación y dejar disponible la reversión en la barra del editor.
  const deletedButton = page.getByRole("button", { name: deletedLabel, exact: true });
  await expect(deletedButton).toHaveCount(0);

  const undo = page.getByRole("button", { name: "Deshacer" });
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(page.getByRole("button", { name: deletedLabel })).toBeVisible();
});
