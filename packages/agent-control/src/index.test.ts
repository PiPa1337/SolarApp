import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLocalProjectStorage } from "../../exporter/scripts/local-project-storage.mjs";
import { createProjectArchive, readProjectArchive } from "../../exporter/src/index";
import { buildFaviconIco } from "../../exporter/src/pwa";
import { buildCatalogModernProject } from "../../project-schema/src/catalog-modern-template";
import { MODERN_BASE_TEMPLATE_MEDIA } from "../../project-schema/src/modern-base-template-media";
import { StoreProjectV2Schema } from "../../project-schema/src/index";
import { createAgentController } from "./index";

const validPng =
  MODERN_BASE_TEMPLATE_MEDIA.favicon.fallbackSource.split(",")[1] ?? "";
const validJpeg = MODERN_BASE_TEMPLATE_MEDIA.product.fallbackSource.split(",")[1] ?? "";
const validWebp = MODERN_BASE_TEMPLATE_MEDIA.product.source.split(",")[1] ?? "";

describe("control nativo del agente", () => {
  it(
    "crea el clon por defecto desde la plantilla y rechaza editarla",
    { timeout: 30_000 },
    async () => {
      const root = await mkdtemp(join(tmpdir(), "solara-agent-template-"));
      try {
        const storage = createLocalProjectStorage({
          applicationRoot: root,
          projectsRoot: join(root, "proyectos"),
          stagingRoot: join(root, ".solara-runtime", "transactions"),
        });
        const template = buildCatalogModernProject({
          seed: "placeholder",
          id: "store-modo-sur-demo",
          name: "Predeterminado",
          slug: "predeterminado",
        });
        const seed = await storage.beginSave({
          projectId: template.id,
          name: template.name,
          slug: template.slug,
          projectUpdatedAt: template.updatedAt,
          expectedVersion: null,
          actor: { kind: "template-upgrade", id: "test-template-seed" },
          allowProtectedWrite: true,
        });
        await storage.upload(
          seed.transactionId,
          "project",
          (async function* () {
            yield new TextEncoder().encode(createProjectArchive(template));
          })(),
        );
        await storage.commit(seed.transactionId);

        const controller = createAgentController({ storage, applicationRoot: root });
        const plan = await controller.createPlan({
          operations: [
            {
              type: "store.create",
              storeId: "store-clon-agent",
              name: "Clon agente",
              slug: "clon-agente",
            },
            {
              type: "store.updatePage",
              pageId: "page-home",
              changes: {
                seoTitle: "Clon agente | Página de inicio",
                seoDescription: "Descripción actualizada del clon.",
              },
            },
            {
              type: "theme.updateTokens",
              tokens: { shadows: { text: { enabled: true, opacity: 0.8 } } },
            },
          ],
        });
        const planned = await controller.getPlan({ planId: plan.planId, includeProject: true });
        expect(planned.project?.origin).toMatchObject({ seed: "duplicate", role: "store" });
        expect(planned.project?.id).toBe("store-clon-agent");
        expect(planned.project?.pages[0]).toMatchObject({
          seoTitle: "Clon agente | Página de inicio",
          seoDescription: "Descripción actualizada del clon.",
        });
        expect(planned.project?.theme.shadows?.text).toMatchObject({
          enabled: true,
          opacity: 0.8,
        });
        expect(planned.project?.products.map((product) => product.id)).not.toEqual(
          template.products.map((product) => product.id),
        );
        await expect(
          controller.createPlan({
            storeId: template.id,
            baseVersion: 1,
            operations: [{ type: "store.updateIdentity", changes: { description: "No" } }],
          }),
        ).rejects.toMatchObject({ code: "PROTECTED_STORE" });
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  it(
    "migra la plantilla protegida con backup, reemplazo atómico e idempotencia",
    { timeout: 30_000 },
    async () => {
      const root = await mkdtemp(join(tmpdir(), "solara-agent-template-migration-"));
      try {
        const storage = createLocalProjectStorage({
          applicationRoot: root,
          projectsRoot: join(root, "proyectos"),
          stagingRoot: join(root, ".solara-runtime", "transactions"),
        });
        const legacy = StoreProjectV2Schema.parse({
          ...buildCatalogModernProject({
            seed: "demo",
            id: "store-modo-sur-demo",
            name: "Tienda",
            slug: "demo-catalogo-jerarquico",
          }),
          origin: {
            templateId: "catalog-modern",
            templateVersion: 1,
            seed: "placeholder",
            role: "base-template",
            updatePolicy: "pinned",
          },
        });
        const other = StoreProjectV2Schema.parse({
          ...legacy,
          id: "store-rm-descartables",
          name: "RM Descartables",
          slug: "rm-descartables",
          origin: { ...legacy.origin, seed: "duplicate", role: "store", updatePolicy: "managed" },
        });

        const seedProject = async (project: typeof legacy, protectedWrite = false) => {
          const transaction = await storage.beginSave({
            projectId: project.id,
            name: project.name,
            slug: project.slug,
            projectUpdatedAt: project.updatedAt,
            expectedVersion: null,
            actor: protectedWrite
              ? { kind: "template-upgrade" as const, id: "template-migration-seed" }
              : { kind: "agent" as const, id: "template-migration-seed" },
            ...(protectedWrite ? { allowProtectedWrite: true } : {}),
          });
          await storage.upload(
            transaction.transactionId,
            "project",
            (async function* () {
              yield new TextEncoder().encode(createProjectArchive(project));
            })(),
          );
          await storage.commit(transaction.transactionId);
        };

        await seedProject(legacy, true);
        await seedProject(other);
        const otherBefore = await storage.readCurrent(other.id);
        if (!otherBefore) throw new Error("Falta el respaldo de la tienda no objetivo.");
        const legacyBefore = await storage.readCurrent(legacy.id);
        if (!legacyBefore) throw new Error("Falta el respaldo de la plantilla heredada.");

        const controller = createAgentController({ storage, applicationRoot: root });
        const preview = await controller.previewTemplateUpgrade({});
        expect(preview.safeChanges.map((change: { id: string }) => change.id)).toContain(
          "base-template.content.v3",
        );
        expect(preview.fromVersion).toBe(1);
        expect(preview.toVersion).toBe(2);
        expect(preview.requiresConfirmation).toBe("ACTUALIZAR_PLANTILLA");

        const result = await controller.commitTemplateUpgrade({
          previewId: preview.previewId,
          baseVersion: preview.baseVersion,
          confirmation: "ACTUALIZAR_PLANTILLA",
          idempotencyKey: "template-migration-001",
        });
        expect(result).toMatchObject({ storeId: legacy.id, status: "synced", version: 2 });
        expect(result.backup).toMatchObject({ version: 1 });
        const backupPath = join(root, (result.backup as { path: string }).path);
        expect((await stat(backupPath)).isFile()).toBe(true);
        expect(await readFile(backupPath)).toEqual(Buffer.from(legacyBefore.bytes));

        const current = await storage.readCurrent(legacy.id);
        if (!current) throw new Error("Falta la plantilla migrada.");
        const migrated = readProjectArchive(Buffer.from(current.bytes).toString("utf8"));
        expect(migrated).toMatchObject({
          id: legacy.id,
          name: "Tienda",
          slug: "demo-catalogo-jerarquico",
          origin: { role: "base-template", updatePolicy: "pinned", seed: "placeholder" },
          siteShell: { cart: true },
          commerceTemplates: {
            designFamily: "catalog-modern-v2",
            cart: { enabled: true },
            checkout: { enabled: true },
          },
        });
        expect(migrated.products).toHaveLength(33);
        expect(migrated.categories).toHaveLength(6);
        expect(migrated.collections).toHaveLength(0);
        expect(migrated.assets).toHaveLength(5);
        expect(JSON.stringify(migrated).toLowerCase()).not.toContain("rm descartables");
        expect(migrated.whatsapp.phone).toBe("");

        const otherAfter = await storage.readCurrent(other.id);
        if (!otherAfter) throw new Error("La tienda no objetivo desapareció.");
        expect(otherAfter.manifest).toEqual(otherBefore.manifest);
        expect(otherAfter.bytes).toEqual(otherBefore.bytes);

        const previewAgain = await controller.previewTemplateUpgrade({});
        expect(previewAgain.safeChanges).toEqual([]);
        const currentVersion = (current.manifest as { current: { version: number } }).current.version;
        const alreadyCurrent = await controller.commitTemplateUpgrade({
          previewId: previewAgain.previewId,
          baseVersion: previewAgain.baseVersion,
          confirmation: "ACTUALIZAR_PLANTILLA",
          idempotencyKey: "template-migration-002",
        });
        expect(alreadyCurrent).toMatchObject({ status: "already-current", version: currentVersion });
        expect(
          ((await storage.readCurrent(legacy.id))?.manifest as { current: { version: number } }).current
            .version,
        ).toBe(currentVersion);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  it("no reemplaza la plantilla si el backup previo falla", { timeout: 30_000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-agent-template-backup-failure-"));
    try {
      const storage = createLocalProjectStorage({
        applicationRoot: root,
        projectsRoot: join(root, "proyectos"),
        stagingRoot: join(root, ".solara-runtime", "transactions"),
      });
      const legacy = StoreProjectV2Schema.parse({
        ...buildCatalogModernProject({
          seed: "demo",
          id: "store-modo-sur-demo",
          name: "Tienda",
          slug: "demo-catalogo-jerarquico",
        }),
        origin: {
          templateId: "catalog-modern",
          templateVersion: 1,
          seed: "placeholder",
          role: "base-template",
          updatePolicy: "pinned",
        },
      });
      const seed = await storage.beginSave({
        projectId: legacy.id,
        name: legacy.name,
        slug: legacy.slug,
        projectUpdatedAt: legacy.updatedAt,
        expectedVersion: null,
        actor: { kind: "template-upgrade", id: "backup-failure-seed" },
        allowProtectedWrite: true,
      });
      await storage.upload(
        seed.transactionId,
        "project",
        (async function* () {
          yield new TextEncoder().encode(createProjectArchive(legacy));
        })(),
      );
      await storage.commit(seed.transactionId);
      const before = await storage.readCurrent(legacy.id);
      if (!before) throw new Error("Falta el respaldo previo al fallo.");

      const failingStorage = {
        ...storage,
        manualBackup: async () => {
          throw new Error("backup fail");
        },
      };
      const controller = createAgentController({ storage: failingStorage, applicationRoot: root });
      const preview = await controller.previewTemplateUpgrade({});
      await expect(
        controller.commitTemplateUpgrade({
          previewId: preview.previewId,
          baseVersion: preview.baseVersion,
          confirmation: "ACTUALIZAR_PLANTILLA",
        }),
      ).rejects.toThrow("backup fail");
      const after = await storage.readCurrent(legacy.id);
      if (!after) throw new Error("La plantilla desapareció después del fallo.");
      expect(after.manifest).toEqual(before.manifest);
      expect(after.bytes).toEqual(before.bytes);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it(
    "conserva imageId y opciones al crear y actualizar variantes por MCP",
    { timeout: 30_000 },
    async () => {
      const root = await mkdtemp(join(tmpdir(), "solara-agent-variant-image-"));
      try {
        const storage = createLocalProjectStorage({
          applicationRoot: root,
          projectsRoot: join(root, "proyectos"),
          stagingRoot: join(root, ".solara-runtime", "transactions"),
        });
        const clean = buildCatalogModernProject({
          seed: "clean",
          id: "store-variant-image",
          name: "Variantes con imagen",
          slug: "variantes-con-imagen",
        });
        const imageId = clean.assets[0]?.id;
        if (!imageId) throw new Error("La plantilla limpia no tiene un asset de prueba.");
        const seed = await storage.beginSave({
          projectId: clean.id,
          name: clean.name,
          slug: clean.slug,
          projectUpdatedAt: clean.updatedAt,
          expectedVersion: null,
          actor: { kind: "test", id: "agent-variant-image-test" },
          allowProtectedWrite: true,
        });
        await storage.upload(
          seed.transactionId,
          "project",
          (async function* () {
            yield new TextEncoder().encode(createProjectArchive(clean));
          })(),
        );
        await storage.commit(seed.transactionId);

        const controller = createAgentController({ storage, applicationRoot: root });
        const plan = await controller.createPlan({
          storeId: clean.id,
          baseVersion: 1,
          operations: [
            {
              type: "product.create",
              productId: "product-variant-image",
              slug: "producto-con-variante",
              title: "Producto con variante",
              imageIds: [imageId],
              variants: [
                {
                  title: "Diseño 01",
                  sku: "VAR-IMG-001",
                  priceCents: 1000,
                  optionValues: { Diseño: "Diseño 01" },
                  imageId,
                },
              ],
            },
            {
              type: "product.update",
              productId: "product-variant-image",
              changes: {
                variants: [
                  {
                    title: "Diseño 02",
                    sku: "VAR-IMG-002",
                    priceCents: 1200,
                    optionValues: { Diseño: "Diseño 02" },
                    imageId,
                  },
                ],
              },
            },
          ],
        });
        const planned = await controller.getPlan({ planId: plan.planId, includeProject: true });
        expect(planned.project?.products[0]?.variants[0]).toMatchObject({
          title: "Diseño 02",
          sku: "VAR-IMG-002",
          optionValues: { Diseño: "Diseño 02" },
          imageId,
        });
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  it(
    "base-template aplica el phone a whatsapp y no hereda placeholders de contacto",
    { timeout: 30_000 },
    async () => {
      const root = await mkdtemp(join(tmpdir(), "solara-agent-whatsapp-"));
      try {
        const storage = createLocalProjectStorage({
          applicationRoot: root,
          projectsRoot: join(root, "proyectos"),
          stagingRoot: join(root, ".solara-runtime", "transactions"),
        });
        const template = buildCatalogModernProject({
          seed: "placeholder",
          id: "store-modo-sur-demo",
          name: "Predeterminado",
          slug: "predeterminado",
        });
        const seed = await storage.beginSave({
          projectId: template.id,
          name: template.name,
          slug: template.slug,
          projectUpdatedAt: template.updatedAt,
          expectedVersion: null,
          actor: { kind: "template-upgrade", id: "test-template-seed" },
          allowProtectedWrite: true,
        });
        await storage.upload(
          seed.transactionId,
          "project",
          (async function* () {
            yield new TextEncoder().encode(createProjectArchive(template));
          })(),
        );
        await storage.commit(seed.transactionId);

        const controller = createAgentController({ storage, applicationRoot: root });
        const plan = await controller.createPlan({
          operations: [
            {
              type: "store.create",
              storeId: "store-whatsapp-fix",
              name: "Verificación WhatsApp",
              slug: "verificacion-whatsapp",
              email: "hola@verificacion.test",
              phone: "5491100000001",
            },
          ],
        });
        const planned = await controller.getPlan({ planId: plan.planId, includeProject: true });
        expect(planned.project?.whatsapp.phone).toBe("5491100000001");
        expect(planned.project?.identity.phone).toBe("5491100000001");
        expect(planned.project?.identity.email).toBe("hola@verificacion.test");
        // El greeting se regenera con la marca del clon.
        expect(planned.project?.whatsapp.greeting).toBe(
          "Hola Verificación WhatsApp, quiero hacer este pedido:",
        );
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  it(
    "base-template sin datos de contacto deja campos vacíos y advierte por el catálogo demo",
    { timeout: 30_000 },
    async () => {
      const root = await mkdtemp(join(tmpdir(), "solara-agent-sentinels-"));
      try {
        const storage = createLocalProjectStorage({
          applicationRoot: root,
          projectsRoot: join(root, "proyectos"),
          stagingRoot: join(root, ".solara-runtime", "transactions"),
        });
        const template = buildCatalogModernProject({
          seed: "placeholder",
          id: "store-modo-sur-demo",
          name: "Predeterminado",
          slug: "predeterminado",
        });
        const seed = await storage.beginSave({
          projectId: template.id,
          name: template.name,
          slug: template.slug,
          projectUpdatedAt: template.updatedAt,
          expectedVersion: null,
          actor: { kind: "template-upgrade", id: "test-template-seed" },
          allowProtectedWrite: true,
        });
        await storage.upload(
          seed.transactionId,
          "project",
          (async function* () {
            yield new TextEncoder().encode(createProjectArchive(template));
          })(),
        );
        await storage.commit(seed.transactionId);

        const controller = createAgentController({ storage, applicationRoot: root });
        const plan = await controller.createPlan({
          operations: [
            {
              type: "store.create",
              storeId: "store-sentinels",
              name: "Sentinel Store",
              slug: "sentinel-store",
            },
          ],
        });
        const planned = await controller.getPlan({ planId: plan.planId, includeProject: true });
        expect(planned.project?.whatsapp.phone).toBe("");
        expect(planned.project?.identity.email).toBe("");
        expect(planned.project?.identity.phone).toBe("");
        const warnings = plan.warnings.join("\n");
        expect(warnings).toContain("catálogo demo");
        expect(warnings).toContain("WhatsApp");
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  it("store.updateWhatsapp y store.updateNavigation aplican sobre la tienda del plan", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-agent-newops-"));
    try {
      const storage = createLocalProjectStorage({
        applicationRoot: root,
        projectsRoot: join(root, "proyectos"),
        stagingRoot: join(root, ".solara-runtime", "transactions"),
      });
      const controller = createAgentController({ storage, applicationRoot: root });
      const plan = await controller.createPlan({
        operations: [
          {
            type: "store.create",
            storeId: "store-newops",
            name: "Ops nuevas",
            slug: "ops-nuevas",
            source: { kind: "clean" },
          },
          { type: "store.updateWhatsapp", phone: "5491100000002", includeSku: true },
          {
            type: "store.updateNavigation",
            mode: "curated",
            catalogLabel: "Rubros",
            items: [{ id: "nav-1", label: "Buscar", href: "/buscar/" }],
          },
        ],
      });
      const planned = await controller.getPlan({ planId: plan.planId, includeProject: true });
      expect(planned.project?.whatsapp.phone).toBe("5491100000002");
      expect(planned.project?.whatsapp.includeSku).toBe(true);
      expect(planned.project?.navigation.catalogLabel).toBe("Rubros");
      expect(planned.project?.navigation.mode).toBe("curated");
      expect(planned.project?.navigation.items[0]?.href).toBe("/buscar/");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it(
    "optimiza PNG, JPEG y WebP con la misma receta que Studio",
    { timeout: 30_000 },
    async () => {
      const root = await mkdtemp(join(tmpdir(), "solara-agent-image-pipeline-"));
      try {
        const storage = createLocalProjectStorage({
          applicationRoot: root,
          projectsRoot: join(root, "proyectos"),
          stagingRoot: join(root, ".solara-runtime", "transactions"),
        });
        const controller = createAgentController({ storage, applicationRoot: root });
        const inputs = [
          { name: "entrada.png", mimeType: "image/png" as const, data: validPng },
          { name: "entrada.jpg", mimeType: "image/jpeg" as const, data: validJpeg },
          { name: "entrada.webp", mimeType: "image/webp" as const, data: validWebp },
        ];
        const staged = [];
        for (const input of inputs) {
          staged.push(
            await controller.stageAsset({
              name: input.name,
              alt: input.name,
              mimeType: input.mimeType,
              source: { kind: "base64", data: input.data },
            }),
          );
        }
        const plan = await controller.createPlan({
          operations: [
            {
              type: "store.create",
              storeId: "store-agent-image-pipeline",
              name: "Pipeline de imágenes",
              slug: "pipeline-imagenes",
              source: { kind: "clean" },
            },
            ...staged.map((asset, index) => ({
              type: "product.create" as const,
              productId: `product-pipeline-${index}`,
              slug: `producto-pipeline-${index}`,
              title: `Producto pipeline ${index}`,
              description: "Producto de prueba.",
              imageIds: [asset.assetId],
            })),
          ],
        });
        const planned = await controller.getPlan({ planId: plan.planId, includeProject: true });
        for (const [index, stagedAsset] of staged.entries()) {
          const input = inputs[index];
          if (!input) throw new Error("Falta la entrada de prueba.");
          const asset = planned.project?.assets.find((candidate) => candidate.id === stagedAsset.assetId);
          expect(asset).toMatchObject({
            id: stagedAsset.assetId,
            optimizationRecipe: "responsive-alpha-v2",
            mimeType: "image/webp",
          });
          expect(asset?.source).toMatch(/^data:image\/webp;base64,/);
          expect(asset?.fallbackSource).toMatch(/^data:image\/(?:jpeg|png);base64,/);
          expect(asset?.hash).toBe(createHash("sha256").update(Buffer.from(input.data, "base64")).digest("hex"));
          const widths = asset?.responsiveSources?.map((source) => source.width) ?? [];
          expect(widths.length).toBeGreaterThan(0);
          expect(widths.at(-1)).toBe(asset?.width);
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  it("crea, stagea, adjunta y publica una tienda sin copiar el demo", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-agent-control-"));
    try {
      const storage = createLocalProjectStorage({
        applicationRoot: root,
        projectsRoot: join(root, "proyectos"),
        stagingRoot: join(root, ".solara-runtime", "transactions"),
      });
      const controller = createAgentController({ storage, applicationRoot: root });
      const staged = await controller.stageAsset({
        name: "taza.png",
        alt: "Taza",
        mimeType: "image/png",
        source: { kind: "base64", data: validPng },
      });
      const plan = await controller.createPlan({
        idempotencyKey: "agent-test-create-001",
        operations: [
          {
            type: "store.create",
            storeId: "store-agent-test",
            name: "Tienda de prueba",
            slug: "tienda-prueba",
            source: { kind: "clean" },
          },
          {
            type: "store.updateLegalProfile",
            changes: {
              countryCode: "AR",
              taxId: "20-12345678-9",
              jurisdiction: "Provincia de Buenos Aires",
              paymentMethods: ["Transferencia bancaria"],
              salesChannels: ["WhatsApp"],
              consumerRights: { enabled: true },
              revisionAt: "2026-08-31T12:00:00.000Z",
            },
          },
          {
            type: "product.create",
            productId: "product-taza",
            slug: "taza",
            title: "Taza",
            description: "Taza",
            priceCents: 1500,
            imageIds: [staged.assetId],
          },
          {
            type: "asset.attach",
            assetId: staged.assetId,
            target: "product",
            productId: "product-taza",
          },
        ],
      });
      const receipt = await controller.commitPlan({
        planId: plan.planId,
        idempotencyKey: "agent-test-create-001",
      });
      expect(receipt.storeId).toBe("store-agent-test");
      const current = await storage.readCurrent("store-agent-test");
      if (!current) throw new Error("Falta el respaldo del test.");
      const project = readProjectArchive(Buffer.from(current.bytes).toString("utf8"));
      expect(project.name).toBe("Tienda de prueba");
      expect(project.products).toHaveLength(34);
      expect(project.products.find((product) => product.id === "product-taza")?.imageIds).toContain(
        staged.assetId,
      );
      expect(project.legalProfile).toMatchObject({
        countryCode: "AR",
        taxId: "20-12345678-9",
        jurisdiction: "Provincia de Buenos Aires",
        paymentMethods: ["Transferencia bancaria"],
        salesChannels: ["WhatsApp"],
        revisionAt: "2026-08-31T12:00:00.000Z",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("acepta sólo ICO válidos como favicon en el canal del agente", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-agent-favicon-"));
    try {
      const storage = createLocalProjectStorage({
        applicationRoot: root,
        projectsRoot: join(root, "proyectos"),
        stagingRoot: join(root, ".solara-runtime", "transactions"),
      });
      const controller = createAgentController({ storage, applicationRoot: root });
      const png = await controller.stageAsset({
        name: "no-es-favicon.png",
        alt: "No es favicon",
        mimeType: "image/png",
        source: { kind: "base64", data: validPng },
      });
      const baseOperations = [
        {
          type: "store.create" as const,
          storeId: "store-agent-favicon",
          name: "Tienda favicon",
          slug: "tienda-favicon",
          source: { kind: "clean" as const },
        },
      ];
      await expect(
        controller.createPlan({
          operations: [
            ...baseOperations,
            { type: "asset.attach", assetId: png.assetId, target: "identity.logo" as const },
            { type: "asset.attach", assetId: png.assetId, target: "seo.favicon" as const },
          ],
        }),
      ).rejects.toMatchObject({ code: "FAVICON_NOT_ICO" });

      const ico = await controller.stageAsset({
        name: "favicon.ico",
        alt: "Favicon válido",
        mimeType: "image/x-icon",
        source: { kind: "base64", data: Buffer.from(buildFaviconIco("agente")).toString("base64") },
      });
      const plan = await controller.createPlan({
        operations: [
          ...baseOperations,
          { type: "asset.attach", assetId: png.assetId, target: "identity.logo" as const },
          { type: "asset.attach", assetId: ico.assetId, target: "seo.favicon" as const },
        ],
      });
      await controller.commitPlan({ planId: plan.planId });
      const current = await storage.readCurrent("store-agent-favicon");
      if (!current) throw new Error("Falta el respaldo de la tienda de favicon.");
      const project = readProjectArchive(Buffer.from(current.bytes).toString("utf8"));
      expect(project.seo.faviconAssetId).toBe(ico.assetId);
      const favicon = project.assets.find((asset) => asset.id === ico.assetId);
      expect(favicon?.optimizationRecipe).toBe("responsive-alpha-v2");
      expect(favicon?.fallbackSource).toMatch(/^data:image\/png;base64,/);
      expect(favicon?.responsiveSources?.at(-1)?.width).toBe(favicon?.width);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("incorpora un asset stageado al actualizar la imagen de una categoría", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-agent-category-image-"));
    try {
      const storage = createLocalProjectStorage({
        applicationRoot: root,
        projectsRoot: join(root, "proyectos"),
        stagingRoot: join(root, ".solara-runtime", "transactions"),
      });
      const controller = createAgentController({ storage, applicationRoot: root });
      const storeId = "store-category-image-test";
      const categoryId = "category-image-test";
      const initialPlan = await controller.createPlan({
        idempotencyKey: "agent-test-category-image-initial-001",
        operations: [
          {
            type: "store.create",
            storeId,
            name: "Categorías",
            slug: "categorias",
            source: { kind: "clean" },
          },
          {
            type: "category.create",
            categoryId,
            slug: "categoria",
            title: "Categoría",
            description: "Categoría de prueba.",
          },
        ],
      });
      await controller.commitPlan({
        planId: initialPlan.planId,
        idempotencyKey: "agent-test-category-image-initial-001",
      });
      const staged = await controller.stageAsset({
        name: "categoria.png",
        alt: "Categoría",
        mimeType: "image/png",
        source: { kind: "base64", data: validPng },
      });
      const plan = await controller.createPlan({
        storeId,
        baseVersion: 1,
        idempotencyKey: "agent-test-category-image-001",
        operations: [
          {
            type: "category.update",
            categoryId,
            changes: { imageId: staged.assetId },
          },
        ],
      });
      expect(plan.diff.categories.updated).toContain(categoryId);
      expect(plan.diff.assets.created).toContain(staged.assetId);

      await controller.commitPlan({
        planId: plan.planId,
        idempotencyKey: "agent-test-category-image-001",
      });
      const current = await storage.readCurrent(storeId);
      if (!current) throw new Error("Falta el respaldo del test.");
      const project = readProjectArchive(Buffer.from(current.bytes).toString("utf8"));
      expect(project.categories.find((candidate) => candidate.id === categoryId)?.imageId).toBe(
        staged.assetId,
      );
      expect(project.assets.some((asset) => asset.id === staged.assetId)).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("recupera planes, sube assets por chunks, mantiene lock y ejecuta jobs", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-agent-durable-"));
    try {
      const storage = createLocalProjectStorage({
        applicationRoot: root,
        projectsRoot: join(root, "proyectos"),
        stagingRoot: join(root, ".solara-runtime", "transactions"),
      });
      const first = createAgentController({ storage, applicationRoot: root });
      const upload = await first.beginAssetUpload({
        name: "marca.png",
        alt: "Marca",
        mimeType: "image/png",
        expectedBytes: Buffer.from(validPng, "base64").byteLength,
      });
      await first.uploadAssetChunk({
        uploadId: upload.uploadId,
        sequence: 0,
        data: validPng,
      });
      const staged = await first.finishAssetUpload({ uploadId: upload.uploadId });
      const plan = await first.createPlan({
        idempotencyKey: "durable-agent-plan-001",
        operations: [
          {
            type: "store.create",
            storeId: "store-durable",
            name: "Durable",
            slug: "durable",
            source: { kind: "clean" },
          },
          {
            type: "product.create",
            productId: "product-durable",
            slug: "producto",
            title: "Producto",
            priceCents: 100,
            imageIds: [staged.assetId],
          },
          {
            type: "asset.attach",
            assetId: staged.assetId,
            target: "product",
            productId: "product-durable",
          },
        ],
      });
      expect(plan.diff.products.created).toContain("product-durable");

      const recovered = createAgentController({ storage, applicationRoot: root });
      expect((await recovered.getPlan({ planId: plan.planId })).planId).toBe(plan.planId);
      const job = await recovered.commitPlan({
        planId: plan.planId,
        idempotencyKey: "durable-agent-plan-001",
        async: true,
      });
      let finalJob = await recovered.getJob({ jobId: job.jobId });
      for (
        let attempt = 0;
        attempt < 100 && ["queued", "running"].includes(finalJob.status);
        attempt += 1
      ) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        finalJob = await recovered.getJob({ jobId: job.jobId });
      }
      expect(finalJob.status).toBe("succeeded");
      const replay = await recovered.commitPlan({
        planId: plan.planId,
        idempotencyKey: "durable-agent-plan-001",
      });
      expect(replay.version).toBe(finalJob.result.version);
      const current = await storage.readCurrent("store-durable");
      expect(current?.manifest.current.version).toBe(finalJob.result.version);

      const update = await recovered.createPlan({
        storeId: "store-durable",
        baseVersion: 1,
        operations: [{ type: "store.updateSeo", changes: { title: "Durable nueva" } }],
      });
      const competing = createAgentController({ storage, applicationRoot: root });
      await expect(
        competing.createPlan({
          storeId: "store-durable",
          baseVersion: 1,
          operations: [{ type: "store.updateSeo", changes: { title: "Competidora" } }],
        }),
      ).rejects.toMatchObject({ code: "AGENT_LOCKED" });
      await recovered.discardPlan({ planId: update.planId });

      const readOnly = createAgentController({
        storage,
        applicationRoot: root,
        scopes: ["read"],
      });
      await expect(
        readOnly.createPlan({
          storeId: "store-durable",
          baseVersion: 1,
          operations: [{ type: "store.updateSeo", changes: { title: "No permitido" } }],
        }),
      ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 15000);

  it("excluye la plantilla de site-rebuild y permite rollback; migra tiendas por separado", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-agent-rollout-"));
    try {
      const storage = createLocalProjectStorage({
        applicationRoot: root,
        projectsRoot: join(root, "proyectos"),
        stagingRoot: join(root, ".solara-runtime", "transactions"),
      });
      const template = buildCatalogModernProject({
        seed: "placeholder",
        id: "store-modo-sur-demo",
        name: "Predeterminado",
        slug: "predeterminado",
      });
      const seed = await storage.beginSave({
        projectId: template.id,
        name: template.name,
        slug: template.slug,
        projectUpdatedAt: template.updatedAt,
        expectedVersion: null,
        actor: { kind: "template-upgrade", id: "rollout-template-seed" },
        allowProtectedWrite: true,
      });
      await storage.upload(
        seed.transactionId,
        "project",
        (async function* () {
          yield new TextEncoder().encode(createProjectArchive(template));
        })(),
      );
      await storage.commit(seed.transactionId);

      const controller = createAgentController({ storage, applicationRoot: root });
      const clonePlan = await controller.createPlan({
        operations: [
          {
            type: "store.create",
            storeId: "store-rollout-clone",
            name: "Clon rollout",
            slug: "clon-rollout",
          },
        ],
      });
      await controller.commitPlan({ planId: clonePlan.planId });

      const sitePreview = await controller.previewRollout({ kind: "site-rebuild" });
      expect(sitePreview.stores.find((store) => store.storeId === template.id)).toMatchObject({
        status: "skipped",
        reason: "protected",
      });
      expect(
        sitePreview.stores.find((store) => store.storeId === "store-rollout-clone"),
      ).toMatchObject({ status: "ready" });
      const siteJob = await controller.commitRollout({
        previewId: sitePreview.previewId,
        idempotencyKey: "rollout-site-rebuild-001",
        async: false,
      });
      expect(siteJob.status).toBe("succeeded");
      const siteResult = siteJob.result.results.find(
        (result: { storeId: string }) => result.storeId === "store-rollout-clone",
      );
      expect(siteResult).toMatchObject({ status: "applied" });
      expect(siteResult.site.previousSite).not.toBeNull();
      await expect(
        controller.rollbackRollout({
          rolloutId: sitePreview.previewId,
          storeId: "store-rollout-clone",
          expectedVersion: 1,
        }),
      ).resolves.toMatchObject({ version: 1, status: "synced" });
      expect(
        Number(
          (
            (await storage.readCurrent(template.id))?.manifest as {
              current?: { version?: number };
            }
          )?.current?.version,
        ),
      ).toBe(1);

      const migrationSource = buildCatalogModernProject({ seed: "demo" });
      const stale = StoreProjectV2Schema.parse({
        ...migrationSource,
        id: "store-rollout-migration",
        name: "Migrable",
        slug: "migrable",
        baseUrl: "https://migrable.example",
        navigation: {
          ...migrationSource.navigation,
          catalogLabel: "Colecciones",
        },
        origin: {
          ...migrationSource.origin,
          seed: "duplicate",
          role: "store",
          updatePolicy: "managed",
          templateVersion: 1,
        },
      });
      const staleSeed = await storage.beginSave({
        projectId: stale.id,
        name: stale.name,
        slug: stale.slug,
        projectUpdatedAt: stale.updatedAt,
        expectedVersion: null,
        actor: { kind: "rollout", id: "migration-seed" },
      });
      await storage.upload(
        staleSeed.transactionId,
        "project",
        (async function* () {
          yield new TextEncoder().encode(createProjectArchive(stale));
        })(),
      );
      await storage.commit(staleSeed.transactionId);

      const migrationPreview = await controller.previewRollout({
        kind: "project-migration",
        target: { storeIds: [stale.id], status: "active", excludeProtected: true },
      });
      expect(migrationPreview.stores).toHaveLength(1);
      expect(migrationPreview.stores[0]).toMatchObject({ status: "ready" });
      const migrationJob = await controller.commitRollout({
        previewId: migrationPreview.previewId,
        idempotencyKey: "rollout-project-migration-001",
        async: false,
      });
      const migrationResult = migrationJob.result.results[0];
      expect(migrationResult).toMatchObject({ status: "applied" });
      const migrated = readProjectArchive(
        Buffer.from((await storage.readCurrent(stale.id))?.bytes ?? "").toString("utf8"),
      );
      expect(migrated.navigation.catalogLabel).toBe("Categorías");
      expect(migrated.origin?.templateVersion).not.toBe(1);
      await expect(
        controller.rollbackRollout({
          rolloutId: migrationPreview.previewId,
          storeId: stale.id,
          expectedVersion: migrationResult.result.version,
        }),
      ).resolves.toMatchObject({ status: "synced" });
      const restored = readProjectArchive(
        Buffer.from((await storage.readCurrent(stale.id))?.bytes ?? "").toString("utf8"),
      );
      expect(restored.navigation.catalogLabel).toBe("Colecciones");
      expect(restored.origin?.templateVersion).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 15000);

  it(
    "archiva y restaura una tienda con store.archive y stores.restore",
    { timeout: 20000 },
    async () => {
      const root = await mkdtemp(join(tmpdir(), "solara-agent-archive-"));
      try {
        const storage = createLocalProjectStorage({
          applicationRoot: root,
          projectsRoot: join(root, "proyectos"),
          stagingRoot: join(root, ".solara-runtime", "transactions"),
        });
        const controller = createAgentController({ storage, applicationRoot: root });
        const plan = await controller.createPlan({
          idempotencyKey: "archive-store-test-001",
          operations: [
            {
              type: "store.create",
              storeId: "store-archivo",
              name: "Archivo",
              slug: "archivo",
              source: { kind: "clean" },
            },
            {
              type: "product.create",
              productId: "product-a",
              slug: "a",
              title: "A",
              priceCents: 100,
            },
          ],
        });
        await controller.commitPlan({
          planId: plan.planId,
          idempotencyKey: "archive-store-test-001",
        });

        // Verificar que la tienda existe antes de archivar.
        const before = await controller.getStore({ storeId: "store-archivo" });
        expect(before.status).toBe("active");

        // Archivar mediante un plan de actualización.
        const archivePlan = await controller.createPlan({
          storeId: "store-archivo",
          baseVersion: 1,
          operations: [{ type: "store.archive", confirmation: "ARCHIVAR_TIENDA" }],
        });
        const archiveReceipt = await controller.commitPlan({ planId: archivePlan.planId });
        expect(archiveReceipt.status).toBe("site-outdated");

        const archived = await controller.getStore({ storeId: "store-archivo" });
        expect(archived.status).toBe("archived");

        // Restaurar.
        const restoreResult = await controller.restoreStore({ storeId: "store-archivo" });
        expect(restoreResult.storeId).toBe("store-archivo");
        expect(restoreResult.status).toBe("synced");

        const restored = await controller.getStore({ storeId: "store-archivo" });
        expect(restored.status).toBe("active");
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  it(
    "reanuda un rollout durable después de reiniciar el controlador",
    { timeout: 30_000 },
    async () => {
      const root = await mkdtemp(join(tmpdir(), "solara-agent-resume-"));
      try {
        const storage = createLocalProjectStorage({
          applicationRoot: root,
          projectsRoot: join(root, "proyectos"),
          stagingRoot: join(root, ".solara-runtime", "transactions"),
        });
        const first = createAgentController({ storage, applicationRoot: root });
        const plan = await first.createPlan({
          operations: [
            {
              type: "store.create",
              storeId: "store-resumable-rollout",
              name: "Rollout reanudable",
              slug: "rollout-reanudable",
              source: { kind: "clean" },
            },
          ],
        });
        await first.commitPlan({ planId: plan.planId });
        const preview = await first.previewRollout({ kind: "site-rebuild" });
        const jobPath = join(root, ".solara-runtime", "agent", "jobs", "job-restart.json");
        await writeFile(
          jobPath,
          `${JSON.stringify(
            {
              jobId: "job-restart",
              kind: "rollout",
              rolloutId: preview.previewId,
              idempotencyKey: "resume-rollout-001",
              status: "running",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            null,
            2,
          )}\n`,
          "utf8",
        );

        const recovered = createAgentController({ storage, applicationRoot: root });
        let finalJob: { status?: string } | undefined;
        for (let attempt = 0; attempt < 40; attempt += 1) {
          const result = await recovered.getRollout({ rolloutId: preview.previewId });
          finalJob = result.job as { status?: string } | undefined;
          if (finalJob?.status === "succeeded") break;
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        expect(finalJob?.status).toBe("succeeded");
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  it("elimina físicamente productos archivados y libera sus índices derivados", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-agent-product-delete-"));
    try {
      const storage = createLocalProjectStorage({
        applicationRoot: root,
        projectsRoot: join(root, "proyectos"),
        stagingRoot: join(root, ".solara-runtime", "transactions"),
      });
      const controller = createAgentController({ storage, applicationRoot: root });
      const storeId = "store-product-delete";
      const archivedProductId = "product-delete-archived";
      const activeProductId = "product-delete-active";
      const initial = await controller.createPlan({
        idempotencyKey: "agent-product-delete-initial-001",
        operations: [
          {
            type: "store.create",
            storeId,
            name: "Borrado de productos",
            slug: "borrado-de-productos",
            source: { kind: "clean" },
          },
          {
            type: "category.create",
            categoryId: "category-delete-test",
            slug: "categoria-delete-test",
            title: "Categoría de prueba",
          },
          {
            type: "product.create",
            productId: archivedProductId,
            slug: "producto-archivado",
            title: "Producto archivado",
            status: "archived",
            categoryIds: ["category-delete-test"],
            priceCents: 100,
          },
          {
            type: "product.create",
            productId: activeProductId,
            slug: "producto-activo",
            title: "Producto activo",
            categoryIds: ["category-delete-test"],
            priceCents: 200,
          },
        ],
      });
      const initialReceipt = await controller.commitPlan({
        planId: initial.planId,
        idempotencyKey: "agent-product-delete-initial-001",
      });

      const protocol = await controller.describeProtocol({});
      expect(protocol.operationTypes).toContain("product.delete");
      await expect(
        controller.createPlan({
          storeId,
          baseVersion: initialReceipt.version,
          operations: [
            {
              type: "product.delete",
              productId: activeProductId,
              confirmation: "ELIMINAR_PRODUCTO",
            },
          ],
        }),
      ).rejects.toMatchObject({ code: "PRODUCT_DELETE_REQUIRES_ARCHIVED" });

      const plan = await controller.createPlan({
        storeId,
        baseVersion: initialReceipt.version,
        idempotencyKey: "agent-product-delete-001",
        operations: [
          {
            type: "product.delete",
            productId: archivedProductId,
            confirmation: "ELIMINAR_PRODUCTO",
          },
        ],
      });
      expect(plan.diff.products.removed).toContain(archivedProductId);
      await controller.commitPlan({
        planId: plan.planId,
        idempotencyKey: "agent-product-delete-001",
      });

      const current = await storage.readCurrent(storeId);
      if (!current) throw new Error("Falta el respaldo del test.");
      const project = readProjectArchive(Buffer.from(current.bytes).toString("utf8"));
      expect(project.products).toHaveLength(34);
      expect(project.products.map((product) => product.id)).toContain(activeProductId);
      expect(project.products.map((product) => product.id)).not.toContain(archivedProductId);
      expect(
        project.categories.find((category) => category.id === "category-delete-test")?.productIds,
      ).toEqual([activeProductId]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("elimina físicamente categorías ocultas y vacías mediante category.delete", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-agent-category-delete-"));
    try {
      const storage = createLocalProjectStorage({
        applicationRoot: root,
        projectsRoot: join(root, "proyectos"),
        stagingRoot: join(root, ".solara-runtime", "transactions"),
      });
      const controller = createAgentController({ storage, applicationRoot: root });
      const storeId = "store-category-delete";
      const categoryId = "category-delete-test";
      const activeCategoryId = "category-delete-active";
      const initial = await controller.createPlan({
        idempotencyKey: "agent-category-delete-initial-001",
        operations: [
          {
            type: "store.create",
            storeId,
            name: "Borrado de categorías",
            slug: "borrado-de-categorias",
            source: { kind: "clean" },
          },
          {
            type: "category.create",
            categoryId,
            slug: "categoria-delete-test",
            title: "Categoría a eliminar",
          },
          {
            type: "category.create",
            categoryId: activeCategoryId,
            slug: "categoria-delete-activa",
            title: "Categoría activa",
          },
          {
            type: "category.setStatus",
            categoryId,
            status: "hidden",
          },
        ],
      });
      const initialReceipt = await controller.commitPlan({
        planId: initial.planId,
        idempotencyKey: "agent-category-delete-initial-001",
      });

      const protocol = await controller.describeProtocol({});
      expect(protocol.operationTypes).toContain("category.delete");
      await expect(
        controller.createPlan({
          storeId,
          baseVersion: initialReceipt.version,
          operations: [
            {
              type: "category.delete",
              categoryId: activeCategoryId,
              confirmation: "ELIMINAR_CATEGORIA",
            },
          ],
        }),
      ).rejects.toMatchObject({ code: "CATEGORY_DELETE_REQUIRES_HIDDEN" });

      const plan = await controller.createPlan({
        storeId,
        baseVersion: initialReceipt.version,
        idempotencyKey: "agent-category-delete-001",
        operations: [
          {
            type: "category.delete",
            categoryId,
            confirmation: "ELIMINAR_CATEGORIA",
          },
        ],
      });
      expect(plan.diff.categories.removed).toContain(categoryId);
      await controller.commitPlan({
        planId: plan.planId,
        idempotencyKey: "agent-category-delete-001",
      });

      const current = await storage.readCurrent(storeId);
      if (!current) throw new Error("Falta el respaldo del test.");
      const project = readProjectArchive(Buffer.from(current.bytes).toString("utf8"));
      expect(project.categories).toHaveLength(7);
      expect(project.categories.map((category) => category.id)).toContain(activeCategoryId);
      expect(project.categories.map((category) => category.id)).not.toContain(categoryId);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reporta blockingIssues en plans.create para productos sin imagen", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-agent-blocking-"));
    try {
      const storage = createLocalProjectStorage({
        applicationRoot: root,
        projectsRoot: join(root, "proyectos"),
        stagingRoot: join(root, ".solara-runtime", "transactions"),
      });
      const controller = createAgentController({ storage, applicationRoot: root });
      const plan = await controller.createPlan({
        operations: [
          {
            type: "store.create",
            storeId: "store-sin-imagen",
            name: "Sin imagen",
            slug: "sin-imagen",
            source: { kind: "clean" },
          },
          {
            type: "product.create",
            productId: "product-b",
            slug: "b",
            title: "B",
            priceCents: 100,
          },
        ],
      });
      expect(Array.isArray(plan.blockingIssues)).toBe(true);
      expect(plan.blockingIssues.some((issue) => issue.code === "product.image")).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it(
    "actualiza settings de una sección y acepta assets stageados en sesión previa",
    { timeout: 20000 },
    async () => {
      const root = await mkdtemp(join(tmpdir(), "solara-agent-section-"));
      try {
        const storage = createLocalProjectStorage({
          applicationRoot: root,
          projectsRoot: join(root, "proyectos"),
          stagingRoot: join(root, ".solara-runtime", "transactions"),
        });
        const first = createAgentController({ storage, applicationRoot: root });
        const staged = await first.stageAsset({
          name: "hero.png",
          alt: "Hero",
          mimeType: "image/png",
          source: { kind: "base64", data: validPng },
        });

        const plan = await first.createPlan({
          idempotencyKey: "section-test-001",
          operations: [
            {
              type: "store.create",
              storeId: "store-section-test",
              name: "Section Test",
              slug: "section-test",
              source: { kind: "clean" },
            },
            // Referencia el asset desde product.create sin asset.attach explícito.
            // Esto valida la recolección de imageIds en applyOperations.
            {
              type: "product.create",
              productId: "product-hero",
              slug: "hero-product",
              title: "Hero Product",
              description: "Test",
              priceCents: 1000,
              imageIds: [staged.assetId],
            },
            {
              type: "section.updateSettings",
              sectionId: "modo-section-hero",
              settings: { posterAssetId: staged.assetId },
            },
          ],
        });
        const receipt = await first.commitPlan({
          planId: plan.planId,
          idempotencyKey: "section-test-001",
        });
        expect(receipt.storeId).toBe("store-section-test");

        // Un segundo controlador (nueva "sesión") debe poder leer los assets del disco.
        const second = createAgentController({ storage, applicationRoot: root });
        const update = await second.createPlan({
          storeId: "store-section-test",
          baseVersion: receipt.version,
          operations: [
            {
              type: "section.updateSettings",
              sectionId: "modo-section-hero",
              settings: { backgroundImageId: staged.assetId },
            },
          ],
        });
        await second.commitPlan({ planId: update.planId });
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );
});
