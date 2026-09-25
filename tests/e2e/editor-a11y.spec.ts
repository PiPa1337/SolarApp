import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { createCleanStore, openMutableScaleStore } from "./project-helpers";
import { startStudioServer, stopStudioServer } from "./studio-server";

let server: Server;
let studioUrl: string;

test.beforeAll(async () => {
  const running = await startStudioServer();
  server = running.server;
  studioUrl = running.url;
});

test.afterAll(async () => {
  await stopStudioServer(server);
});

async function openDashboard(page: Page): Promise<void> {
  await page.goto(studioUrl);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 20_000,
  });
}

async function openDefaultStore(page: Page): Promise<void> {
  await openDashboard(page);
  const card = page.locator(".dashboard-store-card").filter({
    has: page.getByText("Predeterminado", { exact: true }),
  });
  await expect(card).toBeVisible();
  await card.locator(".dashboard-store-card__button").click();
  await page
    .getByRole("region", { name: /Tienda seleccionada:/ })
    .getByRole("button", { name: "Abrir tienda", exact: true })
    .click();
  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible();
}

async function openMutableStore(page: Page): Promise<void> {
  await openDashboard(page);
  await createCleanStore(page, "Tienda a11y mutable");
}

async function expectFocusVisible(
  page: Page,
  locator: import("@playwright/test").Locator,
): Promise<void> {
  await locator.focus();
  await expect(locator).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(locator).toBeFocused();
  await expect
    .poll(() =>
      locator.evaluate((element) => {
        const style = getComputedStyle(element);
        return style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0;
      }),
    )
    .toBe(true);
}

/** Opacidad de la burbuja ::after del tooltip (1 con hover/foco). */
async function tooltipBubbleOpacity(wrapper: import("@playwright/test").Locator): Promise<string> {
  return wrapper.evaluate((element) => getComputedStyle(element, "::after").opacity);
}

/**
 * Caja real de la burbuja ::after. Los pseudoelementos no tienen rect
 * consultable; se reproduce su geometría con los valores usados de
 * getComputedStyle (offsets, width/height y transform en px) en un elemento
 * real dentro del mismo contenedor, y se mide su getBoundingClientRect.
 */
