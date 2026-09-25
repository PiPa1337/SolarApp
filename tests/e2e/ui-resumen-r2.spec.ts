/**
 * Auditoría Resumen R2 (2026-08-10) — Pedido por WhatsApp: número internacional,
 * saludo del pedido y toggle "Incluir SKU".
 * Contrato de 4 capas (plan docs/superpowers/plans/2026-08-10-auditoria-resumen.md):
 * - funcional: editar → persiste (recarga de la app, respaldo IndexedDB);
 * - auto-feedback: sentinel tratado como vacío, badge Pendiente/Revisar
 *   formato/Formato correcto y error inline de 8-15 dígitos;
 * - datos: los tres valores quedan en el proyecto (inputs y preview);
 * - utilidad: diff del sitio exportado ANTES/DESPUÉS — data-whatsapp del
 *   <html>, URL wa.me real del checkout (runtime), fallback noscript del
 *   módulo y mensaje con SKU vs sin SKU.
 */
import { createServer, type Server } from "node:http";
import { expect, type Page, test } from "@playwright/test";
import { exportProject } from "@solara/exporter";
import { type StoreProjectV1, StoreProjectV1Schema } from "@solara/project-schema";
import { catalogModernStore } from "@solara/project-schema/catalog-modern-fixture";
import { createCleanStore, openMutableScaleStore, resetStudioIndexedDb } from "./project-helpers";
import { startStudioServer, stopStudioServer } from "./studio-server";

test.setTimeout(process.env.CI ? 150_000 : 90_000);

const EDITED_PHONE = "5492212345678";
const EDITED_GREETING = "Gracias por elegirnos, preparo mi pedido:";
const PRODUCT_PATH = "/productos/remera-esencial-de-algodon/";

// Sitio ANTES: tienda demo tal cual (número 5491123456789, saludo original,
// SKU incluido). Sitio DESPUÉS: número/saludo editados y SKU apagado. Un
// tercer export sólo con includeSku=false aísla el efecto del toggle.
const baselineExport = exportProject(structuredClone(catalogModernStore), {
  mode: "production",
});
const noSkuExport = exportProject(withWhatsapp({ includeSku: false }), { mode: "production" });
const editedExport = exportProject(
  withWhatsapp({ phone: EDITED_PHONE, greeting: EDITED_GREETING, includeSku: false }),
  { mode: "production" },
);

function withWhatsapp(overrides: Partial<StoreProjectV1["whatsapp"]>): StoreProjectV1 {
  return StoreProjectV1Schema.parse({
    ...structuredClone(catalogModernStore),
    whatsapp: { ...catalogModernStore.whatsapp, ...overrides },
  });
}

import { FIXTURE_PRODUCT_FILES } from "./fixture-server";

const fixtureFiles = FIXTURE_PRODUCT_FILES;
function createStaticServer(
  exported: ReturnType<typeof exportProject>,
): Promise<{ server: Server; url: string }> {
  return new Promise((resolveListening) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const requested = decodeURIComponent(url.pathname).replace(/^\/+/, "");
      const path =
        requested === ""
          ? "index.html"
          : requested.endsWith("/")
            ? `${requested}index.html`
            : requested;
      const content = exported.files.get(path) ?? fixtureFiles.get(path);

      if (content === undefined) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
        return;
      }

      const extension = path.split(".").pop();
      const contentType =
        extension === "html"
          ? "text/html; charset=utf-8"
          : extension === "css"
            ? "text/css; charset=utf-8"
            : extension === "js"
              ? "text/javascript; charset=utf-8"
              : extension === "xml"
                ? "application/xml; charset=utf-8"
                : extension === "png"
                  ? "image/png"
                  : "application/octet-stream";
      response.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" });
      response.end(content);
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        throw new Error("El servidor de pruebas no tiene una dirección TCP.");
      }
      resolveListening({ server, url: `http://127.0.0.1:${address.port}` });
    });
  });
}

