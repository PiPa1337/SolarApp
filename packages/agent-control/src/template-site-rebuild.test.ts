import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createLocalProjectStorage } from "../../exporter/scripts/local-project-storage.mjs";
import { createProjectArchive } from "../../exporter/src/index";
import { buildCatalogModernProject } from "../../project-schema/src/catalog-modern-template";
import { createAgentController } from "./index";

it(
  "reconstruye el sitio protegido obsoleto sin modificar el proyecto y conserva la protección",
  { timeout: 30_000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-template-site-"));
    try {
      const storage = createLocalProjectStorage({ applicationRoot: root });
      const template = buildCatalogModernProject({
        seed: "placeholder",
        id: "store-modo-sur-demo",
      });
      const stream = (text: string) =>
        (async function* () {
          yield new TextEncoder().encode(text);
        })();
      const seed = await storage.beginSave({
        projectId: template.id,
        name: template.name,
        slug: template.slug,
        projectUpdatedAt: template.updatedAt,
        expectedVersion: null,
        actor: { kind: "template-upgrade", id: "seed" },
        allowProtectedWrite: true,
        rendererFingerprint: "old-renderer",
      });
      await storage.upload(seed.transactionId, "project", stream(createProjectArchive(template)));
      await storage.upload(
        seed.transactionId,
        "site",
        stream(
          JSON.stringify([{ path: "index.html", data: "<h1>Anterior</h1>", encoding: "utf8" }]),
        ),
      );
      await storage.commit(seed.transactionId);
      const before = await storage.readCurrent(template.id);
      await expect(storage.rebuildSite(template.id, stream("{}"))).rejects.toMatchObject({
        code: "PROTECTED_STORE",
      });
      await expect(
        storage.rebuildSite(template.id, stream("{}"), {
          actor: { kind: "rollout", id: "global" },
          allowProtectedWrite: true,
        }),
      ).rejects.toMatchObject({ code: "PROTECTED_STORE" });
      const controller = createAgentController({ storage, applicationRoot: root });
      const preview = await controller.previewTemplateUpgrade({});
      expect(preview.safeChanges).toEqual([]);
      expect(preview.siteRebuildRequired).toBe(true);
      const params = {
        previewId: preview.previewId,
        baseVersion: preview.baseVersion,
        confirmation: "ACTUALIZAR_PLANTILLA",
        idempotencyKey: "template-rebuild",
      };
      await expect(
        controller.commitTemplateUpgrade({ ...params, baseVersion: 0 }),
      ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
      const failing = createAgentController({
        storage: {
          ...storage,
          manualBackup: async () => {
            throw new Error("backup-failed");
          },
        },
        applicationRoot: root,
      });
      await expect(failing.commitTemplateUpgrade(params)).rejects.toThrow("backup-failed");
      expect(await storage.readCurrent(template.id)).toEqual(before);
      const result = await controller.commitTemplateUpgrade(params);
      expect(result).toMatchObject({ status: "synced", version: 1 });
      const after = await storage.readCurrent(template.id);
      expect(after?.bytes).toEqual(before?.bytes);
      expect(after?.manifest.current).toEqual(before?.manifest.current);
      expect(after?.manifest.siteHistory[0]).toEqual(before?.manifest.lastValidSite);
      const site = await storage.getLastValidSiteDirectory(template.id);
      expect(await readFile(join(site, "listado/index.html"), "utf8")).toContain(
        "data-product-list-row",
      );
      expect(await controller.commitTemplateUpgrade(params)).toEqual(result);
      const fresh = await controller.previewTemplateUpgrade({});
      expect(fresh.siteRebuildRequired).toBe(false);
      expect(
        await controller.commitTemplateUpgrade({
          ...params,
          previewId: fresh.previewId,
          idempotencyKey: "already-current",
        }),
      ).toMatchObject({ status: "already-current", version: 1 });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
