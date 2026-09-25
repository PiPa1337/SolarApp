/**
 * Barrido A17 (OWNER `apps/studio/src/features/Assets.tsx`): recursos.
 * Contrato de 3 capas por control: (1) efecto real en datos, (2) auto-feedback
 * del control (progreso por archivo, disabled, estados), (3) contrato de datos
 * (paridad `assetUses` vs referencias del schema).
 *
 * Nota: la plantilla limpia conserva 4 assets «Imagen de plantilla»
 * (hero/categorías/colecciones), por eso las grillas se miden sobre el conteo
 * inicial en vez de asumir una tienda vacía.
 */
import type { Server } from "node:http";
import { expect, test } from "@playwright/test";
import { createCleanStore } from "./project-helpers";
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

const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const TEAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAASSURBVBhXY2BoaPgPxhBGw38AQfQH/dpeE7AAAAAASUVORK5CYII=",
  "base64",
);

const IMAGE_INPUT = 'input[type="file"][accept*="image/"]';
const VIDEO_INPUT = 'input[type="file"][accept*="video/"]';
const DROPZONE = "[data-testid='ui-assets-dropzone']";

async function openAssetsTab(page: import("@playwright/test").Page): Promise<number> {
  await page.getByRole("tab", { name: "Recursos", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Recursos" })).toBeVisible();
  await expect(page.locator(".asset-item").first()).toBeAttached();
  return page.locator(".asset-item").count();
}

async function dropFiles(
  page: import("@playwright/test").Page,
  files: Array<{ name: string; type: string; buffer: Buffer }>,
): Promise<void> {
  // Los Buffer de Node no sobreviven la serialización del protocolo: se
  // transfieren como base64 y se reconstruyen dentro de la página.
  const payload = files.map((file) => ({
    name: file.name,
    type: file.type,
    base64: file.buffer.toString("base64"),
  }));
  const dataTransfer = await page.evaluateHandle((items) => {
    const transfer = new DataTransfer();
    for (const item of items) {
      const bytes = Uint8Array.from(atob(item.base64), (char) => char.charCodeAt(0));
      transfer.items.add(new File([bytes], item.name, { type: item.type }));
    }
    return transfer;
  }, payload);
  await page.dispatchEvent(DROPZONE, "drop", { dataTransfer });
  await dataTransfer.dispose();
}

async function uploadPixel(page: import("@playwright/test").Page): Promise<void> {
  await page.locator(IMAGE_INPUT).setInputFiles({
    name: "pixel.png",
    mimeType: "image/png",
    buffer: PIXEL_PNG,
  });
  await expect(page.getByTestId("ui-asset-batch-status")).toContainText("1 imagen agregada", {
    timeout: 15_000,
  });
}

// El arranque del dashboard compite con otros workers del barrido y con la
// carga de la máquina; el timeout por defecto de 30 s no alcanza.
test.setTimeout(120_000);

test("los botones visibles de carga abren el selector correcto", async ({ page }) => {
  await page.goto(studioUrl);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({ timeout: 20_000 });
  await createCleanStore(page, "Tienda barrido A17 selectores");
  await openAssetsTab(page);

  const imageChooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("ui-asset-upload").click();
  const imageChooser = await imageChooserPromise;
  expect(await imageChooser.isMultiple()).toBe(true);
  const imageInput = await imageChooser.element();
  expect(await imageInput.getAttribute("aria-label")).toBe("Seleccionar imágenes");
  expect(await imageInput.getAttribute("accept")).toBe("image/jpeg,image/png,image/webp");

  const videoChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Cargar video", exact: true }).click();
  const videoChooser = await videoChooserPromise;
  expect(await videoChooser.isMultiple()).toBe(true);
  const videoInput = await videoChooser.element();
  expect(await videoInput.getAttribute("aria-label")).toBe("Seleccionar videos");
  expect(await videoInput.getAttribute("accept")).toBe("video/mp4,video/webm");
});

test("sube un lote con progreso real por archivo, reporta duplicados y libera la UI", async ({
  page,
}) => {
  await page.goto(studioUrl);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({ timeout: 20_000 });
  await createCleanStore(page, "Tienda barrido A17 lote");
  const initialCount = await openAssetsTab(page);

  const noiseA = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("sin canvas");
    const image = ctx.createImageData(256, 256);
    for (let i = 0; i < image.data.length; i += 4) {
      image.data[i] = Math.floor(Math.random() * 256);
      image.data[i + 1] = Math.floor(Math.random() * 256);
      image.data[i + 2] = Math.floor(Math.random() * 256);
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((result) => resolve(result ?? new Blob()), "image/png"),
    );
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  const noiseB = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("sin canvas");
    const image = ctx.createImageData(256, 256);
    for (let i = 0; i < image.data.length; i += 4) {
      image.data[i] = Math.floor(Math.random() * 256);
      image.data[i + 1] = Math.floor(Math.random() * 256);
      image.data[i + 2] = Math.floor(Math.random() * 256);
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((result) => resolve(result ?? new Blob()), "image/png"),
    );
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });

  const progress = page.getByTestId("ui-assets-progress");
  // Muestreo in-page con MutationObserver: captura CADA valor de
  // aria-valuenow sin depender de la cadencia del runner (el lote puede
  // durar <200 ms y los estados intermedios son breves).
  await page.evaluate(() => {
    const install = () => {
      const bar = document.querySelector<HTMLElement>('[data-testid="ui-progress"]');
      if (!bar) {
        window.setTimeout(install, 5);
        return;
      }
      const values = new Set<string>();
      const record = () => values.add(bar.getAttribute("aria-valuenow") ?? "");
      record();
      new MutationObserver(record).observe(bar, {
        attributes: true,
        attributeFilter: ["aria-valuenow"],
      });
      (window as unknown as { __solaraA17Progress?: Set<string> }).__solaraA17Progress = values;
    };
    install();
  });
  await page.locator(IMAGE_INPUT).setInputFiles([
    { name: "ruido-a.png", mimeType: "image/png", buffer: Buffer.from(noiseA) },
    { name: "ruido-b.png", mimeType: "image/png", buffer: Buffer.from(noiseB) },
    { name: "ruido-a.png", mimeType: "image/png", buffer: Buffer.from(noiseA) },
  ]);

  await expect(page.getByTestId("ui-asset-batch-status")).toContainText("2 imágenes agregadas", {
    timeout: 90_000,
  });
  await expect(page.getByTestId("ui-asset-batch-status")).toContainText("1 duplicada omitida", {
    timeout: 30_000,
  });
  // Progreso real por archivo: la barra pasó por los pasos 1 y 2 antes del 3
  // (auto-feedback por archivo, no sólo estado final).
  const observed = await page.evaluate(() =>
    Array.from(
      (window as unknown as { __solaraA17Progress?: Set<string> }).__solaraA17Progress ??
        new Set<string>(),
    ),
  );
  expect(observed).toContain("1");
  expect(observed).toContain("2");
  expect(observed).toContain("3");
  await expect(page.locator(".asset-item")).toHaveCount(initialCount + 2);
  await expect(progress).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Cargar imágenes", exact: true })).toBeEnabled();
});

