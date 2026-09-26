import { expect, test } from "@playwright/test";
import { exportProject } from "@solara/exporter";
import { catalogModernStore } from "@solara/project-schema/catalog-modern-fixture";
import { buildCatalogModernProject } from "@solara/project-schema/catalog-modern-template";

test("la demo con teléfono real conserva el contrato data-whatsapp del sitio", () => {
  const exported = exportProject(buildCatalogModernProject({ seed: "demo" }) as never, {
    mode: "production",
  });
  const home = String(exported.files.get("index.html"));
  expect(home).toContain('data-whatsapp="5491123456789"');
  expect(home).toContain(
    `data-whatsapp-greeting="Hola ${catalogModernStore.identity.brandName}, quiero hacer este pedido:"`,
  );
  expect(home).not.toContain("data-whatsapp-include-sku=");
});
