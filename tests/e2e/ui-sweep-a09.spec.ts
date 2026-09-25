/**
 * A09 — Barrido total de controles (2026-08-10): Overview restante + controles
 * guiados de modo avanzado y actualización de plantilla.
 *
 * Slice AUDIT (no se edita `features/Overview.tsx`; A7 es owner; los controles
 * guiados viven en `GuidedOverview.tsx`/`Studio.tsx` de A25/A14, acá se auditan
 * por contrato observable sin editar código).
 *
 * Contrato de 3 capas sobre cada control:
 *  (1) click/edición real → efecto en estado, datos o preview (no visible-only);
 *  (2) auto-feedback: aria-selected de la pestaña, aria-expanded de los
 *      acordeones, aria-checked de switches, aria-readonly, indicador de
 *      guardado (aria-live), disabled en límites de reorden;
 *  (3) datos: payload del campo → receptor en el proyecto autoservado
 *      (IndexedDB) y `origin.templateVersion` para la actualización.
 *
 * Bin A9: "Modo avanzado" (navega al Builder con modo avanzado), panel
 * "Respaldar y adoptar cambios" (aplica upgrade y persiste templateVersion),
 * secciones colapsables (estado marcado) y botones/campos restantes del
 * workspace de Resumen.
 */
import type { Server } from "node:http";
import { expect, type Page, test } from "@playwright/test";
import { createCleanStore, resetStudioIndexedDb } from "./project-helpers";
import { startStudioServer, stopStudioServer } from "./studio-server";

test.setTimeout(process.env.CI ? 90_000 : 45_000);

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

async function setupCleanStore(page: Page, name: string): Promise<void> {
  await resetStudioIndexedDb(page, studioUrl);
  await createCleanStore(page, name);
}

async function openStudioTab(page: Page, tab: string): Promise<void> {
  await page.getByRole("tab", { name: tab, exact: true }).click();
}

async function expectSaved(page: Page): Promise<void> {
  await expect(page.getByTestId("ui-save-indicator")).toContainText("Cambios guardados", {
    timeout: 5_000,
  });
}

/** Receptor del payload commiteado: el proyecto autoservado en IndexedDB. */
interface StoredProject {
  baseUrl?: string;
  slug?: string;
  origin?: { templateVersion?: number };
  identity?: { legalName?: string; phone?: string; address?: string };
  whatsapp?: { phone?: string; greeting?: string };
  navigation?: {
    showHome?: boolean;
    showSearch?: boolean;
    showCart?: boolean;
    items?: Array<{ children?: Array<{ label?: string; href?: string }> }>;
  };
  siteShell?: { announcement?: boolean; header?: boolean; footer?: boolean; cart?: boolean };
}

async function readStoredProject(page: Page, storeName: string): Promise<StoredProject | null> {
  return page.evaluate(
    ([name]) =>
      new Promise<StoredProject | null>((resolve, reject) => {
        const request = indexedDB.open("solara-commerce-studio");
        request.addEventListener("error", () => reject(request.error));
        request.addEventListener("success", () => {
          const db = request.result;
          const all = db.transaction("projects").objectStore("projects").getAll();
          all.addEventListener("success", () => {
            const records = all.result as Array<{ name: string; project: StoredProject }>;
            resolve(records.find((record) => record.name === name)?.project ?? null);
          });
          all.addEventListener("error", () => reject(all.error));
        });
      }),
    [storeName],
  );
}

/** Releer el proyecto persistido y esperar que cumpla el fragmento esperado. */
function expectStoredProject(page: Page, storeName: string, fragment: Partial<StoredProject>) {
  return expect
    .poll(async () => readStoredProject(page, storeName), { timeout: 15_000 })
    .toMatchObject(fragment);
}

async function seedTemplateVersion(page: Page, name: string, version: number): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          ([storeName, nextVersion]) =>
            new Promise<boolean>((resolve, reject) => {
              const request = indexedDB.open("solara-commerce-studio");
              request.addEventListener("error", () => reject(request.error));
              request.addEventListener("success", () => {
                const db = request.result;
                const transaction = db.transaction("projects", "readwrite");
                const store = transaction.objectStore("projects");
                const all = store.getAll();
                all.addEventListener("success", () => {
                  const records = all.result as Array<{
                    name: string;
                    project: { origin?: { templateVersion?: number } };
                  }>;
                  const record = records.find((item) => item.name === storeName);
                  if (!record) {
                    resolve(false);
                    return;
                  }
                  store.put({
                    ...record,
                    project: {
                      ...record.project,
                      origin: { ...(record.project.origin ?? {}), templateVersion: nextVersion },
                    },
                  });
                });
                all.addEventListener("error", () => reject(all.error));
                transaction.addEventListener("complete", () => resolve(true));
                transaction.addEventListener("error", () => reject(transaction.error));
              });
            }),
          [name, version],
        ),
      { timeout: 15_000, message: `No se encontró la tienda ${name} para sembrar la versión.` },
    )
    .toBe(true);
}