let studioServer: Server;
let studioUrl: string;
let baselineServer: Server;
let baselineUrl: string;
let noSkuServer: Server;
let noSkuUrl: string;
let editedServer: Server;
let editedUrl: string;

test.beforeAll(async () => {
  const running = await startStudioServer();
  studioServer = running.server;
  studioUrl = running.url;
  const baseline = await createStaticServer(baselineExport);
  baselineServer = baseline.server;
  baselineUrl = baseline.url;
  const noSku = await createStaticServer(noSkuExport);
  noSkuServer = noSku.server;
  noSkuUrl = noSku.url;
  const edited = await createStaticServer(editedExport);
  editedServer = edited.server;
  editedUrl = edited.url;
});

test.afterAll(async () => {
  await stopStudioServer(studioServer);
  await new Promise<void>((resolveClosing) => baselineServer.close(() => resolveClosing()));
  await new Promise<void>((resolveClosing) => noSkuServer.close(() => resolveClosing()));
  await new Promise<void>((resolveClosing) => editedServer.close(() => resolveClosing()));
});

async function openResumenTab(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "Resumen", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Resumen" })).toBeVisible();
  await expect(page.locator('[data-accordion-id="whatsapp"]')).toBeVisible();
}

async function flushSave(page: Page): Promise<void> {
  await page.keyboard.press("Control+s");
  await expect(page.locator(".save-indicator")).toContainText("Guardado", { timeout: 30_000 });
}

function previewAttribute(page: Page, attribute: string): () => Promise<string | null> {
  return () =>
    page
      .frameLocator('iframe[title="Vista previa desktop"]')
      .locator("html")
      .getAttribute(attribute);
}

/** Flujo real de compra en el sitio exportado: carrito + checkout → popup wa.me. */
async function prepareWhatsAppOrder(page: Page, baseUrl: string): Promise<string> {
  await page.goto(`${baseUrl}${PRODUCT_PATH}`);
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  const drawer = page.locator("[data-cart-drawer]");
  await expect(drawer).toHaveAttribute("aria-hidden", "false");
  await drawer.locator("[data-cart-checkout-next]").click();
  await expect(drawer.locator("[data-checkout-form]")).toBeVisible();
  await drawer.getByLabel("Nombre").fill("Malena Ortiz");
  await drawer.getByLabel(/Telefono|Tel/).fill("11 5555 0142");
  await drawer.getByLabel(/Direccion|Direcci/).fill("Av. Forest 842, CABA");
  await drawer.getByLabel("Localidad").fill("CABA");
  await drawer.getByLabel(/Codigo postal|Código postal/).fill("1427");
  await page.evaluate(() => {
    const originalOpen = window.open.bind(window);
    window.open = ((url, target, features) => {
      document.documentElement.dataset.solaraWhatsappUrl = String(url ?? "");
      return originalOpen(url, target, features);
    }) as typeof window.open;
  });
  const whatsappPopupPromise = page.waitForEvent("popup");
  await drawer.getByRole("button", { name: "Continuar por WhatsApp" }).click();

  const whatsappPopup = await whatsappPopupPromise;
  await expect(page.locator("[data-whatsapp-link]")).toHaveCount(0);
  const url = await page.locator("html").getAttribute("data-solara-whatsapp-url");
  expect(url).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
  await whatsappPopup.close();
  return url ?? "";
}

test("sentinel: el número placeholder se muestra vacío con error y badge Pendiente", async ({
  page,
}) => {
  await resetStudioIndexedDb(page, studioUrl);
  await createCleanStore(page, "Tienda R2 sentinel");
  await openResumenTab(page);

  const section = page.locator('[data-accordion-id="whatsapp"]');
  const phoneInput = page.getByLabel("Número internacional");

  await expect(phoneInput).toHaveValue("");
  await expect(section).toContainText("Pendiente");
  await expect(section.getByTestId("ui-field-error")).toContainText(
    "Falta completar el número de WhatsApp.",
  );
});

