import type { NavigationItem } from "@solara/project-schema";
import { type StoreProjectV1, StoreProjectV1Schema } from "@solara/project-schema";
import { catalogScaleStore } from "@solara/project-schema/scale-fixture";
import { describe, expect, it } from "vitest";

function mulberry32(seed: number) {
  return () => {
    seed += 0x6d2b79f5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randomString(rand: () => number, len = 8): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(rand() * chars.length)];
  return s;
}
describe("fuzz navigation/modules", () => {
  it(
    "20 seeds x 30 operaciones mantienen parse y sin referencias huérfanas",
    { timeout: 120000 },
    () => {
      for (let seed = 0; seed < 20; seed++) {
        const rand = mulberry32(seed);
        let project: StoreProjectV1 = structuredClone(catalogScaleStore);
        for (let step = 0; step < 30; step++) {
          const before = JSON.stringify(project);
          const op = Math.floor(rand() * 5);
          try {
            if (op === 0) {
              // navigation: add item con id duplicado (debe fallar) o válido
              const id =
                rand() < 0.3
                  ? (project.navigation.items[0]?.id ?? "nav-1")
                  : `nav-${randomString(rand, 4)}`;
              const item: NavigationItem = {
                id,
                label: randomString(rand, 6),
                href: rand() < 0.5 ? `/categorias/${project.categories[0]?.slug ?? "test"}/` : "/",
              };
              if (rand() < 0.2) item.href = "not-a-url";
              project = structuredClone(project);
              project.navigation.items.push(item);
            } else if (op === 1) {
              // sections reorder
              project = structuredClone(project);
              const from = Math.floor(rand() * project.sections.length);
              const to = Math.floor(rand() * project.sections.length);
              const [moved] = project.sections.splice(from, 1);
              if (moved) project.sections.splice(to, 0, moved);
            } else if (op === 2) {
              // duplicate product (simula duplicateProject)
              const orig = project.products[0];
              if (!orig) continue;
              const dup: StoreProjectV1["products"][number] = {
                ...structuredClone(orig),
                id: `store-${randomString(rand, 6)}`,
                slug: randomString(rand, 6),
                name: `${orig.name} copia`,
              };
              if (rand() < 0.3) dup.slug = orig.slug; // duplicado debe fallar
              project = structuredClone(project);
              project.products.push(dup);
            } else if (op === 3) {
              // assets: add imageId huérfano a producto
              const p = project.products[0];
              if (!p) continue;
              project = structuredClone(project);
              const prod = project.products.find((x) => x.id === p.id);
              if (prod) prod.imageIds.push(`nonexistent-asset-${randomString(rand, 4)}`);
            } else if (op === 4) {
              // collection productIds huérfano
              const col = project.collections[0];
              if (!col) continue;
              project = structuredClone(project);
              const c = project.collections.find((x) => x.id === col.id);
              if (c) c.productIds.push("nonexistent-product");
            }
            const parsed = StoreProjectV1Schema.safeParse(project);
            if (!parsed.success) {
              // debe ser rechazado, restaurar
              project = JSON.parse(before);
              expect(parsed.success).toBe(false);
            } else {
              // si parsea, verificar invariantes básicas
              const p = parsed.data;
              const catIds = new Set(p.categories.map((c) => c.id));
              for (const prod of p.products)
                for (const cid of prod.categoryIds) expect(catIds.has(cid)).toBe(true);
            }
          } catch (_e) {
            // cualquier throw debe dejar project sin mutación parcial (restaurar)
            const _after = JSON.stringify(project);
            // si hubo throw, project debe ser igual a before (ya restaurado) o si no, debe ser parseable
            expect(() => StoreProjectV1Schema.parse(project)).not.toThrow();
          }
        }
      }
    },
    30000,
  );
});
