import { createHash, randomBytes } from "node:crypto";
import { appendFile, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import {
  type AgentOperation,
  AgentOperationSchema,
  AssetGeneratePlaceholderParamsSchema,
  type AssetStageParams,
  AssetStageParamsSchema,
  AssetUploadBeginParamsSchema,
  AssetUploadChunkParamsSchema,
  AssetUploadFinishParamsSchema,
  AuditListParamsSchema,
  JobGetParamsSchema,
  PlanCommitParamsSchema,
  PlanCreateAndCommitParamsSchema,
  PlanCreateParamsSchema,
  PlanDiscardParamsSchema,
  PlanGetParamsSchema,
  PlanHeartbeatParamsSchema,
  ProtocolDescribeParamsSchema,
  RolloutCommitParamsSchema,
  RolloutGetParamsSchema,
  RolloutPreviewParamsSchema,
  RolloutRollbackParamsSchema,
  StoreGetParamsSchema,
  StoreRestoreParamsSchema,
  TemplateCommitUpgradeParamsSchema,
  TemplateGetParamsSchema,
  TemplatePreviewUpgradeParamsSchema,
} from "@solara/agent-contracts";
import {
  applyMutation,
  createMutationRegistry,
  type ProjectMutation,
  reduceProject,
} from "@solara/core";
import {
  auditProject,
  createProjectArchive,
  EXPORTER_RENDERER_FINGERPRINT,
  exportProject,
  imageMimeTypeFromSource,
  readProjectArchive,
} from "@solara/exporter";
import {
  type Category,
  CategorySchema,
  CollectionSchema,
  type ImageAsset,
  ImageAssetSchema,
  isValidIco,
  type Product,
  ProductSchema,
  type StoreProjectV1,
  StoreProjectV2Schema,
} from "@solara/project-schema";
import { isCatalogModernSentinelValue } from "@solara/project-schema/catalog-modern-guidance";
import { buildModernBaseTemplateProject } from "@solara/project-schema/catalog-modern-template";
import {
  applyCatalogModernUpgrade,
  planCatalogModernUpgrade,
  type TemplateUpgradePlan,
} from "@solara/project-schema/catalog-modern-upgrade";
import {
  BASE_TEMPLATE_STORE_ID,
  cloneProjectFromTemplate,
  getStorePolicy,
  isBaseTemplate,
} from "@solara/project-schema/project-policy";
// El lock es compartido por el agente y el storage de Studio para coordinar
// procesos separados sin habilitar escritura arbitraria.
// @ts-expect-error módulo .mjs compartido sin d.ts
import { createAgentLockStore } from "../../exporter/scripts/agent-lock.mjs";
// El layout compartido es un módulo Node ESM sin declaraciones; Vite lo
// incorpora al bundle y el contrato runtime se comprueba en tests locales.
// @ts-expect-error módulo .mjs compartido sin d.ts
import { assertNoReparsePoints } from "../../exporter/scripts/local-layout.mjs";
import { optimizeFavicon, optimizeRasterImage } from "./image-optimizer.js";
import { migrationApplies, resolveMigration } from "./migration-registry.js";

interface AgentLocalProjectStorage {
  applicationRoot: string;
  projectsRoot: string;
  ensureRoots(): Promise<void>;
  status(): Promise<{ writable: boolean; [key: string]: unknown }>;
  list(): Promise<unknown>;
  beginSave(meta: {
    projectId: string;
    name: string;
    slug: string;
    projectUpdatedAt: string;
    expectedVersion: number | null;
    rendererFingerprint?: string;
    actor?: { kind: "agent" | "template-upgrade" | "rollout"; id: string };
    allowProtectedWrite?: boolean;
  }): Promise<{ transactionId: string; version: number; folder: string }>;
  upload(
    transactionId: string,
    kind: "project" | "site",
    request: AsyncIterable<Uint8Array> & { headers?: Record<string, string> },
  ): Promise<{ bytes: number; sha256: string }>;
  commit(transactionId: string, options?: { protectedSiteKeys?: string[] }): Promise<unknown>;
  abort(transactionId: string): Promise<void>;
  readCurrent(projectId: string): Promise<{ manifest: unknown; bytes: Uint8Array } | undefined>;
  manualBackup(projectId: string): Promise<{ path: string; version: number }>;
  rebuildSite(
    projectId: string,
    request: AsyncIterable<Uint8Array> & { headers?: Record<string, string> },
    options?: { actor?: { kind: "rollout"; id: string }; rendererFingerprint?: string },
  ): Promise<unknown>;
  restoreSite(
    projectId: string,
    expectedVersion: number,
    site: Record<string, unknown>,
  ): Promise<unknown>;
}

type AgentError = Error & { code?: string; details?: unknown };

interface PlanDraft {
  planId: string;
  storeId: string;
  baseVersion: number | null;
  project: StoreProjectV1;
  operations: AgentOperation[];
  createdNewStore: boolean;
  createdAt: string;
  expiresAt: string;
  diff: PlanDiff;
  warnings: string[];
  blockingIssues: Array<{ code: string; severity: string; message: string }>;
  includeDiff: boolean;
  idempotencyKey?: string;
}

interface TemplateUpgradeDraft {
  previewId: string;
  storeId: string;
  baseVersion: number;
  project: StoreProjectV1;
  plan: TemplateUpgradePlan;
  createdAt: string;
  expiresAt: string;
}

interface RolloutStorePreview {
  storeId: string;
  name: string;
  baseVersion: number;
  status: "ready" | "conflict" | "skipped";
  reason?: string;
  safeChanges?: string[];
  conflicts?: string[];
}

interface RolloutDraft {
  previewId: string;
  kind: "site-rebuild" | "project-migration";
  migrationId?: string;
  createdAt: string;
  expiresAt: string;
  stores: RolloutStorePreview[];
  target: { status: "active"; excludeProtected: boolean; storeIds?: string[] | undefined };
}

interface StagedAsset {
  asset: ImageAsset;
  bytesPath?: string;
}

interface PlanDiff {
  store: { mode: "create" | "update"; storeId: string; name: string };
  identity: string[];
  seo: string[];
  products: { created: string[]; updated: string[]; removed: string[] };
  categories: { created: string[]; updated: string[]; removed: string[] };
  collections: { created: string[]; updated: string[]; removed: string[] };
  assets: { created: string[]; updated: string[]; removed: string[] };
  operationCount: number;
}

interface AgentJob {
  jobId: string;
  kind: "plans.commit" | "rollout";
  planId?: string;
  rolloutId?: string;
  requestId?: string | number;
  idempotencyKey?: string;
  status: "queued" | "running" | "succeeded" | "failed";
  createdAt: string;
  updatedAt: string;
  partialResults?: Array<Record<string, unknown>>;
  result?: unknown;
  error?: { code: string; message: string; details?: unknown };
}

interface ControllerOptions {
  storage: AgentLocalProjectStorage;
  applicationRoot: string;
  now?: () => Date;
  protectedStoreIds?: Iterable<string>;
  baseTemplateStoreId?: string;
  scopes?: Iterable<string>;
  actorId?: string;
}

const MAX_INLINE_ASSET_BYTES = 1_500_000;
const MAX_INBOX_ASSET_BYTES = 20_000_000;
const MAX_UPLOAD_CHUNK_BYTES = 1_000_000;
const PLAN_TTL_MS = 30 * 60 * 1000;

function fail(code: string, message: string, details?: unknown): never {
  const error = new Error(message) as AgentError;
  error.code = code;
  if (details !== undefined) error.details = details;
  throw error;
}

function safeSlug(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return slug || "nueva-tienda";
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`.slice(0, 96);
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function siteMap(files: ReadonlyMap<string, string | Uint8Array>): string {
  return JSON.stringify(
    [...files.entries()].map(([path, value]) =>
      typeof value === "string"
        ? { path, encoding: "utf8", data: value }
        : { path, encoding: "base64", data: bytesToBase64(value) },
    ),
  );
}

function bytesStream(
  bytes: Uint8Array,
): AsyncIterable<Uint8Array> & { headers: Record<string, string> } {
  return {
    headers: { "x-solara-sha256": digest(bytes) },
    async *[Symbol.asyncIterator]() {
      yield bytes;
    },
  };
}

function projectIsProtected(project: StoreProjectV1, explicit: Set<string>): boolean {
  return isBaseTemplate(project, explicit);
}

function summary(project: StoreProjectV1, version: number | null, protectedStore: boolean) {
  return {
    storeId: project.id,
    name: project.name,
    slug: project.slug,
    status: project.status,
    schemaVersion: project.schemaVersion,
    originSeed: project.origin?.seed ?? "unknown",
    protected: protectedStore,
    role: getStorePolicy(project, protectedStore ? [project.id] : []).role,
    updatePolicy: project.origin?.updatePolicy ?? "managed",
    templateVersion: project.origin?.templateVersion ?? null,
    version,
    counts: {
      products: project.products.length,
      categories: project.categories.length,
      collections: project.collections.length,
      assets: project.assets.length,
    },
    updatedAt: project.updatedAt,
  };
}

function stable(value: unknown): string {
  return JSON.stringify(value);
}

function keyedChanges<T extends { id: string }>(before: T[], after: T[]) {
  const oldById = new Map(before.map((item) => [item.id, item]));
  const newById = new Map(after.map((item) => [item.id, item]));
  return {
    created: after.filter((item) => !oldById.has(item.id)).map((item) => item.id),
    updated: after
      .filter((item) => oldById.has(item.id) && stable(oldById.get(item.id)) !== stable(item))
      .map((item) => item.id),
    removed: before.filter((item) => !newById.has(item.id)).map((item) => item.id),
  };
}

function planDiff(
  before: StoreProjectV1 | undefined,
  after: StoreProjectV1,
  operations: AgentOperation[],
  createdNewStore: boolean,
): PlanDiff {
  return {
    store: {
      mode: createdNewStore ? "create" : "update",
      storeId: after.id,
      name: after.name,
    },
    identity: before && stable(before.identity) !== stable(after.identity) ? ["identity"] : [],
    seo: before && stable(before.seo) !== stable(after.seo) ? ["seo"] : [],
    products: keyedChanges(before?.products ?? [], after.products),
    categories: keyedChanges(before?.categories ?? [], after.categories),
    collections: keyedChanges(before?.collections ?? [], after.collections),
    assets: keyedChanges(before?.assets ?? [], after.assets),
    operationCount: operations.length,
  };
}

function planWarnings(project: StoreProjectV1, diff: PlanDiff): string[] {
  const warnings: string[] = [];
  if (project.products.length === 0) warnings.push("La tienda todavía no tiene productos.");
  if (
    diff.assets.created.length === 0 &&
    project.products.some((product) => product.imageIds.length === 0)
  ) {
    warnings.push("Hay productos sin imagen asociada.");
  }
  if (!project.identity.phone) warnings.push("La tienda todavía no tiene teléfono de WhatsApp.");
  // La plantilla base siembra un catálogo demo y datos de contacto de
  // ejemplo: un clon que no los reemplace se vería terminado sin serlo.
  const hasDemoProducts = project.products.some(
    (product) =>
      /^product-placeholder-\d+$/.test(product.id) ||
      isCatalogModernSentinelValue(product.title) ||
      isCatalogModernSentinelValue(product.description),
  );
  if (hasDemoProducts) {
    warnings.push(
      "La tienda todavía tiene productos del catálogo demo de la plantilla; reemplazalos antes de publicar.",
    );
  }
  const demoEmail = project.identity.email.trim().toLowerCase() === "email@gmail.com";
  const demoPhone = project.identity.phone === "15412345";
  if (demoEmail || demoPhone) {
    warnings.push("La identidad todavía tiene datos de contacto de ejemplo de la plantilla.");
  }
  if (!project.whatsapp.phone) {
    warnings.push(
      "whatsapp.phone está vacío: el sitio se exporta sin enlaces de WhatsApp; configuralo con store.updateWhatsapp.",
    );
  }
  return warnings;
}

function strictBase64(value: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))
    fail("ASSET_BASE64_INVALID", "El asset no contiene base64 válido.");
  const bytes = new Uint8Array(Buffer.from(value, "base64"));
  if (Buffer.from(bytes).toString("base64") !== value) {
    fail("ASSET_BASE64_INVALID", "El asset no contiene base64 válido.");
  }
  return bytes;
}

async function writeAtomic(pathname: string, value: string | Uint8Array): Promise<void> {
  const temporary = `${pathname}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporary, value);
    await rename(temporary, pathname);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

function imageDimensions(mimeType: AssetStageParams["mimeType"], bytes: Uint8Array) {
  const byte = (index: number) => bytes[index] ?? 0;
  if (mimeType === "image/png" && bytes.length >= 24) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a) {
      return { width: view.getUint32(16), height: view.getUint32(20) };
    }
  }
  if (
    mimeType === "image/x-icon" &&
    isValidIco(bytes) &&
    byte(0) === 0 &&
    byte(1) === 0 &&
    byte(2) === 1 &&
    byte(3) === 0
  ) {
    const count = byte(4) | (byte(5) << 8);
    if (count > 0 && bytes.length >= 6 + count * 16) {
      let width = 0;
      let height = 0;
      for (let index = 0; index < count; index += 1) {
        const offset = 6 + index * 16;
        width = Math.max(width, byte(offset) || 256);
        height = Math.max(height, byte(offset + 1) || 256);
      }
      if (width > 0 && height > 0) return { width, height };
    }
  }
  if (
    mimeType === "image/gif" &&
    bytes.length >= 10 &&
    (String.fromCharCode(...bytes.subarray(0, 6)) === "GIF89a" ||
      String.fromCharCode(...bytes.subarray(0, 6)) === "GIF87a")
  ) {
    return { width: byte(6) | (byte(7) << 8), height: byte(8) | (byte(9) << 8) };
  }
  if (
    mimeType === "image/webp" &&
    bytes.length >= 30 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  ) {
    const kind = String.fromCharCode(...bytes.subarray(12, 16));
    if (kind === "VP8X") {
      return {
        width: 1 + byte(24) + (byte(25) << 8) + (byte(26) << 16),
        height: 1 + byte(27) + (byte(28) << 8) + (byte(29) << 16),
      };
    }
  }
  if (mimeType === "image/jpeg" && bytes.length >= 4 && byte(0) === 0xff && byte(1) === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (byte(offset) !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = byte(offset + 1);
      const length = (byte(offset + 2) << 8) | byte(offset + 3);
      if (length < 2 || offset + length + 2 > bytes.length) break;
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
          marker,
        )
      ) {
        return {
          height: (byte(offset + 5) << 8) | byte(offset + 6),
          width: (byte(offset + 7) << 8) | byte(offset + 8),
        };
      }
      offset += length + 2;
    }
  }
  fail("ASSET_DIMENSIONS_INVALID", "No se pudieron leer las dimensiones reales de la imagen.");
}

