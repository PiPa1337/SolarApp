import { expect, test } from "@playwright/test";
import { createProjectArchive } from "@solara/exporter";
import { catalogModernV2Store } from "@solara/project-schema/catalog-modern-v2-fixture";
import { startStudioServer, stopStudioServer } from "./studio-server";

test.setTimeout(120_000);

async function openStoreFromDashboard(
  page: import("@playwright/test").Page,
  card: import("@playwright/test").Locator,
): Promise<void> {
  await card.locator(".dashboard-store-card__button").click();
  await page
    .getByRole("region", { name: /Tienda seleccionada:/ })
    .getByRole("button", { name: "Abrir tienda", exact: true })
    .click();
}

async function openV2StoreFromDashboard(
  page: import("@playwright/test").Page,
  name: string,
): Promise<string> {
  const fixture = structuredClone(catalogModernV2Store);
  fixture.name = name;
  await page.getByRole("button", { name: "Nueva tienda", exact: true }).click();
  await page.getByLabel("Seleccionar tienda para importar").setInputFiles({
    name: "catalog-modern-v2.solara.json",
    mimeType: "application/json",
    buffer: Buffer.from(createProjectArchive(fixture), "utf8"),
  });
  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Volver a tiendas" }).click();
  const card = page.locator(".dashboard-store-card").filter({ hasText: name }).first();
  const storeId = await card.locator(".dashboard-store-card__button").getAttribute("data-store-card-id");
  if (!storeId) throw new Error(`No se pudo identificar la tienda V2 "${name}".`);
  await openStoreFromDashboard(page, card);
  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Cerrar panel de edición" }).click();
  const desktop = page.getByRole("button", { name: "Vista de escritorio" });
  await expect(desktop).toBeEnabled();
  await desktop.click();
  await expect(desktop).toHaveAttribute("aria-pressed", "true");
  return storeId;
}

test("el preview V2 conserva el carrito al navegar con enlaces internos", async ({ page }) => {
  const running = await startStudioServer();
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(running.url);
    await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
      timeout: 30_000,
    });
    const storeId = await openV2StoreFromDashboard(page, "Preview carrito interno V2");

    const preview = page.frameLocator('iframe[title="Vista previa desktop"]');
    await page.evaluate((id) => localStorage.removeItem(`solara-cart:${id}`), storeId);
    await expect(preview.locator('[data-design-family="catalog-modern-v2"]')).toBeVisible({
      timeout: 30_000,
    });
    // Nightwatch: Predeterminado es la fixture de escala (slugs reales, no
    // placeholder-1); derivar tarjetas con IDs de producto distintos desde el DOM.
    const productTargets = await preview.locator("[data-product-card]").evaluateAll((cards) => {
      const targets: Array<{ id: string; href: string }> = [];
      for (const card of cards) {
        const id = card.getAttribute("data-product-id");
        const href = card.querySelector('a[href^="/productos/"]')?.getAttribute("href");
        if (id && href && !targets.some((target) => target.id === id)) targets.push({ id, href });
      }
      return targets;
    });
    const firstTarget = productTargets[0];
    const secondTarget = productTargets[1];
    if (!firstTarget || !secondTarget) throw new Error("Se necesitan dos tarjetas de producto");
    await preview
      .locator(`[data-product-card][data-product-id="${firstTarget.id}"] a`)
      .first()
      .click();
    await expect(
      preview.locator(`[data-product][data-product-id="${firstTarget.id}"]`),
    ).toBeVisible({ timeout: 30_000 });
    const firstTitle = preview.getByRole("heading", { level: 1 });
    await expect(firstTitle).toHaveText(/.+/, {
      timeout: 30_000,
    });
    const firstTitleText = await firstTitle.textContent();
    await preview.getByRole("button", { name: "Agregar al carrito" }).click();
    await expect(preview.locator("[data-cart-count]").first()).toHaveText("1");
    await preview.locator("[data-cart-drawer]").press("Escape");

    await preview.locator('a[href="/"]').first().click();
    await expect(preview.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 30_000,
    });
    await expect(preview.locator("[data-cart-count]").first()).toHaveText("1");

    await preview
      .locator(`[data-product-card][data-product-id="${secondTarget.id}"] a`)
      .first()
      .click();
    await expect(
      preview.locator(`[data-product][data-product-id="${secondTarget.id}"]`),
    ).toBeVisible({ timeout: 30_000 });
    const secondTitle = preview.getByRole("heading", { level: 1 });
    await expect(secondTitle).toHaveText(/.+/, {
      timeout: 30_000,
    });
    await expect(secondTitle).not.toHaveText(firstTitleText ?? "");
    await expect(preview.locator("[data-cart-count]").first()).toHaveText("1");
    await preview.getByRole("button", { name: "Agregar al carrito" }).click();
    await expect(preview.locator("[data-cart-count]").first()).toHaveText("2");
    await expect
      .poll(
        () =>
          page.evaluate((id) => {
            try {
              return JSON.parse(localStorage.getItem(`solara-cart:${id}`) ?? "[]").length;
            } catch {
              return -1;
            }
          }, storeId),
        { timeout: 10_000 },
      )
      .toBe(2);
    await page.getByTestId("ui-preview-route").fill("/carrito/");
    await page.getByTestId("ui-preview-route").press("Enter");
    await expect(preview.getByRole("heading", { level: 1 })).toHaveText("Carrito", {
      timeout: 30_000,
    });
    await expect(preview.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
    await expect(
      preview.locator(".solara-cart-page [data-cart-lines] .solara-cart-line"),
    ).toHaveCount(2);
    const cartImages = preview.locator(".solara-cart-page [data-cart-lines] .solara-cart-line img");
    await expect(cartImages).toHaveCount(2);
    await expect
      .poll(() =>
        cartImages.evaluateAll(
          (images) => images.filter((image) => image.complete && image.naturalWidth > 0).length,
        ),
      )
      .toBe(2);
    const cartImageMetrics = await cartImages.evaluateAll((images) =>
      images.map((image) => {
        const rect = image.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          objectFit: getComputedStyle(image).objectFit,
        };
      }),
    );
    for (const metric of cartImageMetrics) {
      expect(Math.abs(metric.width - metric.height)).toBeLessThanOrEqual(0.5);
      expect(metric.objectFit).toBe("cover");
    }
  } finally {
    await stopStudioServer(running.server);
  }
});

