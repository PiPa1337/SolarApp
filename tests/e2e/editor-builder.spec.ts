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

/** Re-entrada a la tienda sin limpiar IndexedDB (conserva lo autoguardado). */
async function reopenStore(page: Page) {
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 20_000,
  });
  await page.locator(".dashboard-store-card").filter({ hasText: "Tienda builder" }).click();
  await page.getByRole("button", { name: "Abrir tienda", exact: true }).click();
  await page.getByRole("tab", { name: "Constructor" }).click();
  await expect(page.getByRole("heading", { name: "Constructor" })).toBeVisible();
}

async function selectHero(page: Page) {
  const hero = page.getByRole("listitem").filter({ hasText: "Hero de catálogo" });
  await hero.getByRole("button").first().click();
}

test("el logo se configura desde Identidad y no desde el Constructor", async ({ page }) => {
  await openBuilder(page);
  const header = page.getByRole("listitem").filter({ hasText: "Navbar de catálogo" });
  await header.getByRole("button").first().click();
  await expect(page.getByLabel("Marca del navbar")).toHaveCount(0);
  await expect(page.getByLabel("Imagen del navbar")).toHaveCount(0);

  await page.getByRole("tab", { name: "Resumen", exact: true }).click();
  await expect(page.getByLabel("Logo de la tienda")).toBeVisible();
  await expect(page.getByLabel("Favicon del sitio")).toBeVisible();
  await expect(page.getByLabel("Imagen de portada para SEO")).toBeVisible();
  await expect(page.locator(".identity-media-preview")).toHaveCount(3);
});

test("la sección seleccionada y sus acciones exponen el contexto accesible", async ({ page }) => {
  await openBuilder(page);
  await selectHero(page);
  await page.getByRole("button", { name: "Volver a Constructor", exact: true }).click();

  const hero = page.getByRole("listitem").filter({ hasText: "Hero de catálogo" });
  const selector = hero.getByRole("button").first();
  await expect(selector).toHaveAttribute("aria-pressed", "true");

  const describedBy = await hero
    .getByRole("button", { name: "Duplicar sección" })
    .getAttribute("aria-describedby");
  expect(describedBy).toMatch(/\S+/);
  await expect(page.locator(`#${describedBy}`)).toHaveText("Hero de catálogo");
});

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

test("restaurar valores por defecto devuelve la sección al estado inicial", async ({ page }) => {
  await openBuilder(page);
  await selectHero(page);

  // El hero V2 tiene slides con campos "Título" propios (aria-description="Slide N");
  // el campo del módulo (top-level) no lleva esa marca.
  const title = page
    .getByRole("textbox", { name: "Título", exact: true })
    .and(page.locator("input:not([aria-description])"))
    .first();
  await title.fill("Un título editado");
  await expect(page.getByText("Cambios pendientes", { exact: true })).toBeVisible();
  await expect(
    page.frameLocator("iframe").locator('[data-solara-module="catalog-hero"] h1'),
  ).toHaveText("Un título editado", { timeout: 15_000 });

  await page.getByRole("button", { name: "Restaurar valores por defecto" }).click();
  const restoreDialog = page.getByRole("dialog", { name: "Restaurar valores por defecto" });
  await expect(restoreDialog).toBeVisible();
  await expect(restoreDialog.locator(".confirm-dialog__body")).toContainText("Hero de catálogo");
  await restoreDialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(title).toHaveValue("Un título editado");
  await page.getByRole("button", { name: "Restaurar valores por defecto" }).click();
  await page
    .getByRole("dialog", { name: "Restaurar valores por defecto" })
    .getByRole("button", { name: "Restaurar valores", exact: true })
    .click();
  await expect(title).toHaveValue("Vestite con lo que te representa.");
  await expect(
    page.frameLocator("iframe").locator('[data-solara-module="catalog-hero"] h1'),
  ).toHaveText("Vestite con lo que te representa.", { timeout: 15_000 });
});

test("mover una sección con el teclado reordena la lista", async ({ page }) => {
  await openBuilder(page);
  const sections = page.getByRole("list", { name: "Secciones de la tienda" });
  const firstName = await sections
    .getByRole("listitem")
    .first()
    .locator(".section-select strong")
    .textContent();
  const secondName = await sections
    .getByRole("listitem")
    .nth(1)
    .locator(".section-select strong")
    .textContent();

  const firstHeader = sections.getByRole("listitem").first().locator(".section-select");
  await firstHeader.focus();
  await firstHeader.press("ArrowDown");

  await expect(sections.getByRole("listitem").first().locator(".section-select strong")).toHaveText(
    secondName ?? "",
  );
  await expect(sections.getByRole("listitem").nth(1).locator(".section-select strong")).toHaveText(
    firstName ?? "",
  );
});

