import { referenceStore } from "@solara/project-schema/fixture";
import { describe, expect, it } from "vitest";
import {
  buildCartLine,
  buildContactMailto,
  buildWhatsAppMessage,
  buildWhatsAppUrl,
  formatMoney,
  MAX_APP_FPS,
  normalizeCartQuantity,
  parseCart,
  reconcileCartLines,
  STOREFRONT_RUNTIME_CSS,
  STOREFRONT_RUNTIME_JS,
} from "./index";

describe("storefront runtime", () => {
  it("serializa el selector mixto de galería en el bundle público", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain("gallery-media-id");
    expect(STOREFRONT_RUNTIME_JS).toContain("galleryMediaId");
  });
  it("normaliza cualquier cantidad al rango entero 1–99", () => {
    const cases: Array<[unknown, number]> = [
      [undefined, 1],
      ["", 1],
      ["  ", 1],
      ["no es un número", 1],
      [Number.NaN, 1],
      [0, 1],
      [-4, 1],
      ["3.9", 3],
      [99, 99],
      [100, 99],
      ["150", 99],
    ];
    for (const [value, expected] of cases) {
      expect(normalizeCartQuantity(value), String(value)).toBe(expected);
    }
  });

  it("construye el enlace de email con los datos del formulario", () => {
    const mailto = buildContactMailto("hola@example.com", "Predeterminado", {
      name: "Ana",
      email: "ana@example.com",
      phone: "11 5555 1111",
      message: "Quiero consultar un talle",
    });
    expect(mailto).toContain("mailto:hola@example.com?subject=");
    expect(decodeURIComponent(mailto)).toContain("Hola Predeterminado, quiero hacer una consulta.");
    expect(decodeURIComponent(mailto)).toContain("Quiero consultar un talle");
    expect(decodeURIComponent(mailto)).toContain("ana@example.com");
    expect(decodeURIComponent(mailto)).toContain("11 5555 1111");
  });

  it("genera un mensaje determinista con variante y sin SKU", () => {
    const product = referenceStore.products[0];
    const variant = product?.variants[0];
    if (!product || !variant) throw new Error("Fixture incompleto");

    const message = buildWhatsAppMessage(referenceStore, [buildCartLine(product, variant, 2)], {
      name: "Malena Ortiz",
      phone: "11 5555 0142",
      address: "Av. Forest 842, CABA",
      locality: "Villa Urquiza, CABA",
      postalCode: "C1431",
      notes: "Entregar por la tarde",
    });

    expect(message).toContain("2x Manta Bruma (Musgo)");
    expect(message).not.toContain("[ML-BRU-MUS]");
    expect(message).toContain(formatMoney(15_700_000));
    expect(message).toContain("Malena Ortiz");
    expect(message).toContain("Localidad / Provincia: Villa Urquiza, CABA");
    expect(message).toContain("Código postal: C1431");
  });

  it("codifica el enlace de WhatsApp", () => {
    const url = buildWhatsAppUrl("+54 9 11 2345-6789", "Pedido\nManta");
    expect(url).toBe("https://wa.me/5491123456789?text=Pedido%0AManta");
  });

  it("compara el carrito sin serializarlo para detectar reconciliaciones reales", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain("function cartLinesEqual");
    expect(STOREFRONT_RUNTIME_JS).toContain("if (!cartLinesEqual(external, cart))");
    expect(STOREFRONT_RUNTIME_JS).toContain("const changed = !cartLinesEqual(reconciled, cart)");
  });

  it("usa observadores sin listeners táctiles ni scrollY para el estado de scroll", () => {
    expect(STOREFRONT_RUNTIME_JS).not.toContain("scrollY");
    expect(STOREFRONT_RUNTIME_JS).not.toContain('addEventListener("wheel"');
    expect(STOREFRONT_RUNTIME_JS).not.toContain('addEventListener("touchstart"');
    expect(STOREFRONT_RUNTIME_JS).toContain("IntersectionObserver");
  });

  it("declara motion progresivo sin bloquear el HTML inicial", () => {
    expect(STOREFRONT_RUNTIME_CSS).toContain("--motion-intensity");
    expect(STOREFRONT_RUNTIME_CSS).toContain("prefers-reduced-motion");
    expect(STOREFRONT_RUNTIME_CSS).toContain("@keyframes solara-motion-fade-up");
    expect(STOREFRONT_RUNTIME_CSS).not.toContain(
      'html[data-motion-ready="true"] [data-motion-root]:not',
    );
    expect(STOREFRONT_RUNTIME_JS).toContain("motionEntry");
  });

  it("marca el load de logo y hero-media para el appear de marca", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain("solara-logo");
    expect(STOREFRONT_RUNTIME_JS).toContain("data-hero-media");
    expect(STOREFRONT_RUNTIME_JS).toContain("data-solara-loaded");
    // El serializado usa dataset.camelCase: solaraBroken => data-solara-broken.
    expect(STOREFRONT_RUNTIME_JS).toContain("solaraBroken");
  });

  it("serializa el límite global de 140 FPS y no deja un loop sin callbacks", () => {
    expect(MAX_APP_FPS).toBe(140);
    expect(STOREFRONT_RUNTIME_JS).toContain("installFrameRateCap(window, 140)");
    expect(STOREFRONT_RUNTIME_JS).toContain('solaraFpsCap = "140"');
  });

  it("usa los tokens de tema para el drawer y las alertas del carrito", () => {
    expect(STOREFRONT_RUNTIME_CSS).toContain("var(--solara-shadow-overlay)");
    expect(STOREFRONT_RUNTIME_CSS).toContain("var(--solara-sale, var(--solara-accent))");
    expect(STOREFRONT_RUNTIME_CSS).not.toContain("#9a3f2f");
    expect(STOREFRONT_RUNTIME_CSS).not.toContain("rgb(18 25 21");
  });

  it("agrupa la medición del chrome y construye HTML dinámico con nodos", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain("requestAnimationFrame(measureChromeHeight)");
    expect(STOREFRONT_RUNTIME_JS).toContain("replaceChildren");
    expect(STOREFRONT_RUNTIME_JS).toContain("textContent");
    expect(STOREFRONT_RUNTIME_JS).not.toContain("innerHTML");
    expect(STOREFRONT_RUNTIME_JS).not.toContain("createPolicy");
  });

  it("incluye comportamiento accesible para el popup de búsqueda", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain("data-catalog-search-dialog");
    expect(STOREFRONT_RUNTIME_JS).toContain("data-catalog-search-open");
    expect(STOREFRONT_RUNTIME_JS).toContain("showModal");
    expect(STOREFRONT_RUNTIME_JS).toContain("data-catalog-search-close");
    expect(STOREFRONT_RUNTIME_JS).toContain("catalog-search-open");
  });

  it("el catálogo client-side no hace fetch embebido en el preview del Studio", () => {
    // Regresión 2026-09-04: en el iframe del preview no se sirve search-index.json
    // y el fetch terminaba en alerta de error; se conserva el estado estático.
    expect(STOREFRONT_RUNTIME_JS).toContain("} else if (!embed) {");
  });

  it("conecta los controles de testimonios con su fila desplazable", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain("data-testimonials-prev");
    expect(STOREFRONT_RUNTIME_JS).toContain("data-testimonials-next");
    expect(STOREFRONT_RUNTIME_JS).toContain("scrollLeft");
  });

  it("serializa el capability del formulario de Contacto hacia email", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain("connectContactForms");
    expect(STOREFRONT_RUNTIME_JS).toContain("data-solara-contact-form");
    expect(STOREFRONT_RUNTIME_JS).toContain("contactEmail");
    expect(STOREFRONT_RUNTIME_JS).toContain("encodeURIComponent");
    expect(STOREFRONT_RUNTIME_JS).toContain("mailto:");
    expect(STOREFRONT_RUNTIME_JS).not.toContain("replaceChildren(k.success)");
  });

  it("serializa los helpers de búsqueda dentro del runtime público", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain("function levenshtein");
    expect(STOREFRONT_RUNTIME_JS).toContain("function scoreEntry");
    expect(STOREFRONT_RUNTIME_JS).toContain("function normalizeSearchTokens");
    expect(STOREFRONT_RUNTIME_JS).not.toContain("const matchToken = function matchToken");
    expect(STOREFRONT_RUNTIME_JS).toContain("storefrontBoot");
  });

  it("expone los helpers de búsqueda por un nombre canónico estable", () => {
    // La cadena debe definir bindings con nombre fijo (sobreviven minificación y
    // transpilación CJS) y el boot debe accederlos vía globalThis, nunca a
    // través de referencias de módulo que se reescriben al serializar.
    expect(STOREFRONT_RUNTIME_JS).toContain(
      "const normalizeSearchTokens = function normalizeSearchTokens",
    );
    expect(STOREFRONT_RUNTIME_JS).toContain("const scoreEntry = function scoreEntry");
    expect(STOREFRONT_RUNTIME_JS).toContain(
      "globalThis.__solaraSearchHelpers = { normalizeSearchTokens, levenshtein, scoreEntry }",
    );
    expect(STOREFRONT_RUNTIME_JS).toContain("searchApi.normalizeSearchTokens");
    expect(STOREFRONT_RUNTIME_JS).toContain("searchApi.scoreEntry");
    expect(STOREFRONT_RUNTIME_JS).not.toContain("__solaraSearchHelpers.__solaraSearchHelpers");
  });

  it("convierte el CTA del carrito en una salida útil cuando está vacío", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain("data-cart-cta");
    expect(STOREFRONT_RUNTIME_JS).toContain("i !== +!!count");
  });

  it("mantiene el runtime por debajo del límite público de 80 KiB crudos", () => {
    // Task 9: skeletons de búsqueda, contador visible, título con query y guards del índice suman ~450 B; tope 68 KiB autorizado por el brief.
    // 2026-09-04: checkout WhatsApp multiparte (spec docs/superpowers/specs/2026-09-04-whatsapp-multiparte-design.md):
    // splitOrderParts + 9 helpers + máquina de estados del drawer suman ~8,7 KB reales; tope 80 KiB con margen ~4 KiB.
    expect(Buffer.byteLength(STOREFRONT_RUNTIME_JS, "utf8")).toBeLessThanOrEqual(80 * 1024);
  });
});

