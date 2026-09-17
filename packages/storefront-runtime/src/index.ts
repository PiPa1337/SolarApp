/**
 * Mejora progresiva del storefront: carrito local, variantes, búsqueda, menú,
 * movimiento y WhatsApp. Se activa por capacidades presentes en el HTML y debe
 * dejar contenido y navegación utilizables cuando JavaScript falla.
 */
import type { Product, PublicCopy, StoreProjectV1, Variant } from "@solara/project-schema";
import { personalizeWhatsAppGreeting } from "@solara/project-schema";
import { levenshtein, normalizeSearchTokens, type SearchEntryTokens, scoreEntry } from "./search";

export const MAX_APP_FPS = 140;

export interface FrameRateCapTarget {
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (handle: number) => void;
  setTimeout: (handler: () => void, timeout?: number) => number;
  clearTimeout: (handle: number) => void;
  __solaraFrameRateCap?: { maxFps: number; frameIntervalMs: number };
}

/**
 * Limita los callbacks JavaScript de animación sin mantener un frame loop cuando
 * no hay trabajo pendiente. El compositor del navegador sigue sincronizado con
 * el monitor; este guard evita que un loop accidental consuma más de 140 FPS.
 */
export function installFrameRateCap(target: FrameRateCapTarget, maxFps = MAX_APP_FPS): void {
  if (target.__solaraFrameRateCap) return;
  if (!Number.isFinite(maxFps) || maxFps <= 0) {
    throw new Error("El límite de FPS debe ser un número positivo.");
  }

  const frameIntervalMs = 1000 / maxFps;
  const nativeRequestAnimationFrame = target.requestAnimationFrame.bind(target);
  const nativeCancelAnimationFrame = target.cancelAnimationFrame.bind(target);
  let nextHandle = 1;
  let lastFrameAt = Number.NEGATIVE_INFINITY;
  let nativeFrameHandle: number | null = null;
  let timerHandle: number | null = null;
  const callbacks = new Map<number, FrameRequestCallback>();

  const schedule = (): void => {
    if (callbacks.size === 0 || nativeFrameHandle !== null || timerHandle !== null) return;
    nativeFrameHandle = nativeRequestAnimationFrame((timestamp) => {
      nativeFrameHandle = null;
      const elapsed = timestamp - lastFrameAt;
      if (elapsed < frameIntervalMs) {
        timerHandle = target.setTimeout(() => {
          timerHandle = null;
          schedule();
        }, frameIntervalMs - elapsed);
        return;
      }

      lastFrameAt = timestamp;
      const batch = [...callbacks.values()];
      callbacks.clear();
      for (const callback of batch) {
        try {
          callback(timestamp);
        } catch (error) {
          queueMicrotask(() => {
            throw error;
          });
        }
      }
      schedule();
    });
  };

  target.requestAnimationFrame = (callback) => {
    const handle = nextHandle;
    nextHandle += 1;
    callbacks.set(handle, callback);
    schedule();
    return handle;
  };
  target.cancelAnimationFrame = (handle) => {
    callbacks.delete(handle);
    if (callbacks.size > 0) return;
    if (nativeFrameHandle !== null) {
      nativeCancelAnimationFrame(nativeFrameHandle);
      nativeFrameHandle = null;
    }
    if (timerHandle !== null) {
      target.clearTimeout(timerHandle);
      timerHandle = null;
    }
  };
  target.__solaraFrameRateCap = { maxFps, frameIntervalMs };
}

const DEFAULT_CONTACT_COPY = {
  email: "Email",
  phone: "Teléfono",
  message: "Mensaje",
};
const DEFAULT_WHATSAPP_ASK = "Hola {storeName}, quiero hacer una consulta.";

interface SearchApi {
  normalizeSearchTokens: (value: string) => string[];
  levenshtein: (a: string, b: string) => number;
  scoreEntry: (queryTerms: readonly string[], entry: SearchEntryTokens) => number;
}

export interface CartLine {
  productId: string;
  variantId: string;
  title: string;
  variantTitle: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  imageUrl?: string;
}

export interface StoredCartLine extends CartLine {
  imageWidth?: number;
  imageHeight?: number;
  available?: boolean;
}

export interface CatalogIndexEntry {
  productId: string;
  variantId: string;
  title: string;
  variantTitle: string;
  sku: string;
  price: number;
  available: boolean;
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
}

/**
 * Mantiene todas las entradas de cantidad dentro del contrato comercial del
 * storefront. Los valores vacíos o no numéricos vuelven a una unidad, los
 * decimales se truncan y el máximo evita cantidades que el checkout no puede
 * representar de forma segura.
 */
export function normalizeCartQuantity(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(99, Math.trunc(parsed))) : 1;
}

function safeRuntimeImageUrl(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return "";
  return /^(?:\/(?!\/)|https?:\/\/|data:image\/(?:avif|gif|jpe?g|png|webp);base64,)/i.test(value)
    ? value
    : "";
}

function boundedRuntimeString(value: unknown, max: number, min = 0): value is string {
  return typeof value === "string" && value.length > min && value.length <= max;
}

function validRuntimeDimension(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 32768)
  );
}

function validRuntimeStringArray(value: unknown, maxItems: number, maxString: number): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.length <= maxItems &&
      value.every((item) => boundedRuntimeString(item, maxString, -1)))
  );
}

function validRuntimeSearchTokens(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== "object" || value === null) return false;
  const tokens = value as Record<string, unknown>;
  return ["title", "brand", "tags", "categories", "description"].every((key) =>
    validRuntimeStringArray(tokens[key], 256, 120),
  );
}

function validCatalogIndexEntry(entry: unknown): entry is CatalogIndexEntry {
  if (typeof entry !== "object" || entry === null) return false;
  const value = entry as CatalogIndexEntry;
  return (
    boundedRuntimeString(value.productId, 128) &&
    typeof value.price === "number" &&
    Number.isInteger(value.price) &&
    value.price >= 0 &&
    value.price <= Number.MAX_SAFE_INTEGER &&
    typeof value.available === "boolean" &&
    parseCart([{ ...value, unitPrice: value.price, quantity: 1 }]).length === 1
  );
}

/**
 * Reconciles stored cart lines against the current catalog index. Lines whose
 * variant no longer exists are kept but marked unavailable so the buyer can
 * see and remove them; found lines get fresh identity, price and availability.
 */
export function reconcileCartLines(
  cart: StoredCartLine[],
  catalog: CatalogIndexEntry[],
): StoredCartLine[] {
  const byVariant = new Map(catalog.map((entry) => [entry.variantId, entry]));
  const merged = new Map<string, StoredCartLine>();
  for (const line of cart) {
    const current = byVariant.get(line.variantId);
    let reconciled: StoredCartLine;
    if (!current) {
      reconciled = { ...line, available: false };
    } else {
      // Limpia imagen fantasma: si el catalogo ya no tiene imagen, no conservar la vieja.
      reconciled = {
        ...line,
        productId: current.productId,
        title: current.title,
        variantTitle: current.variantTitle,
        sku: current.sku,
        unitPrice: current.price,
        available: current.available,
      };
      if (current.imageUrl) reconciled.imageUrl = current.imageUrl;
      else delete (reconciled as any).imageUrl;
      if (current.imageWidth) reconciled.imageWidth = current.imageWidth;
      else delete (reconciled as any).imageWidth;
      if (current.imageHeight) reconciled.imageHeight = current.imageHeight;
      else delete (reconciled as any).imageHeight;
    }
    const existing = merged.get(reconciled.variantId);
    if (existing) existing.quantity = Math.min(99, existing.quantity + reconciled.quantity);
    else merged.set(reconciled.variantId, reconciled);
  }
  return [...merged.values()];
}

/** Compara sólo los campos que tienen significado comercial en el carrito. */
function cartLinesEqual(
  left: readonly StoredCartLine[],
  right: readonly StoredCartLine[],
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  return left.every((line, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      line.productId === other.productId &&
      line.variantId === other.variantId &&
      line.title === other.title &&
      line.variantTitle === other.variantTitle &&
      line.sku === other.sku &&
      line.unitPrice === other.unitPrice &&
      line.quantity === other.quantity &&
      line.imageUrl === other.imageUrl &&
      line.imageWidth === other.imageWidth &&
      line.imageHeight === other.imageHeight &&
      line.available === other.available
    );
  });
}

export function parseCart(stored: unknown): StoredCartLine[] {
  if (!Array.isArray(stored)) return [];
  return stored.filter((line): line is StoredCartLine => {
    if (typeof line !== "object" || line === null) return false;
    const value = line as StoredCartLine;
    return (
      (value.productId === undefined || boundedRuntimeString(value.productId, 128)) &&
      boundedRuntimeString(value.variantId, 128) &&
      boundedRuntimeString(value.title, 240, -1) &&
      boundedRuntimeString(value.variantTitle, 160, -1) &&
      boundedRuntimeString(value.sku, 120, -1) &&
      typeof value.unitPrice === "number" &&
      Number.isFinite(value.unitPrice) &&
      Number.isInteger(value.unitPrice) &&
      value.unitPrice >= 0 &&
      value.unitPrice <= Number.MAX_SAFE_INTEGER &&
      typeof value.quantity === "number" &&
      Number.isFinite(value.quantity) &&
      Number.isInteger(value.quantity) &&
      value.quantity >= 1 &&
      value.quantity <= 99 &&
      (value.available === undefined || typeof value.available === "boolean") &&
      (value.imageUrl === undefined ||
        value.imageUrl === "" ||
        safeRuntimeImageUrl(value.imageUrl) !== "") &&
      validRuntimeDimension(value.imageWidth) &&
      validRuntimeDimension(value.imageHeight)
    );
  });
}

export interface CustomerDetails {
  name: string;
  phone: string;
  address: string;
  locality?: string;
  postalCode?: string;
  notes: string;
}

export interface ContactFormDetails {
  name: string;
  email: string;
  phone: string;
  message: string;
}

function getContactLines(
  brandName: string,
  details: ContactFormDetails,
  publicCopy?: Pick<PublicCopy, "contact" | "whatsapp">,
): string[] {
  const whatsappCopy = publicCopy?.whatsapp;
  const contactCopy = publicCopy?.contact ?? DEFAULT_CONTACT_COPY;
  const fields: Array<[string, string]> = [
    [whatsappCopy?.customerName ?? "Nombre", details.name],
    [contactCopy.email, details.email],
    [whatsappCopy?.customerPhone ?? (contactCopy as any).phone ?? "Teléfono", details.phone],
    [contactCopy.message, details.message],
  ];
  return [
    (whatsappCopy?.ask ?? DEFAULT_WHATSAPP_ASK).replace("{storeName}", brandName.trim()),
    ...fields
      .filter((entry) => entry[1].trim().length > 0)
      .map(([label, value]) => `${label}: ${value.trim()}`),
  ];
}