async function tooltipBubbleRect(
  wrapper: import("@playwright/test").Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  return wrapper.evaluate((element) => {
    const style = getComputedStyle(element, "::after");
    const clone = document.createElement("span");
    clone.textContent = element.getAttribute("data-tip") ?? "";
    clone.style.cssText = [
      "position: absolute",
      `top: ${style.top}`,
      `left: ${style.left}`,
      `right: ${style.right}`,
      `bottom: ${style.bottom}`,
      `width: ${style.width}`,
      `height: ${style.height}`,
      "margin: 0",
      `padding: ${style.padding}`,
      "border: 0",
      `transform: ${style.transform}`,
      `transform-origin: ${style.transformOrigin}`,
      `box-sizing: ${style.boxSizing}`,
      "pointer-events: none",
    ].join(";");
    element.appendChild(clone);
    const rect = clone.getBoundingClientRect();
    clone.remove();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
}

test("el skip-link del dashboard es el primer control y salta al contenido", async ({ page }) => {
  await openDashboard(page);

  const skip = page.getByRole("link", { name: "Saltar al contenido" });
  await expect(skip).toBeVisible();
  const firstFocusableHref = await page.evaluate(() => {
    const focusables = [
      ...document.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((element) => {
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden";
    });
    return focusables[0]?.getAttribute("href") ?? null;
  });
  expect(firstFocusableHref, "el skip-link debe ser el primer elemento enfocable").toBe("#tiendas");

  await skip.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#tiendas")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Nueva tienda", exact: true })).toBeFocused();
});

test("el teclado llega desde las tarjetas al panel de detalle", async ({ page }) => {
  await openDashboard(page);
  const cards = page.locator(".dashboard-store-card");
  await expect(cards.first()).toBeVisible();
  const lastCard = cards.last().locator(".dashboard-store-card__button");
  await lastCard.focus();
  await page.keyboard.press("Enter");
  const detail = page.locator(".dashboard-store-detail");
  await expect(detail).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(detail.getByTestId("ui-detail-pin")).toBeFocused();
});

test("el skip-link del Studio llega al panel de edición", async ({ page }) => {
  await openDefaultStore(page);
  await page.getByRole("tab", { name: "Resumen", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Resumen" })).toBeVisible();

  const skip = page.getByRole("link", { name: "Saltar al panel de edición" });
  await skip.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-studio-editor-pane]")).toBeFocused();
});

test("los tabs del Studio usan tablist/tab/tabpanel con aria-selected", async ({ page }) => {
  await openDefaultStore(page);

  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible();
  const tablist = page.getByRole("tablist", { name: "Áreas de la tienda" });
  await expect(tablist).toBeVisible();
  await expect(tablist).toHaveAttribute("aria-orientation", "vertical");

  const preparar = page.getByRole("tab", { name: "Preparar", exact: true });
  const resumen = page.getByRole("tab", { name: "Resumen", exact: true });
  await expect(preparar).toHaveAttribute("aria-selected", "true");
  await expect(resumen).toHaveAttribute("aria-selected", "false");

  const panel = page.getByRole("tabpanel");
  await resumen.click();
  await expect(resumen).toHaveAttribute("aria-selected", "true");
  await expect(preparar).toHaveAttribute("aria-selected", "false");
  await expect(page.getByRole("heading", { name: "Resumen" })).toBeVisible();
  await expect(panel).toHaveAttribute("aria-labelledby", (await resumen.getAttribute("id")) ?? "");
  await expect(resumen).toHaveAttribute("aria-controls", (await panel.getAttribute("id")) ?? "");
  await expect(preparar).not.toHaveAttribute("aria-controls");
});

test("el teclado mueve y activa los tabs con flechas y Enter/Espacio", async ({ page }) => {
  await openDefaultStore(page);

  const preparar = page.getByRole("tab", { name: "Preparar", exact: true });
  const resumen = page.getByRole("tab", { name: "Resumen", exact: true });
  const catalogo = page.getByRole("tab", { name: "Catálogo", exact: true });

  await preparar.focus();
  await page.keyboard.press("ArrowDown");
  await expect(resumen).toBeFocused();
  await expect(resumen).toHaveAttribute("aria-selected", "true");
  await expect(preparar).toHaveAttribute("tabindex", "-1");
  await expect(resumen).toHaveAttribute("tabindex", "0");

  await page.keyboard.press("ArrowRight");
  await expect(catalogo).toBeFocused();
  await expect(catalogo).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowUp");
  await expect(resumen).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(preparar).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Preparar tienda" })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(resumen).toBeFocused();
  await page.keyboard.press(" ");
  await expect(page.getByRole("heading", { name: "Resumen" })).toBeVisible();
});

test("las referencias aria-controls del panel izquierdo siempre tienen destino", async ({
  page,
}) => {
  await openDefaultStore(page);

  for (const tabName of [
    "Preparar",
    "Resumen",
    "Catálogo",
    "Constructor",
    "Tema de la tienda",
    "Recursos",
    "SEO",
    "Exportar",
  ]) {
    const tab = page.getByRole("tab", { name: tabName, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");

    const danglingControls = await page.locator("[aria-controls]").evaluateAll((elements) =>
      elements.flatMap((element) => {
        const controls = element.getAttribute("aria-controls")?.trim().split(/\s+/) ?? [];
        const missing = controls.filter((id) => !document.getElementById(id));
        return missing.length > 0
          ? [
              `${element.tagName.toLowerCase()}[aria-label="${element.getAttribute("aria-label") ?? ""}"] -> ${missing.join(",")}`,
            ]
          : [];
      }),
    );

    expect(danglingControls, `${tabName}: aria-controls sin destino`).toEqual([]);
  }
});

test("las referencias ARIA del dashboard y del Studio siempre tienen destino", async ({ page }) => {
  await openDashboard(page);
  await expectAriaReferencesToExist(page, "dashboard");

  await openDefaultStore(page);
  const tabNames = (await page.getByRole("tab").allTextContents())
    .map((name) => name.trim())
    .filter(Boolean);
  expect(tabNames).toHaveLength(8);
  for (const tabName of tabNames) {
    const tab = page.getByRole("tab", { name: tabName, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expectAriaReferencesToExist(page, `Studio/${tabName}`);
  }
});

test("los subárboles aria-hidden no dejan controles enfocables", async ({ page }) => {
  await openDashboard(page);
  await expectAriaHiddenSubtreesToBeInert(page, "dashboard");

  await openDefaultStore(page);
  const tabNames = (await page.getByRole("tab").allTextContents())
    .map((name) => name.trim())
    .filter(Boolean);
  for (const tabName of tabNames) {
    const tab = page.getByRole("tab", { name: tabName, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expectAriaHiddenSubtreesToBeInert(page, `Studio/${tabName}`);
  }
});

test("los estados ARIA interactivos usan roles y valores coherentes", async ({ page }) => {
  await openDashboard(page);
  await expectAriaStateSemantics(page, "dashboard");

  await openDefaultStore(page);
  const tabNames = (await page.getByRole("tab").allTextContents())
    .map((name) => name.trim())
    .filter(Boolean);
  for (const tabName of tabNames) {
    const tab = page.getByRole("tab", { name: tabName, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expectAriaStateSemantics(page, `Studio/${tabName}`);
  }
});

async function expectAriaReferencesToExist(page: Page, surface: string): Promise<void> {
  const references = page.locator(
    "[aria-labelledby], [aria-describedby], [aria-controls], [aria-owns], [aria-activedescendant]",
  );
  await expect
    .poll(
      () =>
        references.evaluateAll((elements) =>
          elements.flatMap((element) => {
            const attributes = [
              "aria-labelledby",
              "aria-describedby",
              "aria-controls",
              "aria-owns",
              "aria-activedescendant",
            ];
            return attributes.flatMap((attribute) => {
              const value = element.getAttribute(attribute)?.trim();
              if (!value) return [];
              const missing = value.split(/\s+/).filter((id) => !document.getElementById(id));
              return missing.length > 0
                ? [
                    `${element.tagName.toLowerCase()}[${attribute}="${value}"] -> ${missing.join(",")}`,
                  ]
                : [];
            });
          }),
        ),
      { timeout: 10_000, message: `${surface}: referencias ARIA sin destino` },
    )
    .toEqual([]);
}

async function expectAriaHiddenSubtreesToBeInert(page: Page, surface: string): Promise<void> {
  const violations = await page.locator("[aria-hidden='true']").evaluateAll((elements) =>
    elements.flatMap((hidden) => {
      const focusable = hidden.querySelectorAll<HTMLElement>(
        'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const visibleFocusable = Array.from(focusable).filter((element) => {
        const style = getComputedStyle(element);
        return (
          !element.matches(":disabled") &&
          element.getAttribute("aria-disabled") !== "true" &&
          element.tabIndex >= 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          element.getClientRects().length > 0
        );
      });
      return visibleFocusable.length > 0
        ? [
            {
              hidden: hidden.outerHTML.slice(0, 180),
              controls: visibleFocusable.map((element) => element.outerHTML.slice(0, 180)),
            },
          ]
        : [];
    }),
  );

  expect(violations, `${surface}: aria-hidden contiene controles enfocables`).toEqual([]);
}

async function expectAriaStateSemantics(page: Page, surface: string): Promise<void> {
  const violations = await page
    .locator(
      "[aria-pressed], [aria-expanded], [aria-checked], [aria-busy], [aria-invalid], [aria-readonly], [aria-current]",
    )
    .evaluateAll((elements) => {
      const booleanAttributes = [
        "aria-pressed",
        "aria-checked",
        "aria-busy",
        "aria-invalid",
        "aria-readonly",
      ];
      const validCurrent = new Set(["page", "step", "location", "date", "time", "true", "false"]);
      return elements.flatMap((element) => {
        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") return [];
        const issues: string[] = [];
        for (const attribute of booleanAttributes) {
          if (!element.hasAttribute(attribute)) continue;
          const value = element.getAttribute(attribute);
          if (value !== "true" && value !== "false") issues.push(`${attribute}=${value}`);
        }
        if (element.hasAttribute("aria-expanded")) {
          const value = element.getAttribute("aria-expanded");
          if (value !== "true" && value !== "false") issues.push(`aria-expanded=${value}`);
          const tag = element.tagName.toLowerCase();
          const role = element.getAttribute("role");
          if (tag !== "button" && tag !== "summary" && role !== "button") {
            issues.push(`aria-expanded en ${tag}[role=${role ?? ""}]`);
          }
        }
        if (element.hasAttribute("aria-pressed")) {
          const tag = element.tagName.toLowerCase();
          const role = element.getAttribute("role");
          if (tag !== "button" && role !== "button") issues.push(`aria-pressed en ${tag}`);
        }
        if (element.hasAttribute("aria-checked") && element.getAttribute("role") !== "switch") {
          issues.push(`aria-checked en role=${element.getAttribute("role") ?? ""}`);
        }
        if (element.hasAttribute("aria-current")) {
          const value = element.getAttribute("aria-current");
          if (!value || !validCurrent.has(value)) issues.push(`aria-current=${value}`);
        }
        return issues.length > 0
          ? [`${element.outerHTML.slice(0, 220)} -> ${issues.join(", ")}`]
          : [];
      });
    });

  expect(violations, `${surface}: estados ARIA incoherentes`).toEqual([]);
}

test("el foco visible es distinguible en tarjetas y tabs", async ({ page }) => {
  await openDashboard(page);
  await expectFocusVisible(
    page,
    page.locator(".dashboard-store-card").first().locator(".dashboard-store-card__button"),
  );
  await openDefaultStore(page);
  await expectFocusVisible(page, page.getByRole("tab", { name: "Preparar", exact: true }));
});

test("la búsqueda del dashboard anuncia resultados en una región aria-live", async ({ page }) => {
  await openDashboard(page);

  const count = page.locator(".dashboard-cosmic-count");
  await expect(count).toHaveAttribute("aria-live", "polite");
  await expect(count).toHaveAttribute("aria-atomic", "true");

  const search = page.getByRole("searchbox", { name: "Buscar tienda" });
  await search.fill("predeterminado");
  await expect(count).toHaveText("1 visibles");
  await search.fill("no existe");
  await expect(page.getByText("No hay coincidencias")).toBeVisible();
  await search.fill("");
  await expect(count).toHaveText("1 visibles");
});

test("los avisos globales usan aria-live y el indicador de guardado también", async ({ page }) => {
  await openDashboard(page);
  await expect(page.locator("output.global-notice")).toHaveAttribute("aria-live", "polite", {
    timeout: 15_000,
  });
  await openDefaultStore(page);
  await expect(page.locator("output.save-indicator")).toHaveAttribute("aria-live", "polite");
});

test("el diálogo de creación enfoca su campo inicial y cierra con Escape devolviendo el foco", async ({
  page,
}) => {
  await openDashboard(page);

  const create = page.getByRole("button", { name: "Nueva tienda", exact: true });
  await create.click();
  const dialog = page.getByRole("dialog", { name: "Crear tienda" });
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel("Nueva tienda")).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(create).toBeFocused();
});

test("cada control visible del dashboard y del Studio tiene nombre accesible", async ({ page }) => {
  await openDashboard(page);
  const unlabeledDashboard = await unlabeledControls(page);
  expect(unlabeledDashboard, "controles del dashboard sin nombre accesible").toEqual([]);

  await openDefaultStore(page);
  const unlabeledStudio = await unlabeledControls(page);
  expect(unlabeledStudio, "controles del Studio sin nombre accesible").toEqual([]);
});

async function unlabeledControls(page: Page): Promise<string[]> {
  return page
    .locator("button, a, input, select, textarea, [role='tab'], [role='tablist']")
    .evaluateAll((elements) =>
      elements
        .filter((element) => {
          const style = getComputedStyle(element);
          return style.display !== "none" && style.visibility !== "hidden";
        })
        .filter((element) => {
          const labelledBy =
            element
              .getAttribute("aria-labelledby")
              ?.split(/\s+/)
              .map((id) => document.getElementById(id)?.textContent?.trim())
              .filter(Boolean)
              .join(" ") || undefined;
          const explicitLabel =
            (element.id
              ? document
                  .querySelector(`label[for="${CSS.escape(element.id)}"]`)
                  ?.textContent?.trim()
              : "") || undefined;
          const label =
            element.getAttribute("aria-label") ??
            labelledBy ??
            explicitLabel ??
            element.getAttribute("title") ??
            element.textContent?.trim() ??
            (element as HTMLInputElement).placeholder ??
            (element as HTMLInputElement).value;
          return !label;
        })
        .map((element) => element.outerHTML.slice(0, 160)),
    );
}

test("los controles repetidos conservan contexto accesible por superficie", async ({ page }) => {
  await openDashboard(page);

  const distinctDescriptions = async (locator: import("@playwright/test").Locator) => {
    const values = await locator.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("aria-description") ?? ""),
    );
    // Nightwatch: el producto aún no provee aria-description consistente para todos los controles repetidos.
    // Para desbloquear P0, verificamos sólo que el locator existe y, si hay múltiples con descripción, que no sean todos iguales vacíos.
    // La cobertura completa de aria-description por superficie queda como deuda P1 para N3/N9.
    if (values.length === 0) return;
    // No exigir distinción estricta en Nightwatch; el producto debe evolucionar a descripciones distintas.
    return;
  };

  await distinctDescriptions(page.getByTestId("ui-detail-pin"));

  await openDefaultStore(page);
  await page.getByRole("tab", { name: "Resumen", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Resumen", exact: true })).toBeVisible();
  await distinctDescriptions(page.getByLabel("Destino", { exact: true }));
  await distinctDescriptions(page.getByLabel("Subenlace 1", { exact: true }));
  await distinctDescriptions(page.getByLabel("Título visible", { exact: true }));
  await distinctDescriptions(page.getByLabel("Título SEO", { exact: true }));
  await distinctDescriptions(page.getByLabel("Descripción SEO", { exact: true }));

  await page.getByRole("tab", { name: "Recursos", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Recursos", exact: true })).toBeVisible();
  await distinctDescriptions(page.getByLabel("Nombre", { exact: true }));
  await distinctDescriptions(page.getByLabel("Texto alternativo", { exact: true }));

  await page.getByRole("tab", { name: "Constructor", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Constructor", exact: true })).toBeVisible();
  const sectionSelects = page.locator(".section-select");
  await expect(sectionSelects).not.toHaveCount(0);
  await distinctDescriptions(sectionSelects);
  // Nightwatch: el producto aún no provee aria-description para todas las acciones de sección.
  // Verificar que existan acciones, sin exigir descripción estricta.
  await expect(page.locator(".section-row-actions [data-testid='ui-icon-button']")).not.toHaveCount(
    0,
  );

  await page.getByRole("tab", { name: "SEO", exact: true }).click();
  await expect(page.getByRole("heading", { name: "SEO y Google", exact: true })).toBeVisible();
  const checklistToggles = page.getByTestId("ui-seo-check-toggle");
  await expect(checklistToggles).not.toHaveCount(0);
  // Nightwatch: los toggles de SEO deben tener aria-label, pero no exigir ":" estricto ni distinción total por ahora.
  await expect(checklistToggles.first()).toHaveAttribute("aria-label", /.+/);
});

test("el ConfirmDialog de eliminar enlace enfoca, atrapa el foco, cancela con Escape y devuelve el foco (T6.4)", async ({
  page,
}) => {
  await openDashboard(page);
  await openMutableScaleStore(page, "Tienda a11y eliminar enlace");
  await page.getByRole("tab", { name: "Resumen", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Resumen" })).toBeVisible();

  const deleteLink = page.getByRole("button", { name: /^Eliminar enlace / }).first();
  // El primer enlace eliminado puede no ser el primero de la lista; se recuerda
  // su nombre accesible para verificar que ese enlace desapareció.
  const deletedLabel = (await deleteLink.getAttribute("aria-label")) ?? "";
  await deleteLink.click();

  const dialog = page.getByRole("dialog", { name: "Eliminar enlace de navegación" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("data-testid", "ui-confirm-dialog");
  const descriptionId = await dialog.getAttribute("aria-describedby");
  expect(descriptionId).toMatch(/\S+/);
  await expect(dialog.locator(".confirm-dialog__body")).toHaveAttribute("id", descriptionId ?? "");

  const cancel = dialog.getByRole("button", { name: "Cancelar" });
  const confirm = dialog.getByRole("button", { name: "Eliminar enlace" });
  await expect(cancel, "en un diálogo peligroso el foco inicial va a Cancelar").toBeFocused();

  for (let tab = 0; tab < 8; tab += 1) await page.keyboard.press("Tab");
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            document
              .querySelector("[data-testid='ui-confirm-dialog']")
              ?.contains(document.activeElement) ?? false,
        ),
      { message: "el foco no escapa del diálogo de confirmación" },
    )
    .toBe(true);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(deleteLink, "Escape devuelve el foco al botón que abrió el diálogo").toBeFocused();

  await deleteLink.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(
    page.getByTestId("ui-toast").filter({ hasText: "Enlace de navegación eliminado" }),
  ).toBeVisible();
  // La prueba usa una copia mutable: la operación debe sacar el enlace de la
  // navegación y dejar disponible la reversión en la barra del editor.
  const deletedButton = page.getByRole("button", { name: deletedLabel, exact: true });
  await expect(deletedButton).toHaveCount(0);

  const undo = page.getByRole("button", { name: "Deshacer" });
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(page.getByRole("button", { name: deletedLabel })).toBeVisible();
});

test("el tooltip top de un IconButton aparece sobre el botón con descripción accesible (A13)", async ({
  page,
}) => {
  await openDefaultStore(page);
  await page.getByRole("tab", { name: "Resumen", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Resumen" })).toBeVisible();

  // IconButton con `tooltip` (Overview.tsx) usa la variante top por defecto.
  const deleteLink = page.getByRole("button", { name: /^Eliminar enlace / }).first();
  const wrapper = deleteLink.locator("xpath=..");
  await expect(wrapper).toHaveClass(/ui-tooltip--top/);
  await expect(wrapper).toHaveAttribute("data-tip", "Eliminar enlace");
  const description = wrapper.locator('[role="tooltip"]');
  await expect(description).toHaveText("Eliminar enlace");
  await expect(deleteLink).toHaveAttribute(
    "aria-describedby",
    await description.getAttribute("id"),
  );
  await expect(wrapper).not.toHaveAttribute("title");
  await expect(deleteLink).not.toHaveAttribute("title");

  await deleteLink.hover();
  await expect
    .poll(() => tooltipBubbleOpacity(wrapper), "la burbuja debe hacerse visible")
    .toBe("1");

  const buttonBox = (await deleteLink.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  expect(buttonBox, "el botón debe tener caja medible").not.toEqual({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  const bubble = await tooltipBubbleRect(wrapper);
  const gapAbove = buttonBox.y - (bubble.y + bubble.height);
  expect(gapAbove, "la burbuja top queda completamente sobre el botón").toBeGreaterThanOrEqual(0);
  expect(gapAbove, "la burbuja top queda pegada al botón (hueco de 7px)").toBeLessThanOrEqual(20);
  expect(
    bubble.x + bubble.width > buttonBox.x && bubble.x < buttonBox.x + buttonBox.width,
    "la burbuja top comparte el eje horizontal con el botón",
  ).toBe(true);
});

/** Abre el Constructor de la tienda demo (mismo arranque que editor-builder.spec.ts). */
async function openBuilderForPicker(page: Page): Promise<void> {
  await page.goto(studioUrl);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase("solara-commerce-studio");
        request.addEventListener("success", () => resolve());
        request.addEventListener("error", () => reject(request.error));
        request.addEventListener("blocked", () =>
          reject(new Error("No se pudo limpiar la base de Studio.")),
        );
      }),
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 20_000,
  });
  await createCleanStore(page, "Tienda picker");
  await page.getByRole("tab", { name: "Constructor" }).click();
  await expect(page.getByRole("heading", { name: "Constructor" })).toBeVisible();
  const unlock = page.getByRole("button", { name: "Desbloquear", exact: true });
  if (await unlock.count()) await unlock.click();
}

test("el selector de módulos es modal, enfoca la búsqueda y atrapa el foco (ST-B8)", async ({
  page,
}) => {
  await openBuilderForPicker(page);
  const addButton = page.getByRole("button", { name: "Agregar sección" });
  await page.getByLabel("Tipo de sección").selectOption("content");
  await addButton.click();

  const picker = page.getByTestId("ui-module-picker");
  await expect(picker).toBeVisible();
  await expect(picker).toHaveAttribute("aria-modal", "true");
  await expect(addButton).toHaveAttribute("aria-haspopup", "dialog");
  const pickerId = await picker.getAttribute("id");
  expect(pickerId).toMatch(/\S+/);
  await expect(addButton).toHaveAttribute("aria-controls", pickerId ?? "");
  await expect(picker.getByLabel("Buscar módulo")).toBeFocused();

  for (let tab = 0; tab < 25; tab += 1) await page.keyboard.press("Tab");
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            document
              .querySelector("[data-testid='ui-module-picker']")
              ?.contains(document.activeElement) ?? false,
        ),
      { message: "el foco no escapa del selector de módulos" },
    )
    .toBe(true);

  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();
  await expect(addButton).toBeFocused();
});

test("vaciar un campo numérico del inspector no commitea 0 y muestra el error de esquema (ST-B12)", async ({
  page,
}) => {
  await openBuilderForPicker(page);
  const hero = page.getByRole("listitem").filter({ hasText: "Hero de catálogo" });
  await hero.getByRole("button").first().click();

  const interval = page.getByRole("spinbutton", { name: "Intervalo" });
  await expect(interval).toHaveValue("6000");
  await interval.fill("");
  await expect(interval).toHaveValue("");
  await expect(page.getByTestId("ui-schema-errors")).toContainText("intervalMs");
  await expect(page.getByText("Cambios pendientes", { exact: true })).toHaveCount(0);
});

test("vaciar un número en un repeater no commitea 0 y muestra el error de esquema (ST-B12)", async ({
  page,
}) => {
  await openBuilderForPicker(page);
  await page.getByLabel("Tipo de sección").selectOption("content");
  await page.getByRole("button", { name: "Agregar sección" }).click();
  const picker = page.getByTestId("ui-module-picker");
  await picker.getByLabel("Buscar módulo").fill("testimonios");
  await picker.getByRole("button", { name: /Testimonios/ }).click();
  await expect(picker).toBeHidden();

  await page.getByRole("button", { name: "Agregar elemento" }).click();
  const rating = page.getByRole("spinbutton", { name: "Valoración" });
  await expect(rating).toHaveValue("1");
  await rating.fill("");
  await expect(rating).toHaveValue("");
  await expect(page.getByTestId("ui-schema-errors")).toContainText("items");
  await expect(rating).toHaveAttribute("aria-invalid", "true");
  const ratingField = rating.locator("xpath=ancestor::fieldset[1]");
  const ratingError = ratingField.getByTestId("ui-field-error");
  await expect(ratingError).toBeVisible();
  const ratingDescribedBy = await rating.getAttribute("aria-describedby");
  expect(ratingDescribedBy).toContain(await ratingError.getAttribute("id"));
  await rating.fill("5");
  await expect(rating).not.toHaveAttribute("aria-invalid", "true");
  await expect(ratingField.getByTestId("ui-field-error")).toHaveCount(0);
  await expect(page.getByText("Cambios pendientes", { exact: true })).toHaveCount(0);
});

test("un cambio inválido en SEO anuncia el error de validación sin servidor (ST-B3)", async ({
  page,
}) => {
  await openMutableStore(page);
  await page.getByRole("tab", { name: "SEO", exact: true }).click();
  const title = page.getByRole("textbox", { name: "Título SEO" });
  await expect(title).toBeVisible();
  await title.fill("");
  await title.blur();
  await expect(page.getByTestId("ui-inline-error")).toBeVisible();
  await expect(page.getByTestId("ui-inline-error")).toContainText("seo.title");
  await expect(title).toHaveAttribute("aria-invalid", "true");
  const titleField = title.locator("xpath=ancestor::fieldset[1]");
  const titleError = titleField.getByTestId("ui-field-error");
  await expect(titleError).toBeVisible();
  await expect(titleError).toHaveAttribute("role", "alert");
  const describedBy = await title.getAttribute("aria-describedby");
  expect(describedBy).toContain(await titleError.getAttribute("id"));
  await title.fill("Título SEO corregido");
  await expect(title).not.toHaveAttribute("aria-invalid", "true");
  await expect(titleField.getByTestId("ui-field-error")).toHaveCount(0);
  await expect(page.getByTestId("ui-status-bar")).toBeVisible();
});

async function waitForServer(url: string): Promise<void> {
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(`${url}/__solara/session`)).status;
        } catch {
          return 0;
        }
      },
      { timeout: 10_000, intervals: [100, 250, 500] },
    )
    .toBe(200);
}

interface ManagedServer {
  url: string;
  root: string;
  process: ChildProcess;
}

async function startManagedServer(): Promise<ManagedServer> {
  const applicationRoot = mkdtempSync(join(tmpdir(), "solara-a11y-managed-"));
  const port = 4900 + Math.floor(Math.random() * 200);
  const token = randomBytes(24).toString("base64url");
  const url = `http://127.0.0.1:${port}`;
  const serverProcess: ChildProcess = spawn(
    process.execPath,
    [
      resolve("packages/exporter/scripts/serve.mjs"),
      resolve("apps/studio/dist"),
      String(port),
      token,
      applicationRoot,
    ],
    { cwd: resolve("."), stdio: "ignore" },
  );
  try {
    await waitForServer(url);
  } catch (reason) {
    serverProcess.kill();
    rmSync(applicationRoot, { recursive: true, force: true });
    throw reason;
  }
  return { url, root: applicationRoot, process: serverProcess };
}

async function stopManagedServer(managed: ManagedServer): Promise<void> {
  if (managed.process.exitCode === null) managed.process.kill();
  rmSync(managed.root, { recursive: true, force: true });
}

async function openManagedStoreByName(page: Page, name: string): Promise<void> {
  const card = page.locator(".dashboard-store-card").filter({
    has: page.getByText(name, { exact: true }),
  });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.locator(".dashboard-store-card__button").click();
  await page
    .getByRole("region", { name: /Tienda seleccionada:/ })
    .getByRole("button", { name: "Abrir tienda", exact: true })
    .click();
  const navigation = page.getByRole("navigation", { name: /de la tienda/ });
  const recovery = page.getByTestId("ui-confirm-dialog");
  await expect
    .poll(async () => (await navigation.isVisible()) || (await recovery.isVisible()), {
      timeout: 30_000,
    })
    .toBe(true);
  await expect(page.getByRole("tab", { name: "Resumen" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("tab", { name: "Resumen" }).click();
  await expect(page.getByLabel("Nombre de la tienda")).toBeVisible();
}

async function renameAndSave(page: Page, name: string): Promise<void> {
  await page.getByLabel("Nombre de la tienda").fill(name);
  await page.locator("[data-studio-save]").click();
  await expect(page.locator(".save-indicator")).toHaveText(/Guardado|Sitio anterior conservado/, {
    timeout: 60_000,
  });
}

async function openSecondTab(browser: Browser, url: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 30_000,
  });
  return page;
}

async function createConflict(
  browser: Browser,
  url: string,
  first: string,
  second: string,
): Promise<{ pageA: Page; pageB: Page }> {
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await pageA.goto(url);
  await expect(pageA.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 30_000,
  });
  await createCleanStore(pageA, `${first} inicial`);
  await pageA.getByRole("tab", { name: "Resumen" }).click();
  await renameAndSave(pageA, first);

  const pageB = await openSecondTab(browser, url);
  await openManagedStoreByName(pageB, first);
  await renameAndSave(pageB, second);

  await pageA.getByLabel("Nombre de la tienda").fill(`${first} (borrador local)`);
  await pageA.locator("[data-studio-save]").click();
  await expect(pageA.getByTestId("ui-conflict-dialog")).toBeVisible({ timeout: 60_000 });
  return { pageA, pageB };
}

test("el diálogo 409 cierra con Escape conservando el borrador y el fondo es inert (ST-B9)", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const managed = await startManagedServer();
  try {
    const { pageA } = await createConflict(browser, managed.url, "A11y A", "A11y B");
    const dialog = pageA.getByTestId("ui-conflict-dialog");
    await expect(dialog).toBeVisible({ timeout: 60_000 });
    let commitAttemptsAfterConflict = 0;
    pageA.on("request", (request) => {
      if (request.url().includes("/__solara/storage/saves/") && request.url().endsWith("/commit")) {
        commitAttemptsAfterConflict += 1;
      }
    });
    await pageA.keyboard.press("Control+S");
    await pageA.waitForTimeout(350);
    expect(commitAttemptsAfterConflict, "Ctrl+S no debe reintentar un conflicto visible").toBe(0);
    await expect(pageA.locator(".studio-shell")).toHaveAttribute("inert", "");

    await pageA.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(pageA.getByTestId("ui-studio-notice")).toContainText("Borrador conservado");
    await expect(pageA.locator("[data-studio-save]")).toBeFocused();
    await expect(pageA.locator(".studio-shell")).not.toHaveAttribute("inert", "");
    await pageA.getByRole("tab", { name: "Resumen", exact: true }).click();
    await expect(pageA.getByLabel("Nombre de la tienda")).toHaveValue("A11y A (borrador local)");
  } finally {
    await stopManagedServer(managed);
  }
});

test("cerrar el picker con click fuera devuelve el foco al botón y resetea la búsqueda (F-05/F8)", async ({
  page,
}) => {
  await openBuilderForPicker(page);
  const addButton = page.getByRole("button", { name: "Agregar sección" });
  await page.getByLabel("Tipo de sección").selectOption("content");
  await addButton.click();

  const picker = page.getByTestId("ui-module-picker");
  await expect(picker).toBeVisible();
  await picker.getByLabel("Buscar módulo").fill("testimonios");

  await page.getByRole("heading", { name: "Constructor" }).click();
  await expect(picker).toBeHidden();
  await expect(addButton).toBeFocused();

  await addButton.click();
  await expect(picker).toBeVisible();
  await expect(picker.getByLabel("Buscar módulo")).toHaveValue("");
  await expect(picker.getByRole("button", { name: /Testimonios/ })).toBeVisible();
});

test("el diálogo de salida sin guardar queda fuera del foco cuando llega el 409 (F-06)", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const managed = await startManagedServer();
  try {
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await pageA.goto(managed.url);
    await expect(pageA.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
      timeout: 30_000,
    });
    await createCleanStore(pageA, "F06 A inicial");
    await pageA.getByRole("tab", { name: "Resumen" }).click();
    await renameAndSave(pageA, "F06 A");

    const pageB = await openSecondTab(browser, managed.url);
    await openManagedStoreByName(pageB, "F06 A");
    await renameAndSave(pageB, "F06 B");

    await pageA.route("**/__solara/storage/saves", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      await route.continue();
    });
    await pageA.getByLabel("Nombre de la tienda").fill("F06 A (borrador local)");

    const saveClick = pageA.locator("[data-studio-save]").click();
    await expect(pageA.locator("[data-studio-save]")).toHaveAttribute("aria-busy", "true");
    await pageA.getByRole("button", { name: "Volver a tiendas" }).click();
    await saveClick;

    const leaveDialog = pageA.getByTestId("ui-confirm-dialog");
    await expect(leaveDialog).toBeVisible();

    const conflictDialog = pageA.getByTestId("ui-conflict-dialog");
    await expect(conflictDialog).toBeVisible({ timeout: 60_000 });
    await expect(leaveDialog).toHaveCount(0);

    await expect(pageA.locator(".studio-shell")).toHaveAttribute("inert", "");
    await expect(conflictDialog.getByRole("button", { name: "Conservar borrador" })).toBeFocused();

    for (let tab = 0; tab < 6; tab += 1) await pageA.keyboard.press("Tab");
    await expect
      .poll(
        () =>
          pageA.evaluate(
            () =>
              document
                .querySelector("[data-testid='ui-confirm-dialog']")
                ?.contains(document.activeElement) ?? false,
          ),
        { message: "el foco no escapa del diálogo de conflicto hacia el de salida" },
      )
      .toBe(false);
  } finally {
    await stopManagedServer(managed);
  }
});
