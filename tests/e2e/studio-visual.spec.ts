import { createServer, type Server } from "node:http";
import { expect, type Page, test } from "@playwright/test";
import { exportProject } from "@solara/exporter";
import { referenceStore } from "@solara/project-schema/fixture";
import { createCleanStore } from "./project-helpers";
import { startStudioServer, stopStudioServer } from "./studio-server";

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile", width: 390, height: 844 },
] as const;

let studioServer: Server;
let studioUrl: string;
let storefrontServer: Server;
let storefrontUrl: string;

test.beforeAll(async () => {
  const studio = await startStudioServer();
  studioServer = studio.server;
  studioUrl = studio.url;

  const exported = exportProject(referenceStore, { mode: "production" });
  storefrontServer = createServer((request, response) => {
    const requested = decodeURIComponent(
      new URL(request.url ?? "/", "http://localhost").pathname,
    ).replace(/^\/+/, "");
    const path =
      requested === ""
        ? "index.html"
        : requested.endsWith("/")
          ? `${requested}index.html`
          : requested;
    const content = exported.files.get(path);
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
            : extension === "png"
              ? "image/png"
              : "application/octet-stream";
    response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": contentType });
    response.end(content);
  });
  await new Promise<void>((done) => storefrontServer.listen(0, "127.0.0.1", done));
  const address = storefrontServer.address();
  if (!address || typeof address === "string") throw new Error("Puerto de storefront inválido.");
  storefrontUrl = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await stopStudioServer(studioServer);
  await new Promise<void>((done, reject) => {
    storefrontServer.close((error) => (error ? reject(error) : done()));
  });
});

async function expectNoHorizontalOverflow(page: Page, context: string) {
  await expect
    .poll(
      () =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        ),
      { message: `${context} no debe desbordar horizontalmente` },
    )
    .toBe(true);
}

async function openProject(page: Page) {
  await page.goto(studioUrl);
  await createCleanStore(page, "Tienda visual");
}

test("dashboard responde en desktop, tablet y móvil", async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto(studioUrl);
    await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
    await expectNoHorizontalOverflow(page, `Dashboard ${viewport.name}`);
    if (viewport.name === "desktop") {
      await page.screenshot({ path: "test-results/dashboard.png", fullPage: true });
    }
  }
});

test("las portadas conservan su encuadre y el hover anima la card", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(studioUrl);

  const card = page.locator(".dashboard-store-card").filter({ hasText: "Predeterminado" }).first();
  const heroImage = card.locator(".dashboard-store-card__hero img");
  await expect(heroImage).toHaveCount(1);
  await expect
    .poll(() => heroImage.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await expect(heroImage).toHaveCSS("object-fit", "contain");
  await expect(heroImage).toHaveCSS("transform", "none");

  const beforeHover = await card.evaluate((element) => getComputedStyle(element).transform);
  await card.hover();
  await expect
    .poll(() => card.evaluate((element) => getComputedStyle(element).transform))
    .not.toBe(beforeHover);
});

