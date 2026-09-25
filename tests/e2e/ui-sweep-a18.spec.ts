import type { Server } from "node:http";
import { expect, type Page, test } from "@playwright/test";
import { openMutableScaleStore } from "./project-helpers";
import { startStudioServer, stopStudioServer } from "./studio-server";

/**
 * Barrido A18 — HeroSlidesEditor + ConfirmDialog.
 * Contrato de 3 capas: (1) click → efecto real en estado/datos/preview,
 * (2) auto-feedback (disabled en límites, aria-selected del slide activo,
 * diálogo que cierra y devuelve el foco), (3) datos: el payload del editor
 * llega al proyecto (IndexedDB vía autosave) y al preview.
 */

test.setTimeout(process.env.CI ? 60_000 : 45_000);

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

async function resetStudio(page: Page): Promise<void> {
  await page.goto(studioUrl);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase("solara-commerce-studio");
        request.addEventListener("success", () => resolve());
        request.addEventListener("error", () => reject(request.error));
      }),
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({ timeout: 20_000 });
}

/**
 * Convierte el hero del demo (catalog-hero) en un hero-media legacy con
 * slides SIN id (respaldo envejecido) para ejercitar el editor de slides.
 */
async function seedLegacyHero(page: Page, projectId: string): Promise<void> {
  await page.evaluate(
    (projectId) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("solara-commerce-studio");
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction("projects", "readwrite");
          const store = tx.objectStore("projects");
          const get = store.get(projectId);
          get.onsuccess = () => {
            const record = get.result;
            if (!record) {
              reject(new Error("No existe la tienda Predeterminado"));
              return;
            }
            const hero = record.project.sections.find(
              (s: { moduleId: string }) => s.moduleId === "catalog-hero",
            );
            if (!hero) {
              reject(new Error("No existe la sección catalog-hero"));
              return;
            }
            hero.moduleId = "hero-media";
            hero.settings = {
              mode: "carousel",
              eyebrow: "Ante carrusel",
              title: "Carrusel heredado",
              body: "Cuerpo del carrusel",
              actionLabel: "Ver colección",
              actionHref: "/categorias/textiles/",
              posterAssetId: hero.settings.posterAssetId ?? "",
              videoAssetId: "",
              slides: [
                {
                  eyebrow: "Eyebrow A",
                  title: "Diapo base",
                  body: "Primera diapo",
                  actionLabel: "Ver colección",
                  actionHref: "/categorias/mesa/",
                  imageId: "",
                },
                {
                  eyebrow: "Eyebrow B",
                  title: "Segunda diapo",
                  body: "Segunda diapo",
                  actionLabel: "Ver colección",
                  actionHref: "/categorias/textiles/",
                  imageId: "",
                },
              ],
              autoplay: false,
              intervalMs: 6000,
              overlay: "dark",
              alignment: "left",
            };
            store.put(record);
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
          get.onerror = () => reject(get.error);
        };
        open.onerror = () => reject(open.error);
      }),
    projectId,
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({ timeout: 20_000 });
}

async function openHeroInspector(page: Page, projectId: string): Promise<void> {
  await page.locator(`[data-store-card-id="${projectId}"]`).click();
  await page.getByRole("button", { name: "Abrir tienda", exact: true }).click();
  await page.getByRole("tab", { name: "Constructor" }).click();
  await expect(page.getByRole("heading", { name: "Constructor" })).toBeVisible();

  const heroRow = page.getByRole("listitem").filter({ hasText: "Hero audiovisual" });
  await heroRow.getByRole("button").first().click();
  await expect(page.getByText("Slides del carrusel", { exact: true })).toBeVisible();
}

