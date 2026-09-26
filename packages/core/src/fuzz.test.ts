// @ts-nocheck
import { type StoreProjectV1, StoreProjectV1Schema } from "@solara/project-schema";
import { catalogScaleStore } from "@solara/project-schema/scale-fixture";
import { describe, expect, it } from "vitest";
import { createHistory, executeCommand, redo, reduceProject, undo } from "./index";

// PRNG determinista Mulberry32
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

function isValidSlug(s: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length <= 120;
}

function makeSlug(rand: () => number): string {
  const s = randomString(rand, 6 + Math.floor(rand() * 6));
  return s;
}

function checkInvariants(project: StoreProjectV1, label: string) {
  // 1. Schema parse
  const parsed = StoreProjectV1Schema.safeParse(project);
  if (!parsed.success) {
    throw new Error(
      `${label}: StoreProjectV1Schema.parse falló: ${parsed.error.issues.map((i) => `${i.path.join(".")}:${i.message}`).join(", ")}`,
    );
  }
  // 2. IDs únicos
  const dup = (arr: string[], name: string) => {
    const seen = new Set(arr);
    if (seen.size !== arr.length) throw new Error(`${label}: IDs duplicados en ${name}`);
  };
  dup(
    project.products.map((p) => p.id),
    "products.id",
  );
  dup(
    project.products.map((p) => p.slug),
    "products.slug",
  );
  dup(
    project.categories.map((c) => c.id),
    "categories.id",
  );
  dup(
    project.categories.map((c) => c.slug),
    "categories.slug",
  );
  dup(
    project.collections.map((c) => c.id),
    "collections.id",
  );
  dup(
    project.assets.map((a) => a.id),
    "assets.id",
  );
  // 3. slugs válidos
  for (const p of project.products)
    if (!isValidSlug(p.slug)) throw new Error(`${label}: slug inválido producto ${p.slug}`);
  for (const c of project.categories)
    if (!isValidSlug(c.slug)) throw new Error(`${label}: slug inválido categoria ${c.slug}`);
  // 4. referencias huérfanas
  const catIds = new Set(project.categories.map((c) => c.id));
  const colIds = new Set(project.collections.map((c) => c.id));
  const assetIds = new Set(project.assets.map((a) => a.id));
  for (const p of project.products) {
    for (const cid of p.categoryIds)
      if (!catIds.has(cid)) throw new Error(`${label}: producto ${p.id} categoria huérfana ${cid}`);
    for (const cid of p.collectionIds)
      if (!colIds.has(cid)) throw new Error(`${label}: producto ${p.id} coleccion huérfana ${cid}`);
    for (const aid of p.imageIds)
      if (!assetIds.has(aid)) throw new Error(`${label}: producto ${p.id} asset huérfano ${aid}`);
    for (const v of p.variants)
      if (v.imageId && !assetIds.has(v.imageId))
        throw new Error(`${label}: variante ${v.id} asset huérfano ${v.imageId}`);
  }
  for (const c of project.categories)
    if (c.parentId && !catIds.has(c.parentId))
      throw new Error(`${label}: categoria ${c.id} parent huérfano ${c.parentId}`);
  // 5. jerarquía máxima 1 nivel y sin ciclos
  for (const c of project.categories) {
    let depth = 0;
    let cur: string | undefined = c.parentId;
    const seen = new Set([c.id]);
    while (cur) {
      if (seen.has(cur)) throw new Error(`${label}: ciclo en categoria ${c.id}`);
      seen.add(cur);
      depth++;
      if (depth > 1) throw new Error(`${label}: jerarquía >1 nivel en ${c.id}`);
      const parent = project.categories.find((x) => x.id === cur);
      cur = parent?.parentId;
    }
  }
  // 6. productIds derivados correctos
  for (const cat of project.categories) {
    const expected = project.products
      .filter(
        (p) =>
          p.categoryIds.includes(cat.id) ||
          project.categories
            .filter((ch) => ch.parentId === cat.id)
            .some((ch) => p.categoryIds.includes(ch.id)),
      )
      .map((p) => p.id);
    const actual = cat.productIds;
    // comparar como conjuntos
    const aSet = new Set(actual);
    const eSet = new Set(expected);
    if (aSet.size !== eSet.size || [...aSet].some((id) => !eSet.has(id))) {
      throw new Error(
        `${label}: productIds derivados incorrectos en categoria ${cat.id} expected ${[...eSet]} actual ${[...aSet]}`,
      );
    }
  }
  // 7. precios enteros
  for (const p of project.products)
    for (const v of p.variants) {
      if (!Number.isInteger(v.price)) throw new Error(`${label}: precio no entero ${v.price}`);
      if (v.compareAtPrice !== undefined && !Number.isInteger(v.compareAtPrice))
        throw new Error(`${label}: compareAtPrice no entero`);
    }
  // 8. serializar/deserializar conserva semántica (via parse)
  const reparsed = StoreProjectV1Schema.parse(JSON.parse(JSON.stringify(project)));
  if (JSON.stringify(reparsed) !== JSON.stringify(project))
    throw new Error(`${label}: serializar/deserializar no conserva`);
}