test("la card libera el rail de acciones y el detalle conserva sus controles", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(studioUrl);

  const card = page.locator(".dashboard-store-card").filter({ hasText: "Predeterminado" }).first();
  const index = card.locator(".dashboard-store-card__index");
  await expect(index).toHaveText("1");
  await expect(card.locator(".dashboard-store-card__status.is-active")).toHaveCount(0);
  await expect(card.locator(".dashboard-store-card__actions")).toHaveCount(0);
  await expect(card.locator(".dashboard-store-card__pin")).toHaveCount(0);
  await expect(card.locator(".dashboard-store-card__open")).toHaveCount(0);

  const layout = await card.evaluate((element) => {
    const rect = (selector: string) => {
      const node = element.querySelector<HTMLElement>(selector);
      if (!node) throw new Error(`Falta ${selector}`);
      const bounds = node.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom };
    };
    const indexElement = element.querySelector<HTMLElement>(".dashboard-store-card__index");
    const titleElement = element.querySelector<HTMLElement>("strong");
    if (!indexElement || !titleElement) throw new Error("Faltan los textos de la card");
    const indexStyle = getComputedStyle(indexElement);
    const titleStyle = getComputedStyle(titleElement);
    return {
      card: rect(".dashboard-store-card__button"),
      mark: rect(".dashboard-store-card__mark"),
      titlePadding: titleStyle.paddingInline,
      indexColor: indexStyle.color,
      indexShadow: indexStyle.textShadow,
    };
  });

  expect(layout.titlePadding).toBe("8px");
  expect(layout.indexColor).toBe("rgb(255, 255, 255)");
  expect(layout.indexShadow).toContain("1px 1px");
  expect(layout.indexShadow).toContain("rgb(0, 0, 0)");

  await card.locator(".dashboard-store-card__button").click();
  const detail = page.getByRole("region", { name: /Tienda seleccionada:/ });
  await expect(detail.getByTestId("ui-detail-pin")).toBeVisible();
  const detailLayout = await detail.evaluate((element) => {
    const pin = element.querySelector<HTMLElement>('[data-testid="ui-detail-pin"]');
    const close = element.querySelector<HTMLElement>('[aria-label="Cerrar detalle"]');
    if (!pin || !close) throw new Error("Faltan los controles del encabezado del detalle");
    return {
      pinRight: pin.getBoundingClientRect().right,
      closeLeft: close.getBoundingClientRect().left,
    };
  });
  expect(detailLayout.pinRight).toBeLessThanOrEqual(detailLayout.closeLeft);
});

test("tres cards con portadas no desbordan la grilla", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(studioUrl);

  await createCleanStore(page, "Tienda de proporción A");
  await page.getByRole("button", { name: "Volver a tiendas", exact: true }).click();
  await createCleanStore(page, "Tienda de proporción B");
  await page.getByRole("button", { name: "Volver a tiendas", exact: true }).click();

  const grid = page.locator(".dashboard-cosmic-store-grid");
  await expect(grid.locator(".dashboard-store-card")).toHaveCount(3);
  const layout = await grid.evaluate((element) => {
    const gridRect = element.getBoundingClientRect();
    const cards = [...element.querySelectorAll<HTMLElement>(".dashboard-store-card")].map(
      (card) => {
        const rect = card.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      },
    );
    return {
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      gridRight: gridRect.right,
      cards,
    };
  });

  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
  expect(Math.max(...layout.cards.map((card) => card.right))).toBeLessThanOrEqual(
    layout.gridRight + 1,
  );
});

test("dashboard cosmic muestra datos reales y creación guiada", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(studioUrl);
  const logo = page.locator(".app-wordmark__logo");
  await expect(logo).toHaveAttribute("src", /solara-orbit-64/);
  await expect
    .poll(() => logo.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  const activeProductsStat = page.locator(".dashboard-cosmic-library-stat");
  await expect(activeProductsStat).toContainText("Productos activos");
  await expect(activeProductsStat.locator("strong")).toHaveText(/^\d+$/);
  await expect(page.locator(".dashboard-cosmic-select select").first()).toHaveValue("active");
  const updatedMeta = page.locator("time.dashboard-store-card__meta").first();
  await expect(updatedMeta).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}T/);
  await expect
    .poll(() =>
      page
        .locator(".app-root--dashboard-cosmic")
        .evaluate((element) => getComputedStyle(element).backgroundImage),
    )
    .toContain("radial-gradient");
  await expectNoHorizontalOverflow(page, "Dashboard cosmic");

  await page.getByRole("button", { name: "Nueva tienda", exact: true }).click();
  const createDialog = page.getByRole("dialog", { name: "Crear tienda" });
  await expect(createDialog).toBeVisible();
  await expect(page.getByRole("heading", { name: "Crear tienda" })).toBeVisible();
  await page.getByLabel("Nueva tienda").fill("Tienda guiada");
  await page.getByRole("button", { name: "Cerrar creación" }).click();
  await expect(createDialog).toBeHidden();
});