describe("hero V2 sin parallax de cursor (media estática)", () => {
  it("no serializa el follower de cursor del hero", () => {
    expect(STOREFRONT_RUNTIME_JS).not.toContain("connectHeroParallax");
    expect(STOREFRONT_RUNTIME_JS).not.toContain('addEventListener("pointermove"');
    expect(STOREFRONT_RUNTIME_JS).not.toContain('"[data-hero-media]"');
  });

  it("no introduce scroll ni entrada táctil", () => {
    expect(STOREFRONT_RUNTIME_JS).not.toContain("scrollY");
    expect(STOREFRONT_RUNTIME_JS).not.toContain('addEventListener("wheel"');
    expect(STOREFRONT_RUNTIME_JS).not.toContain('addEventListener("touchstart"');
  });
});

describe("fill-mode de los presets de motion", () => {
  const runtime = STOREFRONT_RUNTIME_CSS;
  const motionShorthand = (keyframe: string, delay = true) =>
    `animation: ${keyframe} var(--motion-duration, 600ms) var(--motion-easing, cubic-bezier(.16, 1, .3, 1))${
      delay ? " var(--motion-delay, 0ms)" : ""
    } backwards;`;

  it("los presets de entrada usan backwards y no congelan el hover", () => {
    const entrance = new Map<string, string>([
      ["fade", motionShorthand("solara-motion-fade")],
      ["fade-up", motionShorthand("solara-motion-fade-up")],
      ["slide", motionShorthand("solara-motion-slide")],
      ["scale", motionShorthand("solara-motion-scale")],
      // La regla de stagger no lleva delay en el shorthand.
      ["stagger", motionShorthand("solara-motion-fade-up", false)],
    ]);
    for (const [preset, rule] of entrance) {
      expect(runtime, `preset de entrada ${preset}`).toContain(rule);
    }
  });

  it("los presets scroll-driven conservan both", () => {
    expect(runtime).toContain("animation: solara-parallax linear both;");
    expect(runtime).toContain("animation: solara-progress linear both;");
  });

  it("deja both sólo en las reglas scroll-driven", () => {
    expect(runtime.match(/\bboth\b/g)?.length).toBe(2);
  });
});

