/**
 * Servicio de filesystem para el modo launcher. Sólo opera dentro de
 * `proyectos/`, recibe streams, verifica hashes y publica staging con un
 * manifest atómico; no es una API remota ni debe exponerse fuera de loopback.
 */
import { createHash, randomBytes } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parseJsonBytesChunked } from "../src/json-stream.mjs";
import { createAgentLockStore } from "./agent-lock.mjs";
import { assertNoReparsePoints, resolveLocalLayout, resolveLocalPath } from "./local-layout.mjs";

const MANIFEST_FORMAT = "solara-local-project";
const MANIFEST_VERSION = 2;
const DEFAULT_MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;
const DEFAULT_MAX_EXTRACTED_BYTES = 4 * 1024 * 1024 * 1024;
const DEFAULT_MAX_FILES = 25_000;
const DEFAULT_MAX_AUTOMATIC_BACKUPS = 5;
// Una transacción más vieja que esto se considera de un cliente muerto:
// libera el lock y deja de poder commitear.
const TRANSACTION_TTL_MS = 30 * 60 * 1000;
// Los temporales `.<key>.<tx>.tmp` de commits interrumpidos se barren en
// el próximo commit exitoso; los de menos de un día se conservan por si
// otro proceso todavía los está finalizando.
const STALE_TMP_SWEEP_MS = 24 * 60 * 60 * 1000;
const BASE_TEMPLATE_STORE_ID = "store-modo-sur-demo";

function isSafeSegment(value) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9_-]{0,95}$/i.test(value);
}

function safeSlug(value) {
  const normalized = String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return normalized || "tienda";
}

// El slug llega validado por SlugSchema del proyecto (`^[a-z0-9]+(?:-[a-z0-9]+)*$`,
// hasta 120 caracteres). `safeSlug` trunca a 64 porque construye rutas; la
// validación de entrada debe respetar el contrato del schema, no el límite de
// nombres de archivo.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 120;

function shortProjectKey(projectId) {
  return createHash("sha256").update(projectId).digest("hex").slice(0, 8);
}

function timestampKey(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function versionKey(slug, date, version) {
  return `${safeSlug(slug)}-${timestampKey(date)}-v${String(version).padStart(6, "0")}`;
}

function assertProjectId(projectId) {
  if (!isSafeSegment(projectId)) throw new Error("ID de tienda inválido.");
}

function assertRelativeArchivePath(pathname) {
  if (typeof pathname !== "string" || pathname.length === 0 || pathname.length > 240) {
    throw new Error("Ruta de archivo inválida.");
  }
  const normalized = pathname.replaceAll("\\", "/");
  if (
    normalized.startsWith("/") ||
    /^[a-z]:\//i.test(normalized) ||
    normalized.includes("../") ||
    normalized.includes("/..")
  ) {
    throw new Error("El archivo contiene una ruta insegura.");
  }
  if (normalized.includes("\0")) throw new Error("El archivo contiene un byte inválido.");
  const WINDOWS_RESERVED = new Set([
    "CON",
    "PRN",
    "AUX",
    "NUL",
    "COM1",
    "COM2",
    "COM3",
    "COM4",
    "COM5",
    "COM6",
    "COM7",
    "COM8",
    "COM9",
    "LPT1",
    "LPT2",
    "LPT3",
    "LPT4",
    "LPT5",
    "LPT6",
    "LPT7",
    "LPT8",
    "LPT9",
  ]);
  for (const segment of normalized.split("/")) {
    if (!segment) continue;
    const base = segment.split(".")[0] ?? "";
    const cleaned = base
      .trim()
      .replace(/[. ]+$/, "")
      .toUpperCase();
    if (WINDOWS_RESERVED.has(cleaned))
      throw new Error("La ruta contiene un nombre reservado de Windows.");
  }
  return normalized;
}

function assertInside(root, target) {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  const isWin = process.platform === "win32";
  const cmpRoot = isWin ? resolvedRoot.toLowerCase() : resolvedRoot;
  const cmpTarget = isWin ? resolvedTarget.toLowerCase() : resolvedTarget;
  if (cmpTarget !== cmpRoot && !cmpTarget.startsWith(`${cmpRoot}${sep.toLowerCase()}`)) {
    throw new Error("La ruta queda fuera del almacenamiento local.");
  }
  return resolvedTarget;
}

function manifestPath(root, pathname) {
  return assertInside(root, join(root, assertRelativeArchivePath(pathname)));
}

async function readJson(pathname) {
  return JSON.parse(await readFile(pathname, "utf8"));
}

function recoveryMetadata(manifest) {
  const projectId = manifest?.projectId;
  const version = manifest?.current?.version;
  return {
    ...(isSafeSegment(projectId) ? { projectId } : {}),
    ...(Number.isInteger(version) && version >= 0 ? { version } : {}),
  };
}

async function writeJsonAtomic(pathname, value) {
  const temporary = `${pathname}.tmp-${randomBytes(8).toString("hex")}`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await renameWithRetry(temporary, pathname, rename);
  } catch (error) {
    // Un write fallido no debe dejar basura `.tmp-*` junto al destino.
    await rm(temporary, { force: true });
    throw error;
  }
}

/**
 * Windows puede rechazar un rename con EPERM/EBUSY por un lock transitorio
 * (OneDrive, antivirus) o con EACCES por permisos en un directorio. El
 * reintento con backoff corto absorbe los locks transitorios; un destino
 * residual de un intento interrumpido se limpia antes de publicar (commit).
 */