test("el contenedor de tiendas es transparente y conserva a sus hijos", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(studioUrl);

  const surface = await page.locator(".dashboard-cosmic-library").evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      borderTopWidth: style.borderTopWidth,
      borderRightWidth: style.borderRightWidth,
      borderBottomWidth: style.borderBottomWidth,
      borderLeftWidth: style.borderLeftWidth,
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      boxShadow: style.boxShadow,
      contain: style.contain,
      childClasses: [...element.children].map((child) => child.className),
    };
  });

  expect(surface).toMatchObject({
    borderTopWidth: "0px",
    borderRightWidth: "0px",
    borderBottomWidth: "0px",
    borderLeftWidth: "0px",
    backgroundColor: "rgba(0, 0, 0, 0)",
    backgroundImage: "none",
    boxShadow: "none",
    contain: "layout paint",
  });
  expect(surface.childClasses).toEqual([
    "dashboard-cosmic-library-head",
    "dashboard-cosmic-count visually-hidden",
    "dashboard-cosmic-toolbar",
    "dashboard-cosmic-actions",
    expect.stringMatching(/^dashboard-cosmic-results dashboard-cosmic-results--/),
  ]);
});

test("la paginación queda al fondo del contenedor de tiendas", async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(studioUrl);

    const layout = await page.locator(".dashboard-cosmic-store-groups").evaluate((element) => {
      const pagination = element.querySelector<HTMLElement>(".dashboard-cosmic-pagination");
      if (!pagination) throw new Error("Falta la paginación de tiendas");
      const groups = element.getBoundingClientRect();
      const controls = pagination.getBoundingClientRect();
      return { groupsBottom: groups.bottom, paginationBottom: controls.bottom };
    });

    expect(Math.abs(layout.groupsBottom - layout.paginationBottom)).toBeLessThanOrEqual(1);
  }
});

test("el detalle seleccionado llega hasta el fondo de la fila de tiendas", async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(studioUrl);
    await expect(page.getByTestId("solara-app-boot")).toHaveCount(0, { timeout: 10_000 });
    await page
      .locator(".dashboard-cosmic-store-groups .dashboard-store-card__button")
      .first()
      .click();
    await page.waitForTimeout(400);

    const layout = await page.locator(".dashboard-cosmic-results").evaluate((element) => {
      const groups = element.querySelector<HTMLElement>(".dashboard-cosmic-store-groups");
      const pagination = element.querySelector<HTMLElement>(".dashboard-cosmic-pagination");
      const detail = element.querySelector<HTMLElement>(".dashboard-store-detail.is-open");
      const actions = detail?.querySelector<HTMLElement>(".dashboard-store-detail__actions");
      if (!groups || !pagination || !detail || !actions) {
        throw new Error("Falta una superficie del dashboard");
      }
      const actionItems = Array.from(actions.children).map((child) =>
        (child as HTMLElement).getBoundingClientRect(),
      );
      const actionButtons = Array.from(actions.querySelectorAll<HTMLElement>(".button")).map(
        (button) => button.getBoundingClientRect(),
      );
      if (actionItems.length < 2) throw new Error("Faltan grupos de acciones");
      if (actionButtons.length < 2) throw new Error("Faltan botones de acciones");
      const groupsBounds = groups.getBoundingClientRect();
      const paginationBounds = pagination.getBoundingClientRect();
      const detailBounds = detail.getBoundingClientRect();
      const actionsBounds = actions.getBoundingClientRect();
      return {
        paginationBottom: paginationBounds.bottom,
        detailTop: detailBounds.top,
        detailBottom: detailBounds.bottom,
        groupsTop: groupsBounds.top,
        actionsBottom: actionsBounds.bottom,
        lastActionBottom: actionItems.at(-1)?.bottom ?? 0,
        maxButtonHeight: Math.max(...actionButtons.map((button) => button.height)),
        minButtonHeight: Math.min(...actionButtons.map((button) => button.height)),
      };
    });

    expect(Math.abs(layout.detailBottom - layout.paginationBottom)).toBeLessThanOrEqual(1);
    expect(layout.detailTop).toBeGreaterThanOrEqual(layout.groupsTop - 1);
    expect(Math.abs(layout.actionsBottom - layout.lastActionBottom)).toBeLessThanOrEqual(1);
    expect(layout.maxButtonHeight).toBeLessThanOrEqual(56);
    expect(layout.minButtonHeight).toBeGreaterThanOrEqual(40);
    expect(layout.maxButtonHeight - layout.minButtonHeight).toBeLessThanOrEqual(2);
  }
});