describe("fuzz StoreProjectV2 + @solara/core", () => {
  it(
    "secuencias aleatorias largas mantienen invariantes (seed 42, 250 ops)",
    { timeout: 120000 },
    () => {
      const seed = 42;
      const rand = mulberry32(seed);
      let project: StoreProjectV1 = structuredClone(catalogScaleStore) as unknown as StoreProjectV1;
      let history = createHistory(project);
      const timestampBase = Date.parse("2026-08-20T10:00:00.000Z");
      // 250 pasos conservan variedad de operaciones con un costo estable bajo carga.
      for (let step = 0; step < 250; step++) {
        const at = new Date(timestampBase + step * 1000).toISOString();
        const op = Math.floor(rand() * 12);
        let command: any = null;
        try {
          switch (op) {
            case 0: {
              // product.create
              const id = `product-fuzz-${randomString(rand, 6)}`;
              const slug = makeSlug(rand);
              const baseProd = catalogScaleStore.products[0] as any;
              const prod = {
                ...structuredClone(baseProd),
                id,
                slug,
                title: `Fuzz ${randomString(rand, 10)}`,
                createdAt: at,
                updatedAt: at,
                categoryIds: [],
                collectionIds: [],
                imageIds: [],
                variants: baseProd.variants.slice(0, 1).map((v: any) => ({
                  ...v,
                  id: `variant-${randomString(rand, 6)}`,
                  price: Math.floor(rand() * 10000),
                  sku: randomString(rand, 8),
                })),
              };
              command = { type: "product.create", product: prod, at };
              break;
            }
            case 1: {
              // product.update
              const p = pick(rand, project.products);
              if (!p) break;
              command = {
                type: "product.update",
                productId: p.id,
                changes: { title: `Upd ${randomString(rand, 5)}` },
                at,
              };
              break;
            }
            case 2: {
              // product.archive
              const p = pick(
                rand,
                project.products.filter((x) => x.status !== "archived"),
              );
              if (!p) break;
              command = { type: "product.archive", productId: p.id, at };
              break;
            }
            case 3: {
              // product.restore
              const p = pick(
                rand,
                project.products.filter((x) => x.status === "archived"),
              );
              if (!p) break;
              command = { type: "product.restore", productId: p.id, at };
              break;
            }
            case 4: {
              // products.adjustPrices
              const ids = project.products.slice(0, 2).map((p) => p.id);
              const cents = Math.floor(rand() * 200 - 100);
              command = {
                type: "products.adjustPrices",
                productIds: ids,
                adjustment: { type: "amount", cents },
                at,
              };
              break;
            }
            case 5: {
              // products.setCategories
              const pids = [pick(rand, project.products).id];
              const cids = project.categories.slice(0, 2).map((c) => c.id);
              command = {
                type: "products.setCategories",
                productIds: pids,
                categoryIds: rand() < 0.5 ? cids : [],
                at,
              };
              break;
            }
            case 6: {
              // products.addTags
              const pids = [pick(rand, project.products).id];
              command = {
                type: "products.addTags",
                productIds: pids,
                tags: [randomString(rand, 4)],
                at,
              };
              break;
            }
            case 7: {
              // products.removeTags
              const p = pick(rand, project.products);
              if (!p.tags.length) break;
              command = {
                type: "products.removeTags",
                productIds: [p.id],
                tags: [pick(rand, p.tags)],
                at,
              };
              break;
            }
            case 8: {
              // products.setStatus
              const pids = [pick(rand, project.products).id];
              const statuses: any[] = ["active", "archived", "draft"];
              command = {
                type: "products.setStatus",
                productIds: pids,
                status: pick(rand, statuses),
                at,
              };
              break;
            }
            case 9: {
              // category.reparent
              const cat = pick(rand, project.categories);
              const other = project.categories.find(
                (c) =>
                  c.id !== cat.id &&
                  c.parentId === undefined &&
                  !project.categories.some((ch) => ch.parentId === c.id),
              );
              const parentId = rand() < 0.5 ? undefined : other?.id;
              // evitar reparent a sí mismo o a descendiente
              if (parentId === cat.id) break;
              command = { type: "category.reparent", categoryId: cat.id, parentId, at };
              break;
            }
            case 10: {
              // products.replaceAll (import)
              const prods = project.products.slice(0, 1);
              command = { type: "products.replaceAll", products: prods, at };
              break;
            }
            case 11: {
              // undo/redo
              if (rand() < 0.5 && history.past.length) {
                const before = structuredClone(history.present);
                history = undo(history);
                checkInvariants(history.present, `undo step ${step}`);
                const _afterUndo = history.present;
                history = redo(history);
                // redo debe recuperar semánticamente el mismo proyecto
                expect(history.present).toEqual(before);
                // No aplicar comando en este step, solo undo/redo
                continue;
              } else if (history.future.length) {
                history = redo(history);
                checkInvariants(history.present, `redo step ${step}`);
                continue;
              }
              break;
            }
          }
          if (!command) continue;
          const before = structuredClone(project);
          const beforeJson = JSON.stringify(before);
          let next: StoreProjectV1 | null = null;
          let threw = false;
          try {
            next = reduceProject(project, command);
          } catch (_e) {
            threw = true;
            // comando rechazado no debe dejar mutación parcial
            expect(JSON.stringify(project)).toBe(beforeJson);
          }
          if (!threw && next) {
            // si no cambió, debe ser misma referencia
            if (JSON.stringify(next) === beforeJson) {
              expect(next).toBe(project);
            }
            project = next;
            history = executeCommand(history, command);
            // historia debe contener el nuevo present
            expect(history.present).toEqual(project);
            checkInvariants(project, `step ${step} ${command.type} seed ${seed}`);
            // undo/redo recupera
            const h2 = undo(history);
            if (h2.present !== history.present) {
              const h3 = redo(h2);
              expect(h3.present).toEqual(history.present);
            }
          }
        } catch (e) {
          // imprimir seed para reproducción
          throw new Error(
            `Fuzz fallo en step ${step} seed ${seed} op ${op} command ${JSON.stringify(command)}: ${(e as Error).message}`,
          );
        }
      }
      // secuencia larga final también debe ser válida
      checkInvariants(project, "final");
    },
  );

});