async function renameWithRetry(source, destination, renameFile) {
  const attempts = 4;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await renameFile(source, destination);
      return;
    } catch (error) {
      const transient = ["EPERM", "EBUSY", "EACCES"].includes(error?.code);
      if (attempt === attempts || !transient) throw error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 200 * attempt));
    }
  }
}

async function streamToFile(request, pathname, maxBytes, guardWrite) {
  const temporary = `${pathname}.upload-${randomBytes(8).toString("hex")}`;
  try {
    await mkdir(dirname(pathname), { recursive: true });
    const handle = await open(temporary, "w");
    const hash = createHash("sha256");
    let bytes = 0;
    try {
      await guardWrite?.("write-upload", pathname);
      for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.byteLength;
        if (bytes > maxBytes) throw new Error("El archivo supera el límite permitido.");
        hash.update(buffer);
        await handle.write(buffer);
      }
      await handle.sync();
    } finally {
      await handle.close();
    }
    await renameWithRetry(temporary, pathname, rename);
    return { bytes, sha256: hash.digest("hex") };
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

function parseProjectJson(bytes, expectedProjectId) {
  let envelope;
  try {
    // Códec acotado: con proyectos > ~512 MB, JSON.parse de la cadena
    // completa supera el límite de cadena de V8 (Invalid string length).
    envelope = parseJsonBytesChunked(bytes);
  } catch {
    throw new Error("El respaldo de la tienda está corrupto o no es JSON válido.");
  }
  const project = envelope?.project;
  if (envelope?.format !== "solara-project" || envelope?.version !== 2 || !project) {
    throw new Error("El respaldo no pertenece al formato de proyecto actual.");
  }
  if (project.schemaVersion !== 2 || project.id !== expectedProjectId) {
    throw new Error("El respaldo no coincide con la tienda que se está guardando.");
  }
  return project;
}

function isProtectedProject(project, protectedStoreIds) {
  if (protectedStoreIds.has(project.id) || project.id === BASE_TEMPLATE_STORE_ID) return true;
  if (!project.origin) return false;
  if (project.origin?.role === "store") return false;
  if (project.origin?.role === "base-template") return true;
  // Compatibilidad con respaldos V2 que todavía no tienen role. Los seeds
  // históricos de demo/placeholder siguen siendo no editables hasta que se
  // reescriban con metadatos explícitos.
  return project.origin?.seed !== "clean";
}

async function writeSiteFiles(siteMapPath, destination, limits) {
  let entries;
  try {
    entries = JSON.parse(await readFile(siteMapPath, "utf8"));
  } catch {
    throw new Error("El mapa del sitio está corrupto o no es JSON válido.");
  }
  if (!Array.isArray(entries)) throw new Error("El mapa del sitio debe ser una lista.");
  if (entries.length > limits.maxFiles) throw new Error("El sitio contiene demasiados archivos.");
  let totalBytes = 0;
  let hasIndex = false;
  const seen = new Set();
  const prepared = [];
  for (const entry of entries) {
    if (
      typeof entry?.path !== "string" ||
      typeof entry?.data !== "string" ||
      (entry.encoding !== "utf8" && entry.encoding !== "base64")
    ) {
      throw new Error("El mapa del sitio contiene entradas inválidas.");
    }
    const pathname = assertRelativeArchivePath(entry.path);
    if (seen.has(pathname)) throw new Error("El mapa del sitio contiene rutas duplicadas.");
    seen.add(pathname);
    const output = assertInside(destination, join(destination, pathname));
    const payload = Buffer.from(entry.data, entry.encoding);
    if (payload.byteLength > limits.maxFileBytes) {
      throw new Error("El contenido supera el límite permitido.");
    }
    totalBytes += payload.byteLength;
    if (totalBytes > limits.maxExtractedBytes) {
      throw new Error("El contenido supera el límite permitido.");
    }
    if (pathname === "index.html") hasIndex = true;
    prepared.push({ output, payload });
  }
  await mkdir(destination, { recursive: true });
  for (const { output, payload } of prepared) {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, payload);
  }
  if (!hasIndex) throw new Error("La exportación del sitio no contiene index.html.");
  return { files: prepared.length, bytes: totalBytes };
}

async function directoryExists(pathname) {
  try {
    return (await lstat(pathname)).isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(pathname) {
  try {
    return (await lstat(pathname)).isFile();
  } catch {
    return false;
  }
}

async function sweepStaleTmp(directory, maxAgeMs) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  const threshold = Date.now() - maxAgeMs;
  await Promise.all(
    entries
      .filter((entry) => entry.name.startsWith("."))
      .map(async (entry) => {
        const pathname = join(directory, entry.name);
        try {
          if ((await stat(pathname)).mtimeMs < threshold) {
            await rm(pathname, { recursive: true, force: true });
          }
        } catch {
          // El archivo pudo desaparecer entre el listado y el borrado.
        }
      }),
  );
}

async function pruneAutomaticBackups(directory, maxBackups, guardWrite, onFailure) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return 0;
  }

  const backups = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".solara.json"))
    .sort((left, right) => (left.name < right.name ? 1 : left.name > right.name ? -1 : 0));
  const staleBackups = backups.slice(maxBackups);
  let removed = 0;
  await Promise.all(
    staleBackups.map(async (entry) => {
      const pathname = join(directory, entry.name);
      try {
        await guardWrite("remove-old-backup", pathname);
        await rm(pathname, { force: true });
        removed += 1;
      } catch (error) {
        onFailure?.(pathname, error);
      }
    }),
  );
  return removed;
}

