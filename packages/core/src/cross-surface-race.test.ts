import { type StoreProjectV1, StoreProjectV1Schema } from "@solara/project-schema";
import { catalogModernStore } from "@solara/project-schema/catalog-modern-fixture";
import { describe, expect, it } from "vitest";
import { moveHistory, pushHistorySnapshot } from "../../../apps/studio/src/lib/history";
import {
  applyMutation,
  createHistory,
  createMutationRegistry,
  type HistoryState,
  type ProjectMutation,
  type ProjectMutationActor,
  redo,
  undo,
} from "./index.js";

type PersistedSnapshot = {
  version: number;
  project: StoreProjectV1;
  fingerprint: string;
};

type RecoveryDraft = {
  project: StoreProjectV1;
  baseVersion: number;
  fingerprint: string;
};

type CanvasSelection = {
  sectionId: string;
  fieldKey: string;
  route: string;
  iframeGeneration: number;
};

type RaceState = {
  history: HistoryState;
  disk: PersistedSnapshot;
  draft: RecoveryDraft | null;
  preservedDraftFingerprints: string[];
  conflicts: Array<{
    local: RecoveryDraft;
    disk: PersistedSnapshot;
  }>;
  lockOwner: string | null;
  pendingWorkers: number;
  route: string;
  iframeGeneration: number;
  canvasSelection: CanvasSelection | null;
  highWatermark: number;
  mutationCount: number;
  registry: ReturnType<typeof createMutationRegistry>;
};

const BASE_TIME = Date.parse("2026-08-28T12:00:00.000Z");