export function buildContactMailto(
  email: string,
  brandName: string,
  details: ContactFormDetails,
  publicCopy?: Pick<PublicCopy, "contact" | "whatsapp">,
): string {
  const lines = getContactLines(brandName, details, publicCopy);
  const subjectTemplate = publicCopy?.contact?.emailSubject ?? "Consulta para {storeName}";
  const subject = subjectTemplate.replace("{storeName}", brandName.trim());
  return `mailto:${email.trim()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
}

export function buildContactWhatsAppMessage(
  brandName: string,
  details: ContactFormDetails,
  publicCopy?: Pick<PublicCopy, "contact" | "whatsapp">,
): string {
  return getContactLines(brandName, details, publicCopy).join("\n");
}

export function buildContactWhatsAppUrl(
  phone: string,
  brandName: string,
  details: ContactFormDetails,
  publicCopy?: Pick<PublicCopy, "contact" | "whatsapp">,
): string {
  const message = buildContactWhatsAppMessage(brandName, details, publicCopy);
  return buildWhatsAppUrl(phone, message);
}

export function formatMoney(
  cents: number,
  currency = "ARS",
  locale = "es-AR",
  priceFractionDisplay: "always" | "auto" = "always",
): string {
  const fractionDigits = priceFractionDisplay === "auto" && cents % 100 === 0 ? 0 : 2;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(cents / 100);
}

export function buildCartLine(product: Product, variant: Variant, quantity = 1): CartLine {
  return {
    productId: product.id,
    variantId: variant.id,
    title: product.title,
    variantTitle: variant.title,
    sku: variant.sku,
    unitPrice: variant.price,
    quantity,
  };
}

export type WhatsAppMessageProject = Pick<StoreProjectV1, "publicCopy"> & {
  currency: string;
  locale: string;
  whatsapp: Pick<StoreProjectV1["whatsapp"], "greeting">;
  identity?: Pick<StoreProjectV1["identity"], "brandName">;
  priceFractionDisplay?: "always" | "auto";
};

export function sanitizeWhatsAppText(value: unknown): string {
  return String(value ?? "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function foldWhatsAppAccents(value: string): string {
  return value
    .replace(/ñ/g, "n~")
    .replace(/Ñ/g, "N~")
    .normalize("NFD")
    .replace(/[^ -~]/g, "")
    .replace(/n~/g, "ñ")
    .replace(/N~/g, "Ñ");
}

function isDefaultVariantTitle(value: string): boolean {
  return /^(unic[oa])$/.test(foldWhatsAppAccents(value).toLowerCase());
}

function renderWhatsAppLine(line: CartLine, money: (cents: number) => string): string {
  const title = foldWhatsAppAccents(sanitizeWhatsAppText(line.title));
  const variant = foldWhatsAppAccents(sanitizeWhatsAppText(line.variantTitle));
  const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const showVariant =
    variant !== "" &&
    !isDefaultVariantTitle(variant) &&
    !new RegExp(`\\b${escaped}\\b`, "i").test(title);
  const quantity = line.quantity === 1 ? "" : `${line.quantity}x `;
  return `- ${quantity}${title}${showVariant ? ` (${variant})` : ""} = ${money(line.unitPrice * line.quantity)}`;
}

function mergeWhatsAppLines(lines: CartLine[]): { merged: CartLine[]; total: number } {
  const merged = new Map<string, CartLine>();
  let total = 0;
  for (const line of lines) {
    total += line.unitPrice * line.quantity;
    const key = `${line.productId}\n${line.variantId}`;
    const existing = merged.get(key);
    if (existing) existing.quantity += line.quantity;
    else merged.set(key, { ...line });
  }
  return { merged: [...merged.values()], total };
}

export function orderFingerprint(lines: CartLine[]): string {
  const keys = lines.map(
    (line) => `${line.productId}\n${line.variantId}\n${line.quantity}\n${line.unitPrice}`,
  );
  keys.sort();
  const joined = keys.join("\n");
  let hash = 5381;
  for (let index = 0; index < joined.length; index += 1)
    hash = ((hash * 33) ^ joined.charCodeAt(index)) >>> 0;
  return hash.toString(16).toUpperCase().padStart(4, "0").slice(-4);
}

function resolveWhatsAppGreeting(project: WhatsAppMessageProject): string {
  let greeting = project.whatsapp.greeting.trim();
  const brand = project.identity?.brandName?.trim() ?? "";
  if (brand) greeting = personalizeWhatsAppGreeting(greeting, brand);
  return greeting;
}

function renderWhatsAppCustomer(
  project: WhatsAppMessageProject,
  customer: CustomerDetails,
): string[] {
  const copy = project.publicCopy.whatsapp;
  const pub = project.publicCopy;
  return [
    `${copy.customerName}: ${customer.name.trim()}`,
    `${copy.customerPhone}: ${customer.phone.trim()}`,
    `${copy.delivery}: ${customer.address.trim()}`,
    customer.locality?.trim() ? `${pub.cart.locality}: ${customer.locality.trim()}` : "",
    customer.postalCode?.trim() ? `${pub.cart.postalCode}: ${customer.postalCode.trim()}` : "",
    customer.notes.trim() ? `${copy.notes}: ${customer.notes.trim()}` : "",
  ];
}

function renderWhatsAppDisclaimer(project: WhatsAppMessageProject): string {
  const copy = project.publicCopy.whatsapp;
  const pub = project.publicCopy;
  return `El envío se coordina por este chat. ${pub.checkout.disclaimer || copy.confirmation}\n${pub.checkout.verificationWarning || ""}`;
}

export function buildWhatsAppMessage(
  project: WhatsAppMessageProject,
  lines: CartLine[],
  customer: CustomerDetails,
): string {
  const copy = project.publicCopy.whatsapp;
  const money = (cents: number): string =>
    formatMoney(cents, project.currency, project.locale, project.priceFractionDisplay ?? "always");
  const { merged, total } = mergeWhatsAppLines(lines);
  return [
    resolveWhatsAppGreeting(project),
    "",
    ...merged.map((line) => renderWhatsAppLine(line, money)),
    "",
    `${copy.total}: ${money(total)}`,
    "",
    ...renderWhatsAppCustomer(project, customer),
    "",
    renderWhatsAppDisclaimer(project),
  ]
    .filter((line, index, all) => line !== "" || all[index - 1] !== "")
    .join("\n")
    .trim();
}

export function splitOrderParts(
  project: WhatsAppMessageProject,
  lines: CartLine[],
  customer: CustomerDetails,
): string[] {
  const money = (cents: number): string =>
    formatMoney(cents, project.currency, project.locale, project.priceFractionDisplay ?? "always");
  const { merged, total } = mergeWhatsAppLines(lines);
  const fingerprint = orderFingerprint(merged);
  // 3860 deja ~40 chars para https://wa.me/<teléfono>?text= dentro del tope de 3900 de URL.
  const messageBudget = 3860;
  const maxLines = 50;
  const maxParts = 12;
  const header = (part: number, parts: number): string =>
    `*Pedido #${fingerprint} · Parte ${part} de ${parts}*`;
  const fits = (chunk: CartLine[]): boolean => {
    if (chunk.length > maxLines) return false;
    const text = [
      header(99, 99),
      greetingLine,
      "",
      ...chunk.map((line) => renderWhatsAppLine(line, money)),
      "",
      nonLastTail,
    ].join("\n");
    return encodeURIComponent(text).length <= chunkBudget;
  };
  const renderLastBlock = (parts: number): string[] => [
    `*Total del pedido: ${money(total)}*`,
    "",
    ...renderWhatsAppCustomer(project, customer),
    "",
    renderWhatsAppDisclaimer(project),
    `✓ Fin del pedido (${parts}/${parts})`,
  ];
  const greetingLine = resolveWhatsAppGreeting(project);
  // Margen exacto: el footer real (total + cliente + disclaimer + fin) menos la
  // cola de parte intermedia. Así TODA parte cabe aunque sea la última, sin
  // adivinar longitudes. Asume subtotal de parte < $99.999.999,99.
  const nonLastTail = ["*Subtotal de esta parte: $99.999.999,99*", "Sigue en la parte 99 →"].join(
    "\n",
  );
  const probeMargin = Math.max(
    0,
    encodeURIComponent(renderLastBlock(99).join("\n")).length -
      encodeURIComponent(nonLastTail).length,
  );
  const chunkBudget = messageBudget - probeMargin;
  const renderPart = (
    chunk: CartLine[],
    part: number,
    parts: number,
    summarized: boolean,
  ): string => {
    const head = header(part, parts);
    if (summarized) {
      return [
        head,
        "",
        `- …y ${chunk.length} productos mas (incluidos en el total)`,
        "",
        ...renderLastBlock(parts),
      ]
        .filter((line, index, all) => line !== "" || all[index - 1] !== "")
        .join("\n")
        .trim();
    }
    const items = chunk.map((line) => renderWhatsAppLine(line, money));
    if (parts === 1) return buildWhatsAppMessage(project, lines, customer);
    if (part < parts) {
      const subtotal = chunk.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
      return [
        head,
        ...(part === 1 ? [greetingLine, ""] : [""]),
        ...items,
        "",
        `*Subtotal de esta parte: ${money(subtotal)}*`,
        `Sigue en la parte ${part + 1} →`,
      ]
        .filter((line, index, all) => line !== "" || all[index - 1] !== "")
        .join("\n")
        .trim();
    }
    return [head, "", ...items, "", ...renderLastBlock(parts)]
      .filter((line, index, all) => line !== "" || all[index - 1] !== "")
      .join("\n")
      .trim();
  };
  if (merged.length <= maxLines) {
    const single = buildWhatsAppMessage(project, lines, customer);
    if (encodeURIComponent(single).length <= messageBudget) return [single];
  }
  const chunks: CartLine[][] = [];
  let current: CartLine[] = [];
  for (const line of merged) {
    const candidate = [...current, line];
    if (current.length > 0 && !fits(candidate)) {
      chunks.push(current);
      current = [line];
    } else current = candidate;
  }
  if (current.length > 0) chunks.push(current);
  if (chunks.length <= maxParts)
    return chunks.map((chunk, index) => renderPart(chunk, index + 1, chunks.length, false));
  const head = chunks.slice(0, maxParts - 1);
  const tail = chunks.slice(maxParts - 1).reduce<CartLine[]>((all, chunk) => all.concat(chunk), []);
  return [
    ...head.map((chunk, index) => renderPart(chunk, index + 1, maxParts, false)),
    renderPart(tail, maxParts, maxParts, true),
  ];
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const clean = phone.replace(/\D/g, "");
  if (!clean) return "";
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}