test("el fondo del dashboard es un gradiente estático sin canvas ni animación", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(studioUrl);

  // El agujero negro (WebGL) se eliminó: no debe quedar canvas ni wrapper.
  await expect(page.locator(".cosmic-background")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveCount(0);

  // El fondo es un gradiente radial estático sobre la base oscura.
  await expect
    .poll(() =>
      page
        .locator(".app-root--dashboard-cosmic")
        .evaluate((element) => getComputedStyle(element).backgroundImage),
    )
    .toContain("radial-gradient");

  // Estático: ninguna animación CSS corriendo tras el settle.
  await page.waitForTimeout(600);
  const runningAnimations = await page.evaluate(() => document.getAnimations().length);
  expect(runningAnimations).toBe(0);
});

test("dashboard permite abrir, buscar, cambiar vista, respaldar y administrar una tienda", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(studioUrl);

  const card = page.locator(".dashboard-store-card").filter({ hasText: "Predeterminado" }).first();
  await card.locator(".dashboard-store-card__button").click();
  await expect(
    page.getByRole("region", { name: "Tienda seleccionada: Predeterminado" }),
  ).toBeVisible();

  await page
    .getByRole("region", { name: "Tienda seleccionada: Predeterminado" })
    .getByRole("button", { name: "Abrir tienda", exact: true })
    .click();
  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible();
  await page.getByRole("button", { name: "Volver a tiendas" }).click();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();

  const listButton = page.getByRole("button", { name: "Vista en lista" });
  await listButton.click();
  await expect(page.locator(".dashboard-cosmic-results--list")).toBeVisible();

  const search = page.getByRole("searchbox", { name: "Buscar tienda" });
  await search.fill("predeterminado");
  await expect(page.locator(".dashboard-cosmic-count")).toHaveText("1 visibles");
  await search.fill("no existe");
  await expect(page.getByText("No hay coincidencias")).toBeVisible();
  await search.fill("");

  const selectedCard = page
    .locator(".dashboard-store-card")
    .filter({ hasText: "Predeterminado" })
    .first();
  const selectedButton = selectedCard.locator(".dashboard-store-card__button");
  await selectedButton.click();
  const detail = page.getByRole("region", { name: "Tienda seleccionada: Predeterminado" });
  await detail.getByRole("button", { name: "Cerrar detalle" }).click();
  await expect(selectedButton).toBeFocused();
  await selectedButton.click();

  const downloadPromise = page.waitForEvent("download");
  await detail.getByRole("button", { name: "Respaldar ahora" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.solara\.json$/);

  await detail.getByRole("button", { name: "Duplicar" }).click();
  const duplicateDialog = page.getByRole("dialog", { name: "Duplicar tienda" });
  await expect(duplicateDialog).toBeVisible();
  await expect(page.getByTestId("ui-duplicate-name")).toHaveValue(/copia/);
  await duplicateDialog.getByRole("button", { name: "Duplicar" }).click();
  await expect(page.locator(".dashboard-cosmic-count")).toHaveText("2 visibles");

  // T4.12: el archivo de tienda confirma con el diálogo unificado.
  const duplicateCard = page
    .locator(".dashboard-store-card")
    .filter({ hasText: "Predeterminado (copia)" })
    .first();
  await duplicateCard.locator(".dashboard-store-card__button").click();
  const duplicateDetail = page.getByRole("region", {
    name: "Tienda seleccionada: Predeterminado (copia)",
  });
  await expect(duplicateDetail).toBeVisible();
  await duplicateDetail.getByRole("button", { name: "Archivar" }).click();
  const archiveConfirm = page.getByTestId("ui-confirm-dialog");
  await expect(archiveConfirm).toBeVisible();
  await archiveConfirm.getByRole("button", { name: "Archivar", exact: true }).click();
  await expect(archiveConfirm).toBeHidden();
  await page.locator(".dashboard-cosmic-select select").first().selectOption("archived");
  await expect(page.locator(".dashboard-cosmic-count")).toHaveText("1 visibles");
  const archivedCard = page
    .locator(".dashboard-store-card")
    .filter({ hasText: "Predeterminado" })
    .first();
  await archivedCard.locator(".dashboard-store-card__button").click();
  await expect(
    page
      .getByRole("region", { name: "Tienda seleccionada: Predeterminado" })
      .getByRole("button", { name: "Restaurar tienda" }),
  ).toBeVisible();
  await page
    .getByRole("region", { name: "Tienda seleccionada: Predeterminado" })
    .getByRole("button", { name: "Restaurar tienda" })
    .click();
  await expect(page.locator(".dashboard-cosmic-count")).toHaveText("0 visibles");
});