test("el dropzone acepta el drop, separa tandas mixtas y reporta archivos no compatibles", async ({
  page,
}) => {
  await page.goto(studioUrl);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({ timeout: 20_000 });
  await createCleanStore(page, "Tienda barrido A17 drop");
  const initialCount = await openAssetsTab(page);

  await dropFiles(page, [{ name: "pixel.png", type: "image/png", buffer: PIXEL_PNG }]);
  await expect(page.getByTestId("ui-asset-batch-status")).toContainText("1 imagen agregada", {
    timeout: 15_000,
  });
  await expect(page.locator(".asset-item")).toHaveCount(initialCount + 1);

  await dropFiles(page, [{ name: "pixel.png", type: "image/png", buffer: PIXEL_PNG }]);
  await expect(page.getByTestId("ui-asset-batch-status")).toContainText("0 imágenes agregadas", {
    timeout: 15_000,
  });
  await expect(page.getByTestId("ui-asset-batch-status")).toContainText("1 duplicada omitida");
  await expect(page.locator(".asset-item")).toHaveCount(initialCount + 1);

  await dropFiles(page, [
    { name: "pixel.png", type: "image/png", buffer: PIXEL_PNG },
    { name: "clip.mp4", type: "video/mp4", buffer: Buffer.from("fake") },
  ]);
  await expect(page.getByText(/tandas separadas/)).toBeVisible();
  await expect(page.locator(".asset-item")).toHaveCount(initialCount + 1);

  await dropFiles(page, [{ name: "nota.txt", type: "text/plain", buffer: Buffer.from("hola") }]);
  await expect(page.getByText(/no es un archivo compatible/)).toBeVisible();
  await expect(page.locator(".asset-item")).toHaveCount(initialCount + 1);
});