function storefrontBoot(): void {
  const root = document.documentElement;
  installFrameRateCap(window, 140);
  root.dataset.solaraFpsCap = "140";
  const baseHref = (root.dataset.baseHref ?? "").replace(/\/+$/, "");
  const serviceWorkerUrl = root.dataset.serviceWorkerUrl;
  if (serviceWorkerUrl && "serviceWorker" in navigator) {
    window.addEventListener(
      "load",
      () => {
        void navigator.serviceWorker.register(serviceWorkerUrl, {
          scope: `${baseHref || ""}/`,
        });
      },
      { once: true },
    );
  }
  const storeId = root.dataset.storeId ?? "solara";
  const currency = root.dataset.currency ?? "ARS";
  const locale = root.lang || "es-AR";
  const phone = root.dataset.whatsapp ?? "";
  const copy = JSON.parse(root.dataset.solaraCopy || "{}") as PublicCopy;
  const {
    whatsapp: w,
    contact: k,
    cart: a,
    product: p,
    hero: h,
    checkout: x,
    empty: e,
    search: s,
    filters: f,
  } = copy;
  const greeting = root.dataset.whatsappGreeting ?? "";
  const storageKey = `solara-cart:${storeId}`;
  const embed = parent !== window;
  const priceFractionDisplay = (root.dataset.priceFractionDisplay ?? "always") as "always" | "auto";
  function formatMoneyRuntime(cents: number): string {
    return formatMoney(cents, currency, locale, priceFractionDisplay);
  }
  const money = {
    format: (value: number) => formatMoneyRuntime(Math.round(value * 100)),
  };
  const declaredRuntimeFeatures = root.dataset.solaraRuntimeFeatures;
  const runtimeFeatures = new Set(
    (declaredRuntimeFeatures === undefined
      ? "cart,checkout,product,category,search,hero,motion,variants,filters,video"
      : declaredRuntimeFeatures
    )
      .split(",")
      .filter(Boolean),
  );
  const hasFeature = (feature: string): boolean => runtimeFeatures.has(feature);
  const backupKey = `${storageKey}:backup`;

  const node = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    text?: string,
    attributes?: Record<string, string | number | boolean | undefined>,
  ): HTMLElementTagNameMap[K] => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    for (const [name, value] of Object.entries(attributes ?? {})) {
      if (value !== undefined) element.setAttribute(name, String(value));
    }
    return element;
  };

  const parseSerializedCart = (serialized: string | null): StoredCartLine[] | null => {
    try {
      const stored = JSON.parse(serialized ?? "null");
      return Array.isArray(stored) ? parseCart(stored) : null;
    } catch {
      return null;
    }
  };

  const readStoredCart = (): StoredCartLine[] => {
    if (embed) return [];
    try {
      const primary = parseSerializedCart(localStorage.getItem(storageKey));
      if (primary !== null) return primary;
      return parseSerializedCart(localStorage.getItem(backupKey)) ?? [];
    } catch {
      return [];
    }
  };

  let cart = hasFeature("cart") || hasFeature("checkout") ? readStoredCart() : [];
  const previewCartElement = document.getElementById("solara-preview-cart");
  if (embed && previewCartElement?.dataset.hydrated) {
    const previewCartState = parseSerializedCart(previewCartElement?.textContent ?? null);
    if (previewCartState !== null) cart = previewCartState;
  }
  let lastCartTrigger: HTMLElement | null = null;
  let cartScrollLockOffset = 0;
  const lockCartPageScroll = (): void => {
    if (document.documentElement.dataset.cartScrollLock === "true") return;
    cartScrollLockOffset = window.pageYOffset;
    document.documentElement.dataset.cartScrollLock = "true";
    document.body.style.position = "fixed";
    document.body.style.top = `${-cartScrollLockOffset}px`;
    document.body.style.width = "100%";
  };
  const unlockCartPageScroll = (): void => {
    if (document.documentElement.dataset.cartScrollLock !== "true") return;
    delete document.documentElement.dataset.cartScrollLock;
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.width = "";
    window.scrollTo(0, cartScrollLockOffset);
    cartScrollLockOffset = 0;
  };
  let paused = false;
  const heroAutoplayControls: Array<{ stop: () => void; start: () => void }> = [];

  const initialAddLabels = new Map<HTMLElement, string>();
  document.querySelectorAll<HTMLElement>("[data-add-to-cart]").forEach((button) => {
    initialAddLabels.set(button, button.textContent?.trim() || "");
  });

  const pageType = document.querySelector<HTMLElement>("[data-solara-store]")?.dataset.pageType;

  const connectContactForms = (): void => {
    if (!hasFeature("contact")) return;
    document.querySelectorAll<HTMLFormElement>("[data-solara-contact-form]").forEach((form) => {
      if (form.dataset.contactBound === "true") return;
      form.dataset.contactBound = "true";
      const status = form.querySelector<HTMLElement>("[data-contact-status]");
      const brand = (form.dataset.contactBrand ?? storeId).trim();
      const emailTarget = (form.dataset.contactEmail ?? "").trim();
      const whatsappTarget = (
        form.dataset.contactWhatsapp ??
        form.dataset.contactPhone ??
        ""
      ).trim();
      const whatsappButton = form.querySelector<HTMLButtonElement>(
        '[data-contact-channel="whatsapp"]',
      );
      const getDetails = (): { name: string; email: string; phone: string; message: string } => {
        const data = new FormData(form);
        return {
          name: String(data.get("name") ?? "").trim(),
          email: String(data.get("email") ?? "").trim(),
          phone: String(data.get("phone") ?? "").trim(),
          message: String(data.get("message") ?? "").trim(),
        };
      };
      const getContactLines = (details: {
        name: string;
        email: string;
        phone: string;
        message: string;
      }): string[] => {
        const fields: Array<[string, string]> = [
          [w.customerName ?? "Nombre", details.name],
          [k.email ?? "Email", details.email],
          [w.customerPhone ?? (k as any).phone ?? "Teléfono", details.phone],
          [k.message ?? "Mensaje", details.message],
        ];
        return [
          (w.ask ?? "Hola {storeName}, quiero hacer una consulta.").replace("{storeName}", brand),
          ...fields
            .filter((entry) => entry[1].trim().length > 0)
            .map(([label, value]) => `${label}: ${value.trim()}`),
        ];
      };
      const buildMailto = (details: {
        name: string;
        email: string;
        phone: string;
        message: string;
      }): string => {
        const lines = getContactLines(details);
        const subjectTemplate = k.emailSubject ?? "Consulta para {storeName}";
        const subject = subjectTemplate.replace("{storeName}", brand);
        return `mailto:${emailTarget}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
      };
      const buildWaUrl = (details: {
        name: string;
        email: string;
        phone: string;
        message: string;
      }): string => {
        const message = getContactLines(details).join("\n");
        return `https://wa.me/${whatsappTarget.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
      };
      const handleEmail = (): void => {
        if (!emailTarget) {
          status?.replaceChildren(k.emailFallback ?? "Configurá un email para recibir consultas.");
          return;
        }
        if (!form.reportValidity()) return;
        const details = getDetails();
        const mailto = buildMailto(details);
        window.open(mailto, "_blank", "noopener");
        status?.replaceChildren();
      };
      const handleWhatsapp = (): void => {
        const clean = whatsappTarget.replace(/\D/g, "");
        if (!clean) {
          status?.replaceChildren(
            k.whatsappFallback ?? "Configurá un teléfono de WhatsApp para recibir consultas.",
          );
          return;
        }
        if (!form.reportValidity()) return;
        const details = getDetails();
        const url = buildWaUrl(details);
        window.open(url, "_blank", "noopener");
        status?.replaceChildren();
      };
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        handleEmail();
      });
      whatsappButton?.addEventListener("click", (event) => {
        event.preventDefault();
        handleWhatsapp();
      });
    });
  };

  const persistCart = (c = !1): void => {
    if (!cart.length && !c) return;
    const s = JSON.stringify(cart);
    try {
      if (embed) {
        if (previewCartElement) previewCartElement.textContent = s;
        parent.postMessage(
          {
            type: "solara-preview-cart-write",
            key: storageKey,
            value: s,
            session: previewCartElement?.dataset.session,
          },
          "*",
        );
      } else {
        localStorage.setItem(storageKey, s);
        localStorage.setItem(backupKey, s);
      }
    } catch {}
  };

  const setCartDrawerStep = (
    drawer: HTMLElement,
    step: "review" | "checkout",
    focusTarget = false,
  ): void => {
    const checkout = step === "checkout";
    const reviewPanel = drawer.querySelector<HTMLElement>("[data-cart-review-panel]");
    const checkoutPanel = drawer.querySelector<HTMLElement>("[data-cart-checkout-panel]");
    const nextButton = drawer.querySelector<HTMLButtonElement>("[data-cart-checkout-next]");

    drawer.dataset.cartStep = step;
    if (reviewPanel) {
      reviewPanel.hidden = checkout;
      reviewPanel.toggleAttribute("inert", checkout);
      reviewPanel.setAttribute("aria-hidden", String(checkout));
    }
    if (checkoutPanel) {
      checkoutPanel.hidden = !checkout;
      checkoutPanel.toggleAttribute("inert", !checkout);
      checkoutPanel.setAttribute("aria-hidden", String(!checkout));
      if (checkout) checkoutPanel.scrollTop = 0;
    }

    if (!focusTarget) return;
    window.requestAnimationFrame(() => {
      (checkout
        ? drawer.querySelector<HTMLElement>("[data-cart-review-back]")
        : nextButton
      )?.focus();
    });
  };

  const renderCart = (persist = false): void => {
    const active = document.activeElement;
    const focusedQuantity =
      active instanceof HTMLElement && active.matches("[data-cart-quantity]")
        ? active.dataset.cartQuantity
        : undefined;
    if (persist) persistCart(!cart.length);
    const count = cart.reduce((sum, line) => sum + line.quantity, 0);
    document.querySelectorAll<HTMLElement>("[data-cart-count]").forEach((element) => {
      element.textContent = count > 99 ? "99+" : String(count);
    });
    document.querySelectorAll<HTMLElement>("[data-cart-drawer]").forEach((drawer) => {
      drawer.dataset.cartEmpty = String(cart.length === 0);
      if (cart.length === 0) setCartDrawerStep(drawer, "review");
    });
    document.querySelectorAll<HTMLElement>("[data-solara-cart-open]").forEach((element) => {
      const label = element.dataset.cartLabel ?? "";
      element.setAttribute("aria-label", `${label} ${count}`);
    });

    document.querySelectorAll<HTMLElement>("[data-cart-lines]").forEach((container) => {
      container.replaceChildren();
      if (cart.length === 0) {
        container.append(node("p", e.cart, { class: "solara-cart-empty" }));
        return;
      }
      for (const line of cart) {
        const identity = node("div");
        const imageUrl = safeRuntimeImageUrl(line.imageUrl);
        if (imageUrl) {
          identity.append(
            node("img", undefined, {
              src: imageUrl,
              alt: "",
              ...(line.imageWidth ? { width: line.imageWidth } : {}),
              ...(line.imageHeight ? { height: line.imageHeight } : {}),
              loading: "lazy",
            }),
          );
        }
        const details = node("div");
        details.append(node("strong", line.title), node("small", line.variantTitle));
        if (line.available === false) {
          details.append(node("small", a.unavailable, { class: "solara-cart-line-warning" }));
        }
        identity.append(details);
        const quantityLabel = node("label");
        quantityLabel.append(
          node("span", `${p.quantity} de ${line.title}`, { class: "sr-only" }),
          node("input", undefined, {
            "data-cart-quantity": line.variantId,
            type: "number",
            min: 1,
            max: 99,
            value: line.quantity,
            ...(line.available === false ? { disabled: true } : {}),
          }),
        );
        const article = node("article", undefined, { class: "solara-cart-line" });
        article.append(
          identity,
          quantityLabel,
          node("button", a.remove, {
            type: "button",
            "data-cart-remove": line.variantId,
            "aria-label": `${a.remove} ${line.title}`,
          }),
          node("span", money.format((line.unitPrice * line.quantity) / 100)),
        );
        container.append(article);
      }
    });

    document.querySelectorAll<HTMLElement>("[data-cart-cta]").forEach((a, i) => {
      a.hidden = i !== +!!count;
    });

    const total = cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
    document.querySelectorAll<HTMLElement>("[data-cart-subtotal]").forEach((element) => {
      element.setAttribute("aria-live", "polite");
      element.textContent = money.format(total / 100);
    });
    document.querySelectorAll<HTMLElement>("[data-cart-total]").forEach((element) => {
      element.setAttribute("aria-live", "polite");
      element.textContent = money.format(total / 100);
    });
    if (focusedQuantity !== undefined) {
      document
        .querySelector<HTMLElement>(`[data-cart-quantity="${CSS.escape(focusedQuantity)}"]`)
        ?.focus();
    }
  };

  if (embed) window.addEventListener("pagehide", () => persistCart());

  if (!embed && typeof window !== "undefined") {
    window.addEventListener("storage", (event) => {
      if (event.key !== storageKey && event.key !== backupKey) return;
      const external = readStoredCart();
      if (!cartLinesEqual(external, cart)) {
        cart = external;
        renderCart(false);
      }
    });
  }

  const syncCartToggleExpanded = (expanded: boolean): void => {
    document.querySelectorAll<HTMLElement>("[data-solara-cart-open]").forEach((toggle) => {
      toggle.setAttribute("aria-expanded", String(expanded));
    });
  };

  let freshCatalog: Promise<boolean> | null = null;

  const applyCatalog = (catalog: CatalogIndexEntry[]): void => {
    if (!Array.isArray(catalog)) {
      renderCart(false);
      return;
    }
    const reconciled = reconcileCartLines(cart, catalog);
    const changed = !cartLinesEqual(reconciled, cart);
    cart = reconciled;
    renderCart(changed);
  };

  const reconcileCart = (): Promise<boolean> => {
    if (paused) return Promise.resolve(false);
    if (freshCatalog) return freshCatalog;
    const catalogError =
      (copy as Record<string, Record<string, string>>).errors?.catalogLoad ??
      "No se pudo cargar el catálogo.";
    freshCatalog = fetch(`${baseHref}/catalog-index.json`)
      .then((response) => {
        if (!response.ok) throw new Error(catalogError);
        return response.json() as Promise<CatalogIndexEntry[]>;
      })
      .then((catalog) => {
        const safeCatalog = Array.isArray(catalog) ? catalog.filter(validCatalogIndexEntry) : [];
        applyCatalog(safeCatalog);
        return true;
      })
      .catch(() => {
        freshCatalog = null;
        return false;
      });
    return freshCatalog;
  };

  const pageSiblingsOf = (drawer: HTMLElement): Element[] => {
    const root = drawer.closest("[data-solara-module]");
    if (!root?.parentElement) return [];
    return [...root.parentElement.children].filter((child) => child !== root);
  };

  const openCart = (trigger?: HTMLElement): void => {
    const drawer = document.querySelector<HTMLElement>("[data-cart-drawer]");
    if (!drawer) return;
    setCartDrawerStep(drawer, "review");
    syncCartToggleExpanded(true);
    void reconcileCart();
    lastCartTrigger = trigger ?? (document.activeElement as HTMLElement);
    if (drawer instanceof HTMLDialogElement) {
      if (!drawer.open) drawer.showModal();
    } else {
      drawer.dataset.open = "true";
      drawer.removeAttribute("inert");
      drawer.setAttribute("aria-hidden", "false");
      document
        .querySelectorAll<HTMLElement>("[data-close-cart].solara-cart-backdrop")
        .forEach((backdrop) => {
          backdrop.hidden = false;
        });
    }
    for (const s of pageSiblingsOf(drawer)) s.setAttribute("inert", "");
    lockCartPageScroll();
    setTimeout(() => {
      drawer
        .querySelector<HTMLElement>(
          'button, input, select, textarea, a, [tabindex]:not([tabindex="-1"])',
        )
        ?.focus();
    }, 0);
  };

  const closeCart = (): void => {
    const drawer = document.querySelector<HTMLElement>("[data-cart-drawer]");
    if (!drawer) return;
    syncCartToggleExpanded(false);
    if (drawer instanceof HTMLDialogElement) {
      drawer.close();
    } else {
      delete drawer.dataset.open;
      drawer.setAttribute("inert", "");
      drawer.setAttribute("aria-hidden", "true");
      document
        .querySelectorAll<HTMLElement>("[data-close-cart].solara-cart-backdrop")
        .forEach((backdrop) => {
          backdrop.hidden = true;
        });
    }
    for (const s of pageSiblingsOf(drawer)) s.removeAttribute("inert");
    unlockCartPageScroll();
    window.setTimeout(() => lastCartTrigger?.focus({ preventScroll: true }));
  };

  const selectedVariant = (productRoot: HTMLElement): HTMLElement | null => {
    const select = productRoot.querySelector<HTMLSelectElement>("[data-variant-select]");
    const id = select?.value ?? productRoot.dataset.defaultVariant;
    return id
      ? productRoot.querySelector<HTMLElement>(`[data-variant-data="${CSS.escape(id)}"]`)
      : null;
  };

  const selectGalleryImage = (productRoot: HTMLElement, imageId?: string): void => {
    // Lógica espejo de gallery-media.ts:selectGalleryMedia. Debe vivir
    // ANIDADA aquí (no importada): storefrontBoot se serializa con
    // fn.toString() y el bundler renombra los imports (ReferenceError en
    // producción). El test "serializa el selector mixto" lo cubre.
    const figures = Array.from(
      productRoot.querySelectorAll<HTMLElement>("[data-gallery-media-id], [data-gallery-image-id]"),
    );
    if (figures.length === 0) return;
    const target =
      figures.find(
        (figure) =>
          figure.dataset.galleryMediaId === imageId || figure.dataset.galleryImageId === imageId,
      ) ?? figures[0];
    if (!target) return;
    figures.forEach((figure) => {
      const active = figure === target;
      figure.dataset.galleryActive = String(active);
      if (!active) {
        figure.querySelectorAll("video").forEach((video) => {
          try {
            video.pause();
          } catch {
            /* noop */
          }
        });
      }
    });
    productRoot.querySelectorAll<HTMLElement>("[data-gallery-thumb]").forEach((thumb) => {
      thumb.setAttribute(
        "aria-current",
        String(
          thumb.dataset.galleryThumb === target.dataset.galleryMediaId ||
            thumb.dataset.galleryThumb === target.dataset.galleryImageId,
        ),
      );
    });
  };

  const syncVariant = (productRoot: HTMLElement): void => {
    const variant = selectedVariant(productRoot);
    if (!variant) return;
    const price = Number(variant.dataset.price ?? "0");
    const available = variant.dataset.available === "true";
    const button = productRoot.querySelector<HTMLButtonElement>("[data-add-to-cart]");
    const priceElement = productRoot.querySelector<HTMLElement>("[data-product-price]");
    const compareElement = productRoot.querySelector<HTMLElement>("[data-product-compare]");
    const skuElement = productRoot.querySelector<HTMLElement>("[data-product-sku]");
    const availabilityElement = productRoot.querySelector<HTMLElement>(
      "[data-product-availability]",
    );
    selectGalleryImage(productRoot, variant.dataset.imageId);
    if (priceElement) priceElement.textContent = money.format(price / 100);
    if (skuElement) skuElement.textContent = variant.dataset.sku ?? "";
    if (availabilityElement) {
      availabilityElement.textContent = available ? p.available : p.outOfStock;
    }
    if (compareElement) {
      const compareAt = Number(variant.dataset.compareAt ?? "0");
      compareElement.textContent = compareAt > 0 ? money.format(compareAt / 100) : "";
      compareElement.hidden = !(compareAt > price);
    }
    if (button) {
      button.disabled = !available;
      button.textContent = available ? (initialAddLabels.get(button) ?? p.addToCart) : p.noStock;
    }
  };

  const syncProductTabs = (root: HTMLElement, active: string): void => {
    root.querySelectorAll<HTMLElement>("[data-product-tab-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.productTabPanel !== active;
    });
    root.querySelectorAll<HTMLButtonElement>("[data-product-tab]").forEach((tab) => {
      tab.setAttribute("aria-selected", String(tab.dataset.productTab === active));
    });
  };

  if (hasFeature("product")) {
    document.querySelectorAll<HTMLElement>("[data-product-tabs]").forEach((root) => {
      const firstTab = root.querySelector<HTMLButtonElement>("[data-product-tab]");
      if (!firstTab) return;
      syncProductTabs(root, firstTab.dataset.productTab ?? "details");
      const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-product-tab]"));
      tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
          syncProductTabs(root, tab.dataset.productTab ?? "details");
        });
        tab.addEventListener("keydown", (event) => {
          if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
          event.preventDefault();
          const index = tabs.indexOf(tab);
          const nextIndex =
            event.key === "ArrowRight"
              ? (index + 1) % tabs.length
              : (index - 1 + tabs.length) % tabs.length;
          tabs[nextIndex]?.focus();
        });
      });
    });
  }

  const updateCartQuantity = (target: HTMLElement, restoreInvalid: boolean): void => {
    const variantId = target.dataset.cartQuantity;
    const input = target as HTMLInputElement;
    const previous = cart.find((line) => line.variantId === variantId);
    if (!previous) return;
    const raw = input.value.trim();
    const parsed = Number(raw);
    if (raw === "" || !Number.isFinite(parsed) || parsed <= 0) {
      if (!restoreInvalid) return;
    }
    const quantity = normalizeCartQuantity(parsed);
    if (restoreInvalid) input.value = String(quantity);
    if (quantity === previous.quantity) return;
    cart = cart.map((line) => (line.variantId === variantId ? { ...line, quantity } : line));
    renderCart(true);
  };

  document.addEventListener("input", (event) => {
    if (!hasFeature("cart")) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches("[data-cart-quantity]")) return;
    updateCartQuantity(target, false);
  });

  document.addEventListener("change", (event) => {
    if (!hasFeature("product") && !hasFeature("cart")) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.matches("[data-variant-select]")) {
      const productRoot = target.closest<HTMLElement>("[data-product]");
      if (productRoot) {
        syncVariant(productRoot);
        const variantId = (target as HTMLSelectElement).value;
        const url = new URL(window.location.href);
        url.searchParams.set("variant", variantId);
        history.replaceState(null, "", url);
      }
    }

    if (target.matches("[data-cart-quantity]")) {
      updateCartQuantity(target, true);
    }
  });

  const addProductToCart = (productRoot: HTMLElement | null): void => {
    const variant = productRoot ? selectedVariant(productRoot) : null;
    if (!productRoot || !variant || variant.dataset.available !== "true") return;

    if (!embed) cart = readStoredCart();
    const variantId = variant.dataset.variantId ?? "";
    const quantityInput = productRoot.querySelector<HTMLInputElement>('input[name="quantity"]');
    const quantity = normalizeCartQuantity(quantityInput?.value ?? "1");
    if (quantityInput) quantityInput.value = String(quantity);
    const existing = cart.find((line) => line.variantId === variantId);
    if (existing) {
      existing.quantity = Math.min(99, existing.quantity + quantity);
    } else {
      cart.push({
        productId: productRoot.dataset.productId ?? "",
        variantId,
        title: productRoot.dataset.productTitle ?? "",
        variantTitle: variant.dataset.variantTitle ?? "",
        sku: variant.dataset.sku ?? "",
        unitPrice: Number(variant.dataset.price ?? "0"),
        quantity,
        ...(variant.dataset.imageUrl ? { imageUrl: variant.dataset.imageUrl } : {}),
        ...(variant.dataset.imageWidth ? { imageWidth: Number(variant.dataset.imageWidth) } : {}),
        ...(variant.dataset.imageHeight
          ? { imageHeight: Number(variant.dataset.imageHeight) }
          : {}),
        available: true,
      });
    }
    renderCart(true);
    openCart();
  };

  document.addEventListener("click", (event) => {
    if (!hasFeature("product") && !hasFeature("cart")) return;
    const target = event.target;
    if (!(target instanceof Element)) return;

    const galleryThumb = target.closest<HTMLElement>("[data-gallery-thumb]");
    if (galleryThumb) {
      const productRoot = galleryThumb.closest<HTMLElement>("[data-product]");
      if (productRoot) selectGalleryImage(productRoot, galleryThumb.dataset.galleryThumb);
      return;
    }

    const addButton = target.closest<HTMLElement>(
      "[data-add-to-cart],[data-testimonials-prev],[data-testimonials-next]",
    );
    if (addButton) {
      if (addButton.matches("[data-testimonials-prev],[data-testimonials-next]")) {
        const track = addButton
          .closest<HTMLElement>(".catalog-testimonials-section")
          ?.querySelector<HTMLElement>(".catalog-testimonials-track");
        if (track)
          track.scrollBy({
            left: addButton.matches("[data-testimonials-prev]")
              ? -track.clientWidth
              : track.clientWidth,
            behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
          });
        return;
      }
      event.preventDefault();
      addProductToCart(addButton.closest<HTMLElement>("[data-product]"));
    }

    const cartTrigger = target.closest<HTMLElement>("[data-open-cart]");
    if (cartTrigger) {
      if (cartTrigger instanceof HTMLAnchorElement) event.preventDefault();
      openCart(cartTrigger);
    }

    const checkoutNext = target.closest<HTMLElement>("[data-cart-checkout-next]");
    if (checkoutNext) {
      const drawer = checkoutNext.closest<HTMLElement>("[data-cart-drawer]");
      if (drawer && cart.length > 0) setCartDrawerStep(drawer, "checkout", true);
      return;
    }

    const reviewBack = target.closest<HTMLElement>("[data-cart-review-back]");
    if (reviewBack) {
      const drawer = reviewBack.closest<HTMLElement>("[data-cart-drawer]");
      if (drawer) setCartDrawerStep(drawer, "review", true);
      return;
    }

    if (target.closest("[data-close-cart]")) {
      closeCart();
    }

    const removeButton = target.closest<HTMLElement>("[data-cart-remove]");
    if (removeButton) {
      const variantId = removeButton.dataset.cartRemove;
      cart = cart.filter((line) => line.variantId !== variantId);
      renderCart(true);
    }
  });

  document.querySelectorAll<HTMLFormElement>("[data-solara-add-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!hasFeature("product") && !hasFeature("cart")) return;
      addProductToCart(form.closest<HTMLElement>("[data-product]"));
    });
  });

  document.addEventListener("keydown", (event) => {
    if (!hasFeature("cart") && !hasFeature("checkout")) return;
    const drawer = document.querySelector<HTMLElement>("[data-cart-drawer]");
    const drawerOpen =
      drawer instanceof HTMLDialogElement ? drawer.open : drawer?.dataset.open === "true";
    if (!drawer || !drawerOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeCart();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      drawer.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ),
    ).filter(
      (element) =>
        !element.hidden &&
        element.getAttribute("aria-hidden") !== "true" &&
        element.getClientRects().length > 0,
    );
    if (focusable.length === 0) {
      event.preventDefault();
      drawer.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });

  document.querySelectorAll<HTMLFormElement>("[data-checkout-form]").forEach((form) => {
    const preview = form.querySelector<HTMLElement>("[data-order-preview]");
    const note = node("p", "", { class: "solara-whatsapp-truncated", hidden: true });
    note.setAttribute("role", "status");
    const copyButton = node("button", "Copiar pedido completo", {
      type: "button",
      class: "solara-whatsapp-copy",
    });
    const restartButton = node("button", "Empezar de nuevo", {
      type: "button",
      class: "solara-whatsapp-restart",
      hidden: true,
    });
    preview?.before(note);
    preview?.after(copyButton);
    copyButton.after(restartButton);
    const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const defaultSubmitLabel = submitButton?.textContent ?? "";
    const partsKey = `solara-wa:${storeId}`;
    const readPartsState = (): { fp: string; sent: number; ts: number } | null => {
      try {
        const raw = window.localStorage.getItem(partsKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as {
          fp?: unknown;
          sent?: unknown;
          ts?: unknown;
        };
        if (
          typeof parsed.fp !== "string" ||
          typeof parsed.sent !== "number" ||
          typeof parsed.ts !== "number"
        )
          return null;
        if (Date.now() - parsed.ts > 86400000) return null;
        return { fp: parsed.fp, sent: parsed.sent, ts: parsed.ts };
      } catch {
        return null;
      }
    };
    const writePartsState = (state: { fp: string; sent: number; ts: number }): void => {
      try {
        window.localStorage.setItem(partsKey, JSON.stringify(state));
      } catch {
        return;
      }
    };
    const clearPartsState = (): void => {
      try {
        window.localStorage.removeItem(partsKey);
      } catch {
        return;
      }
    };
    const readCustomer = (): CustomerDetails => {
      const data = new FormData(form);
      const value = (key: string): string => String(data.get(key) ?? "").trim();
      return {
        name: value("name"),
        phone: value("phone"),
        address: value("address"),
        locality: value("locality"),
        postalCode: value("postalCode"),
        notes: value("notes"),
      };
    };
    const buildParts = (customer: CustomerDetails): string[] =>
      splitOrderParts(
        { currency, locale, whatsapp: { greeting }, publicCopy: copy, priceFractionDisplay },
        cart,
        customer,
      );
    const refreshPartsUi = (): void => {
      if (cart.length === 0 || !submitButton) return;
      const parts = buildParts(readCustomer());
      const fingerprint = orderFingerprint(cart);
      const stored = readPartsState();
      if (parts.length <= 1) {
        submitButton.textContent = defaultSubmitLabel;
        note.hidden = true;
        restartButton.hidden = true;
        return;
      }
      if (stored !== null && stored.fp === fingerprint && stored.sent >= parts.length) {
        submitButton.textContent = defaultSubmitLabel;
        note.textContent =
          "Pedido completo enviado por WhatsApp. Para un pedido nuevo, modificá el carrito.";
        note.hidden = false;
        restartButton.hidden = false;
        return;
      }
      let index = 0;
      let resumed = false;
      if (stored !== null && stored.fp === fingerprint && stored.sent < parts.length) {
        index = stored.sent;
        resumed = true;
      }
      submitButton.textContent = `Enviar parte ${index + 1} de ${parts.length} por WhatsApp${
        index + 1 === parts.length ? " (final, con el total)" : ""
      }`;
      note.textContent = `El pedido se envía en ${parts.length} partes por WhatsApp. Estás en la parte ${
        index + 1
      }. El total viaja en la última parte.`;
      note.hidden = false;
      restartButton.hidden = !(resumed && index > 0);
    };
    copyButton.addEventListener("click", () => {
      if (cart.length === 0) return;
      const full = buildWhatsAppMessage(
        { currency, locale, whatsapp: { greeting }, publicCopy: copy, priceFractionDisplay },
        cart,
        readCustomer(),
      );
      const announce = (ok: boolean): void => {
        if (!preview) return;
        preview.textContent = ok
          ? "Pedido copiado. Pegalo en el chat para enviarlo."
          : a.phoneInvalid || x.invalidItems;
        preview.setAttribute("role", "status");
        preview.removeAttribute("hidden");
      };
      const clipboard = navigator.clipboard;
      if (clipboard && typeof clipboard.writeText === "function") {
        clipboard.writeText(full).then(
          () => announce(true),
          () => announce(false),
        );
      } else {
        const area = node("textarea", full, { class: "sr-only" });
        document.body.append(area);
        area.select();
        let ok = false;
        try {
          ok = document.execCommand("copy");
        } catch {
          ok = false;
        }
        area.remove();
        announce(ok);
      }
    });
    restartButton.addEventListener("click", () => {
      clearPartsState();
      refreshPartsUi();
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (cart.length === 0) {
        if (preview) {
          preview.textContent = x.emptyCart;
          preview.setAttribute("role", "alert");
          preview.removeAttribute("hidden");
        }
        return;
      }
      if (!form.reportValidity()) return;
      if (cart.length > 0) freshCatalog = null;
      void reconcileCart().then((ok) => {
        if (!ok) {
          if (preview) {
            preview.textContent = s.error ?? x.invalidItems;
            preview.setAttribute("role", "alert");
          }
          return;
        }
        if (cart.length === 0) return;
        const unavailable = cart.filter((line) => line.available === false);
        if (unavailable.length > 0) {
          if (preview) {
            preview.textContent = x.invalidItems;
            preview.setAttribute("role", "alert");
          }
          return;
        }
        const customer = readCustomer();
        const parts = buildParts(customer);
        const fingerprint = orderFingerprint(cart);
        const stored = readPartsState();
        let index = 0;
        const cartChanged = stored !== null && stored.sent > 0 && stored.fp !== fingerprint;
        if (stored !== null && stored.fp === fingerprint && stored.sent < parts.length)
          index = stored.sent;
        const urls = parts.map((message) => buildWhatsAppUrl(phone, message));
        if (urls.length === 0 || urls.some((partUrl) => !partUrl)) {
          if (preview) {
            preview.textContent = a.phoneInvalid || x.invalidItems;
            preview.setAttribute("role", "alert");
          }
          return;
        }
        const message = parts[index] ?? "";
        const url = urls[index] ?? "";
        if (preview) preview.textContent = message;
        if (parts.length > 1) {
          writePartsState({ fp: fingerprint, sent: index + 1, ts: Date.now() });
          refreshPartsUi();
          if (cartChanged) {
            note.textContent = `El carrito cambió: reenviá desde la parte 1. ${note.textContent}`;
          }
        } else {
          clearPartsState();
          if (submitButton) submitButton.textContent = defaultSubmitLabel;
          note.hidden = true;
        }
        const whatsappWindow = window.open(url, "_blank");
        if (whatsappWindow) whatsappWindow.opener = null;
        else window.location.assign(url);
      });
    });
    window.addEventListener("focus", () => {
      refreshPartsUi();
    });
  });

  if (pageType === "cart" || pageType === "checkout") void reconcileCart();

  let chromeUpdateFrame: number | null = null;
  const measureChromeHeight = (): void => {
    chromeUpdateFrame = null;
    if (paused) return;
    const chrome = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-solara-module="announcement-bar"], [data-solara-module="editorial-header"]',
      ),
    ).reduce((total, element) => total + element.getBoundingClientRect().height, 0);
    const nextHeight = `${Math.ceil(chrome)}px`;
    if (root.style.getPropertyValue("--solara-chrome-height") !== nextHeight) {
      root.style.setProperty("--solara-chrome-height", nextHeight);
    }
  };
  const updateChromeHeight = (): void => {
    if (chromeUpdateFrame !== null) return;
    chromeUpdateFrame = window.requestAnimationFrame(measureChromeHeight);
  };
  let chromeObserver: ResizeObserver | null = null;
  const connectChromeObserver = (): void => {
    if (!("ResizeObserver" in window)) return;
    const observer = new ResizeObserver(updateChromeHeight);
    document
      .querySelectorAll<HTMLElement>(
        '[data-solara-module="announcement-bar"], [data-solara-module="editorial-header"]',
      )
      .forEach((element) => {
        observer.observe(element);
      });
    chromeObserver = observer;
  };
  updateChromeHeight();
  connectChromeObserver();

  document
    .querySelectorAll<HTMLButtonElement>("[data-catalog-announcement-close]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const announcement = button.closest<HTMLElement>(
          '[data-solara-module="catalog-announcement"]',
        );
        if (!announcement) return;
        announcement.hidden = true;
        updateChromeHeight();
      });
    });

  const headers = Array.from(
    document.querySelectorAll<HTMLElement>('[data-solara-module$="-header"]'),
  );
  const sentinel = document.createElement("span");
  let headerObserver: IntersectionObserver | null = null;
  const connectHeaderObserver = (): void => {
    if (headers.length === 0 || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) => {
      const scrolled = entry ? !entry.isIntersecting : false;
      headers.forEach((header) => {
        header.dataset.scrolled = String(scrolled);
      });
    });
    observer.observe(sentinel);
    headerObserver = observer;
  };
  const hasIntersectionObserver = "IntersectionObserver" in window;
  if (headers.length > 0) {
    sentinel.dataset.solaraScrollSentinel = "true";
    sentinel.setAttribute("aria-hidden", "true");
    sentinel.style.cssText =
      "position:absolute;top:0;left:0;width:1px;height:1px;pointer-events:none;opacity:0";
    if (hasIntersectionObserver) {
      document.body.prepend(sentinel);
      connectHeaderObserver();
    } else {
      const syncScrolled = (): void => {
        const scrolled = document.documentElement.scrollTop > 0;
        headers.forEach((header) => {
          header.dataset.scrolled = String(scrolled);
        });
      };
      window.addEventListener("scroll", syncScrolled, { passive: true });
      syncScrolled();
    }
  }

  document
    .querySelectorAll<HTMLDetailsElement>(
      '[data-solara-module="editorial-header"] .solara-mobile-nav, [data-solara-module="editorial-header"] .solara-nav-dropdown',
    )
    .forEach((menu) => {
      const trigger = menu.querySelector<HTMLElement>(":scope > summary");
      const focusable = (): HTMLElement[] =>
        Array.from(
          menu.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((element) => !element.hidden && element.getClientRects().length > 0);
      menu.addEventListener("keydown", (event) => {
        if (!menu.open) return;
        if (event.key === "Escape") {
          event.preventDefault();
          menu.open = false;
          trigger?.focus();
          return;
        }
        if (event.key !== "Tab") return;
        const items = focusable();
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      });
      menu.addEventListener("toggle", () => {
        if (menu.open) {
          focusable()[0]?.focus();
        }
      });
      menu.addEventListener("click", (event) => {
        if (!(event.target instanceof Element) || !event.target.closest("a")) return;
        menu.open = false;
      });
    });

  const modernMenu =
    document.querySelector<HTMLElement>("[data-catalog-mobile-menu]") ??
    document.querySelector<HTMLElement>("#catalog-mobile-menu");
  const modernMenuOpen = document.querySelector<HTMLButtonElement>("[data-catalog-menu-open]");
  const modernMenuClose = modernMenu?.querySelector<HTMLButtonElement>("[data-catalog-menu-close]");
  const modernMenuFocusable = (): HTMLElement[] =>
    modernMenu
      ? Array.from(
          modernMenu.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), summary, select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((element) => !element.hidden && element.getClientRects().length > 0)
      : [];
  const modernMenuSiblings = (): HTMLElement[] =>
    modernMenu?.parentElement
      ? Array.from(modernMenu.parentElement.children).filter(
          (child): child is HTMLElement => child !== modernMenu,
        )
      : [];
  const closeModernMenu = (): void => {
    if (!modernMenu) return;
    modernMenu.dataset.state = "closed";
    modernMenu.hidden = true;
    modernMenu.setAttribute("inert", "");
    modernMenu.setAttribute("aria-hidden", "true");
    modernMenuSiblings().forEach((sibling) => {
      sibling.removeAttribute("inert");
    });
    modernMenuOpen?.setAttribute("aria-expanded", "false");
    document.documentElement.classList.remove("catalog-mobile-menu-open");
    modernMenu.querySelectorAll<HTMLDetailsElement>("details").forEach((details) => {
      details.open = false;
    });
    modernMenuOpen?.focus();
  };
  modernMenuOpen?.addEventListener("click", () => {
    if (!modernMenu) return;
    modernMenu.hidden = false;
    modernMenu.removeAttribute("inert");
    modernMenu.setAttribute("aria-hidden", "false");
    modernMenuSiblings().forEach((sibling) => {
      sibling.setAttribute("inert", "");
    });
    modernMenuOpen.setAttribute("aria-expanded", "true");
    document.documentElement.classList.add("catalog-mobile-menu-open");
    modernMenuClose?.focus();
    modernMenu.getBoundingClientRect();
    window.requestAnimationFrame(() => {
      if (modernMenu.hidden) return;
      modernMenu.dataset.state = "open";
    });
  });
  modernMenuClose?.addEventListener("click", closeModernMenu);
  modernMenu?.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a,[data-catalog-menu-dismiss]"))
      closeModernMenu();
  });
  modernMenu?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeModernMenu();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = modernMenuFocusable();
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });
  modernMenu?.querySelectorAll<HTMLDetailsElement>("details").forEach((details) => {
    details.addEventListener("toggle", () => {
      details
        .querySelector<HTMLElement>(":scope > summary")
        ?.setAttribute("aria-expanded", String(details.open));
    });
  });
  window.matchMedia("(max-width: 767px)").addEventListener("change", (event) => {
    if (!event.matches) closeModernMenu();
  });

  const modernNavMenu = document.querySelector<HTMLDetailsElement>(
    '[data-solara-module="catalog-header"] .catalog-nav-menu',
  );
  const modernNavSummary = modernNavMenu?.querySelector<HTMLElement>(":scope > summary");
  modernNavMenu?.addEventListener("toggle", () => {
    modernNavSummary?.setAttribute("aria-expanded", String(modernNavMenu.open));
  });
  modernNavMenu?.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    modernNavMenu.open = false;
    modernNavSummary?.focus();
  });
  document.addEventListener("click", (event) => {
    if (!modernNavMenu?.open || !(event.target instanceof Node)) return;
    if (!modernNavMenu.contains(event.target)) modernNavMenu.open = false;
  });

  const modernSearchDialog = document.querySelector<HTMLDialogElement>(
    "[data-catalog-search-dialog]",
  );
  const modernSearchOpeners = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-catalog-search-open]"),
  );
  const modernSearchInput =
    modernSearchDialog?.querySelector<HTMLInputElement>("#catalog-search-input");
  let lastModernSearchTrigger: HTMLButtonElement | null = null;
  const closeModernSearch = (): void => {
    if (!modernSearchDialog) return;
    if (modernSearchDialog.open) modernSearchDialog.close();
    modernSearchOpeners.forEach((opener) => {
      opener.setAttribute("aria-expanded", "false");
    });
    document.documentElement.classList.remove("catalog-search-open");
    lastModernSearchTrigger?.focus();
  };
  modernSearchOpeners.forEach((opener) => {
    opener.addEventListener("click", () => {
      if (!modernSearchDialog) return;
      lastModernSearchTrigger = opener;
      modernSearchOpeners.forEach((item) => {
        item.setAttribute("aria-expanded", "false");
      });
      opener.setAttribute("aria-expanded", "true");
      if (typeof modernSearchDialog.showModal === "function") {
        if (!modernSearchDialog.open) modernSearchDialog.showModal();
      } else {
        modernSearchDialog.setAttribute("open", "true");
      }
      document.documentElement.classList.add("catalog-search-open");
      window.requestAnimationFrame(() => modernSearchInput?.focus());
    });
  });
  modernSearchDialog
    ?.querySelector<HTMLButtonElement>("[data-catalog-search-close]")
    ?.addEventListener("click", closeModernSearch);
  modernSearchDialog?.addEventListener("click", (event) => {
    if (event.target === modernSearchDialog) closeModernSearch();
  });
  modernSearchDialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeModernSearch();
  });
  modernSearchDialog?.addEventListener("close", () => {
    modernSearchOpeners.forEach((opener) => {
      opener.setAttribute("aria-expanded", "false");
    });
    document.documentElement.classList.remove("catalog-search-open");
  });

  document
    .querySelectorAll<HTMLElement>('[data-solara-module="catalog-hero"] .catalog-hero-inner')
    .forEach((hero) => {
      const slides = Array.from(
        hero.querySelectorAll<HTMLElement>("[data-catalog-hero-slide-panel]"),
      );
      if (slides.length < 2) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const copy = hero.querySelector<HTMLElement>(".catalog-hero-copy");
      const title = copy?.querySelector<HTMLElement>("h1");
      const body = copy?.querySelector<HTMLElement>(".catalog-hero-body");
      const action = copy?.querySelector<HTMLAnchorElement>(".catalog-primary-action");
      let active = 0;
      let timer = 0;
      const setSlide = (index: number): void => {
        active = (index + slides.length) % slides.length;
        slides.forEach((slide, slideIndex) => {
          const selected = slideIndex === active;
          slide.hidden = !selected;
          slide.setAttribute("aria-hidden", String(!selected));
          hero
            .querySelector(`[data-catalog-hero-slide="${slideIndex}"]`)
            ?.setAttribute("aria-selected", String(selected));
        });
        const selected = slides[active];
        if (!selected) return;
        if (title) title.textContent = selected.dataset.title ?? "";
        if (body) body.textContent = selected.dataset.body ?? "";
        if (action) {
          action.textContent = selected.dataset.actionLabel ?? "";
          action.href = selected.dataset.actionHref ?? "/";
        }
      };
      const stop = (): void => {
        if (timer) window.clearInterval(timer);
        timer = 0;
      };
      const start = (): void => {
        stop();
        if (reduceMotion || hero.dataset.autoplay !== "true") return;
        timer = window.setInterval(
          () => setSlide(active + 1),
          Number(hero.dataset.interval ?? "6000"),
        );
      };
      hero.querySelectorAll<HTMLElement>("[data-catalog-hero-slide]").forEach((indicator) => {
        indicator.addEventListener("click", () => {
          setSlide(Number(indicator.dataset.catalogHeroSlide ?? "0"));
          stop();
        });
      });
      hero.addEventListener("pointerenter", stop);
      hero.addEventListener("focusin", stop);
      heroAutoplayControls.push({ stop, start });
      setSlide(0);
      start();
    });

  document.querySelectorAll<HTMLElement>("[data-hero-mode]").forEach((hero) => {
    const heroCopy = h;
    const video = hero.querySelector<HTMLVideoElement>("video");
    const toggle = hero.querySelector<HTMLButtonElement>("[data-hero-video-toggle]");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saveData = Boolean(
      (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData,
    );
    if (video && (reduceMotion || saveData)) {
      video.pause();
      video.removeAttribute("autoplay");
      video.preload = "none";
    }
    toggle?.addEventListener("click", () => {
      if (!video) return;
      if (video.paused) {
        void video.play();
        toggle.textContent = heroCopy?.pauseVideo ?? "";
        toggle.setAttribute("aria-pressed", "false");
      } else {
        video.pause();
        toggle.textContent = heroCopy?.resumeVideo ?? "";
        toggle.setAttribute("aria-pressed", "true");
      }
    });

    const panels = Array.from(hero.querySelectorAll<HTMLElement>("[data-hero-slide-panel]"));
    if (panels.length === 0) return;
    const copy = hero.querySelector<HTMLElement>(".solara-hero-media-copy");
    const eyebrow = copy?.querySelector<HTMLElement>(".solara-eyebrow");
    const heading = copy?.querySelector<HTMLElement>("h1");
    const body = copy?.querySelector<HTMLElement>(".solara-hero-body");
    const action = copy?.querySelector<HTMLAnchorElement>(".solara-primary-action");
    let activeIndex = 0;
    let timer = 0;
    let interactionPaused = false;
    const setSlide = (nextIndex: number): void => {
      activeIndex = (nextIndex + panels.length) % panels.length;
      panels.forEach((panel, index) => {
        panel.setAttribute("data-hero-active", String(index === activeIndex));
        panel.setAttribute("aria-hidden", String(index !== activeIndex));
      });
      const panel = panels[activeIndex];
      if (!panel) return;
      const nextEyebrow = panel.dataset.heroEyebrow ?? "";
      if (eyebrow) {
        eyebrow.textContent = nextEyebrow;
        eyebrow.hidden = !nextEyebrow;
      }
      if (heading) heading.textContent = panel.dataset.heroTitle ?? "";
      if (body) body.textContent = panel.dataset.heroBody ?? "";
      if (action) {
        action.textContent = panel.dataset.heroActionLabel ?? "";
        action.href = panel.dataset.heroActionHref ?? "/";
      }
      hero.querySelectorAll<HTMLElement>("[data-hero-slide]").forEach((indicator) => {
        indicator.setAttribute(
          "aria-selected",
          indicator.dataset.heroSlide === String(activeIndex) ? "true" : "false",
        );
      });
    };
    setSlide(0);
    const stopAutoplay = (): void => {
      if (timer !== 0) window.clearInterval(timer);
      timer = 0;
    };
    const startAutoplay = (): void => {
      stopAutoplay();
      if (reduceMotion || hero.dataset.heroAutoplay !== "true" || panels.length < 2) return;
      timer = window.setInterval(
        () => setSlide(activeIndex + 1),
        Number(hero.dataset.heroInterval ?? "6000"),
      );
    };
    hero.querySelector<HTMLElement>("[data-hero-prev]")?.addEventListener("click", () => {
      setSlide(activeIndex - 1);
      interactionPaused = true;
      stopAutoplay();
    });
    hero.querySelector<HTMLElement>("[data-hero-next]")?.addEventListener("click", () => {
      setSlide(activeIndex + 1);
      interactionPaused = true;
      stopAutoplay();
    });
    hero.querySelectorAll<HTMLElement>("[data-hero-slide]").forEach((indicator) => {
      indicator.addEventListener("click", () => {
        setSlide(Number(indicator.dataset.heroSlide ?? "0"));
        interactionPaused = true;
        stopAutoplay();
      });
    });
    hero.addEventListener("pointerenter", stopAutoplay);
    hero.addEventListener("focusin", stopAutoplay);
    hero.addEventListener("pointerdown", () => {
      interactionPaused = true;
      stopAutoplay();
    });
    hero.addEventListener("pointerleave", () => {
      if (!interactionPaused) startAutoplay();
    });
    document.addEventListener(
      "visibilitychange",
      () => (document.hidden ? stopAutoplay() : interactionPaused ? undefined : startAutoplay()),
      { passive: true },
    );
    heroAutoplayControls.push({
      stop: stopAutoplay,
      start: () => {
        if (!interactionPaused) startAutoplay();
      },
    });
    startAutoplay();
  });

  const searchInput = document.querySelector<HTMLInputElement>("#solara-search-input");
  const searchResults = document.querySelector<HTMLElement>("[data-search-results]");
  if (searchInput && searchResults) {
    const searchApi = (
      globalThis as typeof globalThis & {
        __solaraSearchHelpers: SearchApi;
      }
    ).__solaraSearchHelpers;
    type SearchEntryWithTokens = {
      title: string;
      brand: string;
      description: string;
      tags?: string[];
      categoryIds?: string[];
      collectionIds?: string[];
      categoryNames?: string[];
      collectionNames?: string[];
      options?: string[];
      path: string;
      imageUrl?: string;
      imageWidth?: number;
      imageHeight?: number;
      priceMin: number;
      available: boolean;
      tokens?: SearchEntryTokens;
    };
    const searchGrid = searchResults.querySelector<HTMLElement>(
      "[data-category-grid]",
    ) as HTMLElement;
    const showSearchMessage = (text: string, className?: string, role?: string): void => {
      searchGrid.replaceChildren(
        node("p", text, { ...(className ? { class: className } : {}), ...(role ? { role } : {}) }),
      );
    };
    const showSearchSkeletons = (): void => {
      searchGrid.replaceChildren(
        ...Array.from({ length: 8 }, () => {
          const card = node("article", undefined, {
            class: "solara-search-result",
            "aria-hidden": "true",
          });
          card.append(
            node("div", undefined, { class: "solara-skeleton solara-skeleton--media" }),
            node("div", undefined, { class: "solara-skeleton solara-skeleton--line" }),
            node("div", undefined, { class: "solara-skeleton solara-skeleton--line" }),
          );
          return card;
        }),
      );
    };
    const validSearchEntry = (entry: SearchEntryWithTokens): boolean => {
      return (
        boundedRuntimeString(entry.title, 240, -1) &&
        boundedRuntimeString(entry.brand, 160, -1) &&
        boundedRuntimeString(entry.description, 2000, -1) &&
        boundedRuntimeString(entry.path, 512, -1) &&
        entry.path.startsWith("/") &&
        !entry.path.startsWith("//") &&
        typeof entry.priceMin === "number" &&
        Number.isInteger(entry.priceMin) &&
        entry.priceMin >= 0 &&
        entry.priceMin <= Number.MAX_SAFE_INTEGER &&
        typeof entry.available === "boolean" &&
        validRuntimeDimension(entry.imageWidth) &&
        validRuntimeDimension(entry.imageHeight) &&
        validRuntimeStringArray(entry.tags, 64, 160) &&
        validRuntimeStringArray(entry.categoryIds, 64, 128) &&
        validRuntimeStringArray(entry.collectionIds, 64, 128) &&
        validRuntimeStringArray(entry.categoryNames, 64, 160) &&
        validRuntimeStringArray(entry.collectionNames, 64, 160) &&
        validRuntimeStringArray(entry.options, 64, 160) &&
        validRuntimeSearchTokens(entry.tokens) &&
        (entry.imageUrl === undefined || safeRuntimeImageUrl(entry.imageUrl) !== "")
      );
    };
    const suggestCorrection = (
      terms: string[],
      entries: SearchEntryWithTokens[],
    ): string | undefined => {
      let best: { term: string; distance: number } | undefined;
      for (const term of terms) {
        if (term.length < 3) continue;
        for (const entry of entries) {
          const candidates = [
            ...(entry.tokens?.title ?? searchApi.normalizeSearchTokens(entry.title)),
            ...(entry.tokens?.brand ?? searchApi.normalizeSearchTokens(entry.brand)),
          ];
          for (const token of candidates) {
            const distance = searchApi.levenshtein(term, token);
            if (distance <= 2 && (!best || distance < best.distance)) {
              best = { term: token, distance };
            }
          }
        }
      }
      return best?.term;
    };
    const renderSearchResult = (entry: SearchEntryWithTokens): HTMLElement => {
      const article = node("article", undefined, {
        class: "solara-search-result",
        "data-product-card": "",
        "data-product-price": entry.priceMin,
        "data-product-available": entry.available,
        "data-product-tags": (entry.tags ?? []).join(","),
        "data-product-options": (entry.options ?? []).join("|"),
      });
      const link = node("a", undefined, { href: entry.path });
      const imageUrl = safeRuntimeImageUrl(entry.imageUrl);
      if (imageUrl) {
        link.append(
          node("img", undefined, {
            src: imageUrl,
            alt: entry.title,
            width: entry.imageWidth ?? 1,
            height: entry.imageHeight ?? 1,
            sizes: "(max-width: 767px) 46vw, (max-width: 1199px) 18rem, 13rem",
            loading: "lazy",
          }),
        );
      }
      const details = node("div");
      details.append(
        node("h2", entry.title),
        node("p", entry.brand),
        node("strong", money.format(entry.priceMin / 100)),
      );
      link.append(details);
      article.append(link);
      return article;
    };
    const query = new URLSearchParams(window.location.search).get("q") ?? "";
    searchInput.value = query;
    if (query) {
      const brand = document.title.split(" | ").pop() ?? "";
      document.title = `Búsqueda: ${query} | ${brand}`;
      document.querySelector('meta[name="robots"]')?.setAttribute("content", "noindex,follow");
      const terms = searchApi.normalizeSearchTokens(query);
      if (!terms.length || terms.some((t) => t.length < 2)) {
        showSearchMessage(s.queryTooShort);
      } else {
        const controller = new AbortController();
        showSearchSkeletons();
        const searchIndexError =
          (copy as Record<string, Record<string, string>>).errors?.searchIndexLoad ??
          "No se pudo cargar el índice de búsqueda.";
        fetch(`${baseHref}/search-index.json`, { signal: controller.signal })
          .then((response) => {
            if (!response.ok) throw new Error(searchIndexError);
            return response.json() as Promise<SearchEntryWithTokens[]>;
          })
          .then((entries) => {
            const safeEntries = Array.isArray(entries) ? entries.filter(validSearchEntry) : [];
            const ranked = safeEntries
              .map((entry) => ({
                entry,
                score: searchApi.scoreEntry(
                  terms,
                  entry.tokens ?? {
                    title: searchApi.normalizeSearchTokens(entry.title),
                    brand: searchApi.normalizeSearchTokens(entry.brand),
                    tags: searchApi.normalizeSearchTokens((entry.tags ?? []).join(" ")),
                    categories: searchApi.normalizeSearchTokens(
                      `${(entry.categoryIds ?? []).join(" ")} ${(entry.collectionIds ?? []).join(" ")} ${(entry.categoryNames ?? []).join(" ")} ${(entry.collectionNames ?? []).join(" ")}`,
                    ),
                    description: searchApi.normalizeSearchTokens(entry.description),
                  },
                ),
              }))
              .filter((item) => item.score > 0)
              .sort(
                (left, right) =>
                  right.score - left.score ||
                  Number(right.entry.available) - Number(left.entry.available) ||
                  left.entry.title.localeCompare(right.entry.title),
              );
            if (ranked.length === 0) {
              const suggestion = suggestCorrection(terms, safeEntries);
              if (suggestion) {
                const url = `/buscar/?q=${encodeURIComponent(suggestion)}`;
                const message = node("p", s.suggestion.replace("{query}", query), {
                  class: "solara-search-summary",
                });
                message.append(document.createTextNode(" "));
                message.append(node("a", suggestion, { href: url }));
                message.append(document.createTextNode("?"));
                searchGrid.replaceChildren(message);
                return;
              }
              showSearchMessage(s.noResults);
              return;
            }
            if (ranked.length > 48) {
              searchGrid.before(
                node("p", `Mostrando 48 de ${ranked.length} resultados`, {
                  class: "solara-search-summary",
                }),
              );
            }
            searchGrid.replaceChildren(
              ...ranked.slice(0, 48).map(({ entry }) => renderSearchResult(entry)),
            );
            searchGrid.dispatchEvent(new Event("f"));
          })
          .catch(() => {
            showSearchMessage(s.error, undefined, "alert");
          });
        window.addEventListener("pagehide", () => controller.abort(), { once: true });
      }
    } else if (!embed) {
      // En el iframe del preview del Studio no se sirve search-index.json:
      // se conserva el estado estático en vez de mostrar un error.
      const controller = new AbortController();
      showSearchSkeletons();
      const searchIndexError =
        (copy as Record<string, Record<string, string>>).errors?.searchIndexLoad ??
        "No se pudo cargar el índice de búsqueda.";
      fetch(`${baseHref}/search-index.json`, { signal: controller.signal })
        .then((response) => {
          if (!response.ok) throw new Error(searchIndexError);
          return response.json() as Promise<SearchEntryWithTokens[]>;
        })
        .then((entries) => {
          const safeEntries = Array.isArray(entries) ? entries.filter(validSearchEntry) : [];
          searchGrid.replaceChildren(...safeEntries.map(renderSearchResult));
          searchGrid.dispatchEvent(new Event("f"));
        })
        .catch(() => {
          showSearchMessage(s.error, undefined, "alert");
        });
      window.addEventListener("pagehide", () => controller.abort(), { once: true });
    }
  }

  const submitSearchOnEnter = (input: HTMLInputElement | null | undefined): void => {
    input?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.isComposing) return;
      const form = input.form;
      if (!form) return;
      event.preventDefault();
      if (typeof form.requestSubmit === "function") form.requestSubmit();
      else form.submit();
    });
  };
  submitSearchOnEnter(searchInput);
  submitSearchOnEnter(modernSearchInput);

  searchInput?.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown") return;
    const firstResult = searchResults?.querySelector<HTMLElement>(".solara-search-result a");
    if (!firstResult) return;
    event.preventDefault();
    firstResult.focus();
  });
  searchResults?.addEventListener("keydown", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches(".solara-search-result a")) return;
    const links = Array.from(
      searchResults.querySelectorAll<HTMLElement>(".solara-search-result a"),
    );
    const currentIndex = links.indexOf(target);
    if (event.key === "ArrowDown" && links[currentIndex + 1]) {
      event.preventDefault();
      links[currentIndex + 1]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      (links[currentIndex - 1] ?? searchInput)?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      searchInput?.focus();
    }
  });

  document.querySelectorAll<HTMLSelectElement>("[data-category-sort]").forEach((sort) => {
    if (!hasFeature("category")) return;
    const scope = sort.closest<HTMLElement>("main");
    const grid = scope?.querySelector<HTMLElement>("[data-category-grid]");
    const availableOnly = scope?.querySelector<HTMLInputElement>("[data-category-available]");
    const tagFilter = scope?.querySelector<HTMLSelectElement>("[data-category-tag]");
    const minPrice = scope?.querySelector<HTMLInputElement>("[data-category-min-price]");
    const maxPrice = scope?.querySelector<HTMLInputElement>("[data-category-max-price]");
    const optionFilters = Array.from(
      scope?.querySelectorAll<HTMLSelectElement>("[data-category-option]") ?? [],
    );
    const resultCount = scope?.querySelector<HTMLElement>("[data-category-result-count]");
    resultCount?.setAttribute("aria-live", "polite");
    if (!grid) return;
    const getCards = () => Array.from(grid.querySelectorAll<HTMLElement>("[data-product-card]"));
    const filterEmpty = document.createElement("p");
    filterEmpty.className = "solara-empty-state";
    filterEmpty.textContent = e.filteredProducts;
    filterEmpty.hidden = true;
    grid.insertAdjacentElement("afterend", filterEmpty);
    const queryParam = new URLSearchParams(window.location.search).get("q") ?? "";
    const pageSize = queryParam
      ? 0
      : Number(grid.dataset.productsPerPage ?? "") ||
        (grid.closest("[data-search-results]") ? 24 : 0);
    let currentPage = 1;
    if (pageSize > 0) {
      const rawPage = Number.parseInt(
        new URLSearchParams(window.location.search).get("pagina") ?? "1",
        10,
      );
      currentPage = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
      if (currentPage > 1) {
        document.querySelector('meta[name="robots"]')?.setAttribute("content", "noindex,follow");
      }
    }
    const paginationCopy = copy.export ?? {
      pagination: "Paginación",
      previous: "Anterior",
      next: "Siguiente",
      pageOf: "Página {page} de {total}",
    };
    const paginationNav = document.createElement("nav");
    paginationNav.className = "solara-pagination";
    paginationNav.setAttribute("aria-label", paginationCopy.pagination);
    paginationNav.hidden = true;
    const prevButton = node("button", paginationCopy.previous, {
      type: "button",
      "data-pagination-prev": "",
    });
    const pageStatus = node("span", "", {
      "data-pagination-status": "",
      "aria-live": "polite",
      tabindex: "-1",
    });
    const nextButton = node("button", paginationCopy.next, {
      type: "button",
      "data-pagination-next": "",
    });
    paginationNav.append(prevButton, pageStatus, nextButton);
    if (pageSize > 0) filterEmpty.insertAdjacentElement("afterend", paginationNav);
    const render = (): void => {
      const cards = getCards();
      const visible = cards.filter((card) => {
        const price = Number(card.dataset.productPrice ?? "0");
        const min = Number(minPrice?.value ?? "") * 100;
        const max = Number(maxPrice?.value ?? "") * 100;
        const selectedTag = tagFilter?.value.trim().toLocaleLowerCase("es-AR") ?? "";
        const tags =
          `${card.dataset.productTags ?? ""} ${card.dataset.productVariants ?? ""}`.toLocaleLowerCase(
            "es-AR",
          );
        const options = (card.dataset.productOptions ?? "")
          .split("|")
          .map((value) => value.trim().toLocaleLowerCase("es-AR"));
        const selectedOptionsMatch = optionFilters.every((filter) => {
          const value = filter.value.trim().toLocaleLowerCase("es-AR");
          const key = filter.dataset.categoryOptionKey?.trim().toLocaleLowerCase("es-AR");
          return !value || !key || options.includes(`${key}=${value}`);
        });
        return (
          (!availableOnly?.checked || card.dataset.productAvailable === "true") &&
          (!selectedTag || tags.includes(selectedTag)) &&
          selectedOptionsMatch &&
          (!minPrice?.value || price >= min) &&
          (!maxPrice?.value || price <= max)
        );
      });
      const sorted = [...visible];
      if (sort.value === "price-asc" || sort.value === "price-desc") {
        sorted.sort((left, right) => {
          const difference = Number(left.dataset.productPrice) - Number(right.dataset.productPrice);
          return sort.value === "price-asc" ? difference : -difference;
        });
      } else if (sort.value === "name") {
        sorted.sort((left, right) =>
          (left.textContent ?? "").localeCompare(right.textContent ?? ""),
        );
      }
      const totalFilteredPages =
        pageSize > 0 ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
      if (currentPage > totalFilteredPages) currentPage = totalFilteredPages;
      const pageWindow = new Set(
        pageSize > 0 ? sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize) : sorted,
      );
      sorted.forEach((card) => {
        grid.append(card);
      });
      cards.forEach((card) => {
        card.hidden = !pageWindow.has(card);
      });
      filterEmpty.hidden = visible.length > 0;
      if (resultCount) {
        const total = resultCount.getAttribute("data-category-total") ?? String(visible.length);
        resultCount.textContent = `${visible.length} de ${total} ${f.resultCount}`;
      }
      if (pageSize > 0) {
        paginationNav.hidden = totalFilteredPages <= 1;
        prevButton.disabled = currentPage <= 1;
        nextButton.disabled = currentPage >= totalFilteredPages;
        pageStatus.textContent = paginationCopy.pageOf
          .replace("{page}", String(currentPage))
          .replace("{total}", String(totalFilteredPages));
        pageStatus.setAttribute("aria-current", "page");
        const url = new URL(window.location.href);
        if (currentPage > 1) url.searchParams.set("pagina", String(currentPage));
        else url.searchParams.delete("pagina");
        window.history.replaceState(null, "", url);
      }
    };
    const goToPage = (next: number): void => {
      currentPage = Math.max(1, next);
      render();
      pageStatus.focus({ preventScroll: true });
    };
    grid.addEventListener("f", render);
    sort.addEventListener("change", render);
    availableOnly?.addEventListener("change", render);
    tagFilter?.addEventListener("change", render);
    optionFilters.forEach((filter) => {
      filter.addEventListener("change", render);
    });
    minPrice?.addEventListener("input", render);
    maxPrice?.addEventListener("input", render);
    prevButton.addEventListener("click", () => goToPage(currentPage - 1));
    nextButton.addEventListener("click", () => goToPage(currentPage + 1));
  });

  const queryVariant = new URLSearchParams(window.location.search).get("variant");
  if (queryVariant && hasFeature("variants")) {
    document.querySelectorAll<HTMLSelectElement>("[data-variant-select]").forEach((select) => {
      if (Array.from(select.options).some((option) => option.value === queryVariant)) {
        select.value = queryVariant;
        const productRoot = select.closest<HTMLElement>("[data-product]");
        if (productRoot) syncVariant(productRoot);
      }
    });
  }

  document.querySelectorAll<HTMLElement>(".catalog-testimonials-section").forEach((s) => {
    const track = s.querySelector<HTMLElement>(".catalog-testimonials-track");
    const buttons = s.querySelectorAll<HTMLButtonElement>(".catalog-testimonials-controls button");
    if (!track) return;
    const sync = () => {
      const max = track.scrollWidth - track.clientWidth;
      buttons.forEach((button, i) => {
        button.disabled = !max || (i ? track.scrollLeft >= max - 1 : track.scrollLeft <= 1);
        button.setAttribute("aria-disabled", `${button.disabled}`);
      });
    };
    track.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    sync();
  });

  const motionRoots = hasFeature("motion")
    ? Array.from(document.querySelectorAll<HTMLElement>("[data-motion-root]")).filter(
        (element) => element.dataset.motionPreset !== "none",
      )
    : [];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const motionSeen = new WeakSet<HTMLElement>();
  let motionObservers: IntersectionObserver[] = [];
  const connectMotion = (): void => {
    if (motionObservers.length > 0) return;
    if (!reduceMotion && "IntersectionObserver" in window) {
      root.dataset.motionReady = "true";
      motionRoots.forEach((element) => {
        const once = element.dataset.motionOnce !== "false";
        if (once && motionSeen.has(element)) return;
        const entryPoint = Math.max(0, Math.min(1, Number(element.dataset.motionEntry ?? "0.18")));
        const observer = new IntersectionObserver(
          ([entry]) => {
            if (entry?.isIntersecting) {
              if (once && motionSeen.has(element)) return;
              if (once) motionSeen.add(element);
              element.dataset.motionVisible = "true";
              if (once) {
                observer.disconnect();
                motionObservers = motionObservers.filter((current) => current !== observer);
              }
            } else if (!once) {
              delete element.dataset.motionVisible;
            }
          },
          { rootMargin: `0px 0px -${entryPoint * 100}% 0px`, threshold: 0 },
        );
        observer.observe(element);
        motionObservers.push(observer);
      });
    }
  };
  if (!reduceMotion && "IntersectionObserver" in window) {
    connectMotion();
  } else {
    motionRoots.forEach((element) => {
      element.dataset.motionVisible = "true";
    });
  }

  // Appear de marca: el logo y la hero-media se marcan al cargar para que el
  // CSS las presente con la coreografía de su sección (sólo roots con preset
  // distinto de none; `none` y los fallos de red quedan visibles directos).
  if (hasFeature("motion")) {
    const markBrandLoaded = (image: HTMLImageElement): void => {
      image.dataset.solaraLoaded = "true";
      image
        .closest(
          "[data-hero-media], figure.solara-hero-media, .solara-hero-media, .catalog-hero-media",
        )
        ?.setAttribute("data-solara-loaded", "true");
    };
    const markBrandBroken = (image: HTMLImageElement): void => {
      image.dataset.solaraBroken = "true";
    };
    const brandImages = Array.from(
      document.querySelectorAll<HTMLImageElement>(
        '[data-motion-root]:not([data-motion-preset="none"]) img.solara-logo, [data-motion-root]:not([data-motion-preset="none"]) [data-hero-media] img, [data-motion-root]:not([data-motion-preset="none"]) figure.solara-hero-media img, [data-motion-root]:not([data-motion-preset="none"]) .solara-hero-media img, [data-motion-root]:not([data-motion-preset="none"]) .catalog-hero-media img',
      ),
    );
    brandImages.forEach((image) => {
      if (image.complete && image.naturalWidth > 0) {
        markBrandLoaded(image);
      } else if (image.complete && image.getAttribute("src")) {
        markBrandBroken(image);
      } else {
        image.addEventListener("load", () => markBrandLoaded(image), { once: true });
        image.addEventListener("error", () => markBrandBroken(image), { once: true });
      }
    });
  }

  if (hasFeature("cart") || hasFeature("checkout")) {
    const initializeCart = (): void => {
      renderCart(false);
      syncCartToggleExpanded(false);
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initializeCart, { once: true });
    } else {
      initializeCart();
    }
  }
  connectContactForms();
  if (hasFeature("variants")) {
    document.querySelectorAll<HTMLElement>("[data-product]").forEach(syncVariant);
  }

  const pauseRuntime = (): void => {
    if (paused) return;
    paused = true;
    motionObservers.forEach((observer) => {
      observer.disconnect();
    });
    motionObservers = [];
    headerObserver?.disconnect();
    headerObserver = null;
    chromeObserver?.disconnect();
    chromeObserver = null;
    heroAutoplayControls.forEach((control) => {
      control.stop();
    });
  };

  const resumeRuntime = (): void => {
    if (!paused) return;
    paused = false;
    connectMotion();
    connectHeaderObserver();
    connectChromeObserver();
    heroAutoplayControls.forEach((control) => {
      control.start();
    });
    if (hasFeature("variants")) {
      document.querySelectorAll<HTMLElement>("[data-product]").forEach(syncVariant);
    }
    if ((pageType === "cart" || pageType === "checkout") && cart.length > 0) {
      freshCatalog = null;
      void reconcileCart();
    }
  };

  const onVisibility = (): void => {
    if (document.hidden) pauseRuntime();
    else resumeRuntime();
  };
  document.addEventListener("visibilitychange", onVisibility, { passive: true });
  window.addEventListener("message", (event) => {
    if (event.source !== parent) return;
    const type = (event.data as { type?: unknown } | undefined)?.type;
    if (type === "solara-pause") pauseRuntime();
    else if (type === "solara-resume") resumeRuntime();
  });
  if (document.hidden) pauseRuntime();
  root.dataset.solaraReady = "1";
}