describe("carrito robusto y checkout con precios frescos (C2/C3/C5/C9 + SF-B4/B5/B10)", () => {
  it("parseCart descarta líneas corruptas sin lanzar (C3)", () => {
    const lines = parseCart([
      {
        variantId: "v1",
        quantity: 2,
        title: "Manta Bruma",
        variantTitle: "Musgo",
        sku: "ML-BRU-MUS",
        unitPrice: 100,
      },
      { variantId: "v2", quantity: 1 },
      { variantId: "v3", quantity: 0 },
      { variantId: "v4", quantity: "dos" },
      "basura",
      null,
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual(
      expect.objectContaining({ variantId: "v1", quantity: 2, title: "Manta Bruma" }),
    );
  });

  it("intercepta el submit del form de agregar para no recargar el carrito (C2)", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain("data-solara-add-form");
    expect(STOREFRONT_RUNTIME_JS).toContain('addEventListener("submit"');
  });

  it("sincroniza aria-expanded del toggle de carrito al abrir y cerrar (C5)", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain("data-solara-cart-open");
    expect(STOREFRONT_RUNTIME_JS).toContain("syncCartToggleExpanded");
  });

  it("anuncia los totales del carrito con aria-live (SF-B10)", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain('setAttribute("aria-live", "polite")');
  });

  it("conserva el label de acción custom del módulo en syncVariant (SF-B5)", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain("initialAddLabels");
    expect(STOREFRONT_RUNTIME_JS).toContain("p.noStock");
  });

  it("normaliza el input inválido al perder foco sin interrumpir la edición vacía", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain("normalizeCartQuantity");
    expect(STOREFRONT_RUNTIME_JS).toContain("if (!restoreInvalid) return;");
    expect(STOREFRONT_RUNTIME_JS).toContain("input.value = String(quantity)");
  });

  it("reconcilia el carrito compartido al abrir el drawer y al enviar (SF-B4)", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain("reconcileCart");
    expect(STOREFRONT_RUNTIME_JS).toContain("catalog-index.json");
  });

  it("refresca el carrito persistido antes de agregar desde una página restaurada", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain("if (!embed) cart = readStoredCart();");
  });

  it("aísla el almacenamiento local cuando el storefront está embebido", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain("const embed = parent !== window;");
    expect(STOREFRONT_RUNTIME_JS).toContain("if (!embed) cart = readStoredCart();");
  });

  it("protege el estado del preview contra iframes y escrituras iniciales obsoletas", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain("dataset.hydrated");
    expect(STOREFRONT_RUNTIME_JS).toContain('type: "solara-preview-cart-write"');
    expect(STOREFRONT_RUNTIME_JS).toContain('addEventListener("pagehide"');
    expect(STOREFRONT_RUNTIME_JS).toContain("backupKey");
  });

  it("no vacía el carrito ante un índice de catálogo vacío", () => {
    expect(STOREFRONT_RUNTIME_JS).not.toContain("catalog.length === 0 && cart.length > 0");
    expect(STOREFRONT_RUNTIME_JS).toContain("!Array.isArray(catalog)");
    expect(STOREFRONT_RUNTIME_JS).toContain("renderCart(false)");
  });
});