test("el dropzone comunica el estado activo y permite limpiar la caché regenerable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const storage = {
      estimate: async () => ({ usage: 900, quota: 1_000 }),
      persist: async () => true,
    };
    Object.defineProperty(window.navigator, "storage", {
      configurable: true,
      value: storage,
    });
  });
  await page.goto(studioUrl);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({ timeout: 20_000 });
  await createCleanStore(page, "Tienda barrido A17 feedback");
  await openAssetsTab(page);

  await page.dispatchEvent(DROPZONE, "dragenter");
  await expect(page.getByTestId("ui-assets-drop-hint")).toBeVisible();
  await page.dispatchEvent(DROPZONE, "dragleave");
  await expect(page.getByTestId("ui-assets-drop-hint")).not.toBeVisible();

  const clearCache = page.getByRole("button", { name: "Limpiar caché regenerable", exact: true });
  await expect(clearCache).toBeVisible();
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find(
      (element) => element.textContent?.trim() === "Limpiar caché regenerable",
    );
    if (!button) throw new Error("No se encontró el botón de caché regenerable.");
    const transitions: string[] = [];
    const record = () => transitions.push(button.getAttribute("aria-busy") ?? "missing");
    record();
    const observer = new MutationObserver(record);
    observer.observe(button, {
      attributes: true,
      attributeFilter: ["aria-busy"],
      childList: true,
      subtree: true,
      characterData: true,
    });
    (window as unknown as { __assetCacheBusyTransitions?: string[] }).__assetCacheBusyTransitions =
      transitions;
    (
      window as unknown as { __assetCacheBusyObserver?: MutationObserver }
    ).__assetCacheBusyObserver = observer;
  });
  await clearCache.click();
  await expect(page.getByTestId("ui-asset-cache-status")).toHaveText("Caché regenerable limpiada.");
  await expect(clearCache).toHaveAttribute("aria-busy", "false");
  await expect(clearCache).toBeEnabled();
  const transitions = await page.evaluate(() => {
    const state = window as unknown as {
      __assetCacheBusyTransitions?: string[];
      __assetCacheBusyObserver?: MutationObserver;
    };
    state.__assetCacheBusyObserver?.disconnect();
    return state.__assetCacheBusyTransitions ?? [];
  });
  expect(transitions, "la limpieza anuncia su estado ocupado").toContain("true");
  expect(transitions.at(-1), "la limpieza vuelve a estar disponible").toBe("false");
});