test("catálogo y constructor conservan jerarquía responsive", async ({ page }) => {
  await openProject(page);
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.getByRole("tab", { name: "Catálogo", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Catálogo", exact: true })).toBeVisible();
    await expect(page.locator("[data-studio-editor-pane]")).toHaveCSS("transform", "none");
    await expectNoHorizontalOverflow(page, `Catálogo ${viewport.name}`);
    if (viewport.name === "desktop") {
      await page.screenshot({ path: "test-results/catalog.png", fullPage: true });
    }

    await page.getByRole("tab", { name: "Constructor", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Constructor" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Inspector de sección" })).toBeVisible();
    await expectNoHorizontalOverflow(page, `Constructor ${viewport.name}`);
    if (viewport.name !== "desktop") {
      await expect
        .poll(() =>
          page.locator("[data-studio-editor-pane]").evaluate((element) => {
            const style = getComputedStyle(element);
            return {
              overflowY: style.overflowY,
              scrollbarVisibility: style.getPropertyValue("--studio-scrollbar-visibility").trim(),
            };
          }),
        )
        .toEqual({ overflowY: "auto", scrollbarVisibility: "hidden" });
    }
    if (viewport.name === "desktop") {
      await page.screenshot({ path: "test-results/constructor.png", fullPage: true });
    }
  }
});