describe("carrito sin líneas fantasma y conteos honestos (F-04, SF-B7, SF-B8, C6, NG-4)", () => {
  it("reconcilia sin descartar: la línea sin variante en el catálogo queda marcada no disponible (F-04)", () => {
    const line = {
      productId: "p1",
      variantId: "v-retirada",
      title: "Manta Bruma",
      variantTitle: "Musgo",
      sku: "ML-BRU-MUS",
      unitPrice: 157000,
      quantity: 2,
    };
    const reconciled = reconcileCartLines(
      [line],
      [
        {
          productId: "p2",
          variantId: "v-activa",
          title: "Manta Luna",
          variantTitle: "Sombra",
          sku: "ML-BRU-LUN",
          price: 165000,
          available: true,
        },
      ],
    );
    expect(reconciled).toHaveLength(1);
    expect(reconciled[0]).toEqual(
      expect.objectContaining({ variantId: "v-retirada", available: false, quantity: 2 }),
    );
    const refreshed = reconcileCartLines(
      [{ ...line, variantId: "v-activa" }],
      [
        {
          productId: "p2",
          variantId: "v-activa",
          title: "Manta Luna",
          variantTitle: "Sombra",
          sku: "ML-BRU-LUN",
          price: 165000,
          available: true,
        },
      ],
    );
    expect(refreshed[0]).toEqual(
      expect.objectContaining({ variantId: "v-activa", available: true, unitPrice: 165000 }),
    );
    expect(STOREFRONT_RUNTIME_JS).toContain("a.unavailable");
    expect(STOREFRONT_RUNTIME_JS).not.toContain("line.variantId in byVariant");
  });

  it("el conteo de categoría usa data-category-total sin pisar el total (SF-B8)", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain('getAttribute("data-category-total")');
    expect(STOREFRONT_RUNTIME_JS).toContain(
      ["de ", "$", "{total} ", "$", "{f.resultCount}"].join(""),
    );
  });

  it("limita la búsqueda a 48 resultados antes de aplicar sus filtros (SF-B7)", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain("slice(0, 48)");
  });

  it("la trampa del drawer atiende carrito o checkout (C6)", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain(
      'if (!hasFeature("cart") && !hasFeature("checkout")) return;',
    );
  });

  it("el input de cantidad del drawer arranca en 1 (NG-4)", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain("min: 1");
    expect(STOREFRONT_RUNTIME_JS).toContain("max: 99");
  });

  it("el menú móvil inertea a sus hermanos al abrir y los libera al cerrar (SF-B13)", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain("modernMenuSiblings");
    expect(STOREFRONT_RUNTIME_JS).toContain('sibling.setAttribute("inert", "")');
    expect(STOREFRONT_RUNTIME_JS).toContain('sibling.removeAttribute("inert")');
  });
});