test("el detalle muestra usos coherentes con las referencias del proyecto", async ({ page }) => {
  await page.goto(studioUrl);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({ timeout: 20_000 });
  const card = page
    .locator(".dashboard-store-card")
    .filter({ has: page.getByText("Predeterminado", { exact: true }) });
  await expect(card).toBeVisible();
  await card.locator(".dashboard-store-card__button").click();
  await page
    .getByRole("region", { name: /Tienda seleccionada:/ })
    .getByRole("button", { name: "Abrir tienda", exact: true })
    .click();
  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible();
  await openAssetsTab(page);

  const heroAsset = page.locator(".asset-item").filter({
    has: page.locator('input[value="Campaña de temporada"]'),
  });
  await expect(heroAsset).toBeVisible();
  await heroAsset.getByTestId("ui-asset-detail-open").click();
  const detail = page.getByTestId("ui-asset-detail");
  await expect(detail).toBeVisible();

  // Referencias del fixture demo: sección hero (posterAssetId), categorías raíz
  // (imageId) y colecciones «Recién llegados» y «Fin de temporada» (imageId).
  await expect(detail).toContainText("Sección hero");
  await expect(detail).toContainText("Recién llegados");
  await expect(detail).toContainText("Fin de temporada");
  await expect(detail).toContainText("Imagen de colección");
  expect(await detail.getByTestId("ui-asset-use").count()).toBeGreaterThanOrEqual(3);
  await expect(page.getByTestId("ui-asset-delete")).toBeDisabled();

  await page.getByTestId("ui-asset-detail-close").click();
  await expect(detail).not.toBeAttached();
  await expect(heroAsset.getByTestId("ui-asset-detail-open")).toBeFocused();

  const productAsset = page
    .locator(".asset-item")
    .filter({
      has: page.locator('input[value="Remera esencial negra"]'),
    })
    .last();
  await expect(productAsset).toBeVisible();
  await productAsset.getByTestId("ui-asset-detail-open").click();
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("Imagen de producto");
  await expect(detail).toContainText("Imagen de categoría");
  // La pertenencia del producto a una colección no convierte el asset del
  // producto en la imagen de esa colección: sólo se listan referencias directas.
  await expect(detail).not.toContainText("Imagen de colección");
  await expect(page.getByTestId("ui-asset-delete")).toBeDisabled();
});

test("Copiar ID escribe el identificador del recurso y comunica Copiado", async ({ page }) => {
  await page.goto(studioUrl);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({ timeout: 20_000 });
  const card = page
    .locator(".dashboard-store-card")
    .filter({ has: page.getByText("Predeterminado", { exact: true }) });
  await card.locator(".dashboard-store-card__button").click();
  await page
    .getByRole("region", { name: /Tienda seleccionada:/ })
    .getByRole("button", { name: "Abrir tienda", exact: true })
    .click();
  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible();
  await openAssetsTab(page);

  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (window as unknown as { __clipboardValue?: string }).__clipboardValue = value;
        },
      },
    });
  });

  const heroAsset = page.locator(".asset-item").filter({
    has: page.locator('input[value="Campaña de temporada"]'),
  });
  const copyButton = heroAsset.getByRole("button", { name: "Copiar ID de Campaña de temporada" });
  await copyButton.click();

  const copiedButton = heroAsset.getByRole("button", { name: "Copiado de Campaña de temporada" });
  await expect(copiedButton).toHaveAttribute("aria-label", "Copiado de Campaña de temporada");
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __clipboardValue?: string }).__clipboardValue),
    )
    .toBe("asset-hero");
});

test("Copiar ID muestra un error accionable cuando el portapapeles rechaza la operación", async ({
  page,
}) => {
  await page.goto(studioUrl);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({ timeout: 20_000 });
  const card = page
    .locator(".dashboard-store-card")
    .filter({ has: page.getByText("Predeterminado", { exact: true }) });
  await card.locator(".dashboard-store-card__button").click();
  await page
    .getByRole("region", { name: /Tienda seleccionada:/ })
    .getByRole("button", { name: "Abrir tienda", exact: true })
    .click();
  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible();
  await openAssetsTab(page);

  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("permission denied");
        },
      },
    });
  });

  const heroAsset = page.locator(".asset-item").filter({
    has: page.locator('input[value="Campaña de temporada"]'),
  });
  await heroAsset.getByRole("button", { name: "Copiar ID de Campaña de temporada" }).click();
  await expect(heroAsset.getByTestId("ui-asset-copy-error")).toContainText(
    "No se pudo copiar el ID",
  );
  await heroAsset.getByTestId("ui-asset-detail-open").click();
  await expect(page.getByTestId("ui-asset-id")).toContainText("asset-hero");
  await expect(
    heroAsset.getByRole("button", { name: "Copiar ID de Campaña de temporada" }),
  ).toBeVisible();
});