test("el enlace Abrir carrito del footer abre el drawer sin cambiar de ruta", async ({ page }) => {
  const running = await startStudioServer();
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(running.url);
    await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
      timeout: 30_000,
    });
    await openV2StoreFromDashboard(page, "Preview footer carrito V2");

    const preview = page.frameLocator('iframe[title="Vista previa desktop"]');
    const footerCartLink = preview.locator("a.catalog-footer-cart-link");
    await expect(footerCartLink).toHaveCount(1, { timeout: 30_000 });
    await footerCartLink.scrollIntoViewIfNeeded();
    await footerCartLink.click();

    await expect(page.getByTestId("ui-preview-route")).toHaveValue("/");
    await expect(preview.locator("[data-cart-drawer]")).toHaveAttribute("data-open", "true");
  } finally {
    await stopStudioServer(running.server);
  }
});

test("el preview V2 conserva el carrito al cambiar de ruta inmediatamente después de agregar", async ({
  page,
}) => {
  const running = await startStudioServer();
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(running.url);
    await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
      timeout: 30_000,
    });
    const storeId = await openV2StoreFromDashboard(page, "Preview cambio inmediato V2");

    const preview = page.frameLocator('iframe[title="Vista previa desktop"]');
    await page.evaluate((id) => localStorage.removeItem(`solara-cart:${id}`), storeId);
    await expect(preview.locator('[data-design-family="catalog-modern-v2"]')).toBeVisible({
      timeout: 30_000,
    });
    const productTargets = await preview.locator("[data-product-card]").evaluateAll((cards) => {
      const targets: Array<{ id: string; href: string }> = [];
      for (const card of cards) {
        const id = card.getAttribute("data-product-id");
        const href = card.querySelector('a[href^="/productos/"]')?.getAttribute("href");
        if (id && href && !targets.some((target) => target.id === id)) targets.push({ id, href });
      }
      return targets;
    });
    const firstTarget = productTargets[0];
    const secondTarget = productTargets[1];
    if (!firstTarget || !secondTarget) throw new Error("Se necesitan dos tarjetas de producto");
    await preview
      .locator(`[data-product-card][data-product-id="${firstTarget.id}"] a`)
      .first()
      .click();
    await expect(preview.getByRole("heading", { level: 1 })).toHaveText(/.+/, {
      timeout: 30_000,
    });
    await preview.getByRole("button", { name: "Agregar al carrito" }).click();

    await page.getByTestId("ui-preview-route").fill(secondTarget.href);
    await page.getByTestId("ui-preview-route").press("Enter");
    await expect(preview.getByRole("heading", { level: 1 })).toHaveText(/.+/, {
      timeout: 30_000,
    });
    await expect(preview.locator("[data-cart-count]").first()).toHaveText("1");
    await preview.getByRole("button", { name: "Agregar al carrito" }).click();

    await page.getByTestId("ui-preview-route").fill("/carrito/");
    await page.getByTestId("ui-preview-route").press("Enter");
    await expect(preview.getByRole("heading", { level: 1 })).toHaveText("Carrito", {
      timeout: 30_000,
    });
    await expect(
      preview.locator(".solara-cart-page [data-cart-lines] .solara-cart-line"),
    ).toHaveCount(2);
  } finally {
    await stopStudioServer(running.server);
  }
});