describe("motion direction de slide (SF-B6)", () => {
  it("slide respeta up, down y right además de left", () => {
    expect(STOREFRONT_RUNTIME_CSS).toContain('[data-motion-direction="up"]');
    expect(STOREFRONT_RUNTIME_CSS).toContain('[data-motion-direction="down"]');
    expect(STOREFRONT_RUNTIME_CSS).toContain('[data-motion-direction="right"]');
    expect(STOREFRONT_RUNTIME_CSS).toContain("--motion-slide-y");
  });

  it("fade-up conserva su movimiento vertical propio", () => {
    expect(STOREFRONT_RUNTIME_CSS).toContain("@keyframes solara-motion-fade-up");
  });
});

describe("pausa y reanudación del runtime (contrato A3↔A4)", () => {
  it("se pausa y reanuda con mensajes postMessage del padre", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain('"solara-pause"');
    expect(STOREFRONT_RUNTIME_JS).toContain('"solara-resume"');
    expect(STOREFRONT_RUNTIME_JS).toContain('addEventListener("message"');
    expect(STOREFRONT_RUNTIME_JS).toContain("event.source !== parent");
  });

  it("pausa el trabajo con la visibilidad del documento con un listener pasivo", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain(
      'addEventListener("visibilitychange", onVisibility, { passive: true })',
    );
  });

  it("registra los listeners de scroll como pasivos", () => {
    const registration = STOREFRONT_RUNTIME_JS.match(/addEventListener\("scroll",[^;]*\)/)?.[0];
    expect(registration).toContain("{ passive: true }");
  });

  it("re-sincroniza variantes y carrito al reanudar", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain("connectMotion()");
    expect(STOREFRONT_RUNTIME_JS).toContain("freshCatalog = null");
  });

  it("no vuelve a reproducir appear one-shot al reanudar el preview", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain("motionSeen =");
    expect(STOREFRONT_RUNTIME_JS).toContain("new WeakSet");
    expect(STOREFRONT_RUNTIME_JS).toContain("motionSeen.has(element)");
    expect(STOREFRONT_RUNTIME_JS).toContain("if (motionObservers.length > 0) return");
  });

  it("vincula la escritura del carrito embebido a la sesion activa del preview", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain("session: previewCartElement?.dataset.session");
  });

  it("mueve testimonios con scroll suave y expone el estado disabled", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain("scrollBy({");
    expect(STOREFRONT_RUNTIME_JS).toContain(
      'behavior: matchMedia("(prefers-reduced-motion: reduce)")',
    );
    expect(STOREFRONT_RUNTIME_JS).toContain('setAttribute("aria-disabled"');
  });

  it("declara sizes compactos para la grilla de resultados de búsqueda", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain(
      'sizes: "(max-width: 767px) 46vw, (max-width: 1199px) 18rem, 13rem"',
    );
  });
});

