import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { assertNoReparsePoints } from "../scripts/local-layout.mjs";
import { createLocalProjectStorage } from "../scripts/local-project-storage.mjs";

const execFileAsync = promisify(execFile);

describe.runIf(process.platform === "win32")("reparse points en Windows", () => {
  it("reporta en recovery un junction dentro de proyectos/", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-reparse-"));
    try {
      const outside = join(root, "afuera");
      const projects = join(root, "proyectos");
      const escaped = join(projects, "escapada");
      await mkdir(outside, { recursive: true });
      await mkdir(projects, { recursive: true });
      try {
        await execFileAsync("cmd", ["/c", "mklink", "/J", escaped, outside]);
      } catch {
        return; // el entorno no permite crear junctions; no es un fallo del servicio.
      }
      const storage = createLocalProjectStorage({ applicationRoot: root });
      const listing = await storage.list();
      expect(listing.projects).toHaveLength(0);
      // El junction no es una tienda: se reporta en recovery para que el
      // usuario lo vea y lo reemplace por una carpeta real.
      const report = listing.recovery.find((r) => r.folder === "escapada");
      expect(report).toMatchObject({
        folder: "escapada",
        message: expect.stringMatching(/enlace simbólico|junction/i),
      });
      await expect(assertNoReparsePoints(projects, escaped)).rejects.toThrow(/enlace simbólico/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe.runIf(process.platform !== "win32")("symlinks en POSIX", () => {
  it("reporta en recovery un symlink dentro de proyectos/", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-reparse-"));
    try {
      const outside = join(root, "afuera");
      const projects = join(root, "proyectos");
      const escaped = join(projects, "escapada");
      await mkdir(outside, { recursive: true });
      await mkdir(projects, { recursive: true });
      await symlink(outside, escaped, "dir");
      const storage = createLocalProjectStorage({ applicationRoot: root });
      const listing = await storage.list();
      expect(listing.projects).toHaveLength(0);
      const report = listing.recovery.find((r) => r.folder === "escapada");
      expect(report).toMatchObject({
        folder: "escapada",
        message: expect.stringMatching(/enlace simbólico|junction/i),
      });
      await expect(assertNoReparsePoints(projects, escaped)).rejects.toThrow(/enlace simbólico/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