test("el preview V2 conserva el vaciado intencional al cambiar de ruta", async ({ page }) => {
  const running = await startStudioServer();
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(running.url);
    await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
      timeout: 30_000,
    });
    const storeId = await openV2StoreFromDashboard(page, "Preview vaciado intencional V2");

    const preview = page.frameLocator('iframe[title="Vista previa desktop"]');
    await page.evaluate((id) => {
      localStorage.removeItem(`solara-cart:${id}`);
      localStorage.removeItem(`solara-cart:${id}:backup`);
    }, storeId);
    await expect(preview.locator('[data-design-family="catalog-modern-v2"]')).toBeVisible({
      timeout: 30_000,
    });
    await preview.locator('a[href^="/productos/"]').first().click();
    await preview.getByRole("button", { name: "Agregar al carrito" }).click();
    await expect(preview.locator("[data-cart-count]").first()).toHaveText("1");
    await preview.locator("[data-cart-remove]").first().click();
    await expect(preview.locator("[data-cart-count]").first()).toHaveText("0");

    await page.getByTestId("ui-preview-route").fill("/carrito/");
    await page.getByTestId("ui-preview-route").press("Enter");
    await expect(preview.getByRole("heading", { level: 1 })).toHaveText("Carrito", {
      timeout: 30_000,
    });
    await expect(preview.locator("[data-cart-count]").first()).toHaveText("0");
    await expect(
      preview.locator(".solara-cart-page [data-cart-lines] .solara-cart-line"),
    ).toHaveCount(0);
  } finally {
    await stopStudioServer(running.server);
  }
});

test("P7-B5: los tamaños de vista y el zoom cambian el stage del preview", async ({ page }) => {
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
    await openStoreFromDashboard(page, card);
    await page.locator(".studio-shell").waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: "Cerrar panel de edición" }).click();
    const desktopButton = page.getByRole("button", { name: "Vista de escritorio" });
    await expect(desktopButton).toBeEnabled();
    await desktopButton.click();
    await expect(desktopButton).toHaveAttribute("aria-pressed", "true");

    const frame = page.locator('.preview-stage iframe[title^="Vista previa"]');
    await expect(frame).toBeVisible();
    const desktopWidth = (await frame.boundingBox())?.width ?? 0;
    const tabletButton = page.getByRole("button", { name: "Vista de tablet" });
    await tabletButton.click();
    await expect(tabletButton).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(async () => (await frame.boundingBox())?.width ?? 0, { timeout: 5_000 })
      .toBeLessThan(desktopWidth);
    const tabletWidth = (await frame.boundingBox())?.width ?? 0;
    const mobileButton = page.getByRole("button", { name: "Vista móvil" });
    await mobileButton.click();
    await expect(mobileButton).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(async () => (await frame.boundingBox())?.width ?? 0, { timeout: 5_000 })
      .toBeLessThan(tabletWidth);
    const mobileWidth = (await frame.boundingBox())?.width ?? 0;
    console.log(
      "P7-B5 anchos: desktop",
      Math.round(desktopWidth),
      "tablet",
      Math.round(tabletWidth),
      "móvil",
      Math.round(mobileWidth),
    );
    expect(tabletWidth).toBeLessThan(desktopWidth);
    expect(mobileWidth).toBeLessThan(tabletWidth);

    const zoom75 = page.getByRole("button", { name: "75%" });
    await zoom75.click();
    await expect(zoom75).toHaveAttribute("aria-pressed", "true");
    const iframeZoom = await frame.evaluate((el) => getComputedStyle(el).zoom);
    console.log("P7-B5 zoom CSS tras 75%:", iframeZoom);
    expect(parseFloat(iframeZoom)).toBeLessThan(1);
  } finally {
    await stopStudioServer(running.server);
  }
});

test("P7-B6: el zoom del preview se conserva al recargar la sesión", async ({ page }) => {
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
    await openStoreFromDashboard(page, card);
    await page.locator(".studio-shell").waitFor({ timeout: 30_000 });

    const zoom50 = page.getByRole("button", { name: "50%" });
    await zoom50.click();
    await expect(zoom50).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
      timeout: 30_000,
    });
    const cardAfter = page.locator(".dashboard-store-card").filter({
      has: page.getByText("Predeterminado", { exact: true }),
    });
    await openStoreFromDashboard(page, cardAfter);
    await page.locator(".studio-shell").waitFor({ timeout: 30_000 });

    const frame = page.locator('.preview-stage iframe[title^="Vista previa"]');
    await expect(frame).toBeVisible();
    const persistedZoom = await frame.evaluate((el) => getComputedStyle(el).zoom);
    console.log("P7-B6 zoom tras recargar:", persistedZoom);
    expect(parseFloat(persistedZoom)).toBeLessThan(1);
    const zoomButton = page.getByRole("button", { name: "50%" });
    await expect(zoomButton).toHaveAttribute("aria-pressed", "true");
  } finally {
    await stopStudioServer(running.server);
  }
});