export function createLocalProjectStorage(options = {}) {
  const defaultLayout = resolveLocalLayout({
    applicationRoot: options.applicationRoot ?? process.cwd(),
  });
  const applicationRoot = resolve(options.applicationRoot ?? defaultLayout.applicationRoot);
  const projectsRoot = resolve(options.projectsRoot ?? defaultLayout.projectsRoot);
  const stagingRoot = resolve(options.stagingRoot ?? defaultLayout.transactionRoot);
  const maxUploadBytes = options.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES;
  const maxExtractedBytes = options.maxExtractedBytes ?? DEFAULT_MAX_EXTRACTED_BYTES;
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_EXTRACTED_BYTES;
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const maxAutomaticBackups = options.maxAutomaticBackups ?? DEFAULT_MAX_AUTOMATIC_BACKUPS;
  if (!Number.isInteger(maxAutomaticBackups) || maxAutomaticBackups < 1) {
    throw new Error("El límite de respaldos automáticos debe ser un entero positivo.");
  }
  const protectedStoreIds = new Set([BASE_TEMPLATE_STORE_ID, ...(options.protectedStoreIds ?? [])]);
  // Sólo los tests inyectan fallos deterministas. Mantener el hook fuera del
  // handler HTTP permite comprobar que una interrupción no reemplaza el
  // manifest anterior sin agregar una ruta de producción ni una dependencia.
  const faultInjector =
    typeof options.faultInjector === "function" ? options.faultInjector : undefined;
  const checkpoint = async (stage) => {
    await faultInjector?.(stage);
  };
  // Sólo los tests inyectan fallos de escritura deterministas (disco lleno o
  // permisos revocados). El handler nunca inyecta la guarda; se usa para
  // comprobar que una escritura fallida no reemplaza el manifest anterior.
  const writeGuard = typeof options.writeGuard === "function" ? options.writeGuard : undefined;
  const guardWrite = async (op, pathname) => {
    await writeGuard?.({ op, pathname });
  };
  // Sólo los tests inyectan un rename que falla de forma transitoria para
  // probar el reintento sin tocar el filesystem real; en producción siempre
  // es el rename de node:fs.
  const renameFile = typeof options.renameOverride === "function" ? options.renameOverride : rename;
  const transactions = new Map();
  const projectLocks = new Set();
  // Sólo los tests inyectan un reloj para envejecer transacciones sin
  // dormir; en producción siempre es la hora real.
  const now = typeof options.now === "function" ? options.now : () => new Date();
  const isExpiredTransaction = (transaction) =>
    now().getTime() - Date.parse(transaction.createdAt) > TRANSACTION_TTL_MS;
  const expireTransaction = async (transaction) => {
    transactions.delete(transaction.id);
    projectLocks.delete(transaction.metadata.projectId);
    await rm(transaction.root, { recursive: true, force: true });
  };
  // Cada ruta se reporta una sola vez por proceso: un respaldo anterior
  // bloqueado no debe loguear en cada reintento de guardado.
  const loggedCleanupFailures = new Set();
  const agentLockStore = createAgentLockStore({ applicationRoot, now });

  async function ensureRoots() {
    await mkdir(projectsRoot, { recursive: true });
    await mkdir(stagingRoot, { recursive: true });
    await assertNoReparsePoints(applicationRoot, projectsRoot);
    await assertNoReparsePoints(applicationRoot, stagingRoot);
    try {
      const { runLegacyZipMigration } = await import("./legacy-zip-migration.mjs");
      await runLegacyZipMigration({
        applicationRoot,
        projectsRoot,
        migrationStatePath: join(stagingRoot, "..", "migration.json"),
      });
    } catch {
      // La migración es una mejora: si falla (OneDrive, permisos, AV), las
      // tiendas V1 quedan en recovery y el próximo arranque reintenta.
    }
  }

  async function findManifest(projectId) {
    assertProjectId(projectId);
    await ensureRoots();
    const entries = await readdir(projectsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink() || !entry.isDirectory()) continue;
      const manifestPath = join(projectsRoot, entry.name, "manifest.json");
      try {
        await assertNoReparsePoints(projectsRoot, join(projectsRoot, entry.name));
        const manifest = await readJson(manifestPath);
        if (manifest.format === MANIFEST_FORMAT && manifest.projectId === projectId) {
          return {
            manifest,
            folder: entry.name,
            root: join(projectsRoot, entry.name),
            manifestPath,
          };
        }
      } catch {
        // Unreadable folders are reported separately by list().
      }
    }
    return undefined;
  }

  async function list() {
    await ensureRoots();
    const entries = await readdir(projectsRoot, { withFileTypes: true });
    const projects = [];
    const recovery = [];
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        // Un junction/symlink no es una tienda: se reporta en recovery para
        // que el usuario lo vea y lo elimine o reemplace por una carpeta real.
        recovery.push({
          folder: entry.name,
          message: "La carpeta es un enlace simbólico o junction y no se usa como tienda.",
        });
        continue;
      }
      if (!entry.isDirectory()) continue;
      const root = join(projectsRoot, entry.name);
      let manifest;
      try {
        await assertNoReparsePoints(projectsRoot, root);
        manifest = await readJson(join(root, "manifest.json"));
        if (manifest.format !== MANIFEST_FORMAT || manifest.manifestVersion !== MANIFEST_VERSION) {
          throw new Error("Manifest local incompatible.");
        }
        const currentPath = manifestPath(root, manifest.current.projectPath);
        if (!(await fileExists(currentPath))) throw new Error("No existe la versión actual.");
        const currentBytes = await readFile(currentPath);
        const actualHash = createHash("sha256").update(currentBytes).digest("hex");
        if (actualHash !== manifest.current.sha256) {
          throw new Error(
            "El respaldo actual no coincide con su hash. Recuperá una versión anterior.",
          );
        }
        if (manifest.lastValidSite?.directoryPath) {
          // Los manifests se pueden copiar entre equipos, por eso sólo se
          // aceptan rutas relativas a la raíz de la instalación local.
          resolveLocalPath(applicationRoot, manifest.lastValidSite.directoryPath);
        }
        // La carpeta es una tienda sana: se elimina cualquier diagnóstico viejo.
        await rm(join(root, "recovery.json"), { force: true });
        projects.push({
          projectId: manifest.projectId,
          name: manifest.storeName,
          slug: manifest.slug,
          status: manifest.status,
          updatedAt: manifest.current.projectUpdatedAt,
          savedAt: manifest.current.savedAt,
          version: manifest.current.version,
          folder: entry.name,
          siteVersion: manifest.lastValidSite?.version ?? null,
          siteOutdated: manifest.status === "site-outdated",
        });
      } catch (error) {
        if (error?.code === "ENOENT") {
          // Sin manifest no hay tienda: se descarta la carpeta y se limpia
          // un diagnóstico viejo que ya no corresponde a ninguna tienda.
          try {
            await rm(join(root, "recovery.json"), { force: true });
          } catch {
            // Carpeta de solo lectura: no se puede limpiar el diagnóstico viejo.
          }
          continue;
        }
        const message =
          error instanceof Error ? error.message : "No se pudo leer el manifest local.";
        const diagnosticPath = join(root, "recovery.json");
        let metadata = recoveryMetadata(manifest);
        let recoveryMessage = message;
        try {
          const existing = await readJson(diagnosticPath);
          if (typeof existing?.message === "string") {
            recoveryMessage = existing.message;
            metadata = { ...recoveryMetadata(existing), ...metadata };
          } else {
            throw new Error("Diagnóstico sin mensaje.");
          }
        } catch {
          // El diagnóstico puede no existir todavía o estar corrupto.
        }
        recovery.push({ folder: entry.name, ...metadata, message: recoveryMessage });
        try {
          await writeJsonAtomic(diagnosticPath, {
            format: "solara-local-recovery",
            folder: entry.name,
            ...metadata,
            message: recoveryMessage,
            detectedAt: new Date().toISOString(),
          });
        } catch {
          // Carpeta de solo lectura: se conserva el diagnóstico anterior si existe.
        }
      }
    }
    projects.sort((left, right) => right.savedAt.localeCompare(left.savedAt));
    return { projects, recovery };
  }

  async function status() {
    await ensureRoots();
    let writable = true;
    try {
      const probe = join(projectsRoot, `.write-probe-${process.pid}`);
      await writeFile(probe, "ok", "utf8");
      await rm(probe, { force: true });
    } catch {
      writable = false;
    }
    return {
      managed: true,
      writable,
      projectsRoot,
      transactionRoot: stagingRoot,
    };
  }

  async function beginSave(meta) {
    assertProjectId(meta.projectId);
    const protectedWrite =
      meta.actor?.kind === "template-upgrade" && meta.allowProtectedWrite === true;
    if (protectedStoreIds.has(meta.projectId) && !protectedWrite) {
      const error = new Error(
        "La plantilla protegida sólo puede cambiarse mediante un upgrade explícito.",
      );
      error.code = "PROTECTED_STORE";
      throw error;
    }
    await agentLockStore.assertAvailable(meta.projectId, meta.actor?.id);
    if (projectLocks.has(meta.projectId)) {
      const stale = [...transactions.values()].find(
        (transaction) => transaction.metadata.projectId === meta.projectId,
      );
      if (stale && isExpiredTransaction(stale)) {
        await expireTransaction(stale);
      } else {
        const error = new Error("Ya hay un guardado en curso para esta tienda.");
        error.code = "VERSION_CONFLICT";
        throw error;
      }
    }
    projectLocks.add(meta.projectId);
    try {
      await ensureRoots();
      if (
        typeof meta.slug !== "string" ||
        meta.slug.length === 0 ||
        meta.slug.length > MAX_SLUG_LENGTH ||
        !SLUG_PATTERN.test(meta.slug)
      ) {
        throw new Error("Slug de tienda inválido.");
      }
      if (!Number.isInteger(meta.expectedVersion) && meta.expectedVersion !== null) {
        throw new Error("Versión esperada inválida.");
      }
      const existing = await findManifest(meta.projectId);
      const currentVersion = existing?.manifest.current?.version ?? 0;
      if (existing) {
        const currentPath = manifestPath(existing.root, existing.manifest.current.projectPath);
        const currentProject = parseProjectJson(await readFile(currentPath), meta.projectId);
        if (isProtectedProject(currentProject, protectedStoreIds) && !protectedWrite) {
          const error = new Error(
            "La plantilla protegida sólo puede cambiarse mediante un upgrade explícito.",
          );
          error.code = "PROTECTED_STORE";
          throw error;
        }
      }
      if (existing && meta.expectedVersion !== currentVersion) {
        const error = new Error("La tienda cambió en otra pestaña.");
        error.code = "VERSION_CONFLICT";
        throw error;
      }
      if (!existing && meta.expectedVersion !== null && meta.expectedVersion !== 0) {
        const error = new Error("La tienda ya no existe en disco.");
        error.code = "VERSION_CONFLICT";
        throw error;
      }
      const transactionId = randomBytes(18).toString("hex");
      const transactionRoot = join(stagingRoot, transactionId);
      await mkdir(transactionRoot, { recursive: true });
      const transaction = {
        id: transactionId,
        createdAt: now().toISOString(),
        metadata: {
          ...meta,
          version: currentVersion + 1,
          folder: existing?.folder ?? `${safeSlug(meta.slug)}--${shortProjectKey(meta.projectId)}`,
          previous: existing?.manifest ?? null,
        },
        root: transactionRoot,
        project: undefined,
        site: undefined,
      };
      try {
        await guardWrite("write-transaction-marker", join(transactionRoot, "transaction.json"));
        await writeJsonAtomic(join(transactionRoot, "transaction.json"), transaction.metadata);
      } catch (error) {
        await rm(transactionRoot, { recursive: true, force: true });
        throw error;
      }
      transactions.set(transactionId, transaction);
      return {
        transactionId,
        version: transaction.metadata.version,
        folder: transaction.metadata.folder,
      };
    } catch (error) {
      projectLocks.delete(meta.projectId);
      throw error;
    }
  }

  async function getTransaction(transactionId) {
    const transaction = transactions.get(transactionId);
    if (!transaction) throw new Error("La transacción de guardado no existe o expiró.");
    if (isExpiredTransaction(transaction)) {
      await expireTransaction(transaction);
      throw new Error("La transacción de guardado expiró.");
    }
    return transaction;
  }

  async function upload(transactionId, kind, request) {
    const transaction = await getTransaction(transactionId);
    if (kind !== "project" && kind !== "site") throw new Error("Tipo de archivo inválido.");
    const filename = kind === "project" ? "project.json" : "site-map.json";
    const pathname = join(transaction.root, filename);
    const result = await streamToFile(request, pathname, maxUploadBytes, guardWrite);
    const expectedHash = request.headers?.["x-solara-sha256"];
    if (typeof expectedHash === "string" && expectedHash !== result.sha256) {
      await rm(pathname, { force: true });
      throw new Error("El hash recibido no coincide con el archivo subido.");
    }
    transaction[kind] = result;
    return result;
  }

  async function commit(transactionId, options = {}) {
    const transaction = await getTransaction(transactionId);
    const { metadata } = transaction;
    const protectedSiteKeys = new Set(
      Array.isArray(options?.protectedSiteKeys) ? options.protectedSiteKeys : [],
    );
    // Defensa en profundidad: si otra transacción commiteó entre beginSave y commit,
    // el manifest actual ya no coincide con `previous`. Rechazar con 409 evita
    // el last-writer-wins silencioso que violaba "nunca perder el último proyecto válido".
    const currentManifestAtCommit = await findManifest(metadata.projectId);
    const currentVersionAtCommit = currentManifestAtCommit?.manifest.current?.version ?? 0;
    const expectedVersionAtCommit = metadata.previous?.current?.version ?? 0;
    if (currentVersionAtCommit !== expectedVersionAtCommit) {
      const error = new Error("La tienda cambió en otra pestaña.");
      error.code = "VERSION_CONFLICT";
      throw error;
    }
    if (metadata.expectedVersion !== null && metadata.expectedVersion !== currentVersionAtCommit) {
      const error = new Error("La tienda cambió en otra pestaña.");
      error.code = "VERSION_CONFLICT";
      throw error;
    }
    try {
      if (!transaction.project) throw new Error("Falta el respaldo editable de la tienda.");
      const project = parseProjectJson(
        await readFile(join(transaction.root, "project.json")),
        metadata.projectId,
      );
      const protectedWrite =
        metadata.actor?.kind === "template-upgrade" && metadata.allowProtectedWrite === true;
      if (isProtectedProject(project, protectedStoreIds) && !protectedWrite) {
        const error = new Error(
          "La plantilla protegida sólo puede cambiarse mediante un upgrade explícito.",
        );
        error.code = "PROTECTED_STORE";
        throw error;
      }
      const storeRoot = join(projectsRoot, metadata.folder);
      const actualRoot = join(storeRoot, "actual");
      const backupsRoot = join(storeRoot, "respaldos");
      const manualBackupsRoot = join(storeRoot, "respaldos-manuales");
      const sitesRoot = join(storeRoot, "sitios");
      await checkpoint("before-publish-preparation");
      await Promise.all([
        mkdir(actualRoot, { recursive: true }),
        mkdir(backupsRoot, { recursive: true }),
        mkdir(manualBackupsRoot, { recursive: true }),
        mkdir(sitesRoot, { recursive: true }),
      ]);
      await assertNoReparsePoints(projectsRoot, storeRoot);
      const savedAt = now();
      const key = versionKey(metadata.slug, savedAt, metadata.version);
      const archiveName = `${key}.solara.json`;
      const archivePath = join(actualRoot, archiveName);
      const temporaryArchivePath = join(actualRoot, `.${archiveName}.${transaction.id}.tmp`);

      let siteInfo;
      if (transaction.site) {
        const temporarySite = join(sitesRoot, `.${key}.${transaction.id}.tmp`);
        const finalSite = join(sitesRoot, key);
        await rm(temporarySite, { recursive: true, force: true });
        try {
          await checkpoint("before-site-extract");
          await guardWrite("write-site-files", temporarySite);
          siteInfo = await writeSiteFiles(join(transaction.root, "site-map.json"), temporarySite, {
            maxFiles,
            maxExtractedBytes,
            maxFileBytes,
          });
          await checkpoint("before-site-rename");
          await guardWrite("rename-site", finalSite);
          // Un destino con la misma clave sólo puede ser un intento
          // interrumpido: se limpia para que el rename no falle en Windows.
          await rm(finalSite, { recursive: true, force: true });
          await renameWithRetry(temporarySite, finalSite, renameFile);
        } catch (error) {
          await rm(temporarySite, { recursive: true, force: true });
          throw error;
        }
        siteInfo = {
          ...siteInfo,
          version: metadata.version,
          key,
          directoryPath: relative(applicationRoot, finalSite).replaceAll("\\", "/"),
          sha256: transaction.site.sha256,
          savedAt: savedAt.toISOString(),
          rendererFingerprint: metadata.rendererFingerprint ?? null,
        };
      }

      // Se publica el respaldo editable sólo después de validar el sitio opcional.
      // Así un mapa inválido no deja archivos huérfanos en `actual/`.
      await checkpoint("before-project-archive");
      await guardWrite("copy-archive", temporaryArchivePath);
      try {
        await copyFile(join(transaction.root, "project.json"), temporaryArchivePath);
        await renameWithRetry(temporaryArchivePath, archivePath, renameFile);
      } catch (error) {
        await rm(temporaryArchivePath, { force: true });
        throw error;
      }

      const previous = metadata.previous;
      if (previous?.current?.projectPath) {
        const oldCurrent = manifestPath(storeRoot, previous.current.projectPath);
        if ((await fileExists(oldCurrent)) && oldCurrent !== archivePath) {
          const oldBackup = join(backupsRoot, oldCurrent.split(sep).at(-1));
          if (!(await fileExists(oldBackup))) await copyFile(oldCurrent, oldBackup);
        }
      }

      const lastValidSite = siteInfo ?? previous?.lastValidSite;
      // Sin sitio subido, el sitio vigente sigue siendo correcto cuando los
      // bytes del proyecto son idénticos a los del último sitio sincronizado
      // (el exporter es determinista) y el renderer no cambió.
      const siteUnchanged =
        !siteInfo &&
        previous?.status === "synced" &&
        previous?.lastValidSite != null &&
        typeof previous?.current?.sha256 === "string" &&
        previous.current.sha256 === transaction.project.sha256 &&
        (previous.lastValidSite.rendererFingerprint ?? null) ===
          (metadata.rendererFingerprint ?? null);
      const manifest = {
        format: MANIFEST_FORMAT,
        manifestVersion: MANIFEST_VERSION,
        projectId: metadata.projectId,
        storeName: project.name,
        slug: project.slug,
        schemaVersion: project.schemaVersion,
        status: siteInfo || siteUnchanged ? "synced" : "site-outdated",
        current: {
          version: metadata.version,
          key,
          projectPath: join("actual", archiveName).replaceAll("\\", "/"),
          sha256: transaction.project.sha256,
          savedAt: savedAt.toISOString(),
          projectUpdatedAt: project.updatedAt,
        },
        ...(lastValidSite ? { lastValidSite } : {}),
      };
      await checkpoint("before-manifest");
      try {
        // Cubre la ventana post-rename → pre-manifest: un fallo aquí deja el
        // sitio renombrado pero el manifest todavía apunta a la versión previa.
        await checkpoint("after-site-rename");
        await guardWrite("write-manifest", join(storeRoot, "manifest.json"));
        await writeJsonAtomic(join(storeRoot, "manifest.json"), manifest);
      } catch (error) {
        await rm(archivePath, { force: true });
        if (siteInfo?.key) {
          await rm(join(sitesRoot, siteInfo.key), { recursive: true, force: true });
        }
        throw error;
      }

      // Poda de retención: `sitios/` sólo conserva el sitio vigente del
      // manifest; las versiones anteriores ya no se referencian y sólo
      // acumularían una carpeta por guardado.
      const keepSiteKey = lastValidSite?.key;
      if (typeof keepSiteKey === "string") {
        try {
          const siteEntries = await readdir(sitesRoot, { withFileTypes: true });
          await Promise.all(
            siteEntries
              .filter(
                (entry) =>
                  entry.isDirectory() &&
                  !entry.name.startsWith(".") &&
                  entry.name !== keepSiteKey &&
                  !protectedSiteKeys.has(entry.name),
              )
              .map(async (entry) => {
                try {
                  await rm(join(sitesRoot, entry.name), { recursive: true, force: true });
                } catch {
                  // OneDrive o el antivirus pueden bloquear el borrado; el
                  // próximo guardado exitoso reintenta la poda.
                }
              }),
          );
        } catch {
          // Sin lectura de sitios/ no hay poda; el guardado ya quedó commiteado.
        }
      }

      // Barrido de temporales huérfanos (`.<key>.<tx>.tmp`) que dejaron
      // commits interrumpidos; los de menos de un día se conservan.
      await Promise.all([
        sweepStaleTmp(sitesRoot, STALE_TMP_SWEEP_MS),
        sweepStaleTmp(actualRoot, STALE_TMP_SWEEP_MS),
      ]);

      if (previous?.current?.projectPath) {
        const oldCurrent = manifestPath(storeRoot, previous.current.projectPath);
        if ((await fileExists(oldCurrent)) && oldCurrent !== archivePath) {
          try {
            await guardWrite("remove-old-current", oldCurrent);
            await rm(oldCurrent, { force: true });
          } catch (error) {
            // El borrado del respaldo anterior no es fatal: el guardado ya
            // quedó commiteado y el respaldo sigue disponible en `actual/`.
            if (!loggedCleanupFailures.has(oldCurrent)) {
              loggedCleanupFailures.add(oldCurrent);
              console.error(
                `Solara: no se pudo quitar el respaldo anterior (${oldCurrent}):`,
                error instanceof Error ? error.message : error,
              );
            }
          }
        }
      }

      await pruneAutomaticBackups(
        backupsRoot,
        maxAutomaticBackups,
        guardWrite,
        (pathname, error) => {
          if (!loggedCleanupFailures.has(pathname)) {
            loggedCleanupFailures.add(pathname);
            console.error(
              `Solara: no se pudo quitar el respaldo automático antiguo (${pathname}):`,
              error instanceof Error ? error.message : error,
            );
          }
        },
      );
      return {
        projectId: manifest.projectId,
        version: manifest.current.version,
        key: manifest.current.key,
        status: manifest.status,
        folder: metadata.folder,
        projectPath: manifest.current.projectPath,
        site: manifest.lastValidSite ?? null,
      };
    } finally {
      // El éxito y cualquier fallo liberan el lock y el staging: un error
      // antes del manifest (copias, respaldos, permisos) no debe retener
      // la tienda bloqueada para siempre.
      await transactions.delete(transactionId);
      projectLocks.delete(metadata.projectId);
      await rm(transaction.root, { recursive: true, force: true });
    }
  }

  async function rebuildSite(projectId, request, options = {}) {
    assertProjectId(projectId);
    await ensureRoots();
    const ownerId = options.actor?.id ?? `site-rebuild-${process.pid}`;
    await agentLockStore.assertAvailable(projectId, ownerId);
    const found = await findManifest(projectId);
    if (!found) throw new Error("La tienda no existe en disco.");
    const currentPath = manifestPath(found.root, found.manifest.current.projectPath);
    const currentProject = parseProjectJson(await readFile(currentPath), projectId);
    if (isProtectedProject(currentProject, protectedStoreIds)) {
      const error = new Error("La plantilla protegida no se incluye en reconstrucciones globales.");
      error.code = "PROTECTED_STORE";
      throw error;
    }
    const transactionId = randomBytes(18).toString("hex");
    const transactionRoot = join(stagingRoot, `site-rebuild-${transactionId}`);
    const sitesRoot = join(found.root, "sitios");
    await mkdir(transactionRoot, { recursive: true });
    try {
      const mapPath = join(transactionRoot, "site-map.json");
      const uploaded = await streamToFile(request, mapPath, maxUploadBytes, guardWrite);
      const savedAt = now();
      const version = found.manifest.current.version;
      const key = versionKey(found.manifest.slug, savedAt, version);
      const temporarySite = join(sitesRoot, `.${key}.${transactionId}.tmp`);
      const finalSite = join(sitesRoot, key);
      await rm(temporarySite, { recursive: true, force: true });
      await writeSiteFiles(mapPath, temporarySite, { maxFiles, maxExtractedBytes, maxFileBytes });
      await rm(finalSite, { recursive: true, force: true });
      await renameWithRetry(temporarySite, finalSite, renameFile);
      const siteInfo = {
        version,
        key,
        directoryPath: relative(applicationRoot, finalSite).replaceAll("\\", "/"),
        sha256: uploaded.sha256,
        savedAt: savedAt.toISOString(),
        rendererFingerprint: options.rendererFingerprint ?? null,
      };
      const previousSite = found.manifest.lastValidSite;
      const manifest = {
        ...found.manifest,
        status: "synced",
        lastValidSite: siteInfo,
        ...(previousSite && previousSite.key !== siteInfo.key
          ? {
              siteHistory: [previousSite, ...(found.manifest.siteHistory ?? [])].slice(0, 10),
            }
          : {}),
      };
      await writeJsonAtomic(found.manifestPath, manifest);
      return {
        projectId,
        version,
        status: "synced",
        site: siteInfo,
        previousSite: previousSite ?? null,
      };
    } finally {
      await rm(transactionRoot, { recursive: true, force: true });
    }
  }

  async function restoreSite(projectId, expectedVersion, site) {
    assertProjectId(projectId);
    await ensureRoots();
    const found = await findManifest(projectId);
    if (!found) throw new Error("La tienda no existe en disco.");
    if (found.manifest.current.version !== expectedVersion) {
      const error = new Error("La tienda cambió después del rollout.");
      error.code = "VERSION_CONFLICT";
      throw error;
    }
    if (!site || typeof site.key !== "string") throw new Error("El sitio anterior es inválido.");
    const target = assertInside(join(found.root, "sitios"), join(found.root, "sitios", site.key));
    if (!(await directoryExists(target)))
      throw new Error("El sitio anterior ya no está disponible.");
    await writeJsonAtomic(found.manifestPath, {
      ...found.manifest,
      status: "synced",
      lastValidSite: site,
    });
    return { projectId, version: expectedVersion, status: "synced", site };
  }

  async function readCurrent(projectId) {
    const found = await findManifest(projectId);
    if (!found) return undefined;
    const path = manifestPath(found.root, found.manifest.current.projectPath);
    const bytes = await readFile(path);
    const actualHash = createHash("sha256").update(bytes).digest("hex");
    if (actualHash !== found.manifest.current.sha256) {
      throw new Error("El respaldo actual no coincide con su hash. Recuperá una versión anterior.");
    }
    return { manifest: found.manifest, bytes };
  }

  async function getLastValidSiteDirectory(projectId) {
    const found = await findManifest(projectId);
    if (!found || !found.manifest.lastValidSite?.directoryPath) return undefined;
    const directory = assertInside(
      applicationRoot,
      resolveLocalPath(applicationRoot, found.manifest.lastValidSite.directoryPath),
    );
    if (!(await directoryExists(directory))) return undefined;
    await assertNoReparsePoints(applicationRoot, directory);
    return directory;
  }

  async function openFolder(projectId) {
    const found = await findManifest(projectId);
    if (!found) return undefined;
    return { folder: found.folder, path: found.root };
  }

  /**
   * Borra una tienda ya identificada por una migración de producto. No se
   * expone como ruta HTTP general: el handler sólo lo usa con IDs legacy
   * reservados y la búsqueda previa mantiene la operación dentro de proyectos/.
   */
  async function removeProject(projectId) {
    const found = await findManifest(projectId);
    if (!found) return false;
    const currentPath = manifestPath(found.root, found.manifest.current.projectPath);
    const project = parseProjectJson(await readFile(currentPath), projectId);
    if (isProtectedProject(project, protectedStoreIds)) {
      const error = new Error("La plantilla protegida no se puede borrar.");
      error.code = "PROTECTED_STORE";
      throw error;
    }
    await rm(found.root, { recursive: true, force: true });
    return true;
  }

  async function manualBackup(projectId) {
    const found = await findManifest(projectId);
    if (!found) throw new Error("La tienda no existe en disco.");
    const source = manifestPath(found.root, found.manifest.current.projectPath);
    const target = join(
      found.root,
      "respaldos-manuales",
      `${found.manifest.current.key}-manual-${timestampKey()}-${randomBytes(4).toString("hex")}.solara.json`,
    );
    await mkdir(join(found.root, "respaldos-manuales"), { recursive: true });
    await copyFile(source, target);
    return { path: relative(applicationRoot, target), version: found.manifest.current.version };
  }

  async function abort(transactionId) {
    const transaction = transactions.get(transactionId);
    if (!transaction) return;
    transactions.delete(transactionId);
    projectLocks.delete(transaction.metadata.projectId);
    await rm(transaction.root, { recursive: true, force: true });
  }

  async function cleanupStaging(maxAgeMs = 24 * 60 * 60 * 1000) {
    await ensureRoots();
    const entries = await readdir(stagingRoot, { withFileTypes: true });
    const threshold = Date.now() - maxAgeMs;
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const pathname = join(stagingRoot, entry.name);
          try {
            if ((await stat(pathname)).mtimeMs < threshold)
              await rm(pathname, { recursive: true, force: true });
          } catch {
            // Otro proceso puede estar finalizando la transacción.
          }
        }),
    );
  }

  async function cleanupAutomaticBackups() {
    await ensureRoots();
    let entries;
    try {
      entries = await readdir(projectsRoot, { withFileTypes: true });
    } catch {
      return 0;
    }
    let removed = 0;
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .map(async (entry) => {
          const storeRoot = join(projectsRoot, entry.name);
          try {
            await assertNoReparsePoints(projectsRoot, storeRoot);
            const manifest = await readJson(join(storeRoot, "manifest.json"));
            if (
              manifest.format !== MANIFEST_FORMAT ||
              manifest.manifestVersion !== MANIFEST_VERSION
            ) {
              return;
            }
            removed += await pruneAutomaticBackups(
              join(storeRoot, "respaldos"),
              maxAutomaticBackups,
              guardWrite,
              (pathname, error) => {
                if (!loggedCleanupFailures.has(pathname)) {
                  loggedCleanupFailures.add(pathname);
                  console.error(
                    `Solara: no se pudo quitar el respaldo automático antiguo (${pathname}):`,
                    error instanceof Error ? error.message : error,
                  );
                }
              },
            );
          } catch {
            // Una tienda en recovery o una carpeta no compatible no se poda.
          }
        }),
    );
    return removed;
  }

  return {
    applicationRoot,
    projectsRoot,
    ensureRoots,
    status,
    list,
    beginSave,
    upload,
    commit,
    readCurrent,
    rebuildSite,
    restoreSite,
    getLastValidSiteDirectory,
    openFolder,
    removeProject,
    manualBackup,
    abort,
    cleanupStaging,
    cleanupAutomaticBackups,
  };
}