function fingerprint(project: StoreProjectV1): string {
  return JSON.stringify(project);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function operationTime(seed: number, step: number, skew: number): string {
  return new Date(BASE_TIME + seed * 10_000_000 + step * 1_000 + skew).toISOString();
}

function monotonicProject(project: StoreProjectV1, floor: number): StoreProjectV1 {
  const timestamp = Date.parse(project.updatedAt);
  if (timestamp > floor) return project;
  return { ...project, updatedAt: new Date(floor + 1).toISOString() };
}

function createRaceProject(): StoreProjectV1 {
  const project = clone(catalogModernStore);
  project.products = project.products.slice(0, 4);
  project.assets = project.assets.map((asset) => ({
    ...asset,
    source: "/race-lab/asset.webp",
    fallbackSource: undefined,
    responsiveSources: undefined,
  }));
  project.categories = project.categories.map((category) => ({
    ...category,
    productIds: project.products
      .filter(
        (product) =>
          product.categoryIds.includes(category.id) ||
          project.categories.some(
            (child) => child.parentId === category.id && product.categoryIds.includes(child.id),
          ),
      )
      .map((product) => product.id),
  }));
  project.collections = project.collections.map((collection) => ({
    ...collection,
    productIds: project.products
      .filter((product) => product.collectionIds.includes(collection.id))
      .map((product) => product.id),
  }));
  return StoreProjectV1Schema.parse(project);
}

function createRaceState(): RaceState {
  const project = createRaceProject();
  const snapshot: PersistedSnapshot = {
    version: 1,
    project,
    fingerprint: fingerprint(project),
  };
  return {
    history: createHistory(project),
    disk: snapshot,
    draft: null,
    preservedDraftFingerprints: [],
    conflicts: [],
    lockOwner: null,
    pendingWorkers: 0,
    route: "/",
    iframeGeneration: 1,
    canvasSelection: null,
    highWatermark: Date.parse(project.updatedAt),
    mutationCount: 0,
    registry: createMutationRegistry(),
  };
}

function withLock<T>(state: RaceState, owner: string, work: () => T): T {
  if (state.lockOwner !== null) throw new Error(`lock ocupado por ${state.lockOwner}`);
  state.lockOwner = owner;
  try {
    return work();
  } finally {
    state.lockOwner = null;
  }
}

function commitMutation(
  state: RaceState,
  mutation: ProjectMutation,
  actor: ProjectMutationActor,
  at: string,
  selection?: CanvasSelection,
): void {
  const before = state.history;
  const beforePastLength = before.past.length;
  const beforeProject = before.present;
  const applied = applyMutation(beforeProject, state.registry, mutation, actor, { at });
  const next = pushHistorySnapshot(before, applied.project);

  expect(next.past.length).toBe(beforePastLength + 1);
  expect(next.future).toHaveLength(0);
  expect(next.present).not.toBe(beforeProject);
  state.history = next;
  state.mutationCount += 1;
  if (selection !== undefined) state.canvasSelection = selection;
}

function commitExternalVersion(state: RaceState, seed: number, step: number, at: string): void {
  const externalAt = new Date(
    Math.max(Date.parse(state.disk.project.updatedAt) + 1, Date.parse(at) + 1),
  ).toISOString();
  const applied = applyMutation(
    state.disk.project,
    state.registry,
    {
      type: "identity.update",
      changes: { legalName: `Edición externa ${seed}-${step}` },
    },
    { kind: "agent", actorId: "race-lab-external", requestId: `${seed}-${step}` },
    { at: externalAt },
  );
  state.disk = {
    version: state.disk.version + 1,
    project: applied.project,
    fingerprint: fingerprint(applied.project),
  };
}

function autosave(state: RaceState): void {
  const project = state.history.present;
  if (state.draft !== null && state.draft.fingerprint !== fingerprint(project)) {
    state.preservedDraftFingerprints.push(state.draft.fingerprint);
  }
  state.draft = {
    project: clone(project),
    baseVersion: state.disk.version,
    fingerprint: fingerprint(project),
  };
}

function save(
  state: RaceState,
  seed: number,
  step: number,
  at: string,
  forceConflict: boolean,
): void {
  withLock(state, "guardar", () => {
    const current = state.history.present;
    if (state.draft !== null && state.draft.fingerprint !== fingerprint(current)) {
      state.preservedDraftFingerprints.push(state.draft.fingerprint);
    }
    const local: RecoveryDraft = {
      project: clone(current),
      baseVersion: state.draft?.baseVersion ?? state.disk.version,
      fingerprint: fingerprint(current),
    };

    if (forceConflict) commitExternalVersion(state, seed, step, at);

    if (local.baseVersion !== state.disk.version) {
      const diskBefore = clone(state.disk);
      state.conflicts.push({ local: clone(local), disk: diskBefore });
      state.draft = local;
      expect(diskBefore.fingerprint).not.toBe(local.fingerprint);
      return;
    }

    state.disk = {
      version: state.disk.version + 1,
      project: clone(current),
      fingerprint: local.fingerprint,
    };
    state.draft = null;
  });
}

function reload(state: RaceState): void {
  const current = state.history.present;
  const currentFingerprint = fingerprint(current);
  if (state.draft !== null && state.draft.fingerprint !== currentFingerprint) {
    state.preservedDraftFingerprints.push(currentFingerprint);
  }
  const loaded = state.draft?.project ?? state.disk.project;
  const next = monotonicProject(clone(loaded), state.highWatermark);
  state.history = createHistory(next);
}

function changeRoute(state: RaceState, route: string): void {
  state.canvasSelection = {
    sectionId: "missing-section",
    fieldKey: "title",
    route: state.route,
    iframeGeneration: state.iframeGeneration,
  };
  state.route = route;
  state.canvasSelection = null;
}

function iframeReload(state: RaceState): void {
  state.iframeGeneration += 1;
  state.pendingWorkers = 0;
  state.canvasSelection = null;
}

function workerError(state: RaceState): void {
  state.pendingWorkers += 1;
  try {
    withLock(state, "preview-worker", () => {
      throw new Error("worker failure injected by race lab");
    });
  } catch {
    state.pendingWorkers = 0;
  }
}

function checkInvariants(state: RaceState, label: string): void {
  const parse = (project: StoreProjectV1, name: string) => {
    const result = StoreProjectV1Schema.safeParse(project);
    if (!result.success) {
      throw new Error(
        `${label}: ${name} inválido: ${result.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
      );
    }
  };

  parse(state.history.present, "present");
  parse(state.disk.project, "disk");
  if (state.draft !== null) {
    parse(state.draft.project, "draft");
    if (fingerprint(state.draft.project) !== state.draft.fingerprint) {
      throw new Error(`${label}: draft sobrescrito silenciosamente`);
    }
  }
  if (state.lockOwner !== null) throw new Error(`${label}: lock no liberado`);
  if (state.pendingWorkers !== 0) throw new Error(`${label}: worker huérfano`);

  const presentTime = Date.parse(state.history.present.updatedAt);
  if (presentTime < state.highWatermark) {
    throw new Error(`${label}: updatedAt retrocedió`);
  }
  state.highWatermark = presentTime;

  if (state.canvasSelection !== null) {
    const sectionExists = state.history.present.sections.some(
      (section) => section.id === state.canvasSelection?.sectionId,
    );
    if (!sectionExists) throw new Error(`${label}: selección Canvas inválida retenida`);
  }
  for (const conflict of state.conflicts) {
    if (conflict.local.fingerprint === conflict.disk.fingerprint) {
      throw new Error(`${label}: conflicto sin ambas versiones`);
    }
    parse(conflict.local.project, "conflict local");
    parse(conflict.disk.project, "conflict disk");
  }
}

function checkHistorySnapshots(state: RaceState): void {
  for (const project of [...state.history.past, ...state.history.future]) {
    const result = StoreProjectV1Schema.safeParse(project);
    if (!result.success) throw new Error("history snapshot inválido al cerrar la semilla");
  }
}

function runSeed(seed: number): void {
  const state = createRaceState();
  const random = (() => {
    let value = seed + 1;
    return () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 4_294_967_296;
    };
  })();

  for (let step = 0; step < 100; step += 1) {
    try {
      const skew = random() < 0.2 ? -5000 : random() < 0.2 ? 5000 : 0;
      const at = operationTime(seed, step, skew);
      const operation = step < 11 ? step : step === 15 ? 4 : Math.floor(random() * 11);
      switch (operation) {
        case 0:
          state.pendingWorkers += 1;
          commitMutation(
            state,
            {
              type: "section.field.update",
              sectionId: "modo-section-hero",
              fieldKey: "title",
              value: `Canvas ${seed}-${step}`,
            },
            { kind: "canvas", sessionId: `race-${seed}` },
            at,
            {
              sectionId: "modo-section-hero",
              fieldKey: "title",
              route: state.route,
              iframeGeneration: state.iframeGeneration,
            },
          );
          state.pendingWorkers = 0;
          break;
        case 1:
          commitMutation(
            state,
            {
              type: "identity.update",
              changes: { brandName: `Sidebar ${seed}-${step}` },
            },
            { kind: "sidebar" },
            at,
          );
          break;
        case 2: {
          const product =
            state.history.present.products[step % state.history.present.products.length];
          if (!product) throw new Error("fixture sin productos");
          commitMutation(
            state,
            {
              type: "product.update",
              productId: product.id,
              changes: { title: `Agent ${seed}-${step}` },
            },
            { kind: "agent", actorId: `race-agent-${seed}`, requestId: `${seed}-${step}` },
            at,
          );
          break;
        }
        case 3:
          autosave(state);
          break;
        case 4:
          save(state, seed, step, at, step === 15 || random() < 0.25);
          break;
        case 5:
          reload(state);
          break;
        case 6:
          state.history = moveHistory(state.history, undo);
          state.canvasSelection = null;
          break;
        case 7:
          state.history = moveHistory(state.history, redo);
          state.canvasSelection = null;
          break;
        case 8:
          changeRoute(state, step % 2 === 0 ? "/" : "/categorias/casa/");
          break;
        case 9:
          iframeReload(state);
          break;
        case 10:
          workerError(state);
          break;
      }
      checkInvariants(state, `seed ${seed} step ${step}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`N4 seed ${seed} step ${step}: ${message}`);
    }
  }

  checkHistorySnapshots(state);
  expect(state.mutationCount).toBeGreaterThan(0);
  expect(state.conflicts.length).toBeGreaterThan(0);
  expect(state.lockOwner).toBeNull();
  expect(state.pendingWorkers).toBe(0);
}

describe("N4 Cross-Surface Race Lab", () => {
  it(
    "100 seeds x 100 operaciones conservan snapshots, drafts, conflictos y locks",
    { timeout: 180000 },
    () => {
      const startSeed = Number.parseInt(process.env.SOLARA_TEST_SEED ?? "0", 10);
      if (!Number.isInteger(startSeed)) throw new Error("SOLARA_TEST_SEED debe ser un entero");
      for (let offset = 0; offset < 100; offset += 1) runSeed(startSeed + offset);
    },
  );
});