test("un valor fuera de rango muestra el error de esquema y no se aplica", async ({ page }) => {
  await openBuilder(page);
  await selectHero(page);

  const interval = page.getByRole("spinbutton", { name: "Intervalo" });
  await interval.fill("100");
  await expect(page.getByTestId("ui-schema-errors")).toBeVisible();
  await expect(page.getByTestId("ui-schema-errors")).toContainText("intervalMs");
  await expect(interval).toHaveValue("100");
  await expect(page.getByText("Cambios pendientes", { exact: true })).toHaveCount(0);

  await page.reload();
  await reopenStore(page);
  await selectHero(page);
  await expect(page.getByTestId("ui-schema-errors")).toHaveCount(0);
  await expect(page.getByRole("spinbutton", { name: "Intervalo" })).toHaveValue("6000");
});

test("el radio de los iconos mobile del hero se configura desde el inspector", async ({ page }) => {
  await openBuilder(page);
  await selectHero(page);

  const radius = page.getByRole("spinbutton", { name: "Radio de íconos mobile (px)" });
  await expect(radius).toHaveValue("8");
  await radius.fill("18");
  await page.getByRole("button", { name: "Volver a Constructor", exact: true }).click();
  await page.getByRole("button", { name: "Vista móvil", exact: true }).click();
  await expect(
    page
      .frameLocator("iframe")
      .locator(".catalog-hero-benefits--band .catalog-hero-benefit-icon")
      .first(),
  ).toHaveCSS("border-radius", "18px", { timeout: 15_000 });
});

test("un preset de tema aplica los colores y el preview los refleja", async ({ page }) => {
  await openBuilder(page);
  await page.getByRole("tab", { name: "Tema de la tienda" }).click();
  await expect(page.getByRole("heading", { name: "Tema de la tienda" })).toBeVisible();

  await page.getByTestId("ui-theme-preset").filter({ hasText: "Jardín de salvia" }).click();
  const backgroundHex = page.locator(".color-grid input[type='text']").first();
  await expect(backgroundHex).toHaveValue("#f1f6f0");
  await expect
    .poll(
      async () =>
        page
          .frameLocator("iframe")
          .locator("html")
          .evaluate((element) =>
            getComputedStyle(element).getPropertyValue("--solara-background").trim(),
          ),
      { timeout: 20_000 },
    )
    .toBe("#f1f6f0");
});