test("eliminar sin usos: confirmar quita la imagen y cancelar la conserva", async ({ page }) => {
  await page.goto(studioUrl);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({ timeout: 20_000 });
  await createCleanStore(page, "Tienda barrido A17 borrar");
  const initialCount = await openAssetsTab(page);
  await uploadPixel(page);

  const assetItem = page
    .locator(".asset-item")
    .filter({ has: page.locator('input[value="pixel"]') });
  await expect(assetItem).toBeVisible();
  await assetItem.getByTestId("ui-asset-detail-open").click();
  const detail = page.getByTestId("ui-asset-detail");
  await expect(detail.getByTestId("ui-asset-uses")).toContainText("Sin usos");
  await expect(page.getByTestId("ui-asset-delete")).toBeEnabled();

  await page.getByTestId("ui-asset-delete").click();
  const dialog = page.getByTestId("ui-confirm-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Eliminar imagen");
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(dialog).not.toBeAttached();
  await expect(page.locator(".asset-item")).toHaveCount(initialCount + 1);

  await page.getByTestId("ui-asset-delete").click();
  await expect(dialog).toBeVisible();
  await dialog.getByTestId("ui-confirm-accept").click();
  await expect(page.locator(".asset-item")).toHaveCount(initialCount);
  await expect(page.getByTestId("ui-asset-detail")).not.toBeAttached();
});

test("video: fallos aislados por archivo con límites, hints y estado final", async ({ page }) => {
  await page.goto(studioUrl);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({ timeout: 20_000 });
  await createCleanStore(page, "Tienda barrido A17 videos");
  await openAssetsTab(page);

  await page.locator(VIDEO_INPUT).setInputFiles([
    { name: "clip.mov", mimeType: "video/quicktime", buffer: Buffer.from("mov falso") },
    { name: "roto.mp4", mimeType: "video/mp4", buffer: Buffer.from("no es un video") },
    {
      name: "pesado.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.alloc(30 * 1024 * 1024 + 1, 1),
    },
  ]);

  const failures = page.getByTestId("ui-asset-errors");
  await expect(failures).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("ui-asset-error")).toHaveCount(3);
  await expect(failures).toContainText("clip.mov");
  await expect(failures).toContainText("Sólo se aceptan videos MP4 o WebM");
  await expect(failures).toContainText("roto.mp4");
  await expect(failures).toContainText("No se pudo leer la metadata");
  await expect(failures).toContainText("pesado.mp4");
  await expect(failures).toContainText("supera los 30 MB");
  await expect(failures).toContainText("MP4 o WebM de hasta 30 MB");
  await expect(page.getByTestId("ui-asset-batch-status")).toContainText("0 videos agregados");
  await expect(page.getByRole("button", { name: "Cargar video", exact: true })).toBeEnabled();
});

test("el selector de archivos avisa cuando se eligen archivos no compatibles", async ({ page }) => {
  await page.goto(studioUrl);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({ timeout: 20_000 });
  await createCleanStore(page, "Tienda barrido A17 picker");
  const initialCount = await openAssetsTab(page);

  await page.locator(IMAGE_INPUT).setInputFiles({
    name: "nota.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hola"),
  });
  await expect(page.getByText(/no es un archivo compatible/)).toBeVisible();
  await expect(page.locator(".asset-item")).toHaveCount(initialCount);

  await page.locator(IMAGE_INPUT).setInputFiles([
    { name: "pixel.png", mimeType: "image/png", buffer: PIXEL_PNG },
    { name: "extra.png", mimeType: "application/octet-stream", buffer: TEAL_PNG },
  ]);
  await expect(page.getByText(/no es un archivo compatible/)).toBeVisible();
  await expect(page.locator(".asset-item")).toHaveCount(initialCount);
});