test("SEO conserva jerarquia y controles dentro del contenedor en todos los viewports", async ({
  page,
}) => {
  await openProject(page);
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.getByRole("tab", { name: "SEO", exact: true }).click();
    await expect(page.getByRole("heading", { name: "SEO y Google", exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page, `SEO ${viewport.name}`);

    const layout = await page.locator(".seo-grid").evaluate((grid) => {
      const container = grid.getBoundingClientRect();
      const boxOf = (selector: string) => {
        const element = grid.querySelector<HTMLElement>(selector);
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top };
      };
      const controls = Array.from(
        grid.querySelectorAll<HTMLElement>("input, textarea, select, button, a"),
      ).map((element) => {
        const box = element.getBoundingClientRect();
        return {
          label: element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "control",
          left: box.left,
          right: box.right,
          width: box.width,
          visible: box.width > 0 && box.height > 0,
        };
      });
      return {
        left: container.left,
        right: container.right,
        clientWidth: grid.clientWidth,
        scrollWidth: grid.scrollWidth,
        sections: [
          boxOf('[data-testid="ui-seo-audit-panel"]'),
          boxOf('[data-testid="ui-seo-checklist"]'),
          boxOf(".seo-fieldset--appearance"),
          boxOf('[data-testid="ui-seo-preview-google"]'),
        ],
        controls,
      };
    });

    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
    expect(layout.sections.every((section) => section !== null)).toBe(true);
    for (const section of layout.sections) {
      expect(section?.left ?? Number.NEGATIVE_INFINITY).toBeGreaterThanOrEqual(layout.left - 1);
      expect(section?.right ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(layout.right + 1);
    }
    expect(layout.controls.length).toBeGreaterThanOrEqual(6);
    for (const control of layout.controls) {
      expect(control.visible, `${viewport.name}: ${control.label} debe tener caja visible`).toBe(
        true,
      );
      expect(
        control.width,
        `${viewport.name}: ${control.label} no puede tener ancho cero`,
      ).toBeGreaterThan(0);
      expect(
        control.left,
        `${viewport.name}: ${control.label} queda fuera por la izquierda`,
      ).toBeGreaterThanOrEqual(layout.left - 1);
      expect(
        control.right,
        `${viewport.name}: ${control.label} queda fuera por la derecha`,
      ).toBeLessThanOrEqual(layout.right + 1);
    }

    if (viewport.name === "desktop") {
      await page.screenshot({ path: "test-results/seo.png", fullPage: true });
    }
  }
});

test("preview diferencia escritorio, tablet y móvil", async ({ page }) => {
  await page.setViewportSize(viewports[0]);
  await openProject(page);
  for (const size of [
    { button: "Vista de escritorio", title: "Vista previa desktop" },
    { button: "Vista de tablet", title: "Vista previa tablet" },
    { button: "Vista móvil", title: "Vista previa mobile" },
  ]) {
    await page.getByRole("button", { name: size.button }).click();
    await expect(page.getByRole("button", { name: size.button })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator(`iframe[title="${size.title}"]`)).toBeVisible();
    if (size.title === "Vista previa desktop") {
      expect(
        await page
          .locator(`iframe[title="${size.title}"]`)
          .evaluate((frame) => frame.srcdoc.length),
      ).toBeLessThan(2_000_000);
      expect(
        await page.locator(`iframe[title="${size.title}"]`).evaluate((frame) => frame.srcdoc),
      ).not.toMatch(/\ssrc="\/__solara-preview-assets\//);
      const frame = page.frameLocator(`iframe[title="${size.title}"]`);
      await expect
        .poll(() =>
          frame
            .locator("img")
            .first()
            .evaluate((image) => image.naturalWidth),
        )
        .toBeGreaterThan(0);
      const previewImages = frame.locator("img");
      await expect
        .poll(async () => {
          const states = await Promise.all(
            (await previewImages.all()).map((image) =>
              image.evaluate((element) => ({
                loaded: (element as HTMLImageElement).naturalWidth > 0,
                eager: element.getAttribute("loading") === "eager",
              })),
            ),
          );
          return states.length > 0 && states.every((state) => state.loaded && state.eager);
        })
        .toBe(true);
      expect(
        await frame.locator("html").evaluate((element) => element.outerHTML.length),
      ).toBeLessThan(14_000_000);
    }

    const frame = page.frameLocator(`iframe[title="${size.title}"]`);
    await expect
      .poll(() =>
        frame.locator("html").evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            policy: style.getPropertyValue("--solara-preview-scrollbar-policy").trim(),
            scrollable: style.overflowY !== "hidden" && element.scrollHeight > element.clientHeight,
            webkitDisplay: getComputedStyle(element, "::-webkit-scrollbar").display,
          };
        }),
      )
      .toEqual({ policy: "hidden", scrollable: true, webkitDisplay: "none" });
  }
});