test("validación 8-15 dígitos: badge y error inline cambian con cada estado", async ({ page }) => {
  await resetStudioIndexedDb(page, studioUrl);
  await createCleanStore(page, "Tienda R2 validación");
  await openResumenTab(page);

  const section = page.locator('[data-accordion-id="whatsapp"]');
  const phoneInput = page.getByLabel("Número internacional");

  await phoneInput.fill("123");
  await expect(section).toContainText("Revisar formato");
  await expect(section.getByTestId("ui-field-error")).toContainText(
    "Usá entre 8 y 15 dígitos con código de país y área.",
  );

  await phoneInput.fill(EDITED_PHONE);
  await expect(section).toContainText("Formato correcto");
  await expect(section.getByTestId("ui-field-error")).toHaveCount(0);
  await expect(phoneInput).toHaveValue(EDITED_PHONE);

  await phoneInput.fill("54911234567890123");
  await expect(section).toContainText("Revisar formato");

  await phoneInput.fill("12345678");
  await expect(section).toContainText("Formato correcto");
  await expect(section.getByTestId("ui-field-error")).toHaveCount(0);
  await expect(phoneInput).toHaveValue("12345678");
});

test("editar número y saludo: efecto real en preview y persistencia al recargar", async ({
  page,
}) => {
  await resetStudioIndexedDb(page, studioUrl);
  const editableStoreId = await openMutableScaleStore(page, "Tienda R2 editable");
  await openResumenTab(page);

  const section = page.locator('[data-accordion-id="whatsapp"]');
  const phoneInput = page.getByLabel("Número internacional");
  const greetingInput = section.getByLabel("Saludo del pedido", { exact: true });

  // La plantilla Predeterminado es inmutable; la copia mutable empieza sin
  // teléfono para que el flujo pruebe una edición real del proyecto.
  await phoneInput.fill("5491123456789");
  await expect(phoneInput).toHaveValue("5491123456789");
  await expect(section).toContainText("Formato correcto");
  await expect(greetingInput).toHaveValue("Hola Predeterminado, quiero hacer este pedido:");
  await expect(page.getByRole("switch", { name: "Incluir SKU en el mensaje" })).toHaveCount(0);

  await phoneInput.fill(EDITED_PHONE);
  await greetingInput.fill(EDITED_GREETING);

  // El preview usa el mismo renderer que la exportación: número y saludo
  // cambian sus atributos, mientras el flag legacy de SKU ya no se publica.
  await expect
    .poll(previewAttribute(page, "data-whatsapp"), { timeout: 15_000 })
    .toBe(EDITED_PHONE);
  await expect
    .poll(previewAttribute(page, "data-whatsapp-greeting"), { timeout: 15_000 })
    .toBe(EDITED_GREETING);
  await expect
    .poll(previewAttribute(page, "data-whatsapp-include-sku"), { timeout: 15_000 })
    .toBeNull();

  await flushSave(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
  await page.locator(`[data-store-card-id="${editableStoreId}"]`).click();
  await page.getByRole("button", { name: "Abrir tienda", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible({
    timeout: 30_000,
  });
  await openResumenTab(page);

  await expect(page.getByLabel("Número internacional")).toHaveValue(EDITED_PHONE);
  await expect(section.getByLabel("Saludo del pedido", { exact: true })).toHaveValue(
    EDITED_GREETING,
  );
  await expect(page.getByRole("switch", { name: "Incluir SKU en el mensaje" })).toHaveCount(0);
});

test("utilidad: el número y el saludo editados llegan al sitio exportado (diff ANTES/DESPUÉS)", async ({
  page,
}) => {
  const beforeHome = String(baselineExport.files.get("index.html"));
  const afterHome = String(editedExport.files.get("index.html"));

  expect(beforeHome).toContain('data-whatsapp="5491123456789"');
  expect(beforeHome).toContain(
    'data-whatsapp-greeting="Hola Tienda Referencia, quiero hacer este pedido:"',
  );
  expect(beforeHome).not.toContain("data-whatsapp-include-sku=");
  expect(afterHome).toContain(`data-whatsapp="${EDITED_PHONE}"`);
  expect(afterHome).toContain(`data-whatsapp-greeting="${EDITED_GREETING}"`);
  expect(afterHome).not.toContain("data-whatsapp-include-sku=");

  // JSON-LD del negocio: `telephone` prefiere el número de WhatsApp y cae al
  // de identidad (hallazgo R2-1, resuelto en Ola 3: exporter storeStructuredData).
  // ANTES ambos coinciden en la demo; DESPUÉS el JSON-LD adopta el número nuevo.
  const jsonLd = (html: string): unknown[] =>
    [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((match) => JSON.parse(match[1] ?? "{}"))
      .filter((entry): entry is Record<string, unknown> => typeof entry === "object");
  const beforeStore = jsonLd(beforeHome).find((entry) => entry["@type"] === "OnlineStore");
  const afterStore = jsonLd(afterHome).find((entry) => entry["@type"] === "OnlineStore");
  expect(beforeStore?.telephone).toBe("5491123456789");
  expect(afterStore?.telephone).toBe(EDITED_PHONE);

  // Fallback noscript del módulo de producto: saludo y número editados.
  const beforeProduct = String(
    baselineExport.files.get("productos/remera-esencial-de-algodon/index.html"),
  );
  const afterProduct = String(
    editedExport.files.get("productos/remera-esencial-de-algodon/index.html"),
  );
  const waLinks = (html: string): string[] =>
    [...html.matchAll(/href="(https:\/\/wa\.me\/[^"]+)"/g)].map((match) => match[1] ?? "");
  const beforeFallback = waLinks(beforeProduct).find((href) =>
    href.startsWith("https://wa.me/5491123456789?text="),
  );
  const afterFallback = waLinks(afterProduct).find((href) =>
    href.startsWith(`https://wa.me/${EDITED_PHONE}?text=`),
  );
  expect(beforeFallback).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
  expect(afterFallback).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
  expect(decodeURIComponent(afterFallback ?? "")).toContain(EDITED_GREETING);
  expect(decodeURIComponent(afterFallback ?? "")).toContain("Producto: Remera esencial de algodón");
  expect(decodeURIComponent(afterFallback ?? "")).not.toContain("[MS-001-NE-S]");

  // URL wa.me del checkout generada por el runtime con el número y el saludo nuevos.
  const href = await prepareWhatsAppOrder(page, editedUrl);
  expect(href).toContain(`https://wa.me/${EDITED_PHONE}?text=`);
  const message = decodeURIComponent(href);
  expect(message).toContain(EDITED_GREETING);
  expect(message).toContain("- Remera esencial de algodon (Negro / S) = $");
  expect(message).not.toContain("[MS-001-NE-S]");
});

test("utilidad: includeSku queda tolerado pero el runtime omite el SKU siempre", async ({
  page,
}) => {
  const withSkuHref = await prepareWhatsAppOrder(page, baselineUrl);
  const withoutSkuHref = await prepareWhatsAppOrder(page, noSkuUrl);

  expect(withSkuHref).toContain("https://wa.me/5491123456789?text=");
  expect(withoutSkuHref).toContain("https://wa.me/5491123456789?text=");

  const withSkuMessage = decodeURIComponent(withSkuHref);
  const withoutSkuMessage = decodeURIComponent(withoutSkuHref);
  expect(withSkuMessage).toContain("Hola Tienda Referencia, quiero hacer este pedido:");
  expect(withSkuMessage).toContain("- Remera esencial de algodon (Negro / S) = $");
  expect(withSkuMessage).not.toContain("[MS-001-NE-S]");
  expect(withoutSkuMessage).not.toContain("[MS-001-NE-S]");
  expect(withoutSkuMessage).toContain("- Remera esencial de algodon (Negro / S) = $");

  // El campo legacy puede diferir en proyectos persistidos, pero el mensaje ya no depende de él.
  expect(withSkuMessage).toBe(withoutSkuMessage);
});
