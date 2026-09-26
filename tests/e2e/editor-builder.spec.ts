import type { Server } from "node:http";
import { expect, type Page, test } from "@playwright/test";
import { createCleanStore } from "./project-helpers";
import { startStudioServer, stopStudioServer } from "./studio-server";

test.setTimeout(process.env.CI ? 60_000 : 30_000);

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

async function openBuilder(page: Page) {
  await page.goto(studioUrl);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase("solara-commerce-studio");
        request.addEventListener("success", () => resolve());
        request.addEventListener("error", () => reject(request.error));
        request.addEventListener("blocked", () =>
          reject(new Error("No se pudo limpiar la base de Studio.")),
        );
      }),
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 20_000,
  });
  await createCleanStore(page, "Tienda builder");
  await page.getByRole("tab", { name: "Constructor" }).click();
  await expect(page.getByRole("heading", { name: "Constructor" })).toBeVisible();
  const unlock = page.getByRole("button", { name: "Desbloquear", exact: true });
  if (await unlock.count()) await unlock.click();
}

async function selectHero(page: Page) {
  const hero = page.getByRole("listitem").filter({ hasText: "Hero de catálogo" });
  await hero.getByRole("button").first().click();
}



test("el picker de módulos filtra por nombre y agrega el módulo elegido", async ({ page }) => {
  await openBuilder(page);
  const sections = page.getByRole("list", { name: "Secciones de la tienda" });
  const initialCount = await sections.getByRole("listitem").count();

  await page.getByLabel("Tipo de sección").selectOption("content");
  await page.getByRole("button", { name: "Agregar sección" }).click();
  const picker = page.getByTestId("ui-module-picker");
  await expect(picker).toBeVisible();

  await picker.getByLabel("Buscar módulo").fill("testimonios");
  await expect(picker.getByRole("button", { name: /Testimonios/ })).toHaveCount(1);
  await expect(picker.getByRole("button", { name: /Testimonios/ })).toContainText("Testimonios");
  await expect(picker.getByRole("button", { name: /Testimonios/ })).toContainText("Nuevo");

  await picker.getByRole("button", { name: /Testimonios/ }).click();
  await expect(picker).toBeHidden();
  await page.getByRole("button", { name: "Volver a Constructor", exact: true }).click();
  await expect(sections.getByRole("listitem")).toHaveCount(initialCount + 1);
  await expect(sections.getByRole("listitem").last()).toContainText("Testimonios");
});

test("el picker marca la incompatibilidad de slot de forma explícita", async ({ page }) => {
  await openBuilder(page);
  await page.getByLabel("Tipo de sección").selectOption("footer");
  await page.getByRole("button", { name: "Agregar sección" }).click();
  const picker = page.getByTestId("ui-module-picker");
  await expect(picker).toBeVisible();

  await picker.getByLabel("Buscar módulo").fill("hero");
  const heroOption = picker.getByRole("button", { name: /Hero de catálogo/ });
  await expect(heroOption).toBeDisabled();
  await expect(heroOption).toContainText("No compatible con «Pie»");
  await picker.getByLabel("Buscar módulo").fill("");
  await expect(picker.getByRole("button", { name: /Footer de catálogo/ })).toBeEnabled();
});







test("los campos de imagen del hero permiten subir una imagen nueva", async ({ page }) => {
  await openBuilder(page);
  await selectHero(page);
  const upload = page.getByRole("button", { name: "Subir imagen" }).first();
  await expect(upload).toBeVisible();
  await upload.click();
  await page
    .locator('input[type="file"][accept*="image/"]')
    .first()
    .setInputFiles({
      name: "no-es-imagen.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("esto no es una imagen"),
    });
  await expect(page.getByText("Sólo se aceptan imágenes JPEG, PNG o WebP.")).toBeVisible();
});


test("subir un video real genera el poster con el primer frame exacto", async ({ page }) => {
  await openBuilder(page);
  await selectHero(page);

  // Grabar un video real en el navegador: el primer frame es rojo puro y el
  // resto azul. Si el poster se captura "después del primer frame", el centro
  // del poster sale azul y el test falla.
  const recorded = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 360;
    canvas.height = 640;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Sin contexto 2d");
    const stream = canvas.captureStream(30);
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    recorder.start(100);
    const t0 = performance.now();
    while (performance.now() - t0 < 400) {
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 360, 640);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    context.fillStyle = "#0000ff";
    context.fillRect(0, 0, 360, 640);
    await new Promise((resolve) => setTimeout(resolve, 600));
    recorder.stop();
    await stopped;
    const blob = new Blob(chunks, { type: recorder.mimeType });
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });

  await page.getByRole("button", { name: "Subir video" }).click();
  await page
    .locator('input[type="file"][accept*="video/"]')
    .first()
    .setInputFiles({
      name: "primer-frame-rojo.webm",
      mimeType: "video/webm",
      buffer: Buffer.from(recorded),
    });
  // La subida termina cuando el botón vuelve a estar habilitado.
  await expect(page.getByRole("button", { name: "Subir video" })).toBeEnabled({
    timeout: 25_000,
  });

  // Leer el poster generado desde IndexedDB y decodificarlo en la página.
  const readPosterInfo = () =>
    page.evaluate(async () => {
      const open = indexedDB.open("solara-commerce-studio");
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      const transaction = db.transaction("projects", "readonly");
      const store = transaction.objectStore("projects");
      const all = await new Promise<
        Array<{
          project?: {
            videos?: Array<{ posterAssetId?: string }>;
            assets?: Array<{ id: string; source: string }>;
          };
        }>
      >((resolve) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result ?? []);
      });
      const record = all.find((item) => (item.project?.videos?.length ?? 0) > 0);
      const video = record?.project?.videos?.[0];
      const poster = record?.project?.assets?.find((asset) => asset.id === video?.posterAssetId);
      if (!poster) return null;
      const image = new Image();
      image.src = poster.source;
      await image.decode();
      const probe = document.createElement("canvas");
      probe.width = image.naturalWidth;
      probe.height = image.naturalHeight;
      const probeContext = probe.getContext("2d");
      if (!probeContext) return null;
      probeContext.drawImage(image, 0, 0);
      const center = probeContext.getImageData(
        Math.floor(image.naturalWidth / 2),
        Math.floor(image.naturalHeight / 2),
        1,
        1,
      ).data;
      return {
        width: image.naturalWidth,
        height: image.naturalHeight,
        center: Array.from(center),
      };
    });

  // El botón se habilita al terminar el procesamiento del inspector, pero el
  // autosave a IndexedDB tiene su propio debounce. Esperar el registro real
  // evita leer el snapshot anterior bajo carga de la suite.
  await expect.poll(readPosterInfo, { timeout: 30_000, intervals: [100, 250, 500] }).not.toBeNull();
  const posterInfo = await readPosterInfo();

  expect(posterInfo).not.toBeNull();
  expect(posterInfo?.width).toBe(360);
  expect(posterInfo?.height).toBe(640);
  const [red, green, blue] = posterInfo?.center ?? [];
  expect(red).toBeGreaterThan(200);
  expect(green).toBeLessThan(80);
  expect(blue).toBeLessThan(80);
});