const SEARCH_HELPERS: ReadonlyArray<readonly [string, (...args: never[]) => unknown]> = [
  ["normalizeSearchTokens", normalizeSearchTokens],
  ["levenshtein", levenshtein],
  ["scoreEntry", scoreEntry],
];

const RUNTIME_HELPERS: ReadonlyArray<readonly [string, (...args: never[]) => unknown]> = [
  ["installFrameRateCap", installFrameRateCap],
  ...SEARCH_HELPERS,
  ["safeRuntimeImageUrl", safeRuntimeImageUrl],
  ["boundedRuntimeString", boundedRuntimeString],
  ["validRuntimeDimension", validRuntimeDimension],
  ["validRuntimeStringArray", validRuntimeStringArray],
  ["validRuntimeSearchTokens", validRuntimeSearchTokens],
  ["parseCart", parseCart],
  ["normalizeCartQuantity", normalizeCartQuantity],
  ["validCatalogIndexEntry", validCatalogIndexEntry],
  ["reconcileCartLines", reconcileCartLines],
  ["cartLinesEqual", cartLinesEqual],
  ["formatMoney", formatMoney],
  ["buildWhatsAppMessage", buildWhatsAppMessage],
  ["buildWhatsAppUrl", buildWhatsAppUrl],
  ["sanitizeWhatsAppText", sanitizeWhatsAppText],
  ["foldWhatsAppAccents", foldWhatsAppAccents],
  ["isDefaultVariantTitle", isDefaultVariantTitle],
  ["renderWhatsAppLine", renderWhatsAppLine],
  ["mergeWhatsAppLines", mergeWhatsAppLines],
  ["orderFingerprint", orderFingerprint],
  ["resolveWhatsAppGreeting", resolveWhatsAppGreeting],
  ["renderWhatsAppCustomer", renderWhatsAppCustomer],
  ["renderWhatsAppDisclaimer", renderWhatsAppDisclaimer],
  ["splitOrderParts", splitOrderParts],
];

