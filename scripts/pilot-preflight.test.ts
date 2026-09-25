import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { readProjectArchive } from "../apps/studio/src/lib/projectArchive";
import { buildCommerceSnapshot, exportProject } from "../packages/exporter/src/index";
import { referenceStore } from "../packages/project-schema/src/fixture";
import { StoreProjectV1Schema } from "../packages/project-schema/src/index";

function escapeXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character] ?? character,
  );
}

function countExact(text: string, value: string): number {
  return text.split(value).length - 1;
}

function assertProductionPackage(project: typeof referenceStore): void {
  const snapshot = buildCommerceSnapshot(project);
  const result = exportProject(project, { mode: "production" });
  const home = String(result.files.get("index.html"));
  const sitemap = String(result.files.get("sitemap.xml"));
  const feed = String(result.files.get("google-merchant.xml"));
  const headers = String(result.files.get("_headers"));

  expect(result.audit.filter((issue) => issue.severity === "critical")).toEqual([]);
  expect(snapshot.products.length).toBeGreaterThan(0);
  expect(result.files.has("robots.txt")).toBe(true);
  expect(result.files.has("image-sitemap.xml")).toBe(true);
  expect(result.files.has("google-merchant.xml")).toBe(true);
  expect(home).not.toContain("noindex,nofollow");
  expect(home).toContain('<link rel="canonical"');
  expect(headers).toContain("Content-Security-Policy");

  for (const product of snapshot.products) {
    const productFile = `${product.canonicalPath.replace(/^\/+/, "")}index.html`;
    const html = result.files.get(productFile);
    expect(typeof html, `falta el HTML de ${product.canonicalPath}`).toBe("string");
    expect(sitemap).toContain(product.canonicalPath);
  }

  const representative = snapshot.products[0];
  if (!representative) return;
  const representativeHtml = String(
    result.files.get(`${representative.canonicalPath.replace(/^\/+/, "")}index.html`),
  );
  expect(representativeHtml).toContain('"@type":"ProductGroup"');

  const feedIds = [...feed.matchAll(/<g:id>([^<]*)<\/g:id>/g)].map((match) => match[1]);
  expect(feedIds).toHaveLength(snapshot.offers.length);
  expect(new Set(feedIds).size).toBe(snapshot.offers.length);
  for (const offer of snapshot.offers) {
    expect(countExact(feed, `<g:id>${escapeXml(offer.variantId)}</g:id>`)).toBe(1);
  }
}

test("valida el paquete production antes del piloto real", () => {
  const archivePath = process.env.SOLARA_PILOT_PROJECT_ARCHIVE;
  const project = archivePath
    ? readProjectArchive(new Uint8Array(readFileSync(resolve(archivePath))))
    : referenceStore;
  assertProductionPackage(project);
  const result = exportProject(project, { mode: "production" });
  const snapshot = buildCommerceSnapshot(project);
  const second = exportProject(project, { mode: "production" });
  expect(second.files).toEqual(result.files);
  console.log({
    source: archivePath ? resolve(archivePath) : "reference fixture",
    pages: result.files.size,
    offers: snapshot.offers.length,
  });
});

test("valida un respaldo con slugs de productos distintos al fixture", () => {
  const project = StoreProjectV1Schema.parse({
    ...structuredClone(referenceStore),
    baseUrl: "https://piloto-ejemplo.test",
    products: referenceStore.products.map((product, index) =>
      index === 0 ? { ...product, slug: "producto-del-piloto" } : product,
    ),
  });

  assertProductionPackage(project);
});