function validateImageSignature(mimeType: AssetStageParams["mimeType"], bytes: Uint8Array): void {
  const starts = (values: number[]) => values.every((value, index) => bytes[index] === value);
  const valid =
    (mimeType === "image/png" && starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
    (mimeType === "image/jpeg" && starts([0xff, 0xd8, 0xff])) ||
    (mimeType === "image/gif" &&
      (starts([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
        starts([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))) ||
    (mimeType === "image/webp" &&
      starts([0x52, 0x49, 0x46, 0x46]) &&
      String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP") ||
    (mimeType === "image/avif" &&
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.subarray(4, 8)) === "ftyp" &&
      ["avif", "avis"].includes(String.fromCharCode(...bytes.subarray(8, 12)))) ||
    (mimeType === "image/x-icon" &&
      isValidIco(bytes));
  if (!valid) fail("ASSET_SIGNATURE_INVALID", "El contenido no coincide con el MIME declarado.");
}

function createCleanProject(
  operation: Extract<AgentOperation, { type: "store.create" }>,
  storeId: string,
  now: Date,
): StoreProjectV1 {
  const slug = operation.slug ?? safeSlug(operation.name);
  const brandName = operation.brandName ?? operation.name;
  const timestamp = now.toISOString();
  const base = cloneProjectFromTemplate(buildModernBaseTemplateProject(), {
    id: storeId,
    name: operation.name,
    slug,
    baseUrl: operation.baseUrl ?? `https://${slug}.example`,
    brandName,
    now: timestamp,
  });
  return StoreProjectV2Schema.parse({
    ...base,
    createdAt: timestamp,
    updatedAt: timestamp,
    origin: { ...base.origin, seed: "duplicate" as const },
    identity: {
      ...base.identity,
      legalName: brandName,
      brandName,
      ...(operation.email === undefined ? {} : { email: operation.email }),
      ...(operation.phone === undefined ? {} : { phone: operation.phone }),
    },
    whatsapp: {
      ...base.whatsapp,
      ...(operation.phone === undefined ? {} : { phone: operation.phone }),
      greeting: `Hola ${brandName}, quiero hacer este pedido:`,
    },
    seo: { ...base.seo, title: brandName },
  });
}

export class AgentController {
  private readonly plans = new Map<string, PlanDraft>();
  private readonly templateUpgrades = new Map<string, TemplateUpgradeDraft>();
  private readonly rollouts = new Map<string, RolloutDraft>();
  private readonly stagedAssets = new Map<string, StagedAsset>();
  private readonly jobs = new Map<string, AgentJob>();
  private readonly protectedStoreIds: Set<string>;
  private readonly baseTemplateStoreId: string;
  private readonly scopes: Set<string>;
  private readonly now: () => Date;
  private readonly inboxRoot: string;
  private readonly agentRoot: string;
  private readonly plansRoot: string;
  private readonly templateUpgradesRoot: string;
  private readonly rolloutsRoot: string;
  private readonly committedRoot: string;
  private readonly assetsRoot: string;
  private readonly uploadsRoot: string;
  private readonly jobsRoot: string;
  private readonly auditPath: string;
  private readonly actorId: string;
  private readonly agentLocks;
  private initialized?: Promise<void>;
  private requestId: string | number | undefined;

  constructor(private readonly options: ControllerOptions) {
    this.protectedStoreIds = new Set(options.protectedStoreIds ?? []);
    this.baseTemplateStoreId = options.baseTemplateStoreId ?? BASE_TEMPLATE_STORE_ID;
    this.scopes = new Set(
      options.scopes ?? [
        "read",
        "template:read",
        "template:write",
        "rollouts:read",
        "rollouts:write",
        "plans:write",
        "commit",
        "assets:write",
        "audit:read",
      ],
    );
    this.now = options.now ?? (() => new Date());
    this.inboxRoot = join(options.applicationRoot, "agent-inbox");
    this.agentRoot = join(options.applicationRoot, ".solara-runtime", "agent");
    this.plansRoot = join(this.agentRoot, "plans");
    this.templateUpgradesRoot = join(this.agentRoot, "template-upgrades");
    this.rolloutsRoot = join(this.agentRoot, "rollouts");
    this.committedRoot = join(this.agentRoot, "committed");
    this.assetsRoot = join(this.agentRoot, "assets");
    this.uploadsRoot = join(this.agentRoot, "uploads");
    this.jobsRoot = join(this.agentRoot, "jobs");
    this.auditPath = join(this.agentRoot, "audit.jsonl");
    this.actorId = options.actorId ?? makeId("agent-session");
    this.agentLocks = createAgentLockStore({
      applicationRoot: options.applicationRoot,
      now: this.now,
    });
  }

  async ready(): Promise<void> {
    if (!this.initialized) this.initialized = this.initialize();
    await this.initialized;
  }

  setRequestContext(requestId: string | number | undefined): void {
    this.requestId = requestId;
  }

  private async initialize(): Promise<void> {
    await this.options.storage.ensureRoots();
    await mkdir(this.agentRoot, { recursive: true });
    await mkdir(this.plansRoot, { recursive: true });
    await mkdir(this.templateUpgradesRoot, { recursive: true });
    await mkdir(this.rolloutsRoot, { recursive: true });
    await mkdir(this.committedRoot, { recursive: true });
    await mkdir(this.assetsRoot, { recursive: true });
    await mkdir(this.uploadsRoot, { recursive: true });
    await mkdir(this.jobsRoot, { recursive: true });
    await assertNoReparsePoints(this.options.applicationRoot, this.agentRoot);
    await this.loadPlans();
    await this.loadTemplateUpgrades();
    await this.loadRollouts();
    await this.loadJobs();
  }

  private requireScope(scope: string): void {
    if (!this.scopes.has(scope))
      fail("PERMISSION_DENIED", `El proceso del agente no tiene el scope ${scope}.`, { scope });
  }

  private async audit(
    event: string,
    details: Record<string, unknown> = {},
    requestId = this.requestId,
  ): Promise<void> {
    try {
      await appendFile(
        this.auditPath,
        `${JSON.stringify({
          at: this.now().toISOString(),
          actorId: this.actorId,
          ...(requestId === undefined ? {} : { requestId }),
          event,
          ...details,
        })}\n`,
        "utf8",
      );
    } catch (error) {
      process.stderr.write(
        `Solara agent: no se pudo escribir auditoría: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }

  private planPath(planId: string): string {
    return join(this.plansRoot, `${planId}.json`);
  }

  private committedPath(idempotencyKey: string): string {
    return join(this.committedRoot, `${digest(new TextEncoder().encode(idempotencyKey))}.json`);
  }

  private jobPath(jobId: string): string {
    return join(this.jobsRoot, `${jobId}.json`);
  }

  private async persistPlan(plan: PlanDraft): Promise<void> {
    await writeAtomic(this.planPath(plan.planId), `${JSON.stringify(plan, null, 2)}\n`);
  }

  private async deletePlan(plan: PlanDraft): Promise<void> {
    this.plans.delete(plan.planId);
    await rm(this.planPath(plan.planId), { force: true });
    await this.agentLocks.release(plan.storeId, plan.planId);
  }

  private async loadPlans(): Promise<void> {
    const entries = await readdir(this.plansRoot, { withFileTypes: true });
    for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith(".json"))) {
      try {
        const plan = JSON.parse(
          await readFile(join(this.plansRoot, entry.name), "utf8"),
        ) as PlanDraft;
        if (!plan.planId || Date.parse(plan.expiresAt) <= this.now().getTime()) {
          await rm(join(this.plansRoot, entry.name), { force: true });
          continue;
        }
        this.plans.set(plan.planId, plan);
        await this.agentLocks.claim(plan.storeId, plan.planId, {
          planId: plan.planId,
          storeId: plan.storeId,
        });
      } catch {
        // Un plan corrupto queda disponible en recovery del runtime, no se ejecuta.
      }
    }
  }

  private templateUpgradePath(previewId: string): string {
    return join(this.templateUpgradesRoot, `${previewId}.json`);
  }

  private async persistTemplateUpgrade(preview: TemplateUpgradeDraft): Promise<void> {
    this.templateUpgrades.set(preview.previewId, preview);
    await writeAtomic(
      this.templateUpgradePath(preview.previewId),
      `${JSON.stringify(preview, null, 2)}\n`,
    );
  }

  private async loadTemplateUpgrades(): Promise<void> {
    const entries = await readdir(this.templateUpgradesRoot, { withFileTypes: true });
    for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith(".json"))) {
      try {
        const preview = JSON.parse(
          await readFile(join(this.templateUpgradesRoot, entry.name), "utf8"),
        ) as TemplateUpgradeDraft;
        if (!preview.previewId || Date.parse(preview.expiresAt) <= this.now().getTime()) {
          await rm(join(this.templateUpgradesRoot, entry.name), { force: true });
          continue;
        }
        this.templateUpgrades.set(preview.previewId, preview);
      } catch {
        // Un preview corrupto se conserva como recovery, nunca se ejecuta.
      }
    }
  }

  private rolloutPath(previewId: string): string {
    return join(this.rolloutsRoot, `${previewId}.json`);
  }

  private async persistRollout(rollout: RolloutDraft): Promise<void> {
    this.rollouts.set(rollout.previewId, rollout);
    await writeAtomic(this.rolloutPath(rollout.previewId), `${JSON.stringify(rollout, null, 2)}\n`);
  }

  private async loadRollouts(): Promise<void> {
    const entries = await readdir(this.rolloutsRoot, { withFileTypes: true });
    for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith(".json"))) {
      try {
        const rollout = JSON.parse(
          await readFile(join(this.rolloutsRoot, entry.name), "utf8"),
        ) as RolloutDraft;
        if (!rollout.previewId || Date.parse(rollout.expiresAt) <= this.now().getTime()) {
          await rm(join(this.rolloutsRoot, entry.name), { force: true });
          continue;
        }
        this.rollouts.set(rollout.previewId, rollout);
      } catch {
        // Un preview de rollout corrupto no debe bloquear el host.
      }
    }
  }

  private async persistJob(job: AgentJob): Promise<void> {
    this.jobs.set(job.jobId, job);
    await writeAtomic(this.jobPath(job.jobId), `${JSON.stringify(job, null, 2)}\n`);
  }

  private async loadJobs(): Promise<void> {
    const entries = await readdir(this.jobsRoot, { withFileTypes: true });
    const resumable: AgentJob[] = [];
    for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith(".json"))) {
      try {
        const job = JSON.parse(await readFile(join(this.jobsRoot, entry.name), "utf8")) as AgentJob;
        if (
          (job.status === "queued" || job.status === "running") &&
          job.kind === "rollout" &&
          job.rolloutId
        ) {
          job.status = "queued";
          job.updatedAt = this.now().toISOString();
          delete job.error;
          await writeAtomic(join(this.jobsRoot, entry.name), `${JSON.stringify(job, null, 2)}\n`);
          resumable.push(job);
        } else if (job.status === "queued" || job.status === "running") {
          job.status = "failed";
          job.error = {
            code: "AGENT_RESTARTED",
            message: "El agente se reinició antes de completar este trabajo.",
          };
          job.updatedAt = this.now().toISOString();
          await writeAtomic(join(this.jobsRoot, entry.name), `${JSON.stringify(job, null, 2)}\n`);
        }
        this.jobs.set(job.jobId, job);
      } catch {
        // Un trabajo corrupto no debe impedir iniciar el host.
      }
    }
    for (const job of resumable) void this.runRolloutJob(job, job.idempotencyKey);
  }

  private planResponse(plan: PlanDraft, includeProject = false, includeDiff = true) {
    return {
      planId: plan.planId,
      ...summary(plan.project, plan.baseVersion, false),
      baseVersion: plan.baseVersion,
      nextVersion: (plan.baseVersion ?? 0) + 1,
      operationCount: plan.operations.length,
      createdNewStore: plan.createdNewStore,
      createdAt: plan.createdAt,
      expiresAt: plan.expiresAt,
      ...(includeDiff ? { diff: plan.diff } : {}),
      warnings: plan.warnings,
      blockingIssues: plan.blockingIssues,
      requiresCommitApproval: true,
      ...(includeProject ? { project: plan.project } : {}),
    };
  }

  private async ensurePlanFresh(plan: PlanDraft): Promise<void> {
    if (Date.parse(plan.expiresAt) <= this.now().getTime()) {
      await this.deletePlan(plan);
      fail("PLAN_EXPIRED", "El plan expiró; generá uno nuevo.");
    }
  }

  async health() {
    await this.ready();
    this.requireScope("read");
    await this.options.storage.ensureRoots();
    const status = await this.options.storage.status();
    return {
      protocol: "solara-agent",
      version: 1,
      writable: status.writable,
      schemaVersion: 2,
      scopes: [...this.scopes],
      actorId: this.actorId,
      features: {
        durablePlans: true,
        dryRunDiff: true,
        cooperativeLocks: true,
        durableJobs: true,
        streamedAssets: true,
      },
    };
  }

  async describeProtocol(rawParams: unknown = {}) {
    ProtocolDescribeParamsSchema.parse(rawParams);
    await this.ready();
    this.requireScope("read");
    return {
      protocol: "solara-agent",
      version: 1,
      scopes: [...this.scopes],
      methods: [
        "health",
        "protocol.describe",
        "stores.list",
        "stores.get",
        "stores.restore",
        "templates.get",
        "templates.previewUpgrade",
        "templates.commitUpgrade",
        "rollouts.preview",
        "rollouts.commit",
        "rollouts.get",
        "rollouts.rollback",
        "plans.create",
        "plans.get",
        "plans.commit",
        "plans.createAndCommit",
        "plans.discard",
        "plans.heartbeat",
        "jobs.get",
        "audit.list",
        "assets.stage",
        "assets.generatePlaceholder",
        "assets.upload.begin",
        "assets.upload.chunk",
        "assets.upload.finish",
        "qa.runExport",
        "qa.runGates",
        "qa.detectFlaky",
        "qa.writeTest",
        "qa.readBacklog",
        "qa.logProgress",
        "qa.updateState",
        "qa.runCycle",
        "qa.status",
      ],
      operationTypes: [
        "store.create",
        "store.updateIdentity",
        "store.updateSeo",
        "store.updatePage",
        "store.updatePublicCopy",
        "store.updatePolicies",
        "store.updateLegalProfile",
        "store.updateWhatsapp",
        "store.updateNavigation",
        "category.create",
        "category.update",
        "category.setStatus",
        "category.delete",
        "collection.create",
        "collection.update",
        "product.create",
        "product.update",
        "products.adjustPrices",
        "products.reorder",
        "product.delete",
        "product.setStatus",
        "store.archive",
        "asset.attach",
        "asset.remove",
        "section.updateSettings",
        "product.createBatch",
        "theme.applyPreset",
        "theme.updateTokens",
      ],
      limits: {
        maxOperationsPerPlan: 500,
        maxInlineAssetBytes: MAX_INLINE_ASSET_BYTES,
        maxStreamedAssetBytes: MAX_INBOX_ASSET_BYTES,
        planTtlMs: PLAN_TTL_MS,
      },
      safety: {
        arbitraryPatch: false,
        arbitraryShell: false,
        arbitraryHtml: false,
        protectedDemosWritable: false,
      },
      operationSchemas: {
        "category.delete": {
          confirmation: "ELIMINAR_CATEGORIA",
          requiresStatus: "hidden",
          requiresEmpty: true,
          requiresNoChildren: true,
        },
        "product.setStatus": { status: ["active", "hidden", "archived"] },
        "product.delete": {
          confirmation: "ELIMINAR_PRODUCTO",
          requiresStatus: "archived",
        },
        "store.archive": { confirmation: "ARCHIVAR_TIENDA" },
      },
    };
  }

  async listStores() {
    await this.ready();
    this.requireScope("read");
    const listing = (await this.options.storage.list()) as {
      projects?: Array<Record<string, unknown>>;
      recovery?: unknown[];
    };
    const projects = await Promise.all(
      (listing.projects ?? []).map(async (item) => {
        const projectId = typeof item.projectId === "string" ? item.projectId : undefined;
        if (!projectId) return { ...item, protected: false };
        try {
          const current = await this.options.storage.readCurrent(projectId);
          const project = current
            ? readProjectArchive(Buffer.from(current.bytes).toString("utf8"))
            : undefined;
          const lock = await this.agentLocks.read(projectId);
          return {
            ...item,
            protected: project
              ? projectIsProtected(project, this.protectedStoreIds)
              : this.protectedStoreIds.has(projectId),
            agentLock: lock ? { expiresAt: lock.expiresAt, planId: lock.planId } : null,
          };
        } catch {
          return { ...item, protected: this.protectedStoreIds.has(projectId) };
        }
      }),
    );
    return {
      projects,
      recovery: listing.recovery ?? [],
    };
  }

  async getStore(rawParams: unknown) {
    await this.ready();
    this.requireScope("read");
    const params = StoreGetParamsSchema.parse(rawParams);
    const current = await this.options.storage.readCurrent(params.storeId);
    if (!current) fail("STORE_NOT_FOUND", `No existe la tienda ${params.storeId}.`);
    const project = readProjectArchive(Buffer.from(current.bytes).toString("utf8"));
    const protectedStore = projectIsProtected(project, this.protectedStoreIds);
    const agentLock = await this.agentLocks.read(params.storeId);
    const result = summary(
      project,
      Number((current.manifest as { current?: { version?: number } })?.current?.version ?? 0),
      protectedStore,
    );
    Object.assign(result, {
      agentLock: agentLock ? { expiresAt: agentLock.expiresAt, planId: agentLock.planId } : null,
    });
    if (params.include === "catalog") {
      return {
        ...result,
        catalog: {
          products: project.products.slice(0, 500),
          categories: project.categories.slice(0, 500),
          collections: project.collections.slice(0, 500),
        },
      };
    }
    return result;
  }

  private async readTemplateProject(): Promise<{
    project: StoreProjectV1;
    version: number;
  }> {
    const current = await this.options.storage.readCurrent(this.baseTemplateStoreId);
    if (!current) fail("TEMPLATE_NOT_FOUND", `No existe la plantilla ${this.baseTemplateStoreId}.`);
    const project = readProjectArchive(Buffer.from(current.bytes).toString("utf8"));
    if (!isBaseTemplate(project, this.protectedStoreIds))
      fail("TEMPLATE_INVALID", "La tienda base no está marcada como protegida.");
    return {
      project,
      version: Number(
        (current.manifest as { current?: { version?: number } })?.current?.version ?? 0,
      ),
    };
  }

  async getTemplate(rawParams: unknown = {}) {
    await this.ready();
    this.requireScope("template:read");
    TemplateGetParamsSchema.parse(rawParams);
    const { project, version } = await this.readTemplateProject();
    return {
      ...summary(project, version, true),
      templateId: project.origin?.templateId ?? "catalog-modern",
      templateVersion: project.origin?.templateVersion ?? null,
      updatePolicy: "pinned",
    };
  }

  async previewTemplateUpgrade(rawParams: unknown) {
    await this.ready();
    this.requireScope("template:read");
    TemplatePreviewUpgradeParamsSchema.parse(rawParams);
    const { project, version } = await this.readTemplateProject();
    const baseVersion =
      rawParams && typeof rawParams === "object" && "baseVersion" in rawParams
        ? (rawParams as { baseVersion?: number }).baseVersion
        : undefined;
    if (baseVersion !== undefined && baseVersion !== version)
      fail("VERSION_CONFLICT", "La plantilla cambió; generá un preview nuevo.", {
        expected: baseVersion,
        actual: version,
      });
    const plan = planCatalogModernUpgrade(project);
    const preview: TemplateUpgradeDraft = {
      previewId: makeId("template-preview"),
      storeId: project.id,
      baseVersion: version,
      project,
      plan,
      createdAt: this.now().toISOString(),
      expiresAt: new Date(this.now().getTime() + PLAN_TTL_MS).toISOString(),
    };
    await this.persistTemplateUpgrade(preview);
    await this.audit("template.upgrade.previewed", {
      previewId: preview.previewId,
      storeId: project.id,
      fromVersion: plan.fromVersion,
      toVersion: plan.toVersion,
    });
    return {
      previewId: preview.previewId,
      storeId: project.id,
      baseVersion: version,
      ...plan,
      requiresConfirmation: "ACTUALIZAR_PLANTILLA",
      expiresAt: preview.expiresAt,
    };
  }

  async commitTemplateUpgrade(rawParams: unknown) {
    await this.ready();
    this.requireScope("template:write");
    const params = TemplateCommitUpgradeParamsSchema.parse(rawParams);
    if (params.idempotencyKey) {
      const committed = await this.readCommitted(params.idempotencyKey);
      if (committed) return committed;
    }
    const preview = this.templateUpgrades.get(params.previewId);
    if (!preview) fail("PREVIEW_NOT_FOUND", "El preview de plantilla no existe o expiró.");
    if (Date.parse(preview.expiresAt) <= this.now().getTime()) {
      this.templateUpgrades.delete(preview.previewId);
      await rm(this.templateUpgradePath(preview.previewId), { force: true });
      fail("PREVIEW_EXPIRED", "El preview de plantilla expiró; generá uno nuevo.");
    }
    if (preview.baseVersion !== params.baseVersion)
      fail("VERSION_CONFLICT", "La plantilla cambió desde el preview.");
    const current = await this.readTemplateProject();
    if (current.version !== preview.baseVersion)
      fail("VERSION_CONFLICT", "La plantilla cambió desde el preview.");
    const currentPlan = planCatalogModernUpgrade(current.project);
    if (currentPlan.safeChanges.length === 0) {
      const result = {
        storeId: current.project.id,
        version: current.version,
        status: "already-current",
        fromTemplateVersion: currentPlan.fromVersion,
        toTemplateVersion: currentPlan.toVersion,
      };
      if (params.idempotencyKey)
        await writeAtomic(
          this.committedPath(params.idempotencyKey),
          `${JSON.stringify(result, null, 2)}\n`,
        );
      await rm(this.templateUpgradePath(preview.previewId), { force: true });
      this.templateUpgrades.delete(preview.previewId);
      return result;
    }
    // Backup verificable antes de abrir la transacción de reemplazo. El storage
    // conserva además su backup automático al publicar el nuevo snapshot.
    const backup = await this.options.storage.manualBackup(current.project.id);
    const upgraded = StoreProjectV2Schema.parse({
      ...applyCatalogModernUpgrade(
        current.project,
        preview.plan.safeChanges.map((change) => change.id),
      ),
      updatedAt: this.now().toISOString(),
      origin: {
        ...current.project.origin,
        role: "base-template" as const,
        updatePolicy: "pinned" as const,
      },
    });
    const exportResult = exportProject(upgraded, { mode: "production" });
    const archive = new TextEncoder().encode(createProjectArchive(upgraded));
    const tx = await this.options.storage.beginSave({
      projectId: upgraded.id,
      name: upgraded.name,
      slug: upgraded.slug,
      projectUpdatedAt: upgraded.updatedAt,
      expectedVersion: preview.baseVersion,
      actor: { kind: "template-upgrade", id: preview.previewId },
      allowProtectedWrite: true,
      rendererFingerprint: EXPORTER_RENDERER_FINGERPRINT,
    });
    try {
      await this.options.storage.upload(tx.transactionId, "project", bytesStream(archive));
      await this.options.storage.upload(
        tx.transactionId,
        "site",
        bytesStream(new TextEncoder().encode(siteMap(exportResult.files))),
      );
      const receipt = await this.options.storage.commit(tx.transactionId);
      const result = {
        storeId: upgraded.id,
        version: tx.version,
        receipt,
        backup,
        status: "synced",
        fromTemplateVersion: preview.plan.fromVersion,
        toTemplateVersion: preview.plan.toVersion,
      };
      if (params.idempotencyKey)
        await writeAtomic(
          this.committedPath(params.idempotencyKey),
          `${JSON.stringify(result, null, 2)}\n`,
        );
      await rm(this.templateUpgradePath(preview.previewId), { force: true });
      this.templateUpgrades.delete(preview.previewId);
      await this.audit("template.upgrade.succeeded", {
        previewId: preview.previewId,
        storeId: upgraded.id,
        version: tx.version,
      });
      return result;
    } catch (error) {
      await this.options.storage.abort(tx.transactionId).catch(() => undefined);
      await this.audit("template.upgrade.failed", {
        previewId: preview.previewId,
        storeId: upgraded.id,
        error: agentError(error),
      });
      throw error;
    }
  }

  private async commitProjectSnapshot(
    project: StoreProjectV1,
    expectedVersion: number,
    actor: "rollout" | "agent",
    actorId: string,
  ) {
    const validated = StoreProjectV2Schema.parse(project);
    let exportResult: ReturnType<typeof exportProject> | undefined;
    let exportWarning: string | undefined;
    try {
      exportResult = exportProject(validated, { mode: "production" });
    } catch (error) {
      exportWarning = error instanceof Error ? error.message : String(error);
      exportResult = exportProject(validated, { mode: "draft" });
    }
    const archive = new TextEncoder().encode(createProjectArchive(validated));
    const tx = await this.options.storage.beginSave({
      projectId: validated.id,
      name: validated.name,
      slug: validated.slug,
      projectUpdatedAt: validated.updatedAt,
      expectedVersion,
      actor: { kind: actor, id: actorId },
      rendererFingerprint: EXPORTER_RENDERER_FINGERPRINT,
    });
    try {
      await this.options.storage.upload(tx.transactionId, "project", bytesStream(archive));
      if (exportResult) {
        await this.options.storage.upload(
          tx.transactionId,
          "site",
          bytesStream(new TextEncoder().encode(siteMap(exportResult.files))),
        );
      }
      const receipt = await this.options.storage.commit(tx.transactionId);
      return {
        receipt,
        storeId: validated.id,
        version: tx.version,
        status: exportWarning ? "site-outdated" : "synced",
        ...(exportWarning ? { exportWarning } : {}),
      };
    } catch (error) {
      await this.options.storage.abort(tx.transactionId).catch(() => undefined);
      throw error;
    }
  }

  async previewRollout(rawParams: unknown) {
    await this.ready();
    this.requireScope("rollouts:read");
    const params = RolloutPreviewParamsSchema.parse(rawParams);
    const listing = (await this.options.storage.list()) as {
      projects?: Array<Record<string, unknown>>;
    };
    const requested = params.target.storeIds ? new Set(params.target.storeIds) : undefined;
    const stores: RolloutStorePreview[] = [];
    for (const item of listing.projects ?? []) {
      const storeId = typeof item.projectId === "string" ? item.projectId : undefined;
      if (!storeId || (requested && !requested.has(storeId))) continue;
      const name = typeof item.name === "string" ? item.name : storeId;
      const current = await this.options.storage.readCurrent(storeId);
      if (!current) {
        stores.push({ storeId, name, baseVersion: 0, status: "skipped", reason: "missing" });
        continue;
      }
      const project = readProjectArchive(Buffer.from(current.bytes).toString("utf8"));
      if (project.status !== params.target.status) {
        stores.push({
          storeId,
          name,
          baseVersion: Number(
            (current.manifest as { current?: { version?: number } })?.current?.version ?? 0,
          ),
          status: "skipped",
          reason: "inactive",
        });
        continue;
      }
      const protectedStore = isBaseTemplate(project, this.protectedStoreIds);
      if (params.target.excludeProtected && protectedStore) {
        stores.push({
          storeId,
          name,
          baseVersion: Number(
            (current.manifest as { current?: { version?: number } })?.current?.version ?? 0,
          ),
          status: "skipped",
          reason: "protected",
        });
        continue;
      }
      const baseVersion = Number(
        (current.manifest as { current?: { version?: number } })?.current?.version ?? 0,
      );
      if (params.kind === "site-rebuild") {
        stores.push({ storeId, name, baseVersion, status: "ready" });
        continue;
      }
      // Con migrationId explícito el rollout resuelve por el registro real:
      // un ID desconocido o no aplicable se marca como conflicto con motivo.
      if (params.migrationId !== undefined) {
        const migration = resolveMigration(params.migrationId);
        if (!migration) {
          stores.push({
            storeId,
            name,
            baseVersion,
            status: "conflict",
            safeChanges: [],
            conflicts: [],
            reason: `migrationId desconocido: ${params.migrationId}`,
          });
          continue;
        }
        if (!migrationApplies(params.migrationId, project)) {
          stores.push({
            storeId,
            name,
            baseVersion,
            status: "skipped",
            reason: "migration-not-applicable",
          });
          continue;
        }
      }
      const upgrade = planCatalogModernUpgrade(project);
      stores.push({
        storeId,
        name,
        baseVersion,
        status: upgrade.conflicts.length > 0 ? "conflict" : "ready",
        safeChanges: upgrade.safeChanges.map((change) => change.id),
        conflicts: upgrade.conflicts.map((conflict) => conflict.id),
        ...(upgrade.conflicts.length > 0 ? { reason: "template-conflict" } : {}),
      });
    }
    const rollout: RolloutDraft = {
      previewId: makeId("rollout-preview"),
      kind: params.kind,
      ...(params.migrationId ? { migrationId: params.migrationId } : {}),
      createdAt: this.now().toISOString(),
      expiresAt: new Date(this.now().getTime() + PLAN_TTL_MS).toISOString(),
      stores,
      target: params.target,
    };
    await this.persistRollout(rollout);
    await this.audit("rollout.previewed", {
      previewId: rollout.previewId,
      kind: rollout.kind,
      storeCount: stores.filter((store) => store.status === "ready").length,
    });
    return {
      previewId: rollout.previewId,
      kind: rollout.kind,
      stores,
      expiresAt: rollout.expiresAt,
      requiresCommitApproval: true,
    };
  }

  async commitRollout(rawParams: unknown) {
    await this.ready();
    this.requireScope("rollouts:write");
    const params = RolloutCommitParamsSchema.parse(rawParams);
    const preview = this.rollouts.get(params.previewId);
    if (!preview) fail("PREVIEW_NOT_FOUND", "El preview de rollout no existe o expiró.");
    if (params.idempotencyKey) {
      const committed = await this.readCommitted(params.idempotencyKey);
      if (committed) return committed;
    }
    const existingJob = [...this.jobs.values()].find(
      (job) => job.rolloutId === preview.previewId && ["queued", "running"].includes(job.status),
    );
    if (existingJob) return this.jobResponse(existingJob);
    const job: AgentJob = {
      jobId: makeId("job-rollout"),
      kind: "rollout",
      rolloutId: preview.previewId,
      ...(params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : {}),
      status: "queued",
      createdAt: this.now().toISOString(),
      updatedAt: this.now().toISOString(),
    };
    await this.persistJob(job);
    if (params.async) {
      void this.runRolloutJob(job, params.idempotencyKey);
      return this.jobResponse(job);
    }
    await this.runRolloutJob(job, params.idempotencyKey);
    return this.jobResponse(job);
  }

  private async runRolloutJob(job: AgentJob, idempotencyKey?: string): Promise<void> {
    const previewId = job.rolloutId;
    if (!previewId) return;
    const running = {
      ...job,
      ...(idempotencyKey ? { idempotencyKey } : {}),
      status: "running" as const,
      updatedAt: this.now().toISOString(),
    };
    await this.persistJob(running);
    Object.assign(job, running);
    try {
      const preview = this.rollouts.get(previewId);
      if (!preview) fail("PREVIEW_NOT_FOUND", "El preview de rollout no existe o expiró.");
      const results: Array<Record<string, unknown>> = [...(running.partialResults ?? [])];
      const replaceResult = (next: Record<string, unknown>) => {
        const index = results.findIndex((item) => item.storeId === next.storeId);
        if (index === -1) results.push(next);
        else results[index] = next;
      };
      const savePartial = async () => {
        const snapshot = {
          ...job,
          status: "running" as const,
          partialResults: results,
          updatedAt: this.now().toISOString(),
        };
        await this.persistJob(snapshot);
        Object.assign(job, snapshot);
      };
      for (const target of preview.stores.filter((store) => store.status === "ready")) {
        const previousResult = results.find((item) => item.storeId === target.storeId);
        if (
          previousResult &&
          ["applied", "skipped", "conflict"].includes(String(previousResult.status))
        ) {
          continue;
        }
        let lockAcquired = false;
        let inProgress: Record<string, unknown> | undefined;
        try {
          await this.agentLocks.claim(target.storeId, previewId, {
            kind: "rollout",
            rolloutId: previewId,
          });
          lockAcquired = true;
          const current = await this.options.storage.readCurrent(target.storeId);
          if (!current) throw new Error("La tienda ya no existe.");
          const currentVersion = Number(
            (current.manifest as { current?: { version?: number } })?.current?.version ?? 0,
          );
          if (currentVersion !== target.baseVersion) {
            if (
              preview.kind === "project-migration" &&
              previousResult?.status === "pending" &&
              typeof previousResult.projectHash === "string"
            ) {
              const recoveredProject = readProjectArchive(
                Buffer.from(current.bytes).toString("utf8"),
              );
              if (
                digest(new TextEncoder().encode(stable(recoveredProject))) ===
                previousResult.projectHash
              ) {
                replaceResult({
                  ...previousResult,
                  status: "applied",
                  result: {
                    storeId: target.storeId,
                    version: currentVersion,
                    status: "synced",
                    recovered: true,
                  },
                });
                await savePartial();
                continue;
              }
            }
            replaceResult({
              storeId: target.storeId,
              status: "conflict",
              reason: "VERSION_CONFLICT",
            });
            await savePartial();
            continue;
          }
          const project = readProjectArchive(Buffer.from(current.bytes).toString("utf8"));
          if (preview.kind === "site-rebuild") {
            inProgress = {
              storeId: target.storeId,
              status: "pending",
              previousSite:
                (current.manifest as { lastValidSite?: Record<string, unknown> })?.lastValidSite ??
                null,
            };
            replaceResult(inProgress);
            await savePartial();
            const exported = exportProject(project, { mode: "production" });
            const siteResult = await this.options.storage.rebuildSite(
              target.storeId,
              bytesStream(new TextEncoder().encode(siteMap(exported.files))),
              {
                actor: { kind: "rollout", id: previewId },
                rendererFingerprint: EXPORTER_RENDERER_FINGERPRINT,
              },
            );
            const siteRecord = siteResult as {
              previousSite?: Record<string, unknown> | null;
              [key: string]: unknown;
            };
            const originalPreviousSite = Object.hasOwn(inProgress, "previousSite")
              ? inProgress.previousSite
              : siteRecord.previousSite;
            replaceResult({
              storeId: target.storeId,
              status: "applied",
              site: { ...siteRecord, previousSite: originalPreviousSite },
            });
            await savePartial();
            continue;
          }
          const upgrade = planCatalogModernUpgrade(project);
          if (upgrade.conflicts.length > 0) {
            replaceResult({
              storeId: target.storeId,
              status: "conflict",
              conflicts: upgrade.conflicts,
            });
            await savePartial();
            continue;
          }
          if (upgrade.safeChanges.length === 0) {
            replaceResult({
              storeId: target.storeId,
              status: "skipped",
              reason: "already-current",
            });
            await savePartial();
            continue;
          }
          const next = StoreProjectV2Schema.parse({
            ...applyCatalogModernUpgrade(
              project,
              upgrade.safeChanges.map((change) => change.id),
            ),
            updatedAt: this.now().toISOString(),
          });
          inProgress = {
            storeId: target.storeId,
            status: "pending",
            previousProject: project,
            projectHash: digest(new TextEncoder().encode(stable(next))),
          };
          replaceResult(inProgress);
          await savePartial();
          const result = await this.commitProjectSnapshot(
            next,
            target.baseVersion,
            "rollout",
            previewId,
          );
          replaceResult({
            storeId: target.storeId,
            status: "applied",
            previousProject: project,
            result,
          });
          await savePartial();
        } catch (error) {
          replaceResult({
            ...(inProgress ?? { storeId: target.storeId }),
            status: "failed",
            error: agentError(error),
          });
          await savePartial().catch(() => undefined);
        } finally {
          if (lockAcquired) await this.agentLocks.release(target.storeId, previewId);
        }
      }
      const counts: Record<string, number> = {};
      for (const item of results) {
        const key = String(item.status);
        counts[key] = (counts[key] ?? 0) + 1;
      }
      const result = {
        rolloutId: previewId,
        kind: preview.kind,
        results,
        counts,
      };
      if (idempotencyKey)
        await writeAtomic(
          this.committedPath(idempotencyKey),
          `${JSON.stringify(result, null, 2)}\n`,
        );
      const succeeded = {
        ...job,
        result,
        partialResults: results,
        status: "succeeded" as const,
        updatedAt: this.now().toISOString(),
      };
      await this.persistJob(succeeded);
      Object.assign(job, succeeded);
      await this.audit("rollout.succeeded", {
        rolloutId: previewId,
        kind: preview.kind,
        counts: result.counts,
      });
    } catch (error) {
      const failed = {
        ...job,
        status: "failed" as const,
        error: agentError(error),
        updatedAt: this.now().toISOString(),
      };
      await this.persistJob(failed);
      Object.assign(job, failed);
      await this.audit("rollout.failed", { rolloutId: previewId, error: agentError(error) });
    }
  }

  async getRollout(rawParams: unknown) {
    await this.ready();
    this.requireScope("rollouts:read");
    const params = RolloutGetParamsSchema.parse(rawParams);
    const preview = this.rollouts.get(params.rolloutId);
    const job = [...this.jobs.values()].find((item) => item.rolloutId === params.rolloutId);
    if (!preview && !job) fail("ROLLOUT_NOT_FOUND", "El rollout no existe o expiró.");
    return { ...(preview ? { preview } : {}), ...(job ? { job: this.jobResponse(job) } : {}) };
  }

  async rollbackRollout(rawParams: unknown) {
    await this.ready();
    this.requireScope("rollouts:write");
    const params = RolloutRollbackParamsSchema.parse(rawParams);
    const job = [...this.jobs.values()].find((item) => item.rolloutId === params.rolloutId);
    const result = job?.result as { results?: Array<Record<string, unknown>> } | undefined;
    const storeResult = result?.results?.find((item) => item.storeId === params.storeId);
    if (!storeResult || storeResult.status !== "applied")
      fail("ROLLBACK_NOT_AVAILABLE", "No existe un resultado aplicado para esa tienda.");
    const current = await this.options.storage.readCurrent(params.storeId);
    const currentVersion = Number(
      (current?.manifest as { current?: { version?: number } })?.current?.version ?? 0,
    );
    if (currentVersion !== params.expectedVersion)
      fail("VERSION_CONFLICT", "La tienda cambió después del rollout.");
    if (storeResult.previousProject) {
      const rollbackProject = StoreProjectV2Schema.parse(storeResult.previousProject);
      const rollback = await this.commitProjectSnapshot(
        rollbackProject,
        params.expectedVersion,
        "rollout",
        params.rolloutId,
      );
      await this.audit("rollout.rollback.succeeded", {
        rolloutId: params.rolloutId,
        storeId: params.storeId,
        version: rollback.version,
      });
      return rollback;
    }
    const site = (storeResult.site as { previousSite?: Record<string, unknown> } | undefined)
      ?.previousSite;
    if (site) {
      const rollback = await this.options.storage.restoreSite(
        params.storeId,
        params.expectedVersion,
        site,
      );
      await this.audit("rollout.rollback.succeeded", {
        rolloutId: params.rolloutId,
        storeId: params.storeId,
      });
      return rollback;
    }
    fail("ROLLBACK_NOT_AVAILABLE", "El sitio o respaldo anterior ya no está disponible.");
  }

  async restoreStore(rawParams: unknown) {
    await this.ready();
    this.requireScope("plans:write");
    const params = StoreRestoreParamsSchema.parse(rawParams);
    const current = await this.options.storage.readCurrent(params.storeId);
    if (!current) fail("STORE_NOT_FOUND", `No existe la tienda ${params.storeId}.`);
    const project = readProjectArchive(Buffer.from(current.bytes).toString("utf8"));
    if (project.status !== "archived")
      fail("STORE_NOT_ARCHIVED", `La tienda ${params.storeId} no está archivada.`);
    const currentVersion = Number(
      (current.manifest as { current?: { version?: number } })?.current?.version ?? 0,
    );
    if (params.expectedVersion !== undefined && params.expectedVersion !== currentVersion)
      fail("VERSION_CONFLICT", "La tienda cambió desde la lectura.", {
        expected: params.expectedVersion,
        actual: currentVersion,
      });
    const lock = await this.agentLocks.read(params.storeId);
    if (lock) fail("AGENT_LOCKED", "La tienda tiene un lock activo; esperá a que expire.");
    const restored = StoreProjectV2Schema.parse({
      ...project,
      status: "active" as const,
      updatedAt: this.now().toISOString(),
    });
    let exportResult: ReturnType<typeof exportProject> | undefined;
    try {
      exportResult = exportProject(restored, { mode: "production" });
    } catch {
      // La restauración no debe fallar por contenido pendiente; exporta draft.
      exportResult = exportProject(restored, { mode: "draft" });
    }
    const archive = new TextEncoder().encode(createProjectArchive(restored));
    const tx = await this.options.storage.beginSave({
      projectId: restored.id,
      name: restored.name,
      slug: restored.slug,
      projectUpdatedAt: restored.updatedAt,
      expectedVersion: currentVersion,
      actor: { kind: "agent" as const, id: this.actorId },
      rendererFingerprint: EXPORTER_RENDERER_FINGERPRINT,
    });
    try {
      await this.options.storage.upload(tx.transactionId, "project", bytesStream(archive));
      await this.options.storage.upload(
        tx.transactionId,
        "site",
        bytesStream(new TextEncoder().encode(siteMap(exportResult.files))),
      );
      const receipt = await this.options.storage.commit(tx.transactionId);
      await this.audit("stores.restore.succeeded", {
        storeId: params.storeId,
        version: tx.version,
      });
      return { receipt, storeId: restored.id, version: tx.version, status: "synced" };
    } catch (error) {
      await this.options.storage.abort(tx.transactionId).catch(() => undefined);
      throw error;
    }
  }
  async stageAsset(rawParams: unknown) {
    await this.ready();
    this.requireScope("assets:write");
    const params = AssetStageParamsSchema.parse(rawParams);
    await mkdir(this.inboxRoot, { recursive: true });
    await assertNoReparsePoints(this.options.applicationRoot, this.inboxRoot);
    let bytes: Uint8Array;
    if (params.source.kind === "base64") {
      if (params.source.data.length > 8_000_000)
        fail("ASSET_TOO_LARGE", "El base64 supera el límite de transporte.");
      bytes = strictBase64(params.source.data);
      if (bytes.byteLength > MAX_INLINE_ASSET_BYTES)
        fail("ASSET_USE_INBOX", "Para assets grandes usá agent-inbox y source.kind=inbox.");
    } else {
      const filename = params.source.filename;
      if (
        filename !== filename.replace(/[\\/]/g, "") ||
        !/^[^<>:"/\\|?*]+$/.test(filename) ||
        filename === "." ||
        filename === ".."
      ) {
        fail("ASSET_PATH_INVALID", "El nombre del asset no puede salir de agent-inbox.");
      }
      const path = join(this.inboxRoot, filename);
      bytes = new Uint8Array(await readFile(path));
      if (bytes.byteLength > MAX_INBOX_ASSET_BYTES)
        fail("ASSET_TOO_LARGE", "El asset supera el límite permitido.");
    }
    const result = await this.stageBytes(params, bytes);
    await this.audit("asset.staged", { assetId: result.assetId, bytes: result.bytes });
    return result;
  }

  private async stageBytes(
    params: { name: string; alt: string; mimeType: AssetStageParams["mimeType"] },
    bytes: Uint8Array,
  ) {
    if (bytes.byteLength > MAX_INBOX_ASSET_BYTES)
      fail("ASSET_TOO_LARGE", "El asset supera el límite permitido.");
    validateImageSignature(params.mimeType, bytes);
    const assetId = makeId("asset-agent");
    let persistedBytes = bytes;
    let asset: ImageAsset;
    if (params.mimeType === "image/x-icon") {
      const dimensions = imageDimensions(params.mimeType, bytes);
      // Mínimo razonable para evitar imágenes inutilizables en el sitio público.
      if (dimensions.width < 32 || dimensions.height < 32)
        fail("ASSET_DIMENSIONS_INVALID", "Las dimensiones del asset no son válidas.");
      let optimized;
      try {
        optimized = await optimizeFavicon(bytes, dimensions.width, dimensions.height);
      } catch (error) {
        fail(
          "ASSET_OPTIMIZATION_FAILED",
          `No se pudo aplicar la receta responsive-alpha-v2 a «${params.name}».`,
          error instanceof Error ? error.message : undefined,
        );
      }
      asset = ImageAssetSchema.parse({
        kind: "image",
        id: assetId,
        name: params.name,
        alt: params.alt,
        mimeType: optimized.mimeType,
        optimizationRecipe: optimized.optimizationRecipe,
        source: optimized.source,
        fallbackSource: optimized.fallbackSource,
        responsiveSources: optimized.responsiveSources,
        width: optimized.width,
        height: optimized.height,
        hash: optimized.hash,
      });
      persistedBytes = optimized.primaryBytes;
    } else {
      let optimized;
      try {
        optimized = await optimizeRasterImage(bytes, params.mimeType);
      } catch (error) {
        fail(
          "ASSET_OPTIMIZATION_FAILED",
          `No se pudo aplicar la receta responsive-alpha-v2 a «${params.name}».`,
          error instanceof Error ? error.message : undefined,
        );
      }
      // optimizer devuelve las dimensiones decodificadas; así AVIF no depende
      // de un parser parcial de ISOBMFF en el host Node.
      if (optimized.width < 32 || optimized.height < 32)
        fail("ASSET_DIMENSIONS_INVALID", "Las dimensiones del asset no son válidas.");
      asset = ImageAssetSchema.parse({
        kind: "image",
        id: assetId,
        name: params.name,
        alt: params.alt,
        mimeType: optimized.mimeType,
        optimizationRecipe: optimized.optimizationRecipe,
        source: optimized.source,
        fallbackSource: optimized.fallbackSource,
        responsiveSources: optimized.responsiveSources,
        width: optimized.width,
        height: optimized.height,
        hash: optimized.hash,
      });
      persistedBytes = optimized.primaryBytes;
    }
    const bytesPath = join(this.assetsRoot, `${assetId}.bin`);
    const metadataPath = join(this.assetsRoot, `${assetId}.json`);
    await writeAtomic(bytesPath, persistedBytes);
    await writeAtomic(
      metadataPath,
      `${JSON.stringify({ ...asset, source: undefined }, (_, value) => (value === undefined ? undefined : value), 2)}\n`,
    );
    this.stagedAssets.set(assetId, { asset, bytesPath });
    return {
      assetId,
      bytes: persistedBytes.byteLength,
      sha256: asset.hash,
      width: asset.width,
      height: asset.height,
    };
  }

  /**
   * Genera un placeholder PNG determinístico basado en el seed. Colores
   * derivados de SHA-256 para que cada seed produzca un resultado estable.
   */
  async generatePlaceholderAsset(rawParams: unknown) {
    await this.ready();
    this.requireScope("assets:write");
    const params = AssetGeneratePlaceholderParamsSchema.parse(rawParams);
    const hash = createHash("sha256").update(params.seed).digest();
    const png = this.generateSolidPng(128, 128, hash[0] ?? 0, hash[1] ?? 0, hash[2] ?? 0);
    const result = await this.stageBytes(
      { name: params.name, alt: params.alt, mimeType: "image/png" },
      new Uint8Array(png),
    );
    await this.audit("asset.placeholder.generated", { assetId: result.assetId });
    return result;
  }

  /** Genera un PNG RGB sólido mínimo sin dependencias externas. */
  private generateSolidPng(width: number, height: number, r: number, g: number, b: number): Buffer {
    const bytesPerRow = width * 3 + 1;
    const rawData = Buffer.alloc(bytesPerRow * height);
    for (let y = 0; y < height; y++) {
      const rowOffset = y * bytesPerRow;
      rawData[rowOffset] = 0;
      for (let x = 0; x < width; x++) {
        const offset = rowOffset + 1 + x * 3;
        rawData[offset] = r;
        rawData[offset + 1] = g;
        rawData[offset + 2] = b;
      }
    }
    const compressed = deflateSync(rawData);
    const crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
    function crc32(buf: Uint8Array): number {
      let crc = 0xffffffff;
      for (const byte of buf) {
        const tableEntry = crcTable[(crc ^ byte) & 0xff];
        if (tableEntry !== undefined) crc = tableEntry ^ (crc >>> 8);
      }
      return (crc ^ 0xffffffff) >>> 0;
    }
    function chunk(type: string, data: Buffer): Buffer {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      const typeBuf = Buffer.from(type);
      const crcBuf = Buffer.alloc(4);
      crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
      return Buffer.concat([len, typeBuf, data, crcBuf]);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", compressed),
      chunk("IEND", Buffer.alloc(0)),
    ]);
  }

  private async readStagedAsset(assetId: string): Promise<StagedAsset | undefined> {
    const cached = this.stagedAssets.get(assetId);
    if (cached) return cached;
    const metadataPath = join(this.assetsRoot, `${assetId}.json`);
    const bytesPath = join(this.assetsRoot, `${assetId}.bin`);
    try {
      const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as ImageAsset & {
        source?: string;
      };
      const bytes = new Uint8Array(await readFile(bytesPath));
      const asset = ImageAssetSchema.parse({
        ...metadata,
        source: `data:${metadata.mimeType};base64,${bytesToBase64(bytes)}`,
      });
      const staged = { asset, bytesPath };
      this.stagedAssets.set(assetId, staged);
      return staged;
    } catch {
      return undefined;
    }
  }

  async beginAssetUpload(rawParams: unknown) {
    await this.ready();
    this.requireScope("assets:write");
    const params = AssetUploadBeginParamsSchema.parse(rawParams);
    const uploadId = makeId("upload-agent");
    const metadataPath = join(this.uploadsRoot, `${uploadId}.json`);
    const partPath = join(this.uploadsRoot, `${uploadId}.part`);
    await writeAtomic(
      metadataPath,
      `${JSON.stringify({
        uploadId,
        name: params.name,
        alt: params.alt,
        mimeType: params.mimeType,
        expectedBytes: params.expectedBytes,
        receivedBytes: 0,
        nextSequence: 0,
        createdAt: this.now().toISOString(),
      })}\n`,
    );
    await writeAtomic(partPath, new Uint8Array());
    return { uploadId, nextSequence: 0, receivedBytes: 0, maxBytes: MAX_INBOX_ASSET_BYTES };
  }

  async uploadAssetChunk(rawParams: unknown) {
    await this.ready();
    this.requireScope("assets:write");
    const params = AssetUploadChunkParamsSchema.parse(rawParams);
    const metadataPath = join(this.uploadsRoot, `${params.uploadId}.json`);
    const partPath = join(this.uploadsRoot, `${params.uploadId}.part`);
    let metadata: {
      uploadId: string;
      expectedBytes?: number;
      receivedBytes: number;
      nextSequence: number;
    };
    try {
      metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    } catch {
      fail("UPLOAD_NOT_FOUND", "La carga de asset no existe o expiró.");
    }
    if (params.sequence !== metadata.nextSequence)
      fail("UPLOAD_SEQUENCE_INVALID", `Se esperaba el chunk ${metadata.nextSequence}.`);
    const bytes = strictBase64(params.data);
    if (bytes.byteLength > MAX_UPLOAD_CHUNK_BYTES)
      fail("UPLOAD_CHUNK_TOO_LARGE", "El chunk supera el límite permitido.");
    const receivedBytes = metadata.receivedBytes + bytes.byteLength;
    if (receivedBytes > MAX_INBOX_ASSET_BYTES)
      fail("ASSET_TOO_LARGE", "El asset supera el límite permitido.");
    if (metadata.expectedBytes !== undefined && receivedBytes > metadata.expectedBytes)
      fail("UPLOAD_SIZE_INVALID", "La carga supera expectedBytes.");
    await appendFile(partPath, bytes);
    const next = {
      ...metadata,
      receivedBytes,
      nextSequence: metadata.nextSequence + 1,
    };
    await writeAtomic(metadataPath, `${JSON.stringify(next)}\n`);
    return {
      uploadId: params.uploadId,
      nextSequence: next.nextSequence,
      receivedBytes,
      progress: metadata.expectedBytes ? receivedBytes / metadata.expectedBytes : null,
    };
  }

  async finishAssetUpload(rawParams: unknown) {
    await this.ready();
    this.requireScope("assets:write");
    const params = AssetUploadFinishParamsSchema.parse(rawParams);
    const metadataPath = join(this.uploadsRoot, `${params.uploadId}.json`);
    const partPath = join(this.uploadsRoot, `${params.uploadId}.part`);
    let metadata: {
      name: string;
      alt: string;
      mimeType: AssetStageParams["mimeType"];
      expectedBytes?: number;
      receivedBytes: number;
    };
    try {
      metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    } catch {
      fail("UPLOAD_NOT_FOUND", "La carga de asset no existe o expiró.");
    }
    if (metadata.expectedBytes !== undefined && metadata.receivedBytes !== metadata.expectedBytes)
      fail("UPLOAD_INCOMPLETE", "La carga no coincide con expectedBytes.");
    const bytes = new Uint8Array(await readFile(partPath));
    const hash = digest(bytes);
    if (params.sha256 && params.sha256.toLowerCase() !== hash)
      fail("ASSET_HASH_INVALID", "El SHA-256 del asset no coincide.");
    const result = await this.stageBytes(metadata, bytes);
    await rm(metadataPath, { force: true });
    await rm(partPath, { force: true });
    await this.audit("asset.upload.finished", {
      uploadId: params.uploadId,
      assetId: result.assetId,
      bytes: result.bytes,
    });
    return result;
  }

  async createPlan(rawParams: unknown) {
    await this.ready();
    this.requireScope("plans:write");
    const params = PlanCreateParamsSchema.parse(rawParams);
    const operations = params.operations.map((operation: AgentOperation) =>
      AgentOperationSchema.parse(operation),
    );
    if (params.idempotencyKey) {
      const existing = [...this.plans.values()].find(
        (plan) => plan.idempotencyKey === params.idempotencyKey,
      );
      if (existing) {
        await this.ensurePlanFresh(existing);
        return this.planResponse(existing);
      }
      const committed = await this.readCommitted(params.idempotencyKey);
      if (committed) return { status: "committed", ...committed };
    }
    const first = operations[0];
    if (!first) fail("PLAN_INVALID", "El plan requiere al menos una operación.");
    const createOperation = first.type === "store.create" ? first : undefined;
    const isNew = createOperation !== undefined;
    if (
      isNew &&
      operations.some((operation, index) => operation.type === "store.create" && index !== 0)
    ) {
      fail(
        "PLAN_INVALID",
        "Una planificación nueva sólo puede crear una tienda y debe hacerlo primero.",
      );
    }
    const storeId = isNew ? (createOperation.storeId ?? makeId("store-agent")) : params.storeId;
    if (!storeId)
      fail("STORE_ID_REQUIRED", "Las operaciones sobre una tienda existente requieren storeId.");
    if (!isNew && params.baseVersion === undefined)
      fail("VERSION_REQUIRED", "Las tiendas existentes requieren baseVersion entero.");
    const current = isNew ? undefined : await this.options.storage.readCurrent(storeId);
    if (!isNew && !current) fail("STORE_NOT_FOUND", `No existe la tienda ${storeId}.`);
    const baseVersion =
      params.baseVersion ??
      (current
        ? Number((current.manifest as { current?: { version?: number } })?.current?.version ?? 0)
        : null);
    if (!isNew && !Number.isInteger(baseVersion))
      fail("VERSION_REQUIRED", "Las tiendas existentes requieren baseVersion entero.");
    if (isNew && baseVersion !== null && baseVersion !== 0)
      fail("VERSION_INVALID", "Una tienda nueva debe usar baseVersion null o 0.");
    let base: StoreProjectV1;
    if (isNew) {
      if (createOperation.source.kind === "clean") {
        base = createCleanProject(createOperation, storeId, this.now());
      } else {
        const templateCurrent = await this.options.storage.readCurrent(this.baseTemplateStoreId);
        if (!templateCurrent) {
          fail(
            "TEMPLATE_NOT_FOUND",
            `No existe la plantilla base ${this.baseTemplateStoreId}; no se puede crear la tienda.`,
          );
        }
        const template = readProjectArchive(Buffer.from(templateCurrent.bytes).toString("utf8"));
        if (!isBaseTemplate(template, this.protectedStoreIds)) {
          fail(
            "TEMPLATE_INVALID",
            "La fuente solicitada no está marcada como plantilla protegida.",
          );
        }
        base = cloneProjectFromTemplate(template, {
          id: storeId,
          name: createOperation.name,
          slug: createOperation.slug ?? safeSlug(createOperation.name),
          ...(createOperation.baseUrl ? { baseUrl: createOperation.baseUrl } : {}),
          // Sin brandName explícito, el clon heredaría la marca de la
          // plantilla (identity.brandName, legalName y greeting de WhatsApp).
          brandName: createOperation.brandName ?? createOperation.name,
          now: this.now().toISOString(),
        });
        // Paridad con createProject del Studio: el clon no hereda los
        // placeholders tipados de contacto de la plantilla; los campos no
        // provistos quedan vacíos para que el readiness los reporte honestos.
        // El teléfono, cuando viene, también configura WhatsApp (el canal no
        // tiene otra forma de dejarlo operativo para el sitio exportado).
        base = StoreProjectV2Schema.parse({
          ...base,
          identity: {
            ...base.identity,
            email: createOperation.email ?? "",
            phone: createOperation.phone ?? "",
          },
          whatsapp: {
            ...base.whatsapp,
            ...(createOperation.phone === undefined ? {} : { phone: createOperation.phone }),
          },
        });
      }
    } else {
      if (!current) fail("STORE_NOT_FOUND", `No existe la tienda ${storeId}.`);
      base = readProjectArchive(Buffer.from(current.bytes).toString("utf8"));
      if (projectIsProtected(base, this.protectedStoreIds))
        fail(
          "PROTECTED_STORE",
          "La tienda de demo está protegida. Creá una tienda nueva para modificarla.",
        );
    }
    const project = await this.applyOperations(base, isNew ? operations.slice(1) : operations);
    const diff = planDiff(isNew ? undefined : base, project, operations, isNew);
    const warnings = planWarnings(project, diff);
    // Ejecutar la auditoría del exporter antes de crear el plan para que el
    // agente vea errores críticos (p. ej. producto sin imagen) sin commitear.
    const blockingIssues = auditProject(project)
      .filter((issue) => issue.severity === "critical")
      .map((issue) => ({ code: issue.code, severity: issue.severity, message: issue.message }));
    const planId = makeId("plan-agent");
    const createdAt = this.now().toISOString();
    const plan: PlanDraft = {
      planId,
      storeId: project.id,
      baseVersion,
      project,
      operations,
      createdNewStore: isNew,
      createdAt,
      expiresAt: new Date(this.now().getTime() + PLAN_TTL_MS).toISOString(),
      diff,
      warnings,
      blockingIssues,
      includeDiff: params.includeDiff,
      ...(params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : {}),
    };
    try {
      await this.agentLocks.claim(plan.storeId, plan.planId, {
        planId: plan.planId,
        storeId: plan.storeId,
      });
      this.plans.set(planId, plan);
      await this.persistPlan(plan);
      await this.audit("plan.created", {
        planId,
        storeId: plan.storeId,
        operationCount: operations.length,
        createdNewStore: isNew,
      });
    } catch (error) {
      await this.agentLocks.release(plan.storeId, plan.planId);
      throw error;
    }
    return this.planResponse(plan, false, params.includeDiff);
  }

  async getPlan(rawParams: unknown) {
    await this.ready();
    this.requireScope("read");
    const params = PlanGetParamsSchema.parse(rawParams);
    const plan = this.plans.get(params.planId);
    if (!plan) fail("PLAN_NOT_FOUND", "El plan no existe o expiró.");
    await this.ensurePlanFresh(plan);
    await this.agentLocks.heartbeat(plan.storeId, plan.planId);
    return this.planResponse(plan, params.includeProject);
  }

  async discardPlan(rawParams: unknown) {
    await this.ready();
    this.requireScope("plans:write");
    const params = PlanDiscardParamsSchema.parse(rawParams);
    const plan = this.plans.get(params.planId);
    if (!plan) fail("PLAN_NOT_FOUND", "El plan no existe o expiró.");
    await this.ensurePlanFresh(plan);
    await this.deletePlan(plan);
    await this.audit("plan.discarded", { planId: plan.planId, storeId: plan.storeId });
    return { planId: plan.planId, discarded: true };
  }

  async heartbeatPlan(rawParams: unknown) {
    await this.ready();
    this.requireScope("plans:write");
    const params = PlanHeartbeatParamsSchema.parse(rawParams);
    const plan = this.plans.get(params.planId);
    if (!plan) fail("PLAN_NOT_FOUND", "El plan no existe o expiró.");
    await this.ensurePlanFresh(plan);
    const lock = await this.agentLocks.heartbeat(plan.storeId, plan.planId);
    return { planId: plan.planId, expiresAt: lock.expiresAt };
  }

  async commitPlan(rawParams: unknown) {
    await this.ready();
    this.requireScope("commit");
    const params = PlanCommitParamsSchema.parse(rawParams);
    if (params.idempotencyKey) {
      const committed = await this.readCommitted(params.idempotencyKey);
      if (committed) return committed;
    }
    if (params.async) {
      const existingJob = [...this.jobs.values()].find(
        (job) => job.planId === params.planId && ["queued", "running"].includes(job.status),
      );
      if (existingJob) return this.jobResponse(existingJob);
      const job: AgentJob = {
        jobId: makeId("job-agent"),
        kind: "plans.commit",
        planId: params.planId,
        ...(this.requestId === undefined ? {} : { requestId: this.requestId }),
        status: "queued",
        createdAt: this.now().toISOString(),
        updatedAt: this.now().toISOString(),
      };
      await this.persistJob(job);
      void this.runCommitJob(job, params);
      return this.jobResponse(job);
    }
    return this.commitPlanNow(params, this.requestId);
  }

  /**
   * Crea el plan y lo commitea en la misma llamada. Elimina la necesidad de
   * tres invocaciones separadas (stage -> plan.create -> plan.commit) para
   * flujos transaccionales donde el agente ya revisó el diff previamente.
   * Devuelve directamente el receipt del commit.
   */
  async createAndCommitPlan(rawParams: unknown) {
    await this.ready();
    this.requireScope("commit");
    const params = PlanCreateAndCommitParamsSchema.parse(rawParams);
    const plan = await this.createPlan({
      storeId: params.storeId,
      baseVersion: params.baseVersion,
      idempotencyKey: params.idempotencyKey,
      operations: params.operations,
    });
    if (typeof plan === "object" && plan !== null && "planId" in plan) {
      return this.commitPlanNow(
        { planId: (plan as { planId: string }).planId, idempotencyKey: params.idempotencyKey },
        this.requestId,
      );
    }
    // El plan ya estaba commiteado (idempotencia); devolver el receipt existente.
    return plan;
  }

  private async commitPlanNow(rawParams: unknown, requestId = this.requestId) {
    const params = PlanCommitParamsSchema.parse(rawParams);
    const plan = this.plans.get(params.planId);
    if (!plan) fail("PLAN_NOT_FOUND", "El plan no existe, ya fue consumido o expiró.");
    await this.ensurePlanFresh(plan);
    const idempotencyKey = params.idempotencyKey ?? plan.idempotencyKey;
    if (idempotencyKey) {
      const committed = await this.readCommitted(idempotencyKey);
      if (committed) return committed;
    }
    await this.agentLocks.heartbeat(plan.storeId, plan.planId);
    await this.audit(
      "plan.commit.started",
      { planId: plan.planId, storeId: plan.storeId },
      requestId,
    );
    const current = await this.options.storage.readCurrent(plan.storeId);
    const currentVersion = current
      ? Number((current.manifest as { current?: { version?: number } })?.current?.version ?? 0)
      : null;
    if (plan.createdNewStore ? current : currentVersion !== plan.baseVersion) {
      fail("VERSION_CONFLICT", "La tienda cambió desde la creación del plan; generá uno nuevo.", {
        expected: plan.baseVersion,
        actual: currentVersion,
      });
    }
    const validated = StoreProjectV2Schema.parse(plan.project);
    let exportResult: ReturnType<typeof exportProject> | undefined;
    let exportWarning: string | undefined;
    try {
      exportResult = exportProject(validated, { mode: "production" });
    } catch (error) {
      exportWarning = error instanceof Error ? error.message : String(error);
      exportResult = exportProject(validated, { mode: "draft" });
    }
    const archive = new TextEncoder().encode(createProjectArchive(validated));
    const tx = await this.options.storage.beginSave({
      projectId: validated.id,
      name: validated.name,
      slug: validated.slug,
      projectUpdatedAt: validated.updatedAt,
      expectedVersion: plan.baseVersion,
      actor: { kind: "agent", id: plan.planId },
      rendererFingerprint: EXPORTER_RENDERER_FINGERPRINT,
    });
    try {
      await this.options.storage.upload(tx.transactionId, "project", bytesStream(archive));
      if (!exportWarning && exportResult) {
        const map = new TextEncoder().encode(siteMap(exportResult.files));
        await this.options.storage.upload(tx.transactionId, "site", bytesStream(map));
      }
      const receipt = await this.options.storage.commit(tx.transactionId);
      const result = {
        receipt,
        storeId: validated.id,
        version: tx.version,
        status: exportWarning ? "site-outdated" : "synced",
        audit: exportResult?.audit ?? [],
        ...(exportWarning ? { exportWarning } : {}),
      };
      if (idempotencyKey)
        await writeAtomic(
          this.committedPath(idempotencyKey),
          `${JSON.stringify(result, null, 2)}\n`,
        );
      await this.audit(
        "plan.commit.succeeded",
        {
          planId: plan.planId,
          storeId: validated.id,
          version: tx.version,
          status: result.status,
        },
        requestId,
      );
      await this.deletePlan(plan);
      return result;
    } catch (error) {
      await this.options.storage.abort(tx.transactionId).catch(() => undefined);
      await this.audit(
        "plan.commit.failed",
        {
          planId: plan.planId,
          storeId: plan.storeId,
          error: agentError(error),
        },
        requestId,
      );
      throw error;
    }
  }

  private async readCommitted(idempotencyKey: string): Promise<unknown | undefined> {
    try {
      return JSON.parse(await readFile(this.committedPath(idempotencyKey), "utf8"));
    } catch {
      return undefined;
    }
  }

  private jobResponse(job: AgentJob) {
    return {
      jobId: job.jobId,
      kind: job.kind,
      planId: job.planId,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      ...(job.result === undefined ? {} : { result: job.result }),
      ...(job.error === undefined ? {} : { error: job.error }),
    };
  }

  private async runCommitJob(job: AgentJob, params: unknown): Promise<void> {
    const running = {
      ...job,
      status: "running" as const,
      updatedAt: this.now().toISOString(),
    };
    await this.persistJob(running);
    Object.assign(job, running);
    try {
      const result = await this.commitPlanNow(params, job.requestId);
      const succeeded = {
        ...job,
        result,
        status: "succeeded" as const,
        updatedAt: this.now().toISOString(),
      };
      await this.persistJob(succeeded);
      Object.assign(job, succeeded);
    } catch (error) {
      const failed = {
        ...job,
        status: "failed" as const,
        error: agentError(error),
        updatedAt: this.now().toISOString(),
      };
      await this.persistJob(failed);
      Object.assign(job, failed);
    }
  }

  async getJob(rawParams: unknown) {
    await this.ready();
    this.requireScope("read");
    const params = JobGetParamsSchema.parse(rawParams);
    const job = this.jobs.get(params.jobId);
    if (!job) fail("JOB_NOT_FOUND", "El trabajo no existe o expiró.");
    return this.jobResponse(job);
  }

  async listAudit(rawParams: unknown = { limit: 50 }) {
    await this.ready();
    this.requireScope("audit:read");
    const params = AuditListParamsSchema.parse(rawParams);
    try {
      const lines = (await readFile(this.auditPath, "utf8")).trim().split(/\r?\n/).filter(Boolean);
      return { entries: lines.slice(-params.limit).map((line) => JSON.parse(line)) };
    } catch {
      return { entries: [] };
    }
  }

  private async applyOperations(
    base: StoreProjectV1,
    rawOperations: AgentOperation[],
  ): Promise<StoreProjectV1> {
    // Recolectar todos los assets stageados referenciados por el plan, tanto
    // desde asset.attach como desde product.create.imageIds, y deduplicarlos
    // para evitar "ID de recurso duplicado" cuando varios attach/productos
    // usan el mismo asset.
    const referencedAssetIds = new Set<string>();
    for (const operation of rawOperations) {
      if (operation.type === "asset.attach") {
        referencedAssetIds.add(operation.assetId);
      } else if (operation.type === "category.create") {
        if (operation.imageId) referencedAssetIds.add(operation.imageId);
      } else if (operation.type === "category.update") {
        if (operation.changes.imageId) referencedAssetIds.add(operation.changes.imageId);
      } else if (operation.type === "product.create") {
        for (const imageId of operation.imageIds) referencedAssetIds.add(imageId);
      } else if (operation.type === "product.update") {
        if (operation.changes.imageIds) {
          for (const imageId of operation.changes.imageIds) {
            referencedAssetIds.add(imageId);
          }
        }
      } else if (operation.type === "product.createBatch") {
        for (const imageId of operation.imageIds) referencedAssetIds.add(imageId);
      }
    }
    const stagedForPlan: ImageAsset[] = [];
    for (const assetId of referencedAssetIds) {
      const staged = await this.readStagedAsset(assetId);
      if (staged) stagedForPlan.push(staged.asset);
    }
    let project =
      stagedForPlan.length === 0
        ? base
        : StoreProjectV2Schema.parse({
            ...base,
            assets: [
              ...base.assets,
              ...stagedForPlan.filter(
                (asset) => !base.assets.some((candidate) => candidate.id === asset.id),
              ),
            ],
          });
    const mutationRegistry = createMutationRegistry();
    const applyRegistered = (mutation: ProjectMutation, at: string): void => {
      project = applyMutation(
        project,
        mutationRegistry,
        mutation,
        { kind: "agent", actorId: this.actorId, requestId: this.requestId ?? "plan" },
        { at },
      ).project;
    };
    const validateVariantImages = (
      productId: string,
      imageIds: string[],
      variants: Array<{ imageId?: string | undefined }>,
    ): void => {
      for (const variant of variants) {
        if (variant.imageId === undefined) continue;
        if (!project.assets.some((asset) => asset.id === variant.imageId)) {
          fail("ASSET_NOT_FOUND", `No existe la imagen de variante ${variant.imageId}.`);
        }
        if (!imageIds.includes(variant.imageId)) {
          fail(
            "PLAN_INVALID",
            `La imagen de variante ${variant.imageId} debe estar también en la galería de ${productId}.`,
          );
        }
      }
    };
    for (const rawOperation of rawOperations) {
      const operation = AgentOperationSchema.parse(rawOperation);
      const at = this.now().toISOString();
      switch (operation.type) {
        case "store.create": {
          fail(
            "PLAN_INVALID",
            "store.create sólo puede ser la primera operación de un plan nuevo.",
          );
          break;
        }
        case "store.updateIdentity": {
          applyRegistered({ type: "identity.update", changes: operation.changes as never }, at);
          break;
        }
        case "store.updateSeo":
          applyRegistered({ type: "seo.update", changes: operation.changes as never }, at);
          break;
        case "store.updatePage": {
          if (!project.pages.some((page) => page.id === operation.pageId))
            fail("PAGE_NOT_FOUND", `No existe la página ${operation.pageId}.`);
          project = StoreProjectV2Schema.parse({
            ...project,
            pages: project.pages.map((page) =>
              page.id === operation.pageId ? { ...page, ...operation.changes } : page,
            ),
            updatedAt: at,
          });
          break;
        }
        case "store.updatePublicCopy": {
          const LEGAL_MIN_LENGTHS: Record<string, number> = {
            "whatsapp.confirmation": 20,
            "checkout.disclaimer": 20,
            "whatsapp.ask": 10,
            "whatsapp.purchase": 10,
            "cart.phoneInvalid": 10,
            "navigation.openMenu": 5,
            "navigation.closeMenu": 5,
            "product.noStock": 3,
            "cart.unavailable": 3,
          };
          const REQUIRED_PLACEHOLDERS: Record<string, string[]> = {
            "contact.emailSubject": ["{storeName}"],
            "whatsapp.orderGreeting": ["{storeName}"],
            "search.suggestion": ["{query}"],
            "export.pageOf": ["{page}", "{total}"],
            "export.exploreCategory": ["{category}"],
            "export.viewImage": ["{index}"],
          };
          for (const [groupKey, changes] of Object.entries(operation.changes)) {
            if (typeof changes !== "object" || changes === null) continue;
            for (const [key, value] of Object.entries(changes as Record<string, unknown>)) {
              if (typeof value !== "string") continue;
              const fullKey = `${groupKey}.${key}`;
              const minLength = LEGAL_MIN_LENGTHS[fullKey];
              if (minLength !== undefined && value.trim().length < minLength) {
                throw new Error(
                  `${fullKey}: el texto es un aviso legal y debe tener al menos ${minLength} caracteres.`,
                );
              }
              const required = REQUIRED_PLACEHOLDERS[fullKey];
              if (required) {
                for (const placeholder of required) {
                  if (!value.includes(placeholder)) {
                    throw new Error(`${fullKey}: debe contener el placeholder ${placeholder}`);
                  }
                }
              }
            }
          }
          for (const [group, changes] of Object.entries(operation.changes)) {
            if (!changes || typeof changes !== "object" || Array.isArray(changes)) continue;
            for (const [field, value] of Object.entries(changes)) {
              if (typeof value !== "string") continue;
              applyRegistered(
                { type: "publicCopy.update", group: group as never, field, value },
                at,
              );
            }
          }
          break;
        }
        case "store.updatePolicies":
          {
            const { navigation, ...policyChanges } = operation.changes;
            let updated = { ...project, policies: { ...project.policies, ...policyChanges } };
            if (navigation && typeof navigation === "object") {
              updated = {
                ...updated,
                navigation: { ...project.navigation, ...(navigation as Record<string, unknown>) },
              };
            }
            project = StoreProjectV2Schema.parse(updated);
          }
          break;
        case "store.updateLegalProfile": {
          project = StoreProjectV2Schema.parse({
            ...project,
            legalProfile: {
              ...project.legalProfile,
              ...operation.changes,
              consumerRights: {
                ...project.legalProfile.consumerRights,
                ...(operation.changes.consumerRights ?? {}),
              },
              revisionAt: operation.changes.revisionAt ?? at,
            },
          });
          break;
        }
        case "store.updateWhatsapp": {
          // Filtrar undefined: con exactOptionalPropertyTypes un spread
          // explícito de `phone: undefined` pisaría el campo y fallaría el
          // schema (phone es string obligatorio).
          const changes: Record<string, unknown> = {};
          if (operation.phone !== undefined) changes.phone = operation.phone;
          if (operation.greeting !== undefined) changes.greeting = operation.greeting;
          if (operation.includeSku !== undefined) changes.includeSku = operation.includeSku;
          applyRegistered({ type: "whatsapp.update", changes } as never, at);
          break;
        }
        case "store.updateNavigation": {
          const changes: Record<string, unknown> = {};
          if (operation.mode !== undefined) changes.mode = operation.mode;
          if (operation.catalogLabel !== undefined) changes.catalogLabel = operation.catalogLabel;
          if (operation.items !== undefined) changes.items = operation.items;
          applyRegistered({ type: "navigation.update", changes } as never, at);
          break;
        }
        case "category.create": {
          const category = CategorySchema.parse({
            id: operation.categoryId ?? makeId("category-agent"),
            slug: operation.slug,
            title: operation.title,
            description: operation.description,
            ...(operation.parentId ? { parentId: operation.parentId } : {}),
            ...(operation.imageId ? { imageId: operation.imageId } : {}),
            productIds: [],
          });
          project = reduceProject(project, { type: "category.create", category, at });
          break;
        }
        case "collection.create": {
          const collection = CollectionSchema.parse({
            id: operation.collectionId ?? makeId("collection-agent"),
            slug: operation.slug,
            title: operation.title,
            description: operation.description,
            ...(operation.imageId ? { imageId: operation.imageId } : {}),
            productIds: [],
          });
          project = reduceProject(project, { type: "collection.create", collection, at });
          break;
        }
        case "category.update": {
          applyRegistered(
            {
              type: "category.update",
              categoryId: operation.categoryId,
              changes: operation.changes as never,
            },
            at,
          );
          break;
        }
        case "category.setStatus": {
          if (!project.categories.some((candidate) => candidate.id === operation.categoryId))
            fail("PLAN_INVALID", `La categoría no existe: ${operation.categoryId}.`);
          applyRegistered(
            {
              type: "category.update",
              categoryId: operation.categoryId,
              changes: { status: operation.status },
            },
            at,
          );
          break;
        }
        case "category.delete": {
          const category = project.categories.find(
            (candidate) => candidate.id === operation.categoryId,
          );
          if (!category)
            fail("CATEGORY_NOT_FOUND", `No existe la categoría ${operation.categoryId}.`);
          if (category.status !== "hidden") {
            fail(
              "CATEGORY_DELETE_REQUIRES_HIDDEN",
              `La categoría ${operation.categoryId} debe estar oculta antes de eliminarla.`,
            );
          }
          if (project.categories.some((candidate) => candidate.parentId === category.id)) {
            fail(
              "CATEGORY_DELETE_HAS_CHILDREN",
              `La categoría ${operation.categoryId} todavía tiene subcategorías.`,
            );
          }
          if (project.products.some((product) => product.categoryIds.includes(category.id))) {
            fail(
              "CATEGORY_DELETE_NOT_EMPTY",
              `La categoría ${operation.categoryId} todavía tiene productos asignados.`,
            );
          }
          project = reduceProject(project, {
            type: "category.delete",
            categoryId: operation.categoryId as Category["id"],
            at,
          });
          break;
        }
        case "collection.update": {
          applyRegistered(
            {
              type: "collection.update",
              collectionId: operation.collectionId,
              changes: operation.changes as never,
            },
            at,
          );
          break;
        }
        case "product.create": {
          const productId = operation.productId ?? makeId("product-agent");
          const rawVariants = operation.variants ?? [
            {
              title: "Única",
              sku: operation.sku ?? productId.slice(-12),
              priceCents: operation.priceCents ?? 0,
              available: true,
              stockStatus: "in_stock" as const,
              optionValues: {},
            },
          ];
          validateVariantImages(
            operation.productId ?? "producto-nuevo",
            operation.imageIds,
            rawVariants,
          );
          const product: Product = ProductSchema.parse({
            id: productId,
            slug: operation.slug,
            title: operation.title,
            description: operation.description,
            status: operation.status,
            brand: operation.brand ?? project.identity.brandName,
            categoryIds: operation.categoryIds,
            collectionIds: operation.collectionIds,
            tags: operation.tags,
            imageIds: operation.imageIds,
            variants: rawVariants.map((variant, index) => ({
              id: makeId(`variant-agent-${index}`),
              title: variant.title,
              sku: variant.sku,
              optionValues: variant.optionValues,
              price: variant.priceCents,
              ...(variant.compareAtPriceCents === undefined
                ? {}
                : { compareAtPrice: variant.compareAtPriceCents }),
              available: variant.available,
              stockStatus: variant.stockStatus,
              ...(variant.imageId === undefined ? {} : { imageId: variant.imageId }),
            })),
            createdAt: at,
            updatedAt: at,
          });
          project = reduceProject(project, { type: "product.create", product, at });
          break;
        }
        case "product.update":
          {
            const { priceCents, variants, ...productChanges } = operation.changes;
            const existingVariants = project.products.find(
              (candidate) => candidate.id === operation.productId,
            )?.variants ?? [];
            if (variants !== undefined) {
              const existingProduct = project.products.find(
                (candidate) => candidate.id === operation.productId,
              );
              validateVariantImages(
                operation.productId,
                operation.changes.imageIds ?? existingProduct?.imageIds ?? [],
                variants,
              );
            }
            const mappedVariants = variants?.map((variant, index) => ({
              id:
                existingVariants[index]?.id ??
                makeId(`variant-agent-${operation.productId}-${index}`),
              title: variant.title,
              sku: variant.sku,
              optionValues: variant.optionValues,
              price: variant.priceCents,
              ...(variant.compareAtPriceCents === undefined
                ? {}
                : { compareAtPrice: variant.compareAtPriceCents }),
              available: variant.available,
              stockStatus: variant.stockStatus,
              ...(variant.imageId === undefined ? {} : { imageId: variant.imageId }),
            }));
            if (
              Object.keys(productChanges).length > 0 ||
              priceCents !== undefined ||
              mappedVariants !== undefined
            ) {
              applyRegistered(
                {
                  type: "product.update",
                  productId: operation.productId,
                  changes: {
                    ...productChanges,
                    ...(priceCents === undefined ? {} : { price: priceCents }),
                    ...(mappedVariants === undefined ? {} : { variants: mappedVariants }),
                  } as never,
                },
                at,
              );
            }
          }
          break;
        case "products.adjustPrices":
          project = reduceProject(project, {
            type: "products.adjustPrices",
            productIds: operation.productIds as Product["id"][],
            adjustment: operation.adjustment,
            at,
          });
          break;
        case "products.reorder": {
          const currentProductIds = project.products.map((product) => product.id as string);
          if (
            operation.productIds.length !== currentProductIds.length ||
            new Set(operation.productIds).size !== operation.productIds.length ||
            operation.productIds.some((productId) => !currentProductIds.includes(productId))
          ) {
            fail(
              "PLAN_INVALID",
              "products.reorder debe incluir cada producto exactamente una vez.",
            );
          }
          applyRegistered(
            { type: "products.reorder", productIds: operation.productIds },
            at,
          );
          break;
        }
        case "product.setStatus":
          project = reduceProject(project, {
            type: "products.setStatus",
            productIds: [operation.productId as Product["id"]],
            status: operation.status,
            at,
          });
          break;
        case "product.delete": {
          const product = project.products.find(
            (candidate) => candidate.id === operation.productId,
          );
          if (!product) fail("PRODUCT_NOT_FOUND", `No existe el producto ${operation.productId}.`);
          if (product.status !== "archived") {
            fail(
              "PRODUCT_DELETE_REQUIRES_ARCHIVED",
              `El producto ${operation.productId} debe estar archivado antes de eliminarlo.`,
            );
          }
          project = reduceProject(project, {
            type: "product.delete",
            productId: operation.productId as Product["id"],
            at,
          });
          break;
        }
        case "store.archive": {
          // La operación de archivado requiere que la tienda objetivo sea la
          // misma del plan y que no esté protegida (validado en createPlan).
          // La operacion siempre aplica al proyecto del plan; el storeId
          // opcional del contrato se valida para evitar ambigüedad.
          if (operation.storeId !== undefined && operation.storeId !== project.id)
            fail("PLAN_INVALID", "store.archive sólo puede archivar la tienda del plan.");
          project = StoreProjectV2Schema.parse({
            ...project,
            status: "archived" as const,
            updatedAt: at,
          });
          break;
        }
        case "asset.attach": {
          const staged = await this.readStagedAsset(operation.assetId);
          const assetExists = project.assets.some((asset) => asset.id === operation.assetId);
          if (!assetExists && !staged)
            fail(
              "ASSET_NOT_STAGED",
              `El asset ${operation.assetId} no está staged en esta sesión.`,
            );
          if (operation.target === "seo.favicon") {
            const faviconAsset =
              staged?.asset ?? project.assets.find((asset) => asset.id === operation.assetId);
            const faviconIsIco =
              !!faviconAsset &&
              /^data:/i.test(faviconAsset.source) &&
              imageMimeTypeFromSource(faviconAsset.source, faviconAsset.mimeType) ===
                "image/x-icon";
            if (!faviconIsIco) {
              fail(
                "FAVICON_NOT_ICO",
                "El favicon debe ser un asset ICO válido; subilo con mimeType image/x-icon.",
              );
            }
          }
          let assets = project.assets;
          if (!assetExists) {
            if (!staged)
              fail(
                "ASSET_NOT_STAGED",
                `El asset ${operation.assetId} no está staged en esta sesión.`,
              );
            assets = [...project.assets, staged.asset];
          }
          if (operation.target === "product") {
            if (!operation.productId)
              fail("PRODUCT_ID_REQUIRED", "Un asset de producto requiere productId.");
            const product = project.products.find((item) => item.id === operation.productId);
            if (!product)
              fail("PRODUCT_NOT_FOUND", `No existe el producto ${operation.productId}.`);
            project = StoreProjectV2Schema.parse({
              ...project,
              assets,
              products: project.products.map((item) =>
                item.id === operation.productId
                  ? { ...item, imageIds: [...new Set([...item.imageIds, operation.assetId])] }
                  : item,
              ),
              updatedAt: at,
            });
          } else {
            project = StoreProjectV2Schema.parse({
              ...project,
              assets,
              identity:
                operation.target === "identity.logo"
                  ? { ...project.identity, logoAssetId: operation.assetId }
                  : project.identity,
              seo: {
                ...project.seo,
                ...(operation.target === "seo.favicon"
                  ? { faviconAssetId: operation.assetId }
                  : {}),
                ...(operation.target === "seo.social" ? { socialImageId: operation.assetId } : {}),
              },
              updatedAt: at,
            });
          }
          break;
        }
        case "asset.remove": {
          const assetExists = project.assets.some((asset) => asset.id === operation.assetId);
          if (!assetExists) fail("ASSET_NOT_FOUND", `No existe el asset ${operation.assetId}.`);
          const { assets: _assets, ...withoutAssetDefinitions } = project;
          const serialized = JSON.stringify(withoutAssetDefinitions);
          if (serialized.includes(`"${operation.assetId}"`)) {
            fail(
              "ASSET_IN_USE",
              `El asset ${operation.assetId} todavía está referenciado por la tienda.`,
            );
          }
          project = StoreProjectV2Schema.parse({
            ...project,
            assets: project.assets.filter((asset) => asset.id !== operation.assetId),
            updatedAt: at,
          });
          break;
        }
        case "section.updateSettings": {
          // Mismo núcleo de mutaciones que Canvas y sidebar: el snapshot
          // resultante es idéntico sin importar la superficie de origen.
          const applied = applyMutation(project, createMutationRegistry(), {
            type: "section.updateSettings",
            sectionId: operation.sectionId,
            settings: operation.settings,
          });
          project = applied.project;
          break;
        }
        case "product.createBatch": {
          for (let index = 0; index < operation.items.length; index++) {
            const item = operation.items[index];
            if (!item) continue;
            const batchProductId = makeId("product-batch");
            const batchPriceCents = operation.basePriceCents + index * operation.priceStepCents;
            const batchSku = `${operation.skuPrefix}-${String(index + 1).padStart(3, "0")}`;
            const batchSlug = item.title
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "");
            const product: Product = ProductSchema.parse({
              id: batchProductId,
              slug: batchSlug,
              title: item.title,
              description: item.description,
              status: "active" as const,
              brand: project.identity.brandName,
              categoryIds: [operation.categoryId],
              collectionIds: [],
              tags: operation.tags,
              imageIds: operation.imageIds,
              variants: [
                {
                  id: makeId("variant-batch"),
                  title: "Única",
                  sku: batchSku,
                  optionValues: {},
                  price: batchPriceCents,
                  available: true,
                  stockStatus: "in_stock" as const,
                },
              ],
              createdAt: at,
              updatedAt: at,
            });
            project = reduceProject(project, { type: "product.create", product, at });
          }
          break;
        }
        case "theme.applyPreset": {
          const { applyPreset: applyThemePreset } = await import("@solara/project-schema");
          project = StoreProjectV2Schema.parse({
            ...project,
            theme: applyThemePreset(project.theme, operation.presetId),
            updatedAt: at,
          });
          break;
        }
        case "theme.updateTokens": {
          applyRegistered({ type: "theme.updateTokens", tokens: operation.tokens as never }, at);
          break;
        }
      }
    }
    return StoreProjectV2Schema.parse(project);
  }
}

export function createAgentController(options: ControllerOptions): AgentController {
  return new AgentController(options);
}

export function agentError(error: unknown): { code: string; message: string; details?: unknown } {
  const candidate = error as AgentError;
  return {
    code: candidate?.code ?? "AGENT_ERROR",
    message: error instanceof Error ? error.message : String(error),
    ...(candidate?.details === undefined ? {} : { details: candidate.details }),
  };
}

export async function dispatchAgentMethod(
  controller: AgentController,
  method: string,
  params: unknown,
  requestId?: string | number,
): Promise<unknown> {
  controller.setRequestContext(requestId);
  try {
    switch (method) {
      case "health":
        return await controller.health();
      case "protocol.describe":
        return await controller.describeProtocol(params);
      case "stores.list":
        return await controller.listStores();
      case "stores.get":
        return await controller.getStore(params);
      case "stores.restore":
        return await controller.restoreStore(params);
      case "templates.get":
        return await controller.getTemplate(params);
      case "templates.previewUpgrade":
        return await controller.previewTemplateUpgrade(params);
      case "templates.commitUpgrade":
        return await controller.commitTemplateUpgrade(params);
      case "rollouts.preview":
        return await controller.previewRollout(params);
      case "rollouts.commit":
        return await controller.commitRollout(params);
      case "rollouts.get":
        return await controller.getRollout(params);
      case "rollouts.rollback":
        return await controller.rollbackRollout(params);
      case "plans.create":
        return await controller.createPlan(params);
      case "plans.get":
        return await controller.getPlan(params);
      case "plans.commit":
        return await controller.commitPlan(params);
      case "plans.createAndCommit":
        return await controller.createAndCommitPlan(params);
      case "plans.discard":
        return await controller.discardPlan(params);
      case "plans.heartbeat":
        return await controller.heartbeatPlan(params);
      case "jobs.get":
        return await controller.getJob(params);
      case "audit.list":
        return await controller.listAudit(params);
      case "assets.stage":
        return await controller.stageAsset(params);
      case "assets.generatePlaceholder":
        return await controller.generatePlaceholderAsset(params);
      case "assets.upload.begin":
        return await controller.beginAssetUpload(params);
      case "assets.upload.chunk":
        return await controller.uploadAssetChunk(params);
      case "assets.upload.finish":
        return await controller.finishAssetUpload(params);
      default:
        if (method.startsWith("qa.")) {
          const { createQaContext, dispatchQaMethod } = await import("./qa-methods.js");
          const qaCtx = createQaContext(
            (controller as unknown as { options: { applicationRoot: string } }).options
              .applicationRoot,
            (controller as unknown as { scopes: Set<string> }).scopes,
            async () => {},
          );
          return await dispatchQaMethod(qaCtx, method, (params ?? {}) as Record<string, unknown>);
        }
        fail("METHOD_NOT_FOUND", `Método de agente desconocido: ${method}.`);
    }
  } finally {
    controller.setRequestContext(undefined);
  }
}
