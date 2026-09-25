import { expect, test } from "vitest";
import { getReferenceExport } from "./export-shared-fixture";

test("P5-9: JSON-LD valido y con URLs absolutas en las paginas comerciales", () => {
  // Export production compartido (una vez por proceso).
  const result = getReferenceExport();
  const expectStructured = (path: string): boolean =>
    /^(index|productos\/[^/]+\/index|colecciones\/[^/]+\/index|nosotros|contacto)\.html$/.test(
      path,
    ) || /^categorias\/[^/]+\/index\.html$/.test(path);
  for (const [path, content] of result.files) {
    if (!path.endsWith(".html")) continue;
    if (!expectStructured(path)) continue;
    const html = String(content);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    expect(blocks.length, `${path}: sin JSON-LD`).toBeGreaterThan(0);
    for (const block of blocks) {
      const data = JSON.parse(block[1]);
      expect(String(data["@type"] ?? ""), `${path}: tipo`).toMatch(/\S+/);
      if ("url" in data) {
        expect(data.url, `${path}: url absoluta`).toMatch(/^https:\/\//);
      }
    }
  }
});
