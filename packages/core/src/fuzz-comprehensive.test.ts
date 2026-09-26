// @ts-nocheck
import { StoreProjectV1Schema } from "@solara/project-schema";
import { catalogScaleStore } from "@solara/project-schema/scale-fixture";
import { describe, expect, it } from "vitest";
import { reduceProject } from "./index";

function mulberry32(seed: number) {
  return () => {
    seed += 0x6d2b79f5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick<T>(rand: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)]!;
}
function randomString(rand: () => number, len = 8): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(rand() * chars.length)];
  return s;
}
describe("fuzz comprehensive", () => {
  it("100 ops con operaciones y casos inválidos mantiene invariantes", () => {
    const seed = 999;
    const rand = mulberry32(seed);
    let project: any = structuredClone(catalogScaleStore);
    const base = Date.parse("2026-08-20T10:00:00.000Z");
    // El test cubre 10 clases de operación; 100 pasos mantienen variedad sin repetirlas 500 veces.
    for (let step = 0; step < 100; step++) {
      const at = new Date(base + step * 100).toISOString();
      const op = Math.floor(rand() * 10);
      let cmd: any = null;
      const p = pick(rand, project.products);
      const cat = pick(rand, project.categories);
      switch (op) {
        case 0: {
          const id = `p-${seed}-${step}-${randomString(rand, 4)}`;
          const slug = `${randomString(rand, 6)}-${seed}`;
          const baseProd: any = catalogScaleStore.products[0];
          const prod = {
            ...structuredClone(baseProd),
            id,
            slug,
            title: `Fuzz ${randomString(rand, 5)}`,
            createdAt: at,
            updatedAt: at,
            categoryIds: [],
            variants: [
              {
                ...baseProd.variants[0],
                id: `v-${randomString(rand, 4)}`,
                price: rand() < 0.1 ? 10.5 : Math.floor(rand() * 100000),
                sku: randomString(rand, 6),
              },
            ],
          };
          cmd = { type: "product.create", product: prod, at };
          break;
        }
        case 1:
          cmd = {
            type: "product.update",
            productId: p.id,
            changes:
              rand() < 0.2 ? { slug: "BAD SLUG!" } : { title: `Upd ${randomString(rand, 5)}` },
            at,
          };
          break;
        case 2:
          cmd = { type: "category.reparent", categoryId: cat.id, parentId: cat.id, at };
          break;
        case 3:
          cmd = {
            type: "products.setCategories",
            productIds: [p.id],
            categoryIds: ["nonexistent"],
            at,
          };
          break;
        case 4:
          cmd = {
            type: "products.adjustPrices",
            productIds: [p.id],
            adjustment: { type: "percentage", basisPoints: -20000 },
            at,
          };
          break;
        case 5:
          cmd = { type: "products.addTags", productIds: [p.id], tags: ["   ", ""], at };
          break;
        case 6:
          cmd = {
            type: "products.setStatus",
            productIds: [p.id],
            status: "invalid_status" as any,
            at,
          };
          break;
        case 7:
          cmd = {
            type: "products.replaceAll",
            products: [{ ...structuredClone(p), slug: "bad slug!" } as any],
            at,
          };
          break;
        case 8:
          cmd = {
            type: "product.create",
            product: { ...structuredClone(p), id: p.id, slug: randomString(rand, 6) },
            at,
          };
          break;
        case 9:
          cmd = {
            type: "category.reparent",
            categoryId: cat.id,
            parentId: pick(rand, project.categories).id,
            at,
          };
          break;
      }
      if (!cmd) continue;
      const before = JSON.stringify(project);
      try {
        const next = reduceProject(project, cmd);
        const parsed = StoreProjectV1Schema.safeParse(next);
        if (!parsed.success)
          throw new Error(
            "parse fail after " +
              cmd.type +
              ": " +
              parsed.error.issues.map((i: any) => i.path.join(".")).join(", "),
          );
        expect(next).toBeDefined();
        project = next;
      } catch (_e) {
        expect(JSON.stringify(project)).toBe(before);
      }
    }
    expect(StoreProjectV1Schema.safeParse(project).success).toBe(true);
  }, 60000);
});
