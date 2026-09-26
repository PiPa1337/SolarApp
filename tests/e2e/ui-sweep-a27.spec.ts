import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { exportProject } from "@solara/exporter";
import { catalogModernStore } from "@solara/project-schema/catalog-modern-fixture";

// Desde 9a22a95 los assets del fixture viajan embebidos como data URLs;
// solo los 12 productos quedan como archivos webp servibles en /fixtures/.
const fixtureFiles = new Map<string, Uint8Array>(
  Array.from({ length: 12 }, (_, index) => {
    const number = String(index + 1).padStart(2, "0");
    return [
      `fixtures/modo-sur-product-${number}.webp`,
      readFileSync(resolve(`apps/studio/public/fixtures/modo-sur-product-${number}.webp`)),
    ] as const;
  }),
);

const baseExport = exportProject(catalogModernStore, { mode: "production" });

function startServer(exported: typeof baseExport): Promise<number> {
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
      resolveListening((server.address() as AddressInfo).port);
    });
  });
}

let basePort = 0;

test.beforeAll(async () => {
  basePort = await startServer(baseExport);
});

function storeUrl(port: number, path: string): string {
  return `http://127.0.0.1:${port}${path}`;
}

test("C9b: un producto con todas las variantes agotadas inicia el botón deshabilitado", async ({
  page,
}) => {
  test.info().annotations.push({ type: "contrato", description: "A27 · C9 · sold out product" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(storeUrl(basePort, "/productos/sweater-cuello-alto/"));

  const addButton = page.locator("[data-add-to-cart]");
  await expect(addButton).toBeDisabled();
  await expect(addButton).toHaveText("Sin stock");
  await expect(page.locator("[data-product-availability]")).toHaveText("Agotado");
  await expect(page.locator("[data-variant-select] option")).toBeDisabled();
  await expect(page.locator('[data-variant-select] option:disabled')).toHaveCount(1);
});