test("reemplazar conserva el nombre y el ID: la grilla y el detalle acuerdan", async ({ page }) => {
  await page.goto(studioUrl);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({ timeout: 20_000 });
  await createCleanStore(page, "Tienda barrido A17 reemplazo");
  const initialCount = await openAssetsTab(page);
  await uploadPixel(page);

  const assetItem = page
    .locator(".asset-item")
    .filter({ has: page.locator('input[value="pixel"]') });
  await expect(assetItem).toBeVisible();
  await assetItem.locator('input[value="pixel"]').fill("Mi imagen");
  await assetItem.locator('input[value="pixel"]').blur();

  // El rename se refleja en la grilla; relocalizar por el alt de la imagen
  // (atributo prop, siempre actualizado) en vez del value del input.
  const renamedItem = page.locator(".asset-item").filter({
    has: page.locator('img[alt="Mi imagen"]'),
  });
  await expect(renamedItem).toBeVisible();
  await expect(renamedItem.locator("input").first()).toHaveValue("Mi imagen");

  const imgBefore = await renamedItem.locator("img").getAttribute("src");
  await renamedItem.getByTestId("ui-asset-detail-open").click();
  const detail = page.getByTestId("ui-asset-detail");
  await expect(detail.getByRole("heading", { name: "Mi imagen" })).toBeVisible();

  // El botón abre el picker apuntando al asset del detalle; el file chooser
  // inyecta el reemplazo por el mismo input de imágenes.
  const chooserPromise = page.waitForEvent("filechooser");
  await detail.getByTestId("ui-asset-replace").click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: "teal.png", mimeType: "image/png", buffer: TEAL_PNG });

  await expect(page.getByTestId("ui-asset-batch-status")).toContainText(
    "Imagen reemplazada conservando el ID",
    { timeout: 15_000 },
  );
  await expect(page.locator(".asset-item")).toHaveCount(initialCount + 1);
  // El detalle sigue abierto sobre el mismo asset (el ID no cambió), muestra
  // la imagen nueva (2 × 2) y la grilla conserva el nombre: acuerdan.
  await expect(detail).toBeVisible();
  await expect(detail.getByRole("heading", { name: "Mi imagen" })).toBeVisible();
  await expect(detail).toContainText("2 × 2");
  await expect(renamedItem.locator("img")).not.toHaveAttribute("src", imgBefore ?? "");
  await expect(renamedItem.locator("input").first()).toHaveValue("Mi imagen");
});

test("video real (WebM grabado en el navegador): se agrega con metadata y estado final", async ({
  page,
}) => {
  await page.goto(studioUrl);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({ timeout: 20_000 });
  await createCleanStore(page, "Tienda barrido A17 video ok");
  await openAssetsTab(page);

  const webm = await page.evaluate(
    () =>
      new Promise<number[]>((resolve, reject) => {
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 240;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("sin canvas"));
          return;
        }
        let frame = 0;
        const draw = () => {
          ctx.fillStyle = "#17457a";
          ctx.fillRect(0, 0, 320, 240);
          ctx.fillStyle = "#f2f2f2";
          ctx.fillRect((frame * 2) % 280, 100, 40, 40);
          frame += 1;
          requestAnimationFrame(draw);
        };
        draw();
        const stream = canvas.captureStream(15);
        const recorder = new MediaRecorder(stream);
        const chunks: Blob[] = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        };
        recorder.onerror = () => {
          stream.getTracks().forEach((track) => {
            track.stop();
          });
          reject(new Error("grabación fallida"));
        };
        recorder.onstop = () => {
          stream.getTracks().forEach((track) => {
            track.stop();
          });
          const blob = new Blob(chunks, { type: "video/webm" });
          void blob.arrayBuffer().then((bytes) => resolve(Array.from(new Uint8Array(bytes))));
        };
        recorder.start(100);
        window.setTimeout(() => recorder.stop(), 900);
      }),
  );

  await page.locator(VIDEO_INPUT).setInputFiles({
    name: "clip-grabado.webm",
    mimeType: "video/webm",
    buffer: Buffer.from(webm),
  });

  await expect(page.getByTestId("ui-asset-batch-status")).toContainText("1 video agregado", {
    timeout: 20_000,
  });
  const videoItem = page.locator(".asset-item").filter({ has: page.locator("video") });
  await expect(videoItem).toBeVisible();
  await expect(videoItem).toContainText("320 × 240");
  await expect(page.getByTestId("ui-assets-progress")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Cargar video", exact: true })).toBeEnabled();

  // Portada del video: el select refleja la asignación y la conserva tras el
  // re-render del proyecto (updateVideo → onChange).
  const posterSelect = videoItem.locator("select");
  await expect(posterSelect).toBeVisible();
  const posterValue = await posterSelect.locator("option").nth(1).getAttribute("value");
  expect(posterValue).toMatch(/\S+/);
  await posterSelect.selectOption(posterValue ?? "");
  await expect(posterSelect).toHaveValue(posterValue ?? "");
});