/** Lee las slides del hero desde IndexedDB (persistencia del autosave). */
async function readHeroSlides(page: Page, projectId: string): Promise<unknown[] | null> {
  return page.evaluate(
    (projectId) =>
      new Promise<unknown[] | null>((resolve, reject) => {
        const open = indexedDB.open("solara-commerce-studio");
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction("projects", "readonly");
          const store = tx.objectStore("projects");
          const get = store.get(projectId);
          get.onsuccess = () => {
            const record = get.result;
            db.close();
            if (!record) {
              resolve(null);
              return;
            }
            const hero = record.project.sections.find(
              (s: { moduleId: string }) => s.moduleId === "hero-media",
            );
            resolve(hero?.settings?.slides ?? null);
          };
          get.onerror = () => reject(get.error);
        };
        open.onerror = () => reject(open.error);
      }),
    projectId,
  );
}

async function prepareLegacyHero(page: Page, name: string): Promise<string> {
  const projectId = await openMutableScaleStore(page, name);
  await page.getByRole("button", { name: "Volver a tiendas" }).click();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
  await seedLegacyHero(page, projectId);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({ timeout: 20_000 });
  await openHeroInspector(page, projectId);
  return projectId;
}

const preview = (page: Page) => page.frameLocator("iframe");

test("A18 T1: agregar slide crea una diapositiva con id válido y el preview la muestra", async ({
  page,
}) => {
  const projectId = await resetStudio(page).then(() => prepareLegacyHero(page, "Tienda A18 hero"));

  await expect(page.getByText("2 configurados", { exact: true })).toBeVisible();
  await expect(preview(page).locator('.solara-hero-indicators [role="tab"]')).toHaveCount(2, {
    timeout: 15_000,
  });

  await page.getByRole("button", { name: "Agregar slide" }).click();
  await expect(page.locator(".slide-card")).toHaveCount(3);
  await expect(page.getByText("3 configurados", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Título del slide 3", { exact: true })).toHaveValue(
    "Nueva diapositiva",
  );

  await expect
    .poll(async () => {
      const slides = (await readHeroSlides(page, projectId)) as Array<{
        id: string;
        title: string;
      }>;
      return slides?.length;
    })
    .toBe(3);
  const slides = (await readHeroSlides(page, projectId)) as Array<{ id: string; title: string }>;
  const ids = slides.map((slide) => slide.id);
  expect(
    ids.every((id) => typeof id === "string" && id.length > 0),
    "todas las slides tienen id",
  ).toBe(true);
  expect(new Set(ids).size, "los ids son únicos").toBe(3);
  expect(slides[2].title).toBe("Nueva diapositiva");

  const tabs = preview(page).locator('.solara-hero-indicators [role="tab"]');
  await expect(tabs).toHaveCount(3);
  await expect(preview(page).locator('[data-hero-slide-panel="2"]')).toHaveAttribute(
    "data-hero-title",
    "Nueva diapositiva",
  );
});

test("A18 T2: los campos de slide persisten y llegan al proyecto y al preview", async ({
  page,
}) => {
  const projectId = await resetStudio(page).then(() => prepareLegacyHero(page, "Tienda A18 hero"));

  await page.getByLabel("Antetítulo del slide 1").fill("Eyebrow editado");
  await page.getByLabel("Título del slide 1", { exact: true }).fill("Diapo editada");
  await page.getByLabel("Texto del CTA del slide 1").fill("Comprar ya");
  await page.getByLabel("Destino del CTA del slide 1").fill("/categorias/remeras/");

  const imageSelect = page.getByLabel("Imagen del slide 1");
  await expect(imageSelect.locator("option").count()).resolves.toBeGreaterThanOrEqual(2);
  const assetId = await imageSelect
    .locator("option[value]:not([value=''])")
    .first()
    .getAttribute("value");
  if (assetId) await imageSelect.selectOption(assetId);

  await expect(page.getByLabel("Antetítulo del slide 1")).toHaveValue("Eyebrow editado");
  await expect(page.getByLabel("Título del slide 1", { exact: true })).toHaveValue("Diapo editada");
  await expect(page.getByLabel("Texto del CTA del slide 1")).toHaveValue("Comprar ya");
  await expect(page.getByLabel("Destino del CTA del slide 1")).toHaveValue("/categorias/remeras/");

  await expect
    .poll(async () => {
      const slides = (await readHeroSlides(page, projectId)) as Array<Record<string, string>>;
      return slides?.[0]?.title;
    })
    .toBe("Diapo editada");
  const slides = (await readHeroSlides(page, projectId)) as Array<Record<string, string>>;
  expect(slides[0].eyebrow).toBe("Eyebrow editado");
  expect(slides[0].actionLabel).toBe("Comprar ya");
  expect(slides[0].actionHref).toBe("/categorias/remeras/");
  if (assetId) expect(slides[0].imageId).toBe(assetId);
  expect(slides[0].id, "la slide legacy recibe un id válido al abrir el editor").toMatch(/^slide-/);
  expect(new Set(slides.map((slide) => slide.id)).size).toBe(2);

  const frame = preview(page);
  await expect(frame.locator('[data-hero-slide-panel="0"]')).toHaveAttribute(
    "data-hero-title",
    "Diapo editada",
    { timeout: 10_000 },
  );
  await expect(frame.locator('[data-hero-slide-panel="0"]')).toHaveAttribute(
    "data-hero-action-label",
    "Comprar ya",
  );
  await expect(frame.locator('[data-hero-slide-panel="0"]')).toHaveAttribute(
    "data-hero-action-href",
    "/categorias/remeras/",
  );
});

test("A18 T3: duplicar inserta una copia con el mismo contenido y un id nuevo", async ({
  page,
}) => {
  const projectId = await resetStudio(page).then(() => prepareLegacyHero(page, "Tienda A18 hero"));

  await page.getByRole("button", { name: "Duplicar slide" }).first().click();
  await expect(page.locator(".slide-card")).toHaveCount(3);
  await expect(page.getByLabel("Título del slide 1", { exact: true })).toHaveValue("Diapo base");
  await expect(page.getByLabel("Título del slide 2", { exact: true })).toHaveValue("Diapo base");
  await expect(page.getByLabel("Título del slide 3", { exact: true })).toHaveValue("Segunda diapo");

  await expect
    .poll(async () => {
      const current = (await readHeroSlides(page, projectId)) as Array<{
        id: string;
        title: string;
      }>;
      return current?.length;
    })
    .toBe(3);
  const slides = (await readHeroSlides(page, projectId)) as Array<{ id: string; title: string }>;
  const ids = slides.map((slide) => slide.id);
  expect(new Set(ids).size, "los ids siguen siendo únicos tras duplicar").toBe(3);
  expect(slides[1].title).toBe("Diapo base");

  await expect(preview(page).locator('.solara-hero-indicators [role="tab"]')).toHaveCount(3);
});

test("A18 T4: quitar elimina la slide y el preview se actualiza", async ({ page }) => {
  const projectId = await resetStudio(page).then(() => prepareLegacyHero(page, "Tienda A18 hero"));

  const deleteSlide = page.getByRole("button", { name: "Eliminar slide" }).first();
  await deleteSlide.click();
  const deleteDialog = page.getByRole("dialog", { name: "Eliminar slide" });
  await expect(deleteDialog).toBeVisible();
  await expect(deleteDialog.locator(".confirm-dialog__body")).toContainText("Diapo base");
  await deleteDialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.locator(".slide-card")).toHaveCount(2);
  await deleteSlide.click();
  await page
    .getByRole("dialog", { name: "Eliminar slide" })
    .getByRole("button", { name: "Eliminar slide", exact: true })
    .click();
  await expect(page.locator(".slide-card")).toHaveCount(1);
  await expect(page.getByText("1 configurados", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Título del slide 1", { exact: true })).toHaveValue("Segunda diapo");

  await expect
    .poll(async () => {
      const slides = (await readHeroSlides(page, projectId)) as Array<{ title: string }>;
      return slides?.length;
    })
    .toBe(1);
  const slides = (await readHeroSlides(page, projectId)) as Array<{ title: string }>;
  expect(slides[0].title).toBe("Segunda diapo");

  await expect(preview(page).locator('.solara-hero-indicators [role="tab"]')).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(preview(page).locator('[data-hero-slide-panel="0"]')).toHaveAttribute(
    "data-hero-title",
    "Segunda diapo",
    { timeout: 10_000 },
  );
});

test("A18 T5: mover prev/next cambia el orden real del editor, del proyecto y del preview", async ({
  page,
}) => {
  const projectId = await resetStudio(page).then(() => prepareLegacyHero(page, "Tienda A18 hero"));

  await page.getByRole("button", { name: "Agregar slide" }).click();
  await expect(page.locator(".slide-card")).toHaveCount(3);
  await page.getByLabel("Título del slide 3", { exact: true }).fill("Tercera diapo");

  const lastCard = page.locator(".slide-card").last();
  await lastCard.getByRole("button", { name: "Mover slide arriba" }).click();
  await expect(page.getByLabel("Título del slide 2", { exact: true })).toHaveValue("Tercera diapo");
  await expect(page.getByLabel("Título del slide 3", { exact: true })).toHaveValue("Segunda diapo");

  await expect
    .poll(async () => {
      const slides = (await readHeroSlides(page, projectId)) as Array<{ title: string }>;
      return slides.map((slide) => slide.title);
    })
    .toEqual(["Diapo base", "Tercera diapo", "Segunda diapo"]);

  const frame = preview(page);
  await expect(frame.locator('[data-hero-slide-panel="1"]')).toHaveAttribute(
    "data-hero-title",
    "Tercera diapo",
    { timeout: 10_000 },
  );

  await page
    .locator(".slide-card")
    .first()
    .getByRole("button", { name: "Mover slide abajo" })
    .click();
  await expect(page.getByLabel("Título del slide 1", { exact: true })).toHaveValue("Tercera diapo");
  await expect(page.getByLabel("Título del slide 2", { exact: true })).toHaveValue("Diapo base");
  await expect(frame.locator('[data-hero-slide-panel="0"]')).toHaveAttribute(
    "data-hero-title",
    "Tercera diapo",
    { timeout: 10_000 },
  );
});

test("A18 T6: mover se deshabilita en los límites (auto-feedback)", async ({ page }) => {
  await resetStudio(page);
  await prepareLegacyHero(page, "Tienda A18 hero");

  const firstCard = page.locator(".slide-card").first();
  const lastCard = page.locator(".slide-card").last();
  await expect(firstCard.getByRole("button", { name: "Mover slide arriba" })).toBeDisabled();
  await expect(firstCard.getByRole("button", { name: "Mover slide arriba" })).toHaveAttribute(
    "aria-description",
    "Slide 1 de 2",
  );
  await expect(lastCard.getByRole("button", { name: "Mover slide abajo" })).toHaveAttribute(
    "aria-description",
    "Slide 2 de 2",
  );
  await expect(firstCard.getByRole("button", { name: "Mover slide abajo" })).toBeEnabled();
  await expect(lastCard.getByRole("button", { name: "Mover slide arriba" })).toBeEnabled();
  await expect(lastCard.getByRole("button", { name: "Mover slide abajo" })).toBeDisabled();

  await page.getByRole("button", { name: "Agregar slide" }).click();
  await expect(page.locator(".slide-card")).toHaveCount(3);
  const middle = page.locator(".slide-card").nth(1);
  await expect(middle.getByRole("button", { name: "Mover slide arriba" })).toBeEnabled();
  await expect(middle.getByRole("button", { name: "Mover slide abajo" })).toBeEnabled();
});

test("A18 T7: el slide activo queda marcado en las pestañas del preview", async ({ page }) => {
  await resetStudio(page);
  await prepareLegacyHero(page, "Tienda A18 hero");

  const frame = preview(page);
  const tabs = frame.locator('.solara-hero-indicators [role="tab"]');
  await expect(tabs).toHaveCount(2, { timeout: 15_000 });
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "false");
  await expect(frame.locator('[data-hero-slide-panel="0"]')).toHaveAttribute(
    "data-hero-active",
    "true",
  );
  await expect(frame.locator('[data-hero-slide-panel="1"]')).toHaveAttribute(
    "data-hero-active",
    "false",
  );

  await tabs.nth(1).evaluate((element) => (element as HTMLButtonElement).click());
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true", { timeout: 10_000 });
  await expect(tabs.first()).toHaveAttribute("aria-selected", "false");
  await expect(frame.locator('[data-hero-slide-panel="1"]')).toHaveAttribute(
    "data-hero-active",
    "true",
  );
  await expect(frame.locator('[data-hero-slide-panel="0"]')).toHaveAttribute(
    "data-hero-active",
    "false",
  );

  await frame
    .locator("[data-hero-prev]")
    .evaluate((element) => (element as HTMLButtonElement).click());
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true", { timeout: 10_000 });
  await expect(frame.locator('[data-hero-slide-panel="0"]')).toHaveAttribute(
    "data-hero-active",
    "true",
  );
});

test("A18 T8: título vacío muestra error y no se commitea; al corregirlo se aplica", async ({
  page,
}) => {
  const projectId = await resetStudio(page).then(() => prepareLegacyHero(page, "Tienda A18 hero"));

  await page.getByLabel("Título del slide 1", { exact: true }).fill("Diapo editada");
  await expect
    .poll(async () => {
      const slides = (await readHeroSlides(page, projectId)) as Array<{ title: string }>;
      return slides?.[0]?.title;
    })
    .toBe("Diapo editada");

  await page.getByLabel("Título del slide 1", { exact: true }).fill("");
  await expect(page.getByTestId("ui-schema-errors")).toContainText("slides.0.title");
  const title = page.getByLabel("Título del slide 1", { exact: true });
  await expect(title).toHaveAttribute("aria-invalid", "true");
  const titleField = title.locator("xpath=ancestor::fieldset[1]");
  const titleError = titleField.getByTestId("ui-field-error");
  await expect(titleError).toBeVisible();
  const titleDescribedBy = await title.getAttribute("aria-describedby");
  expect(titleDescribedBy).toContain(await titleError.getAttribute("id"));
  await expect
    .poll(async () => {
      const slides = (await readHeroSlides(page, projectId)) as Array<{ title: string }>;
      return slides?.[0]?.title;
    })
    .toBe("Diapo editada");

  await page.getByLabel("Título del slide 1", { exact: true }).fill("Diapo corregida");
  await expect(page.getByTestId("ui-schema-errors")).not.toBeVisible();
  await expect(title).not.toHaveAttribute("aria-invalid", "true");
  await expect(titleField.getByTestId("ui-field-error")).toHaveCount(0);
  await expect
    .poll(async () => {
      const slides = (await readHeroSlides(page, projectId)) as Array<{ title: string }>;
      return slides?.[0]?.title;
    })
    .toBe("Diapo corregida");
  await expect(preview(page).locator('[data-hero-slide-panel="0"]')).toHaveAttribute(
    "data-hero-title",
    "Diapo corregida",
    { timeout: 10_000 },
  );
});

const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function openAssetDeleteDialog(page: Page, openStore = true) {
  if (openStore) await openMutableScaleStore(page, "Tienda A18 recursos");
  await page.getByRole("tab", { name: "Recursos", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Recursos", exact: true })).toBeVisible();

  const existing = page
    .locator(".asset-item")
    .filter({ has: page.locator('input[value="pixel"]') });
  if ((await existing.count()) === 0) {
    await page.locator('input[type="file"][accept*="image/"]').setInputFiles({
      name: "pixel.png",
      mimeType: "image/png",
      buffer: PIXEL_PNG,
    });
    await expect(page.getByText("1 imagen agregada", { exact: false })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("searchbox", { name: "Buscar recursos" }).fill("pixel");
  }

  const item = page.locator(".asset-item").filter({ has: page.locator('input[value="pixel"]') });
  await expect(item).toBeVisible();
  await item.getByTestId("ui-asset-detail-open").click();
  const deleteBtn = page.getByTestId("ui-asset-delete");
  await expect(deleteBtn).toBeEnabled();
  await deleteBtn.click();

  const dialog = page.getByTestId("ui-confirm-dialog");
  await expect(dialog).toBeVisible();
  return { dialog, deleteBtn };
}

test("A18 T9: cancelar cierra el diálogo, devuelve el foco y conserva el recurso", async ({
  page,
}) => {
  await resetStudio(page);
  const { dialog, deleteBtn } = await openAssetDeleteDialog(page);

  await expect(dialog.getByRole("button", { name: "Cancelar", exact: true })).toBeFocused();
  const countBefore = await page.locator(".asset-item").count();

  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(deleteBtn).toBeFocused();
  await expect(page.locator(".asset-item")).toHaveCount(countBefore);
});

test("A18 T10: confirmar borra el recurso y cierra el diálogo", async ({ page }) => {
  await resetStudio(page);
  const { dialog } = await openAssetDeleteDialog(page);

  const countBefore = await page.locator(".asset-item").count();
  await dialog.getByTestId("ui-confirm-accept").click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".asset-item")).toHaveCount(countBefore - 1);
  await expect(page.getByTestId("ui-asset-detail")).not.toBeAttached();
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName ?? "")).toBe("BODY");
});