const SERIALIZED_RUNTIME_HELPERS = RUNTIME_HELPERS.map(([name, fn]) => {
  const source = fn.toString();
  const bindingName = source.match(/^function\s+([A-Za-z_$][\w$]*)/)?.[1] ?? name;
  return { name, bindingName, source };
});

function stripRuntimeComments(source: string): string {
  let output = "";
  let quote = "";
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? "";
    const next = source[index + 1] ?? "";
    if (quote) {
      output += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      output += character;
    } else if (character === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") index += 1;
      output += "\n";
    } else if (character === "/" && next === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/"))
        index += 1;
      index += 1;
    } else {
      output += character;
    }
  }
  return output.replace(/^[ \t]+/gm, "").replace(/\n{2,}/g, "\n");
}

export const STOREFRONT_RUNTIME_JS = stripRuntimeComments(`${SERIALIZED_RUNTIME_HELPERS.map(
  ({ bindingName, source }) => `const ${bindingName} = ${source};`,
).join("\n")}
globalThis.__solaraSearchHelpers = { ${SERIALIZED_RUNTIME_HELPERS.filter(({ name }) =>
  SEARCH_HELPERS.some(([searchName]) => searchName === name),
)
  .map(({ name, bindingName }) => (name === bindingName ? name : `${name}: ${bindingName}`))
  .join(", ")} };
(${storefrontBoot.toString()})();`);

