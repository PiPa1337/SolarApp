// @ts-nocheck
import { StoreProjectV1Schema } from "@solara/project-schema";
import { catalogScaleStore } from "@solara/project-schema/scale-fixture";
import { describe, expect, it } from "vitest";
import { createHistory, executeCommand, reduceProject } from "./index";

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
function makeSlug(rand: () => number): string {
  return randomString(rand, 6 + Math.floor(rand() * 6));
}
function checkInvariants(project: any, label: string) {
  const parsed = StoreProjectV1Schema.safeParse(project);
  if (!parsed.success)
    throw new Error(
      label +
        ": parse fail " +
        parsed.error.issues.map((i: any) => `${i.path.join(".")}:${i.message}`).join(", "),
    );
}
describe("fuzz100", () => {
  it(
    "10 seeds x 50 ops",
    { timeout: 180000 },
    async () => {
      // Mantiene varias semillas deterministas sin repetir secuencias largas.
      for (let seed = 0; seed < 10; seed++) {
        const rand = mulberry32(seed);
        let project: any = structuredClone(catalogScaleStore);
        let history = createHistory(project);
        const base = Date.parse("2026-08-20T10:00:00.000Z") + seed * 100000;
        for (let step = 0; step < 50; step++) {
          const at = new Date(base + step * 700).toISOString();
          const op = Math.floor(rand() * 6);
          let cmd: any = null;
          if (op === 0) {
            const id = `p-${seed}-${step}-${randomString(rand, 4)}`;
            const slug = `${makeSlug(rand)}-${seed}-${step}`;
            const baseProd: any = catalogScaleStore.products[0];
            const prod = {
              ...structuredClone(baseProd),
              id,
              slug,
              title: `Fuzz ${randomString(rand, 6)}`,
              createdAt: at,
              updatedAt: at,
              categoryIds: [],
              collectionIds: [],
              imageIds: [],
              variants: baseProd.variants.slice(0, 1).map((v: any) => ({
                ...v,
                id: `v-${randomString(rand, 5)}`,
                price: Math.floor(rand() * 50000),
                sku: randomString(rand, 6),
              })),
            };
            cmd = { type: "product.create", product: prod, at };
          } else if (op === 1) {
            const p = pick(rand, project.products);
            cmd = {
              type: "product.update",
              productId: p.id,
              changes: { title: `Upd ${randomString(rand, 4)}` },
              at,
            };
          } else if (op === 2) {
            const p = pick(rand, project.products);
            cmd = {
              type: rand() < 0.5 ? "product.archive" : "product.restore",
              productId: p.id,
              at,
            };
          } else if (op === 3) {
            const ids = [pick(rand, project.products).id];
            const cents = Math.floor(rand() * 400 - 200);
            cmd = {
              type: "products.adjustPrices",
              productIds: ids,
              adjustment:
                rand() < 0.5
                  ? { type: "amount", cents }
                  : { type: "percentage", basisPoints: Math.floor(rand() * 20000 - 10000) },
              at,
            };
          } else if (op === 4) {
            const pids = [pick(rand, project.products).id];
            const cids =
              rand() < 0.3
                ? ["nonexistent-cat"]
                : project.categories.slice(0, 1).map((c: any) => c.id);
            cmd = { type: "products.setCategories", productIds: pids, categoryIds: cids, at };
          } else if (op === 5) {
            const cat = pick(rand, project.categories);
            const candidates = project.categories.filter((c: any) => c.id !== cat.id);
            const parent = rand() < 0.4 ? pick(rand, candidates)?.id : undefined;
            cmd = { type: "category.reparent", categoryId: cat.id, parentId: parent, at };
          }
          if (!cmd) continue;
          const before = structuredClone(project);
          const beforeJson = JSON.stringify(before);
          try {
            const next = reduceProject(project, cmd);
            if (next !== project) {
              project = next;
              history = executeCommand(history, cmd);
            }
            checkInvariants(project, `seed ${seed} step ${step}`);
          } catch (_e) {
            expect(JSON.stringify(project)).toBe(beforeJson);
          }
        }
        checkInvariants(project, `seed ${seed} final`);
        // Ceder al event loop evita que el worker RPC de Vitest parezca
        // bloqueado durante la batería multi-seed bajo carga paralela.
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    },
    180000,
  );
});
