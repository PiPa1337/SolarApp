import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
// El runner vive en scripts/ pero importa los packages por ruta relativa al
// monorepo; desde el paquete, el test resuelve los workspace packages.
import { runStoreFactory } from "../../../scripts/store-factory.mjs";

test(
  "fábrica autónoma crea tiendas por el canal oficial sin tocar la base",
  { timeout: 600_000 },
  async () => {
    const { results, templateVersionBefore, templateVersionAfter } = await runStoreFactory({
      total: 3,
    });
    expect(results).toHaveLength(3);
    for (const result of results) {
      // Los críticos esperables de una tienda sin assets reales son:
      // imágenes de plantilla pendientes y productos sin imagen. Cualquier
      // otro crítico sí falla la fábrica.
      const unexpected = (result.criticalSample ?? []).filter(
        (message) =>
          !message.includes("no tiene imagen") && !message.includes("imágenes de plantilla"),
      );
      expect(unexpected).toEqual([]);
      expect(result.products).toBeGreaterThan(0);
      expect(result.files).toBeGreaterThan(0);
    }
    // IDs independientes entre tiendas
    const ids = new Set(results.map((result) => result.storeId));
    expect(ids.size).toBe(results.length);
    // La plantilla base no cambia durante la fábrica
    expect(templateVersionAfter).toBe(templateVersionBefore);
    // El reporte es artefacto de QA: va a temp, nunca al repo (los JSON en
    // docs/reports rompen format:check y son regenerables).
    const reportDir = await mkdtemp(join(tmpdir(), "solara-factory-report-"));
    await writeFile(
      join(reportDir, "agent-store-factory.json"),
      JSON.stringify({ total: results.length, results }, null, 2),
    );
  },
);