test("el panel de trabajo se despliega desde la izquierda y deja crecer el preview", async ({
  page,
}) => {
  await page.setViewportSize(viewports[0]);
  await openProject(page);

  const workspace = page.locator(".studio-workspace");
  const editor = page.locator("[data-studio-editor-pane]");
  const preview = page.locator(".preview-pane");
  await expect(editor).toHaveClass(/editor-pane--closed/);
  await expect(page.locator(".studio-topbar .preview-toolbar")).toBeVisible();
  await expect(page.locator(".preview-pane > header")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Abrir panel de edición" })).toBeVisible();

  await page.getByRole("tab", { name: "Preparar", exact: true }).click();
  await expect(editor).toHaveClass(/editor-pane--open/);
  await expect(page.getByRole("button", { name: "Cerrar panel de edición" })).toBeVisible();
  const openEditorBox = await editor.boundingBox();
  const openPreviewBox = await preview.boundingBox();
  expect(openEditorBox).not.toBeNull();
  expect(openPreviewBox).not.toBeNull();
  expect((openEditorBox?.x ?? 0) + (openEditorBox?.width ?? 0)).toBeLessThanOrEqual(
    (openPreviewBox?.x ?? 0) + 1,
  );
  expect(openPreviewBox?.width ?? 0).toBeGreaterThan(520);
  const editorTransition = await editor.evaluate((element) => ({
    opacity: getComputedStyle(element).opacity,
    transitionProperty: getComputedStyle(element).transitionProperty,
  }));
  expect(editorTransition.opacity).toBe("1");
  expect(
    editorTransition.transitionProperty.split(",").map((property) => property.trim()),
  ).not.toContain("opacity");

  await page.getByRole("button", { name: "Cerrar panel de edición" }).click();
  await expect(editor).toHaveClass(/editor-pane--closed/);
  await expect(page.getByRole("button", { name: "Abrir panel de edición" })).toBeVisible();

  const workspaceBox = await workspace.boundingBox();
  const previewBox = await preview.boundingBox();
  expect(workspaceBox).not.toBeNull();
  expect(previewBox).not.toBeNull();
  expect(previewBox?.width).toBeCloseTo(workspaceBox?.width ?? 0, -1);
  expect(previewBox?.height).toBeCloseTo(workspaceBox?.height ?? 0, -1);
  expect(previewBox?.y).toBeCloseTo(workspaceBox?.y ?? 0, -1);

  await page.getByRole("button", { name: "Abrir panel de edición" }).click();
  await expect(editor).toHaveClass(/editor-pane--open/);
  await expect(page.getByRole("button", { name: "Cerrar panel de edición" })).toBeVisible();
});

test("Exportar conserva separados la exposición pública y el verificador", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 991 });
  await openProject(page);
  await page.getByRole("tab", { name: "Exportar", exact: true }).click();

  await page.getByText("Contenido público de producción", { exact: true }).click();
  const exposure = page.getByTestId("ui-export-public-exposure");
  const verifier = page.getByTestId("ui-cloudflare-verifier");
  await expect(exposure).toBeVisible();
  await expect(verifier).toBeVisible();

  const exposureBox = await exposure.boundingBox();
  const verifierBox = await verifier.boundingBox();
  expect(exposureBox).not.toBeNull();
  expect(verifierBox).not.toBeNull();
  expect((exposureBox?.y ?? 0) + (exposureBox?.height ?? 0)).toBeLessThanOrEqual(
    (verifierBox?.y ?? 0) + 1,
  );
});

test("Studio respeta foco, modo oscuro y movimiento reducido", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto(studioUrl);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        matchMedia("(prefers-color-scheme: dark)").matches &&
        matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  ).toBe(true);

  await page.keyboard.press("Tab");
  const focused = page.locator(":focus-visible");
  await expect(focused).toBeVisible();
  await expect
    .poll(
      () =>
        focused.evaluate((element) => {
          const style = getComputedStyle(element);
          return (
            (style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0) ||
            style.boxShadow !== "none"
          );
        }),
      { message: "El elemento enfocado debe tener un contorno visible" },
    )
    .toBe(true);
});

test("storefront home y producto responden sin overflow y conservan el carrito", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const viewport of [viewports[0], viewports[2]]) {
    await page.setViewportSize(viewport);
    await page.goto(storefrontUrl);
    await expect(
      page.getByRole("heading", { level: 1, name: "Una casa con materia y calma." }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page, `Storefront home ${viewport.name}`);
    if (viewport.name === "desktop") {
      await page.screenshot({ path: "test-results/home.png", fullPage: true });
    }

    await page.goto(`${storefrontUrl}/productos/manta-bruma/`);
    await expect(page.getByRole("heading", { level: 1, name: "Manta Bruma" })).toBeVisible();
    await expectNoHorizontalOverflow(page, `Storefront producto ${viewport.name}`);
    if (viewport.name === "desktop") {
      await page.screenshot({ path: "test-results/product.png", fullPage: true });
    }
  }

  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await expect(page.locator("[data-cart-drawer]")).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("[data-cart-count]").first()).toHaveText("1");
});