describe("carrito y checkout del drawer (A29)", () => {
  it("refleja el conteo en el badge y en el aria-label del trigger", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain("count > 99");
    expect(STOREFRONT_RUNTIME_JS).toContain("99+");
    expect(STOREFRONT_RUNTIME_JS).toContain(
      'element.setAttribute("aria-label", `${label} ${count}`)',
    );
    expect(STOREFRONT_RUNTIME_JS).not.toContain("`${label} vacío`");
    expect(STOREFRONT_RUNTIME_JS).not.toContain("`${label}, ${count} productos`");
  });

  it("marca el drawer cuando el carrito está vacío para compactar su estado", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain(
      "drawer.dataset.cartEmpty = String(cart.length === 0);",
    );
  });

  it("cierra el drawer con Escape y devuelve el foco al trigger", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain('event.key === "Escape"');
    expect(STOREFRONT_RUNTIME_JS).toContain("trigger ?? document.activeElement");
    expect(STOREFRONT_RUNTIME_JS).toContain("lastCartTrigger?.focus({ preventScroll: true })");
    expect(STOREFRONT_RUNTIME_JS).toContain("syncCartToggleExpanded(false)");
  });

  it("bloquea el scroll de la página mientras el drawer está abierto y lo restaura al cerrar", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain("lockCartPageScroll()");
    expect(STOREFRONT_RUNTIME_JS).toContain("unlockCartPageScroll()");
    expect(STOREFRONT_RUNTIME_JS).toContain('document.body.style.position = "fixed"');
    expect(STOREFRONT_RUNTIME_JS).toContain("window.scrollTo(0, cartScrollLockOffset)");
    expect(STOREFRONT_RUNTIME_CSS).toContain("overscroll-behavior: contain");
  });

  it("conserva el cierre del drawer y la persistencia del carrito", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain('target.closest("[data-close-cart]")');
    expect(STOREFRONT_RUNTIME_JS).toContain("renderCart(true)");
  });

  it("quita líneas por data-cart-remove y persiste el carrito", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain('"data-cart-remove": line.variantId');
    expect(STOREFRONT_RUNTIME_JS).toContain(
      "cart = cart.filter((line) => line.variantId !== variantId)",
    );
  });

  it("bloquea el checkout con role=alert y conserva la línea no disponible", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain("x.invalidItems");
    expect(STOREFRONT_RUNTIME_JS).toContain("a.phoneInvalid || x.invalidItems");
    expect(STOREFRONT_RUNTIME_JS).toContain('setAttribute("role", "alert")');
    // El bloqueo ahora da feedback visible (emptyCart con role=alert) antes de
    // validar el formulario, en lugar de un return silencioso combinado.
    expect(STOREFRONT_RUNTIME_JS).toContain("if (cart.length === 0) {");
    expect(STOREFRONT_RUNTIME_JS).toContain("if (!form.reportValidity()) return;");
  });

  it("construye la URL wa.me con tel\u00E9fono normalizado y totales en centavos", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain("https://wa.me/");
    expect(STOREFRONT_RUNTIME_JS).toContain("encodeURIComponent(message)");
    expect(STOREFRONT_RUNTIME_JS).toContain('replace(/\\D/g, "")');
    expect(STOREFRONT_RUNTIME_JS).toContain("buildWhatsAppUrl(phone, message)");
    expect(STOREFRONT_RUNTIME_JS).toContain("copy.total");
    expect(STOREFRONT_RUNTIME_JS).toContain("pub.checkout.disclaimer");
  });

  it("acota la cantidad editada y el agregado a 1–99", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain("const quantity = normalizeCartQuantity(parsed);");
    expect(STOREFRONT_RUNTIME_JS).toContain(
      'const quantity = normalizeCartQuantity(quantityInput?.value ?? "1");',
    );
    expect(STOREFRONT_RUNTIME_JS).toContain("quantityInput.value = String(quantity)");
  });
});