async function readTemplateVersion(page: Page, name: string): Promise<number | undefined> {
  const project = await readStoredProject(page, name);
  return (project?.origin as { templateVersion?: number } | undefined)?.templateVersion;
}

test("modo avanzado del guiado: navega al Constructor con la pestaña marcada y desprotege la estructura (capa 1+2+3)", async ({
  page,
}) => {
  await setupCleanStore(page, "Tienda modo avanzado");

  await openStudioTab(page, "Preparar");
  await expect(page.getByRole("heading", { name: "Preparar tienda" })).toBeVisible();

  // Auto-feedback previo: la pestaña Constructor no está seleccionada.
  const builderTab = page.getByRole("tab", { name: "Constructor", exact: true });
  await expect(builderTab).toHaveAttribute("aria-selected", "false");

  // Capa 1+2: el clic navega, marca la pestaña y abre el panel de edición.
  await page.getByRole("button", { name: "Modo avanzado" }).click();
  await expect(builderTab).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("[data-studio-editor-pane]")).toHaveAttribute("aria-hidden", "false");
  await expect(page.getByRole("heading", { name: "Constructor" })).toBeVisible();

  // Capa 1: el modo avanzado está activo (estructura desprotegida): el aviso de
  // base protegida no aparece y "Agregar sección" está habilitado en Home.
  await expect(page.getByText(/La estructura base está protegida/)).toHaveCount(0);
  await expect(
    page.getByText("Ordená secciones y cambiá su módulo sin alterar el contenido compatible."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Agregar sección" })).toBeEnabled();
});

test("el tab Constructor directo conserva la base protegida; el modo avanzado sólo llega del guiado (F13, contraste)", async ({
  page,
}) => {
  await setupCleanStore(page, "Tienda contraste modo");

  // Ir al Constructor con el tab (sin pasar por el guiado): base protegida.
  await openStudioTab(page, "Constructor");
  await expect(page.getByRole("heading", { name: "Constructor" })).toBeVisible();
  await expect(page.getByText(/La estructura base está protegida/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Agregar sección" })).toBeDisabled();

  // La pestaña del Constructor no activa el modo: la base protegida es el
  // default en tiendas limpias (F13). El modo llega del flujo guiado o del
  // botón "Desbloquear" del Constructor (contrato PT4, Opción A).
  await openStudioTab(page, "Preparar");
  await page.getByRole("button", { name: "Modo avanzado" }).click();
  await expect(page.getByRole("heading", { name: "Constructor" })).toBeVisible();
  await expect(page.getByText(/La estructura base está protegida/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Agregar sección" })).toBeEnabled();
});

test("Respaldar y adoptar cambios: respalda en descarga, actualiza y persiste templateVersion (capa 1+2+3)", async ({
  page,
}) => {
  const storeName = "Tienda actualizable A9";
  await setupCleanStore(page, storeName);

  // Una tienda recién creada está en la última versión: sin panel.
  await openStudioTab(page, "Preparar");
  await expect(page.getByText("Actualización disponible")).toHaveCount(0);

  // Sembrar una versión vieja de plantilla para que el plan tenga cambios.
  await seedTemplateVersion(page, storeName, 1);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
  const card = page.locator(".dashboard-store-card", { hasText: storeName });
  await expect(card.locator(".dashboard-store-card__button")).toBeVisible();
  await card.locator(".dashboard-store-card__button").click();
  await page
    .getByRole("region", { name: new RegExp(`Tienda seleccionada: ${storeName}`) })
    .getByRole("button", { name: "Abrir tienda", exact: true })
    .click();

  // Auto-feedback del panel: anuncia la versión destino.
  await openStudioTab(page, "Preparar");
  await expect(page.getByText("Actualización disponible")).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Catalog Modern 2$/ })).toBeVisible();

  // Capa 1+3: clic → descarga del respaldo + upgrade aplicado + persistido.
  const updateButton = page.getByRole("button", { name: "Respaldar y adoptar cambios" });
  const downloadPromise = page.waitForEvent("download");
  await updateButton.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/-antes-de-actualizar\.solara\.json$/);

  await expect(page.getByText("Actualización disponible")).toHaveCount(0, { timeout: 15_000 });
  await expect.poll(async () => readTemplateVersion(page, storeName), { timeout: 10_000 }).toBe(2);

  // Persistencia tras recargar: el panel no vuelve a aparecer.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
  const reopened = page.locator(".dashboard-store-card", { hasText: storeName });
  await expect(reopened.locator(".dashboard-store-card__button")).toBeVisible();
  await reopened.locator(".dashboard-store-card__button").click();
  await page
    .getByRole("region", { name: new RegExp(`Tienda seleccionada: ${storeName}`) })
    .getByRole("button", { name: "Abrir tienda", exact: true })
    .click();
  await openStudioTab(page, "Preparar");
  await expect(page.getByText("Actualización disponible")).toHaveCount(0);
});

test("Cerrar aviso de actualización lo descarta sin mutar la plantilla", async ({ page }) => {
  const storeName = "Tienda descarta actualización A9";
  await setupCleanStore(page, storeName);

  await openStudioTab(page, "Preparar");
  await seedTemplateVersion(page, storeName, 1);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
  const card = page.locator(".dashboard-store-card", { hasText: storeName });
  await card.locator(".dashboard-store-card__button").click();
  await page
    .getByRole("region", { name: new RegExp(`Tienda seleccionada: ${storeName}`) })
    .getByRole("button", { name: "Abrir tienda", exact: true })
    .click();
  await openStudioTab(page, "Preparar");

  const updatePanel = page.locator(".template-update");
  await expect(updatePanel).toBeVisible();
  await updatePanel
    .getByRole("button", { name: "Cerrar aviso de actualización", exact: true })
    .click();

  await expect(updatePanel).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Respaldar y adoptar cambios" })).toHaveCount(0);
  await expect.poll(async () => readTemplateVersion(page, storeName)).toBe(1);
});

test("los cinco acordeones del Resumen marcan su estado y pliegan su panel (capa 2)", async ({
  page,
}) => {
  await setupCleanStore(page, "Tienda acordeones A9");
  await openStudioTab(page, "Resumen");

  const sections = [
    ["identity", "Identidad"],
    ["whatsapp", "Pedido por WhatsApp"],
    ["domain", "Dominio"],
    ["navigation", "Navegación pública"],
    ["pages", "Páginas editoriales"],
  ] as const;

  for (const [key, label] of sections) {
    const toggle = page.getByRole("button", { name: new RegExp(`^${label}`) });
    const panel = page.locator(`[data-accordion-id="${key}"] .overview-accordion__panel`);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(panel).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(panel).toBeVisible();
  }
});

test("el estado plegado del Resumen sobrevive al cambio de pestaña", async ({ page }) => {
  await setupCleanStore(page, "Tienda acordeón persistente A9");
  await openStudioTab(page, "Resumen");

  const identityToggle = page.getByRole("button", { name: "Identidad", exact: true });
  const identityPanel = page.locator('[data-accordion-id="identity"] .overview-accordion__panel');
  await identityToggle.click();
  await expect(identityToggle).toHaveAttribute("aria-expanded", "false");
  await expect(identityPanel).toBeHidden();

  await openStudioTab(page, "Preparar");
  await openStudioTab(page, "Resumen");

  await expect(page.getByRole("button", { name: "Identidad", exact: true })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(
    page.locator('[data-accordion-id="identity"] .overview-accordion__panel'),
  ).toBeHidden();
});

test("campos restantes: razón social, teléfono, dirección, saludo, URL y slug (capa 1+2+3)", async ({
  page,
}) => {
  const storeName = "Tienda campos A9";
  await setupCleanStore(page, storeName);
  await openStudioTab(page, "Resumen");

  // Auto-feedback del badge de WhatsApp: "Pendiente" con teléfono vacío.
  const whatsappBadge = page.locator('[data-accordion-id="whatsapp"]');
  await expect(whatsappBadge.getByText("Pendiente", { exact: true })).toBeVisible();

  // Razón social, teléfono, dirección y saludo → rutas del schema.
  await page.getByLabel("Razón social", { exact: true }).fill("Razón Social A9 SRL");
  await page.getByLabel("Teléfono", { exact: true }).fill("1122334455");
  await page.getByLabel("Dirección", { exact: true }).fill("Av. Siempre Viva 742");
  await page
    .locator('[data-accordion-id="whatsapp"]')
    .getByLabel("Saludo del pedido", { exact: true })
    .fill("Hola, quiero este pedido:");
  await expectSaved(page);

  // Teléfono inválido: sin commit, error y badge "Revisar formato".
  const phoneInput = page.getByLabel("Número internacional", { exact: true });
  await phoneInput.fill("12");
  await expect(phoneInput).toHaveValue("12");
  await expect(page.getByTestId("ui-field-error")).toContainText(
    "Usá entre 8 y 15 dígitos con código de país y área.",
  );
  await expect(whatsappBadge.getByText("Revisar formato", { exact: true })).toBeVisible();

  // Teléfono válido: commitea y el badge pasa a "Formato correcto".
  await phoneInput.fill("5491123456789");
  await expect(whatsappBadge.getByText("Formato correcto", { exact: true })).toBeVisible();
  await expect(page.getByTestId("ui-field-error")).toHaveCount(0);

  // URL pública inválida: borrador conservado, error visible y sin commit.
  const initialProject = await readStoredProject(page, storeName);
  expect(initialProject?.baseUrl).toMatch(/^https?:\/\//);
  const urlInput = page.getByLabel("URL pública", { exact: true });
  await urlInput.fill("no es una url");
  await expect(page.getByTestId("ui-field-error")).toContainText(
    "Ingresá una URL válida con http(s).",
  );
  await expect(urlInput).toHaveValue("no es una url");
  expect((await readStoredProject(page, storeName))?.baseUrl).toBe(initialProject?.baseUrl);

  // URL válida: commitea y el error desaparece.
  await urlInput.fill("https://tienda-a9.example");
  await expect(page.getByTestId("ui-field-error")).toHaveCount(0);
  await expectStoredProject(page, storeName, { baseUrl: "https://tienda-a9.example" });

  // Slug interno: editable y validado como cualquier otro campo de identidad.
  const slugInput = page.getByLabel("Slug interno", { exact: true });
  const slugValue = await slugInput.inputValue();
  const editedSlug = `${slugValue}-editada`;
  await expect(slugInput).toBeEditable();
  await slugInput.fill(editedSlug);
  await expect(slugInput).toHaveValue(editedSlug);
  await expectStoredProject(page, storeName, { slug: editedSlug });

  // Capa 3: los cuatro campos de texto llegaron al proyecto autoservado.
  await expectStoredProject(page, storeName, {
    identity: {
      legalName: "Razón Social A9 SRL",
      phone: "1122334455",
      address: "Av. Siempre Viva 742",
    },
    whatsapp: { phone: "5491123456789", greeting: "Hola, quiero este pedido:" },
  });
});

test("switches restantes: navegación y shell commitean con aria-checked (capa 1+2+3)", async ({
  page,
}) => {
  const storeName = "Tienda switches A9";
  await setupCleanStore(page, storeName);
  await openStudioTab(page, "Resumen");

  const navSwitches = ["Mostrar Inicio", "Mostrar búsqueda", "Mostrar carrito"] as const;
  const shellSwitches = [
    "Mostrar barra informativa",
    "Mostrar encabezado",
    "Mostrar pie",
    "Mostrar carrito lateral",
  ] as const;

  for (const label of [...navSwitches, ...shellSwitches]) {
    const toggle = page.getByRole("switch", { name: label, exact: true });
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
  }

  await expectStoredProject(page, storeName, {
    navigation: { showHome: false, showSearch: false, showCart: false },
    siteShell: {
      announcement: false,
      header: false,
      footer: false,
      cart: false,
    },
  });

  // El estado marcado sobrevive al cambio de pestaña.
  await openStudioTab(page, "Preparar");
  await openStudioTab(page, "Resumen");
  for (const label of [...navSwitches, ...shellSwitches]) {
    await expect(page.getByRole("switch", { name: label, exact: true })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  }
});

test("subenlaces: alta, edición, reorden con límites y borrado confirmado (capa 1+2+3)", async ({
  page,
}) => {
  const storeName = "Tienda subenlaces A9";
  await setupCleanStore(page, storeName);
  await openStudioTab(page, "Resumen");

  // Alta de un enlace de catálogo para poder colgarle subenlaces.
  await page.getByRole("button", { name: "Añadir enlace de catálogo" }).click();
  const item = page.locator(".navigation-editor-item").first();
  await expect(item.getByLabel("Enlace 1", { exact: true })).toHaveValue("Nueva categoría");

  // Alta de subenlace: aparece "Subenlace 1" con su label por defecto.
  await item.getByRole("button", { name: "Añadir subenlace" }).click();
  const child = item.locator(".navigation-child-editor").first();
  const childLabel = child.getByLabel("Subenlace 1", { exact: true });
  await expect(childLabel).toHaveValue("Nuevo subenlace");

  // Un solo subenlace: ambos botones de reorden en límite (disabled).
  await expect(child.getByRole("button", { name: "Mover Nuevo subenlace arriba" })).toBeDisabled();
  await expect(child.getByRole("button", { name: "Mover Nuevo subenlace abajo" })).toBeDisabled();

  // Edición de label y destino válido (commit al salir del campo).
  await childLabel.fill("Colección de verano");
  const childDestination = child.getByLabel("Destino", { exact: true });
  await childDestination.fill("no es una url");
  await expect(child.getByTestId("ui-field-error")).toContainText("Usá http(s) o una ruta interna");
  await childDestination.fill("https://verano.ejemplo");
  await childDestination.press("Tab");

  // Segundo subenlace: el primero recupera "abajo" habilitado y reordena.
  await item.getByRole("button", { name: "Añadir subenlace" }).click();
  const firstChild = item.locator(".navigation-child-editor").nth(0);
  const secondChild = item.locator(".navigation-child-editor").nth(1);
  await expect(firstChild.getByLabel("Subenlace 1", { exact: true })).toHaveValue(
    "Colección de verano",
  );
  await firstChild.getByRole("button", { name: "Mover Colección de verano abajo" }).click();
  await expect(firstChild.getByLabel("Subenlace 1", { exact: true })).toHaveValue(
    "Nuevo subenlace",
  );
  await expect(secondChild.getByLabel("Subenlace 2", { exact: true })).toHaveValue(
    "Colección de verano",
  );
  await expect(
    secondChild.getByRole("button", { name: "Mover Colección de verano arriba" }),
  ).toBeEnabled();
  await secondChild.getByRole("button", { name: "Mover Colección de verano arriba" }).click();
  await expect(firstChild.getByLabel("Subenlace 1", { exact: true })).toHaveValue(
    "Colección de verano",
  );

  // El borrado del subenlace confirma el destino y conserva el foco.
  await secondChild.getByRole("button", { name: "Eliminar subenlace Nuevo subenlace" }).click();
  const childDeleteDialog = page.getByRole("dialog", {
    name: "Eliminar subenlace de navegación",
  });
  await expect(childDeleteDialog).toBeVisible();
  await expect(childDeleteDialog.locator(".confirm-dialog__body")).toContainText("Nuevo subenlace");
  await childDeleteDialog.getByRole("button", { name: "Eliminar subenlace", exact: true }).click();
  await expect(item.locator(".navigation-child-editor")).toHaveCount(1);

  // Capa 3: el subenlace commiteado llegó al proyecto autoservado.
  await expectStoredProject(page, storeName, {
    navigation: {
      items: [
        {
          children: [{ label: "Colección de verano", href: "https://verano.ejemplo" }],
        },
      ],
    },
  });
});

test("la barra de guardado del workspace refleja el estado real en pantallas chicas (capa 2)", async ({
  page,
}) => {
  await setupCleanStore(page, "Tienda barra guardado A9");
  // La barra sólo reemplaza al indicador del encabezado en viewports ≤ 560px.
  await page.setViewportSize({ width: 480, height: 800 });
  await openStudioTab(page, "Resumen");

  const savebar = page.getByTestId("ui-overview-savebar");
  await expect(savebar).toBeVisible();
  await expect(savebar.getByText("Cambios guardados", { exact: true })).toBeVisible();
  await expect(
    savebar.getByText("Los cambios se guardan automáticamente en tu máquina."),
  ).toBeVisible();

  await page.getByLabel("Razón social", { exact: true }).fill("Razón que ensucia la barra");
  await expect(savebar.getByText("Sin guardar", { exact: true })).toBeVisible();
  await expect(savebar.getByText("Cambios guardados", { exact: true })).toBeVisible({
    timeout: 5_000,
  });
});
