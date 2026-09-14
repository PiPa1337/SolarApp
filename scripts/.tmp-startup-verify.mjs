import { mkdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { startStudioServer, stopStudioServer } from "../tests/e2e/studio-server.ts";

const output = resolve("capturas-inicio-15s-verify-final");
const rawVideo = resolve(output, "raw-video");
await mkdir(rawVideo, { recursive: true });

const running = await startStudioServer();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1316, height: 630 },
  recordVideo: { dir: rawVideo, size: { width: 1316, height: 630 } },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));

await page.addInitScript(() => {
  localStorage.setItem("solara-dashboard-selected", "store-modo-sur-demo");
  window.__solaraBootTrace = [];
  const opacity = (selector) => {
    const element = document.querySelector(selector);
    return element ? Number.parseFloat(getComputedStyle(element).opacity) : null;
  };
  const startedAt = performance.now();
  window.setInterval(() => {
    const overlay = document.querySelector('[data-testid="solara-app-boot"]');
    const field = document.querySelector(".dashboard-gargantua > .dashboard-gravity-field");
    window.__solaraBootTrace.push({
      t: Math.round(performance.now() - startedAt),
      htmlBoot: document.documentElement.dataset.solaraBoot ?? null,
      entry: document.documentElement.dataset.solaraDashboardEntry ?? null,
      phase: overlay?.dataset.bootPhase ?? null,
      blackoutOpacity: opacity(".app-boot-sequence__blackout"),
      headerOpacity: opacity(".app-header--dashboard-cosmic"),
      bannersOpacity: opacity(".dashboard-cosmic__banners"),
      contentOpacity: opacity(".dashboard-cosmic__content"),
      noticeOpacity: opacity(".global-notice"),
      errorOpacity: opacity(".global-error"),
      warningOpacity: opacity(".global-warning"),
      canvasOpacity: opacity(".dashboard-gargantua > .dashboard-gravity-field canvas"),
      fieldState: field?.dataset.animationState ?? null,
    });
  }, 50);
});

await page.goto(running.url, { waitUntil: "commit" });
await page.waitForTimeout(15_000);
await page.screenshot({ path: resolve(output, "final-15s.png") });
const trace = await page.evaluate(() => window.__solaraBootTrace ?? []);
await writeFile(resolve(output, "boot-trace.json"), JSON.stringify(trace, null, 2));
await writeFile(resolve(output, "browser-errors.json"), JSON.stringify(errors, null, 2));

const video = page.video();
await context.close();
const videoPath = await video.path();
await browser.close();
await stopStudioServer(running.server);
await rename(videoPath, resolve(output, "startup-15s-final.webm"));
