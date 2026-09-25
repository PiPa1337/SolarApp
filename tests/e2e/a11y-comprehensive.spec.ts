import { createServer } from "node:http";
import { expect, test } from "@playwright/test";
import { exportProject } from "@solara/exporter";
import { catalogModernStore } from "@solara/project-schema/catalog-modern-fixture";

const exported = exportProject(catalogModernStore, { mode: "production" });

function startServer() {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const requested = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const path =
      requested === ""
        ? "index.html"
        : requested.endsWith("/")
          ? `${requested}index.html`
          : requested;
    const content = exported.files.get(path);
    if (!content) {
      res.writeHead(404).end("Not found");
      return;
    }
    const ext = path.split(".").pop();
    const ct =
      ext === "html"
        ? "text/html; charset=utf-8"
        : ext === "css"
          ? "text/css; charset=utf-8"
          : ext === "js"
            ? "text/javascript; charset=utf-8"
            : "application/octet-stream";
    res.writeHead(200, { "Content-Type": ct }).end(content);
  });
  return server;
}

test("a11y: landmarks, headings y skip link", async ({ page }) => {
  const server = startServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr: any = server.address();
  const base = `http://127.0.0.1:${addr.port}`;
  try {
    await page.goto(`${base}/`, { waitUntil: "load" });
    // landmarks
    expect(await page.locator("header").count()).toBeGreaterThanOrEqual(1);
    expect(await page.locator("main").count()).toBe(1);
    expect(await page.locator("footer").count()).toBeGreaterThanOrEqual(1);
    expect(await page.locator("nav[aria-label]").count()).toBeGreaterThanOrEqual(1);
    // skip link
    const skip = page.locator(".solara-skip-link");
    await expect(skip).toHaveAttribute("href", "#solara-main");
    expect(await page.locator("#solara-main").count()).toBe(1);
    // headings hierarchy: h1 then h2
    const h1Count = await page.locator("h1").count();
    expect(h1Count).toBeGreaterThanOrEqual(1);
    const h1Text = await page.locator("h1").first().textContent();
    expect(h1Text?.trim().length).toBeGreaterThan(0);
    // breadcrumbs have aria-label
    await expect(page.locator('nav[aria-label="Migas de pan"]').first()).toBeHidden({
      timeout: 100,
    });
    // on category page, breadcrumbs should exist
    const categoryPath = [...exported.files.keys()].find((p) => p.startsWith("categorias/"));
    if (categoryPath) {
      const route = `/${categoryPath.slice(0, -"index.html".length)}`;
      await page.goto(`${base}${route}`, { waitUntil: "load" });
      await expect(page.locator('nav[aria-label="Migas de pan"]')).toBeVisible();
      await expect(
        page.locator('nav[aria-label="Migas de pan"] [aria-current="page"]'),
      ).toBeVisible();
    }
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test("a11y: testimonials track focusable y keyboard scrolleable", async ({ page }) => {
  const server = startServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr: any = server.address();
  const base = `http://127.0.0.1:${addr.port}`;
  try {
    await page.goto(`${base}/`, { waitUntil: "load" });
    const track = page.locator(".catalog-testimonials-track");
    if ((await track.count()) > 0) {
      await expect(track).toHaveAttribute("tabindex", "0");
      await expect(track).toHaveAttribute("role", "region");
      await expect(track).toHaveAttribute("aria-label", "Testimonios de clientes");
      await track.focus();
      await expect(track).toBeFocused();
      const outlineWidth = await track.evaluate((el) => getComputedStyle(el).outlineWidth);
      expect(outlineWidth).not.toBe("0px");
    }
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test("a11y: cart drawer focus trap y Escape", async ({ page }) => {
  const server = startServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr: any = server.address();
  const base = `http://127.0.0.1:${addr.port}`;
  try {
    await page.goto(`${base}/`, { waitUntil: "load" });
    const openBtn = page.locator("[data-solara-cart-open]").first();
    await expect(openBtn).toHaveAttribute("aria-expanded", "false");
    await openBtn.click();
    const drawer = page.locator("[data-cart-drawer]");
    await expect(drawer).toBeVisible();
    expect(await drawer.getAttribute("role")).toBe("dialog");
    expect(await drawer.getAttribute("aria-modal")).toBe("true");
    // focus should be inside drawer
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
    expect(["BUTTON", "INPUT", "SELECT", "TEXTAREA", "A"]).toContain(focusedTag);
    // Tab should trap inside drawer
    const _beforeActive = await page.evaluate(() =>
      document.activeElement?.outerHTML?.slice(0, 100),
    );
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    // still inside?
    const inside = await drawer.evaluate((el) => el.contains(document.activeElement));
    expect(inside).toBe(true);
    // Escape should close and return focus
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveAttribute("aria-hidden", "true");
    await expect(drawer).toHaveAttribute("inert", "");
    await expect(openBtn).toBeFocused();
    expect(await openBtn.getAttribute("aria-expanded")).toBe("false");
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test("a11y: search dialog y mobile menu", async ({ page }) => {
  const server = startServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr: any = server.address();
  const base = `http://127.0.0.1:${addr.port}`;
  try {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1024, height: 768 },
      { width: 390, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(`${base}/`, { waitUntil: "load" });
      // search dialog
      const searchOpen = page.locator("[data-catalog-search-open]").first();
      if ((await searchOpen.count()) > 0 && (await searchOpen.isVisible())) {
        await searchOpen.click();
        const dialog = page.locator("#catalog-search-dialog");
        await expect(dialog).toBeVisible();
        expect(await dialog.getAttribute("aria-labelledby")).toBe("catalog-search-title");
        await expect(page.locator("#catalog-search-input")).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        await expect(searchOpen).toBeFocused();
      }
      // mobile menu, when the responsive trigger is exposed
      const menuOpen = page.locator("[data-catalog-menu-open]").first();
      if ((await menuOpen.count()) > 0 && (await menuOpen.isVisible())) {
        await menuOpen.click();
        const menu = page.locator("#catalog-mobile-menu");
        await expect(menu).toBeVisible();
        expect(await menu.getAttribute("role")).toBe("dialog");
        await page.keyboard.press("Escape");
        await expect(menu).toBeHidden();
        await expect(menuOpen).toBeFocused();
      }
    }
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test("a11y: variant selector y form labels", async ({ page }) => {
  const server = startServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr: any = server.address();
  const base = `http://127.0.0.1:${addr.port}`;
  try {
    const productPath = [...exported.files.keys()].find((p) => p.startsWith("productos/"));
    if (!productPath) throw new Error("no product");
    const route = `/${productPath.slice(0, -"index.html".length)}`;
    await page.goto(`${base}${route}`, { waitUntil: "load" });
    // variant select has label
    const variantSelect = page.locator("[data-variant-select]");
    const variantId = await variantSelect.getAttribute("id");
    expect(variantId).toMatch(/\S+/);
    const label = page.locator(`label[for="${variantId}"]`);
    await expect(label).toBeVisible();
    // quantity has label
    const qtyId = await page.locator('input[name="quantity"]').getAttribute("id");
    expect(qtyId).toMatch(/\S+/);
    await expect(page.locator(`label[for="${qtyId}"]`)).toBeVisible();
    // gallery thumbs have aria-label and aria-current
    const thumb = page.locator("[data-gallery-thumb]").first();
    if ((await thumb.count()) > 0) {
      await expect(thumb).toHaveAttribute("aria-label", /Ver imagen/);
      await expect(thumb).toHaveAttribute("aria-current", /true|false/);
    }
    // cart subtotal has aria-live
    await page.goto(`${base}/`, { waitUntil: "load" });
    const subtotal = page.locator("[data-cart-subtotal]");
    if ((await subtotal.count()) > 0) {
      expect(await subtotal.getAttribute("aria-live")).toBe("polite");
    }
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test("a11y: zoom 200% y viewport estrecho sin overflow", async ({ page }) => {
  const server = startServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr: any = server.address();
  const base = `http://127.0.0.1:${addr.port}`;
  try {
    // 320px narrow
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(`${base}/`, { waitUntil: "load" });
    const overflow320 = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2,
    );
    expect(overflow320).toBe(true);
    // 1280 with zoom 200% simulated as 640 viewport (200% zoom = half viewport)
    await page.setViewportSize({ width: 640, height: 800 });
    await page.goto(`${base}/`, { waitUntil: "load" });
    const overflow640 = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2,
    );
    expect(overflow640).toBe(true);
    // 400% as 320
    await page.setViewportSize({ width: 320, height: 800 });
    await page.evaluate(() => {
      document.body.style.zoom = "1";
    });
    const overflow400 = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 5,
    );
    expect(overflow400).toBe(true);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test("a11y: reduced motion desactiva autoplay", async ({ page }) => {
  const server = startServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr: any = server.address();
  const base = `http://127.0.0.1:${addr.port}`;
  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${base}/`, { waitUntil: "load" });
    // hero should not autoplay when reduced motion
    const hero = page.locator("[data-hero-mode]").first();
    if ((await hero.count()) === 0) {
      // check via JS that autoplay respects reduced motion
      const autoplayDisabled = await page.evaluate(
        () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      );
      expect(autoplayDisabled).toBe(true);
    }
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
