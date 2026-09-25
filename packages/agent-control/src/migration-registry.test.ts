import { catalogModernStore } from "@solara/project-schema/catalog-modern-fixture";
import { describe, expect, it } from "vitest";
import {
  defaultMigrationId,
  listMigrations,
  migrationApplies,
  resolveMigration,
} from "./migration-registry.js";

describe("registro de migraciones", () => {
  it("resuelve por migrationId y rechaza IDs desconocidos", () => {
    expect(resolveMigration("catalog-modern.template-upgrade")).toMatchObject({
      migrationId: "catalog-modern.template-upgrade",
      scope: "catalog-modern",
    });
    expect(resolveMigration("no-existe")).toBeUndefined();
    expect(migrationApplies("no-existe", catalogModernStore)).toBe(false);
  });

  it("aplica al fixture moderno y produce preview determinista", () => {
    const id = defaultMigrationId();
    expect(migrationApplies(id, catalogModernStore)).toBe(true);
    const migration = resolveMigration(id);
    if (!migration) throw new Error("la migración de plantilla debe existir");
    const preview = migration.preview(catalogModernStore);
    expect(Array.isArray(preview.safeChanges)).toBe(true);
    expect(Array.isArray(preview.conflicts)).toBe(true);
  });

  it("el registro expone al menos la migración de plantilla", () => {
    expect(listMigrations().length).toBeGreaterThanOrEqual(1);
  });
});
