import type { Server } from "node:http";
import { expect, test } from "@playwright/test";
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

test("mantiene landmarks, nombres accesibles y foco en el dashboard", async ({ page }) => {
  await page.goto(studioUrl);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("main")).toBeVisible();

  const unlabeledControls = await page
    .locator("button, a, input, select, textarea")
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
  expect(unlabeledControls, "cada control visible debe tener un nombre accesible").toEqual([]);

  const missingAlt = await page
    .locator("img")
    .evaluateAll((images) => images.filter((image) => !image.getAttribute("alt")?.trim()).length);
  expect(missingAlt, "cada imagen debe tener alt, aunque sea decorativo").toBe(0);

  await page.keyboard.press("Tab");
  await expect(page.locator(":focus-visible")).toBeVisible();
});