test("A18 T11: Escape cancela y devuelve el foco al control que abrió el diálogo", async ({
  page,
}) => {
  await resetStudio(page);
  const { dialog, deleteBtn } = await openAssetDeleteDialog(page);
  const countBefore = await page.locator(".asset-item").count();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(deleteBtn).toBeFocused();
  await expect(page.locator(".asset-item")).toHaveCount(countBefore);
});

test("A18 T12: Enter confirma desde el botón principal y cancela desde el secundario", async ({
  page,
}) => {
  await resetStudio(page);

  let flow = await openAssetDeleteDialog(page);
  const countBeforeCancel = await page.locator(".asset-item").count();
  await page.keyboard.press("Enter");
  await expect(flow.dialog).toBeHidden();
  await expect(flow.deleteBtn).toBeFocused();
  await expect(page.locator(".asset-item")).toHaveCount(countBeforeCancel);

  flow = await openAssetDeleteDialog(page, false);
  await page.keyboard.press("Tab");
  await expect(flow.dialog.getByTestId("ui-confirm-accept")).toBeFocused();
  const countBefore = await page.locator(".asset-item").count();
  await page.keyboard.press("Enter");
  await expect(flow.dialog).toBeHidden();
  await expect(page.locator(".asset-item")).toHaveCount(countBefore - 1);
});

test("A18 T13: el diálogo expone aria-labelledby hacia su título y el botón X cierra", async ({
  page,
}) => {
  await resetStudio(page);
  const { dialog, deleteBtn } = await openAssetDeleteDialog(page);

  const labelledBy = await dialog.getAttribute("aria-labelledby");
  expect(labelledBy, "aria-labelledby presente").toMatch(/\S+/);
  const labelText = await page.evaluate(
    (id) => document.getElementById(id as string)?.textContent?.trim() ?? "",
    labelledBy,
  );
  expect(labelText).toBe("Eliminar imagen");

  await dialog.getByRole("button", { name: "Cerrar diálogo" }).click();
  await expect(dialog).toBeHidden();
  await expect(deleteBtn).toBeFocused();
});