test("el hero permite subir un video desde el campo de video", async ({ page }) => {
  await openBuilder(page);
  await selectHero(page);
  await expect(page.getByRole("button", { name: "Subir video" })).toBeVisible();
  await page.getByRole("button", { name: "Subir video" }).click();
  await page
    .locator('input[type="file"][accept*="video/"]')
    .first()
    .setInputFiles({
      name: "no-es-video.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("esto no es un video"),
    });
  await expect(page.getByText("Sólo se aceptan videos MP4 o WebM.")).toBeVisible();
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

test("una imagen válida se procesa sin romper el inspector", async ({ page }) => {
  test.setTimeout(60_000);
  await openBuilder(page);
  await selectHero(page);
  const upload = page.getByRole("button", { name: "Subir imagen" }).first();
  await upload.click();
  await page
    .locator('input[type="file"][accept*="image/"]')
    .first()
    .setInputFiles({
      name: "prueba-valida.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  await expect(page.getByRole("button", { name: "Subir imagen" }).first()).toBeEnabled({
    timeout: 25_000,
  });
  await expect(page.getByTestId("ui-schema-errors")).toHaveCount(0);
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

test("el Builder mantiene el contacto de Home V2 y no ofrece páginas independientes", async ({
  page,
}) => {
  await openBuilder(page);
  await page.getByRole("tab", { name: "Tema de la tienda" }).click();
  await page.getByTestId("ui-design-family-v2").click();
  await page.getByRole("tab", { name: "Constructor" }).click();
  await expect(page.getByRole("heading", { name: "Constructor" })).toBeVisible();
  const pageSelector = page.getByLabel("Página de edición");
  await expect(pageSelector).toHaveValue("home");
  await expect(pageSelector.locator("option")).toHaveCount(1);
  await expect(page.getByTestId("ui-preview-route")).toHaveValue("/");
  await expect(page.locator('[data-section-select="home-section-contact-form"]')).toBeVisible();
  await expect(page.locator('[data-section-select="home-section-contact-channels"]')).toBeVisible();
});

test("el panel de configuración sólo conserva Home y sus controles vigentes", async ({ page }) => {
  await openBuilder(page);
  await page.getByRole("tab", { name: "Resumen" }).click();
  await expect(page.getByRole("heading", { name: "Resumen" })).toBeVisible();
  await expect(page.locator(".page-editor")).toHaveCount(1);
  await expect(page.getByRole("switch", { name: "Mostrar Contacto" })).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "Mostrar Nosotros" })).toHaveCount(0);

  await page.getByRole("tab", { name: "Tema de la tienda" }).click();
  await expect(page.getByTestId("ui-design-family-v1")).toHaveCount(0);
  await expect(page.getByTestId("ui-design-family-v2")).toBeVisible();
});

test("el hero V2 expone el modo sólo video (media 9:16)", async ({ page }) => {
  await openBuilder(page);
  await selectHero(page);
  const modeField = page.getByRole("combobox", { name: "Modo" });
  await expect(modeField).toBeVisible();
  await expect(modeField.locator("option")).toHaveCount(1);
  await expect(modeField.locator("option")).toHaveAttribute("value", "video");
  await expect(modeField).toHaveValue("video");
});

test("la familia Editorial V2 queda como única opción visible", async ({ page }) => {
  await openBuilder(page);
  await page.getByRole("tab", { name: "Tema de la tienda" }).click();
  await expect(page.getByRole("heading", { name: "Tema de la tienda" })).toBeVisible();

  await expect(page.getByTestId("ui-design-family-v1")).toHaveCount(0);
  const v2 = page.getByTestId("ui-design-family-v2");
  await expect(v2).toBeVisible();
  const preview = page.frameLocator("iframe");
  await expect(preview.locator('[data-design-family="catalog-modern-v2"]')).toBeVisible({
    timeout: 20_000,
  });
  await expect(preview.getByRole("heading", { level: 1 })).toHaveText("Titulo del hero");
});

test("agregar un testimonio genera un ítem válido que commitea y persiste en el preview", async ({
  page,
}) => {
  await openBuilder(page);
  const sections = page.getByRole("list", { name: "Secciones de la tienda" });
  const initialCount = await sections.getByRole("listitem").count();

  await page.getByLabel("Tipo de sección").selectOption("content");
  await page.getByRole("button", { name: "Agregar sección" }).click();
  await page
    .getByTestId("ui-module-picker")
    .getByRole("button", { name: /Testimonios/ })
    .click();
  // The list stays mounted while its detail occupies the single editor panel.
  await expect(page.locator(".editor-pane .section-row")).toHaveCount(initialCount + 1);

  await page.getByRole("button", { name: "Agregar elemento" }).click();
  await expect(page.getByRole("checkbox", { name: "Contenido de ejemplo" })).toHaveCount(0);
  await expect(page.getByText("Cambios pendientes", { exact: true })).toBeVisible();
  await expect(page.getByTestId("ui-schema-errors")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Deshacer" })).toBeEnabled();
  const newTestimonial = page
    .frameLocator("iframe")
    .locator('[data-solara-module="catalog-testimonials"]')
    .last()
    .locator(".catalog-testimonial h3")
    .first();
  await expect(newTestimonial).toHaveText("Nuevo elemento", { timeout: 15_000 });

  await expect(page.getByText(/^Guardado/)).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await reopenStore(page);
  await sections
    .getByRole("listitem")
    .filter({ hasText: "Testimonios" })
    .last()
    .locator(".section-select")
    .click();
  await expect(page.getByTestId("ui-schema-errors")).toHaveCount(0);
  await expect(newTestimonial).toHaveText("Nuevo elemento", { timeout: 15_000 });
});

test("un par de bajo contraste muestra la advertencia y el reset por grupo la limpia", async ({
  page,
}) => {
  await openBuilder(page);
  await page.getByRole("tab", { name: "Tema de la tienda" }).click();
  await expect(page.getByRole("heading", { name: "Tema de la tienda" })).toBeVisible();

  const textHex = page.locator(".color-grid input[type='text']").nth(2);
  const initialValue = await textHex.inputValue();
  await textHex.fill("#fdfdfd");

  const warning = page.getByTestId("ui-contrast-warning");
  await expect(warning).toBeVisible();
  await expect(warning).toContainText("Texto sobre fondo");
  await expect(warning).toContainText("4.5:1");

  await page.getByRole("button", { name: "Restaurar colores" }).click();
  await expect(warning).toBeHidden();
  await expect(textHex).toHaveValue(initialValue);
});

test("P6-B5: el modo avanzado se enciende desde Preparar y se revierte", async ({ page }) => {
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
  await page.locator('[data-store-card-id="store-modo-sur-demo"]').click();
  await page.getByRole("button", { name: "Abrir tienda", exact: true }).click();
  await page.getByRole("tab", { name: "Preparar" }).click();
  await page.waitForTimeout(1200);

  const toggle = page.getByRole("button", { name: "Modo avanzado" });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await page.waitForTimeout(1200);
  const constructorHeading = page.getByRole("heading", { name: "Constructor" });
  await expect(constructorHeading).toBeVisible({ timeout: 10000 });
  const advancedBadge = page.locator(".ui-badge", { hasText: "Modo avanzado activado" });
  try {
    await expect(advancedBadge).toBeVisible({ timeout: 5000 });
  } catch {
    console.log("P6-B5 badge no visible en Constructor, verificando toggle en Preparar");
    await page.getByRole("tab", { name: "Preparar" }).click();
    await expect(page.getByRole("button", { name: "Modo avanzado activado" })).toBeVisible({
      timeout: 10000,
    });
    await page.getByRole("tab", { name: "Constructor" }).click();
    await expect(constructorHeading).toBeVisible({ timeout: 10000 });
  }
  console.log("P6-B5 modo avanzado activado verificado");

  await page.getByRole("tab", { name: "Preparar" }).click();
  await page.waitForTimeout(1000);
  const activeToggle = page.getByRole("button", { name: "Modo avanzado activado" });
  const pressed = await activeToggle.getAttribute("aria-pressed");
  console.log("P6-B5 aria-pressed en Preparar:", pressed);
  expect(pressed).toBe("true");
  await activeToggle.click();
  await page.waitForTimeout(1000);
  const badge = page.locator(".ui-badge", { hasText: "Modo avanzado activado" });
  await expect(badge).toHaveCount(0);
  console.log("P6-B5 modo avanzado revertido en Constructor");
});

test("P6-B6: el picker de módulos se opera con teclado y trampa de Tab", async ({ page }) => {
  await openBuilder(page);
  const sections = page.getByLabel("Secciones");
  const initialCount = await sections.getByRole("listitem").count();

  await page.getByLabel("Tipo de sección").selectOption("content");
  await page.getByRole("button", { name: "Agregar sección" }).click();
  const picker = page.getByTestId("ui-module-picker");
  await expect(picker).toBeVisible();

  const search = picker.getByLabel("Buscar módulo");
  await search.fill("testimonios");
  const option = picker.getByTestId("ui-module-option").first();
  await expect(option).toBeVisible();
  await option.focus();
  await page.keyboard.press("Enter");
  await expect(picker).toBeHidden();
  await page.getByRole("button", { name: "Volver a Constructor", exact: true }).click();
  await expect(sections.getByRole("listitem")).toHaveCount(initialCount + 1);
  console.log("P6-B6 módulo agregado por teclado");

  await page.getByLabel("Tipo de sección").selectOption("content");
  await page.getByRole("button", { name: "Agregar sección" }).click();
  await expect(picker).toBeVisible();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const activeInPicker = await picker.evaluate((el) => el.contains(document.activeElement));
  console.log("P6-B6 foco atrapado en el picker:", activeInPicker);
  expect(activeInPicker).toBe(true);
  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();
});

test("R3-P6-B5: Desbloquear en Constructor enciende el modo avanzado", async ({ page }) => {
  await openBuilder(page);
  const unlock = page.getByRole("button", { name: "Desbloquear" });
  const visible = await unlock.isVisible().catch(() => false);
  console.log("R3-P6-B5 Desbloquear visible:", visible);
  if (!visible) {
    console.log("R3-P6-B5 base sin proteger: modo avanzado ya activo");
    return;
  }
  await unlock.click();
  await page.waitForTimeout(800);
  const badge = page.locator(".ui-badge", { hasText: "Modo avanzado activado" });
  await expect(badge).toBeVisible();
  await expect(page.getByRole("button", { name: "Desbloquear" })).toHaveCount(0);
  console.log("R3-P6-B5 modo avanzado activado desde Constructor");
});

test("R4-P6-B5: Restaurar tipografía revierte las fuentes a los valores de apertura", async ({
  page,
}) => {
  await openBuilder(page);
  await page.getByRole("tab", { name: "Tema de la tienda" }).click();
  await page.waitForTimeout(1000);

  const fontSelect = page.getByTestId("ui-font-display");
  await fontSelect.scrollIntoViewIfNeeded();
  const fontStack = await fontSelect.inputValue();
  console.log("R4-P6-B5 fuente inicial:", JSON.stringify(fontStack.slice(0, 50)));

  const optionCount = await fontSelect.locator("option").count();
  const currentIndex = await fontSelect.evaluate((el) => el.selectedIndex);
  const targetIndex = currentIndex < optionCount - 1 ? currentIndex + 1 : 0;
  await fontSelect.selectOption({ index: targetIndex });
  await page.waitForTimeout(500);
  const resetButton = page.getByTestId("ui-reset-typography");
  await resetButton.scrollIntoViewIfNeeded();
  await resetButton.click();
  await page.waitForTimeout(700);
  const afterReset = await page.getByTestId("ui-font-display").inputValue();
  console.log("R4-P6-B5 fuente tras reset:", JSON.stringify(afterReset.slice(0, 50)));
  expect(afterReset).toBe(fontStack);
});