/**
 * Entrada para el build externo con esbuild (modo draft): referencia a la
 * funcion de boot. Production sigue usando STOREFRONT_RUNTIME_JS inline.
 */
export const STOREFRONT_RUNTIME_ENTRY = storefrontBoot;

export const STOREFRONT_RUNTIME_CSS = `
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.solara-skeleton {
  border-radius: 0.35rem;
  background: var(--solara-surface);
  animation: solara-shimmer 1.4s ease-in-out infinite;
}

/* El skeleton replica la card real (imagen aspect-ratio 1 + líneas de texto)
   para que la carga de resultados no produzca saltos de layout. */
.solara-skeleton--media {
  aspect-ratio: 1;
}

.solara-skeleton--line {
  height: 1.5rem;
  margin-top: 0.75rem;
}

.solara-skeleton--line + .solara-skeleton--line {
  height: 1.1rem;
  margin-top: 0.5rem;
  width: 62%;
}

[data-cart-drawer] {
  width: min(31rem, 100%);
  max-width: none;
  height: 100dvh;
  max-height: 100dvh;
  margin: 0 0 0 auto;
  border: 0;
  color: var(--solara-text);
  background: var(--solara-background);
  box-shadow: var(--solara-shadow-overlay);
  overscroll-behavior: contain;
}

[data-cart-drawer]::backdrop {
  background: color-mix(in srgb, var(--solara-text) 42%, transparent);
}

.solara-cart-line {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 4rem auto auto;
  align-items: center;
  gap: 1rem;
  padding-block: 1rem;
  border-bottom: 1px solid var(--solara-border);
}

.solara-cart-line button {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--solara-muted);
  cursor: pointer;
  font-size: 0.78rem;
  text-decoration: underline;
}

.solara-cart-line button:hover {
  color: var(--solara-text);
}

.solara-cart-line > div:first-child {
  display: grid;
  grid-template-columns: 3.4rem minmax(0, 1fr);
  align-items: center;
  gap: 0.7rem;
}

.solara-cart-line > div:first-child > img {
  width: 3.4rem;
  height: 3.4rem;
  object-fit: contain;
  object-position: center;
  display: block;
  background: var(--solara-surface);
}

.solara-cart-line small {
  display: block;
  color: var(--solara-muted);
}

.solara-cart-line-warning {
  color: var(--solara-sale, var(--solara-accent)) !important;
  font-weight: 650;
}

.solara-cart-line input {
  width: 100%;
  min-height: 2.5rem;
}

.solara-whatsapp-truncated {
  margin: 0.25rem 0 0;
  font-size: 0.75rem;
  color: var(--solara-muted);
}

@media (max-width: 520px) {
  .solara-cart-line {
    grid-template-columns: minmax(0, 1fr) 4rem;
  }

  .solara-cart-line > button,
  .solara-cart-line > span:last-child {
    grid-column: 2;
    justify-self: end;
  }
}

/* Progressive motion: content remains visible while the observer is idle or unavailable. */
[data-motion-root][data-motion-visible="true"][data-motion-preset="fade"] [data-motion-zone] {
  animation: solara-motion-fade var(--motion-duration, 600ms) var(--motion-easing, cubic-bezier(.16, 1, .3, 1)) var(--motion-delay, 0ms) backwards;
}

[data-motion-root][data-motion-visible="true"][data-motion-preset="fade-up"] [data-motion-zone] {
  animation: solara-motion-fade-up var(--motion-duration, 600ms) var(--motion-easing, cubic-bezier(.16, 1, .3, 1)) var(--motion-delay, 0ms) backwards;
}

[data-motion-root][data-motion-visible="true"][data-motion-preset="slide"] [data-motion-zone] {
  --motion-slide-x: calc(var(--motion-distance, 24px) * var(--motion-intensity, 1));
  --motion-slide-y: 0px;
  animation: solara-motion-slide var(--motion-duration, 600ms) var(--motion-easing, cubic-bezier(.16, 1, .3, 1)) var(--motion-delay, 0ms) backwards;
}

[data-motion-root][data-motion-visible="true"][data-motion-preset="slide"][data-motion-direction="left"] [data-motion-zone] {
  --motion-slide-x: calc(var(--motion-distance, 24px) * var(--motion-intensity, 1) * -1);
}

[data-motion-root][data-motion-visible="true"][data-motion-preset="slide"][data-motion-direction="right"] [data-motion-zone] {
  --motion-slide-x: calc(var(--motion-distance, 24px) * var(--motion-intensity, 1));
}

[data-motion-root][data-motion-visible="true"][data-motion-preset="slide"][data-motion-direction="up"] [data-motion-zone] {
  --motion-slide-x: 0px;
  --motion-slide-y: calc(var(--motion-distance, 24px) * var(--motion-intensity, 1));
}

[data-motion-root][data-motion-visible="true"][data-motion-preset="slide"][data-motion-direction="down"] [data-motion-zone] {
  --motion-slide-x: 0px;
  --motion-slide-y: calc(var(--motion-distance, 24px) * var(--motion-intensity, 1) * -1);
}

[data-motion-root][data-motion-visible="true"][data-motion-preset="scale"] [data-motion-zone] {
  animation: solara-motion-scale var(--motion-duration, 600ms) var(--motion-easing, cubic-bezier(.16, 1, .3, 1)) var(--motion-delay, 0ms) backwards;
}

[data-motion-root][data-motion-visible="true"][data-motion-preset="stagger"] [data-motion-zone] > * {
  animation: solara-motion-fade-up var(--motion-duration, 600ms) var(--motion-easing, cubic-bezier(.16, 1, .3, 1)) backwards;
}

[data-motion-root][data-motion-preset="stagger"][data-motion-visible="true"] [data-motion-zone] > :nth-child(2) { animation-delay: var(--motion-stagger, 80ms); }
[data-motion-root][data-motion-preset="stagger"][data-motion-visible="true"] [data-motion-zone] > :nth-child(3) { animation-delay: calc(var(--motion-stagger, 80ms) * 2); }
[data-motion-root][data-motion-preset="stagger"][data-motion-visible="true"] [data-motion-zone] > :nth-child(4) { animation-delay: calc(var(--motion-stagger, 80ms) * 3); }
[data-motion-root][data-motion-preset="stagger"][data-motion-visible="true"] [data-motion-zone] > :nth-child(n+5) { animation-delay: calc(var(--motion-stagger, 80ms) * 4); }

@supports (animation-timeline: view()) {
  [data-motion-root][data-motion-preset="parallax"] [data-motion-zone] {
    animation: solara-parallax linear both;
    animation-timeline: view();
    animation-range: entry -10% exit 110%;
  }

  [data-motion-root][data-motion-preset="scroll-progress"] {
    transform-origin: left center;
    animation: solara-progress linear both;
    animation-timeline: view();
    animation-range: entry 0% cover 100%;
  }
}

@supports not (animation-timeline: view()) {
  [data-motion-root][data-motion-preset="parallax"] [data-motion-zone] {
    transform: none;
  }

  [data-motion-root][data-motion-preset="scroll-progress"] {
    transform-origin: left center;
    transform: scaleX(1);
  }
}

[data-motion-root][data-motion-preset="layer-stack"] {
  position: relative;
}

[data-motion-root][data-motion-preset="layer-stack"] [data-motion-zone] {
  position: sticky;
  top: var(--layer-top, 5rem);
  z-index: 1;
}

[data-motion-root][data-motion-preset="layer-stack"] [data-motion-zone] > * {
  position: relative;
  z-index: 1;
}

@keyframes solara-parallax {
  from { transform: translate3d(0, -2%, 0) scale(1.03); }
  to { transform: translate3d(0, 2%, 0) scale(1.03); }
}

@keyframes solara-motion-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes solara-motion-fade-up {
  from { opacity: 0; transform: translate3d(0, calc(var(--motion-distance, 24px) * var(--motion-intensity, 1)), 0); }
  to { opacity: 1; transform: none; }
}

/* slide respeta data-motion-direction; fade-up conserva su subida vertical (direction no aplica ahí). */
@keyframes solara-motion-slide {
  from { opacity: 0; transform: translate3d(var(--motion-slide-x, 24px), var(--motion-slide-y, 0px), 0); }
  to { opacity: 1; transform: none; }
}

@keyframes solara-motion-scale {
  from { opacity: 0; transform: scale(calc(1 - (0.03 * var(--motion-intensity, 1)))); }
  to { opacity: 1; transform: none; }
}

@keyframes solara-progress {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}

@keyframes solara-shimmer {
  50% { opacity: 0.45; }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }

  .solara-skeleton {
    animation: none;
  }

  [data-motion-root],
  [data-motion-root] [data-motion-zone],
  [data-motion-root] [data-motion-zone] > * {
    opacity: 1 !important;
    transform: none !important;
  }
}

@media (max-width: 767px) {
  [data-motion-root][data-motion-preset="parallax"],
  [data-motion-root][data-motion-preset="layer-stack"] {
    position: static;
    animation: none;
    transform: none;
  }

  [data-motion-root][data-motion-preset="parallax"] [data-motion-zone] {
    transform: none;
  }
}
`;