describe("fixmes del barrido A29 (index.ts)", () => {
  it("envía los formularios de búsqueda con Enter", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain("submitSearchOnEnter");
    expect(STOREFRONT_RUNTIME_JS).toContain("requestSubmit");
  });

  it("actualiza la cantidad del carrito mientras se edita", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain('document.addEventListener("input"');
    expect(STOREFRONT_RUNTIME_JS).toContain("updateCartQuantity");
  });

  it("el drawer de carrito inertea a los hermanos al abrir y los libera al cerrar", () => {
    expect(STOREFRONT_RUNTIME_JS.match(/pageSiblingsOf\(drawer\)/g)?.length).toBe(2);
    expect(STOREFRONT_RUNTIME_JS).toContain('s2.setAttribute("inert", "")');
    expect(STOREFRONT_RUNTIME_JS).toContain('s2.removeAttribute("inert")');
  });

  it("la búsqueda guarda por término: un término de 1 carácter corta el query", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain("terms.some((t) => t.length < 2)");
  });

  it("el conteo de categoría anuncia con aria-live al filtrar", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain('resultCount?.setAttribute("aria-live", "polite")');
  });

  it("en /buscar/ el binding usa el input visible de la página, no el del diálogo", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain('document.querySelector("#solara-search-input")');
    expect(STOREFRONT_RUNTIME_JS).not.toContain('"#catalog-search-input, #solara-search-input"');
  });
});

describe("ux pública: a11y carrito, búsqueda con estado y memo del índice (auditoría 2)", () => {
  it("muestra 8 skeletons de búsqueda al cargar y los reemplaza al resolver", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain("solara-skeleton");
    expect(STOREFRONT_RUNTIME_JS).toContain("showSearchSkeletons()");
    expect(STOREFRONT_RUNTIME_JS).toContain("length: 8");
    const idxSkeletons = STOREFRONT_RUNTIME_JS.indexOf("const showSearchSkeletons");
    const idxLoading = STOREFRONT_RUNTIME_JS.indexOf("showSearchSkeletons();");
    const idxFetch = STOREFRONT_RUNTIME_JS.indexOf("fetch(`${baseHref}/search-index.json`");
    expect(idxSkeletons).toBeGreaterThan(-1);
    expect(idxLoading).toBeGreaterThan(idxSkeletons);
    expect(idxFetch).toBeGreaterThan(idxLoading);
    expect(STOREFRONT_RUNTIME_CSS).toContain(".solara-skeleton");
    expect(STOREFRONT_RUNTIME_CSS).toContain("@keyframes solara-shimmer");
    expect(STOREFRONT_RUNTIME_CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.solara-skeleton[\s\S]*animation: none/,
    );
  });

  it("el skeleton de búsqueda replica la estructura de la card para evitar CLS", () => {
    // Piezas: bloque de imagen cuadrado (aspect-ratio 1) + líneas de texto.
    expect(STOREFRONT_RUNTIME_JS).toContain("solara-skeleton--media");
    expect(STOREFRONT_RUNTIME_JS).toContain("solara-skeleton--line");
    expect(STOREFRONT_RUNTIME_CSS).toMatch(/\.solara-skeleton--media \{[^}]*aspect-ratio: 1/);
    expect(STOREFRONT_RUNTIME_CSS).toMatch(/\.solara-skeleton--line \{[^}]*height:/);
    // El bloque plano ya no fuerza una altura mínima propia: la da la estructura.
    expect(STOREFRONT_RUNTIME_CSS).not.toMatch(/\.solara-skeleton \{[^}]*min-height/);
  });

  it("anuncia el total recortado cuando hay más de 48 resultados", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain("ranked.length > 48");
    expect(STOREFRONT_RUNTIME_JS).toContain("`Mostrando 48 de ${ranked.length} resultados`");
  });

  it("refleja la query en el título de la página de búsqueda", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain("document.title = `Búsqueda: ${query} | ${brand}`");
  });

  it("no invalida el índice del catálogo cuando el carrito está vacío", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain("if (cart.length > 0) freshCatalog = null;");
    expect(STOREFRONT_RUNTIME_JS).toContain(
      '(pageType === "cart" || pageType === "checkout") && cart.length > 0',
    );
  });
});
