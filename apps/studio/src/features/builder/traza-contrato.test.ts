import { catalogModernModules, officialModules, type RegisteredModule } from "@solara/modules";
import type { StoreProjectV1 } from "@solara/project-schema";
import { catalogModernStore as catalogModernStoreFixture } from "@solara/project-schema/catalog-modern-fixture";
import { describe, expect, it } from "vitest";
import { defaultRepeaterItem } from "./repeaterDefaults";

type SchemaRef = RegisteredModule["settingsSchema"];

function unwrap(current: unknown): unknown {
  for (let guard = 0; guard < 8; guard += 1) {
    const inner = (current as { _def?: { innerType?: unknown } })._def?.innerType;
    if (inner) {
      current = inner;
      continue;
    }
    const element = (current as { element?: unknown }).element;
    if (element) {
      current = element;
      continue;
    }
    break;
  }
  return current;
}

function objectShape(schema: SchemaRef): Record<string, unknown> {
  const target = unwrap(schema) as { shape?: Record<string, unknown> };
  return target.shape ?? {};
}

function isRequired(value: unknown): boolean {
  return (value as { _def?: { innerType?: unknown } })._def?.innerType === undefined;
}

function arrayItemShape(schema: SchemaRef, key: string): Record<string, unknown> | undefined {
  const value = objectShape(schema)[key];
  const target = unwrap(value) as { shape?: Record<string, unknown> };
  return target.shape;
}

describe("settingsFields <-> settingsSchema contrato", () => {
  const modules = [...officialModules, ...catalogModernModules];
  for (const module of modules) {
    const id = module.manifest.id;
    it(`${id}: toda key de settingsFields existe en el schema`, () => {
      const shape = objectShape(module.settingsSchema);
      for (const field of module.settingsFields) {
        expect(shape, `${id}: campo '${field.key}' sin clave en el schema`).toHaveProperty(field.key);
        if (field.type === "repeater") {
          const itemShape = arrayItemShape(module.settingsSchema, field.key);
          expect(itemShape, `${id}: '${field.key}' no es un array de objetos en el schema`).toEqual(
            expect.any(Object),
          );
          for (const item of field.fields) {
            expect(
              itemShape,
              `${id}: campo '${field.key}[].${item.key}' sin clave en el schema`,
            ).toHaveProperty(item.key);
          }
        }
      }
    });
    it(`${id}: toda clave del schema sin default tiene control en settingsFields`, () => {
      const shape = objectShape(module.settingsSchema);
      const fieldKeys = new Set<string>(module.settingsFields.map((field) => field.key));
      const missing = Object.entries(shape)
        .filter(([key, value]) => isRequired(value) && !fieldKeys.has(key))
        .map(([key]) => key);
      expect(missing, `${id}: claves requeridas sin control: ${missing.join(", ")}`).toEqual([]);
    });
    for (const field of module.settingsFields) {
      if (field.type !== "repeater") continue;
      it(`${id}: los ítems requeridos de '${field.key}' tienen control o id inyectado`, () => {
        const itemShape = arrayItemShape(module.settingsSchema, field.key) ?? {};
        const fieldKeys = new Set(field.fields.map((item) => item.key));
        const missing = Object.entries(itemShape)
          .filter(([key, value]) => isRequired(value) && !fieldKeys.has(key) && key !== "id")
          .map(([key]) => key);
        expect(
          missing,
          `${id}: ${field.key}[]. requeridos sin control: ${missing.join(", ")}`,
        ).toEqual([]);
      });
    }
    for (const field of module.settingsFields) {
      if (field.type !== "select") continue;
      it(`${id}: toda opción de '${field.key}' pasa el schema`, () => {
        const defaults = module.settingsSchema.parse({});
        for (const option of field.options) {
          const result = module.settingsSchema.safeParse({
            ...defaults,
            [field.key]: option.value,
          });
          expect(result.success, `${id}: '${field.key}' = "${option.value}" rechazado`).toBe(true);
        }
      });
    }
  }
});

describe("el payload de cada control pasa el schema del módulo", () => {
  const modules = [...officialModules, ...catalogModernModules];
  for (const module of modules) {
    const id = module.manifest.id;
    it(`${id}: payload por tipo de control`, () => {
      const defaults = module.settingsSchema.parse({});
      for (const field of module.settingsFields) {
        let payload: unknown;
        if (field.type === "boolean") payload = true;
        else if (field.type === "number") payload = (field.min ?? 1) as number;
        else if (field.type === "select") payload = field.options[0]?.value ?? "";
        else if (field.type === "array") payload = [payloadSlide(field.key)];
        else if (field.type === "repeater")
          payload = [defaultRepeaterItem(field.fields, project, field.itemLabelKey)];
        else payload = "valor de prueba";
        const result = module.settingsSchema.safeParse({ ...defaults, [field.key]: payload });
        expect(
          result.success,
          `${id}: payload de '${field.key}' (${field.type}) rechazado: ${(result as { error?: { issues?: Array<{ message: string }> } }).error?.issues?.map((issue) => issue.message).join(", ")}`,
        ).toBe(true);
      }
    });
  }
});

const project: StoreProjectV1 = structuredClone(catalogModernStoreFixture);

function payloadSlide(key: string): Record<string, unknown> {
  if (key !== "slides") return {};
  return {
    id: "slide-1",
    eyebrow: "Antetítulo",
    title: "Título",
    body: "Cuerpo",
    actionLabel: "Ver colección",
    actionHref: "/",
    imageId: "",
  };
}
