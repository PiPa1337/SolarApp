/**
 * Fix mobile galería producto (todas las tiendas): stage cuadrado 1:1 con
 * imágenes en cover y video en contain para preservar el cuadro completo.
 * Se interpola AL FINAL de la hoja final del exporter con especificidad
 * reforzada para ganar a las reglas históricas de mobile sólo en ≤767px.
 * Desktop y thumbs intactos.
 */
export const PRODUCT_GALLERY_MOBILE_FIX = `@media (max-width:767px){:is([data-solara-store].catalog-modern.catalog-modern,[data-solara-module="product-detail"][data-solara-module="product-detail"]) *:is(.catalog-product-gallery-main,.solara-product-gallery-main){width:100%;aspect-ratio:1;max-height:none;overflow:hidden}:is([data-solara-store].catalog-modern.catalog-modern,[data-solara-module="product-detail"][data-solara-module="product-detail"]) *:is(figure[data-gallery-active]){width:100%;height:100%;aspect-ratio:1;margin:0;background:var(--catalog-surface,var(--solara-surface))}:is([data-solara-store].catalog-modern.catalog-modern,[data-solara-module="product-detail"][data-solara-module="product-detail"]) *:is(figure[data-gallery-active="true"])[data-gallery-active="true"]{display:block}:is([data-solara-store].catalog-modern.catalog-modern,[data-solara-module="product-detail"][data-solara-module="product-detail"]) *:is(img.catalog-product-gallery-image,img.solara-product-gallery-image){width:100%;height:100%;max-height:none;object-fit:cover;object-position:center}:is([data-solara-store].catalog-modern.catalog-modern,[data-solara-module="product-detail"][data-solara-module="product-detail"]) *:is(video.catalog-product-gallery-video,video.solara-product-gallery-video){width:100%;height:100%;max-height:none;object-fit:contain;object-position:center}}@media (hover:none),(pointer:coarse){.cm.v2 .catalog-product-gallery-main:hover .catalog-product-gallery-image{transform:none}}`;

export const MOBILE_HERO_SQUARE_FIX = `@media (max-width:767px){[data-solara-store].catalog-modern .catalog-hero-inner,.cm.v2 .catalog-hero-editorial .catalog-hero-inner,.cm.v2 .catalog-hero-editorial [data-hero-media]{border-radius:0}}`;

export const STORE_BASE_STYLES = `
[data-solara-store] {
  color: var(--solara-text);
  background: var(--solara-background);
  font-family: var(--solara-font-body);
  font-size: calc(1rem * var(--solara-type-scale, 1));
  line-height: 1.58;
  min-width: 0;
}
.solara-skip-link {
  position: fixed;
  z-index: 50;
  top: .5rem;
  left: .5rem;
  padding: .5rem .8rem;
  transform: translateY(-160%);
  background: var(--solara-text);
  color: var(--solara-background);
}
.solara-skip-link:focus {
  transform: translateY(0);
}
[data-solara-store] .solara-consumer-rights {
  grid-column: 1 / -1;
  justify-self: end;
  max-width: min(calc(100vw - 1rem), 22rem);
  margin-top: 1rem;
  padding: .45rem .7rem;
  border: 1px solid var(--solara-border);
  border-radius: var(--solara-radius);
  background: var(--solara-surface);
  color: var(--solara-text);
  font-size: .75rem;
  line-height: 1.35;
}
[data-solara-store] .solara-consumer-rights a {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: .15em;
}
[data-solara-store] .solara-consumer-rights a:hover,
[data-solara-store] .solara-consumer-rights a:focus-visible {
  color: var(--solara-accent);
}
[data-solara-store] *,
[data-solara-store] *::before,
[data-solara-store] *::after {
  box-sizing: border-box;
}
[data-solara-store] img {
  display: block;
  max-width: 100%;
}
[data-solara-store] picture,
[data-solara-store] figure {
  display: block;
  max-width: 100%;
}
[data-solara-store] .solara-product-media > picture,
[data-solara-store] .catalog-product-media > picture {
  display: block;
  width: 100%;
  height: 100%;
}
[data-solara-store] .solara-product-gallery-main figure > picture,
[data-solara-store] .solara-product-gallery-thumbs button > picture,
[data-solara-store] .catalog-product-gallery-main figure > picture,
[data-solara-store] .catalog-product-gallery-thumbs button > picture {
  display: block;
  width: 100%;
  height: 100%;
  margin: 0;
  line-height: 0;
}
[data-solara-store] .solara-product-media > picture > img,
[data-solara-store] .catalog-product-media > picture > img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}
/* Los medios comerciales llenan su marco con un recorte centrado y consistente. */
[data-solara-store] .catalog-product-card-image,
[data-solara-store] .solara-category-hero img,
[data-solara-store] .catalog-product-media img,
[data-solara-store] .solara-product-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  display: block;
}
[data-solara-store] .solara-product-gallery-main img,
[data-solara-store] .catalog-product-gallery-main img,
[data-solara-store] .solara-product-gallery-image,
[data-solara-store] .catalog-product-gallery-image,
[data-solara-store] .solara-product-gallery-thumbs img,
[data-solara-store] .catalog-product-gallery-thumbs img,
[data-solara-store] img.solara-product-gallery-thumb,
[data-solara-store] img.catalog-product-gallery-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  display: block;
}
[data-solara-store] a {
  color: inherit;
  text-underline-offset: 0.2em;
}
[data-solara-store] button,
[data-solara-store] input,
[data-solara-store] select,
[data-solara-store] textarea {
  color: inherit;
  font: inherit;
}
[data-solara-store] button,
[data-solara-store] a {
  transition:
    background-color var(--solara-motion-fast, 180ms) var(--solara-motion-easing, ease),
    border-color var(--solara-motion-fast, 180ms) var(--solara-motion-easing, ease),
    color var(--solara-motion-fast, 180ms) var(--solara-motion-easing, ease),
    opacity var(--solara-motion-fast, 180ms) var(--solara-motion-easing, ease),
    transform var(--solara-motion-fast, 180ms) var(--solara-motion-easing, ease);
}
[data-solara-store] button:disabled,
[data-solara-store] input:disabled,
[data-solara-store] select:disabled,
[data-solara-store] textarea:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}
[data-solara-store] button,
[data-solara-store] summary,
[data-solara-store] a {
  -webkit-tap-highlight-color: transparent;
}
[data-solara-store] :focus-visible {
  outline: 3px solid color-mix(in srgb, var(--solara-accent), var(--solara-accent-text) 28%);
  outline-offset: 3px;
}
[data-solara-store] h1,
[data-solara-store] h2,
[data-solara-store] h3,
[data-solara-store] p,
[data-solara-store] figure {
  margin: 0;
}
[data-solara-store] h1,
[data-solara-store] h2,
[data-solara-store] h3 {
  font-family: var(--solara-font-display);
  font-weight: 500;
  letter-spacing: -0.045em;
  line-height: 0.98;
  text-wrap: balance;
}
[data-solara-store] .solara-primary-action,
[data-solara-store] .solara-secondary-action {
  align-items: center;
  border: 1px solid transparent;
  border-radius: var(--solara-radius);
  display: inline-flex;
  font-weight: 650;
  justify-content: center;
  min-height: 48px;
  overflow-wrap: anywhere;
  padding: .75rem 1.1rem;
  text-align: center;
  text-decoration: none;
}
[data-solara-store] .solara-primary-action {
  background: var(--solara-accent);
  color: var(--solara-accent-text);
}
[data-solara-store] .solara-search-form .solara-primary-action {
  border-radius: 0;
}
[data-solara-store] .solara-secondary-action {
  border-color: var(--solara-border);
}
[data-solara-store] .solara-primary-action:hover {
  background: color-mix(in srgb, var(--solara-accent) 88%, var(--solara-accent-text));
  transform: translateY(-1px);
}
[data-solara-store] .solara-secondary-action:hover {
  background: var(--solara-surface);
  border-color: var(--solara-muted);
}
[data-solara-store] .solara-primary-action:active,
[data-solara-store] .solara-secondary-action:active,
[data-solara-store] button:active {
  transform: translateY(1px);
}
[data-solara-store] .solara-container {
  width: min(calc(100% - 2rem), var(--solara-container));
  margin-inline: auto;
}
[data-solara-store] .solara-page-intro {
  max-width: 60rem;
  padding: clamp(4rem, 10vw, 8rem) 0 clamp(3rem, 7vw, 6rem);
}
[data-solara-store] .solara-page-intro h1 {
  max-width: 12ch;
  margin-top: .75rem;
  font-size: clamp(3rem, 8vw, 8rem);
}
[data-solara-store] .solara-page-intro > p:last-child {
  max-width: 42ch;
  margin-top: 1.4rem;
  color: var(--solara-muted);
  font-size: 1.12rem;
}
[data-solara-store] .solara-breadcrumbs {
  display: flex;
  flex-wrap: wrap;
  gap: .5rem;
  padding-top: 1.5rem;
  color: var(--solara-muted);
  font-size: .8rem;
}
[data-solara-store] .solara-breadcrumbs a:hover {
  color: var(--solara-accent);
}
[data-solara-store] .solara-story-grid,
[data-solara-store] .solara-contact-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: clamp(2rem, 8vw, 9rem);
  padding: clamp(3rem, 8vw, 7rem) 0;
  border-top: 1px solid var(--solara-border);
}
[data-solara-store] .solara-story-grid h2,
[data-solara-store] .solara-contact-grid h2 {
  max-width: 14ch;
  font-size: clamp(2rem, 4vw, 4rem);
}
[data-solara-store] .solara-story-grid p,
[data-solara-store] .solara-contact-grid p {
  max-width: 48ch;
  margin-top: 1rem;
  color: var(--solara-muted);
}
[data-solara-store] .solara-story-grid .solara-secondary-action,
[data-solara-store] .solara-contact-grid .solara-primary-action {
  margin-top: 1.5rem;
}
[data-solara-store] .solara-values-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  margin: 0 0 clamp(4rem, 10vw, 9rem);
  border-block: 1px solid var(--solara-border);
}
[data-solara-store] .solara-values-grid article {
  min-height: 12rem;
  padding: 1.5rem 0;
  border-right: 1px solid var(--solara-border);
}
[data-solara-store] .solara-values-grid article:last-child {
  border-right: 0;
}
[data-solara-store] .solara-values-grid h2 {
  font-size: 1.55rem;
}
[data-solara-store] .solara-values-grid p {
  margin-top: .8rem;
  color: var(--solara-muted);
}
[data-solara-store] .solara-contact-details {
  display: grid;
  gap: 1px;
  border-block: 1px solid var(--solara-border);
}
[data-solara-store] .solara-contact-details > * {
  display: grid;
  gap: .25rem;
  padding: 1.1rem 0;
  border-bottom: 1px solid var(--solara-border);
  text-decoration: none;
}
[data-solara-store] .solara-contact-details > *:last-child {
  border-bottom: 0;
}
[data-solara-store] .solara-contact-details span {
  color: var(--solara-muted);
  font-size: .75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
[data-solara-store] .solara-contact-details a:hover strong {
  color: var(--solara-accent);
}
[data-solara-store] .solara-search-form {
  display: grid;
  gap: .5rem;
  max-width: 48rem;
  padding-bottom: clamp(3rem, 8vw, 7rem);
}
[data-solara-store] .solara-search-form > div {
  display: flex;
  gap: .75rem;
}
[data-solara-store] .solara-search-form input,
[data-solara-store] .solara-checkout-form input,
[data-solara-store] .solara-checkout-form textarea {
  min-height: 3.1rem;
  width: 100%;
  padding: .75rem 0.85rem;
  border: 1px solid var(--solara-border);
  border-radius: var(--solara-radius);
  background: var(--solara-surface);
}
[data-solara-store] .solara-search-form input {
  border-radius: 0;
}
[data-solara-store] .solara-search-results {
  min-height: 14rem;
  padding-block: 2rem 6rem;
  border-top: 1px solid var(--solara-border);
}
[data-solara-store] .solara-search-results-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.5rem;
}
[data-solara-store] .solara-search-result a {
  display: grid;
  gap: .75rem;
  text-decoration: none;
}
[data-solara-store] .solara-search-result img {
  width: 100%;
  height: auto;
  aspect-ratio: 1;
  object-fit: cover;
  object-position: center;
  background: var(--solara-surface);
}
[data-solara-store] .solara-search-result h2 {
  font-size: 1.35rem;
  overflow-wrap: anywhere;
}
[data-solara-store] .solara-search-result p {
  color: var(--solara-muted);
}
[data-solara-store] .solara-search-result a:hover h2 {
  color: var(--solara-accent);
}
[data-solara-store] .solara-cart-page-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(16rem, 0.34fr);
  gap: clamp(2rem, 7vw, 7rem);
}
[data-solara-store] .solara-cart-page-grid {
  padding-block: 2rem 7rem;
}
[data-solara-store] .solara-cart-page-grid [data-cart-lines]:has(> .solara-cart-empty, > .solara-empty-state) {
  align-self: center;
}
[data-solara-store] .solara-cart-page-grid aside {
  align-self: start;
  display: grid;
  gap: .75rem;
  padding-top: 1rem;
}
[data-solara-store] .solara-cart-summary > p {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin: 0;
}
[data-solara-store] .solara-cart-summary > p strong {
  text-align: right;
  font-size: 1rem;
}
[data-solara-store] .solara-cart-page-grid aside strong {
  font-family: var(--solara-font-display);
  font-size: 2rem;
}
[data-solara-store] .solara-cart-summary > p:last-of-type strong {
  font-size: 2rem;
}
[data-solara-store] .solara-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: .75rem;
  margin: 2.5rem auto 6rem;
}
[data-solara-store] .solara-pagination[hidden] { display: none !important; }
[data-solara-store] .solara-pagination a,
[data-solara-store] .solara-pagination span {
  min-width: 2.75rem;
  min-height: 2.75rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: .5rem .75rem;
  border: 1px solid var(--solara-border);
  border-radius: var(--solara-radius);
  text-decoration: none;
}
[data-solara-store] .solara-pagination a:hover {
  border-color: var(--solara-accent);
  color: var(--solara-accent);
}
[data-solara-store] .solara-pagination button {
  min-width: 2.75rem;
  min-height: 2.75rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: .5rem .75rem;
  border: 1px solid var(--solara-border);
  border-radius: var(--solara-radius);
  background: transparent;
  font: inherit;
  color: inherit;
  cursor: pointer;
}
[data-solara-store] .solara-pagination button:hover:not(:disabled) {
  border-color: var(--solara-accent);
  color: var(--solara-accent);
}
[data-solara-store] .solara-pagination button:disabled {
  opacity: .45;
  cursor: default;
}
[data-solara-store] .solara-pagination span[aria-current="page"] {
  border-color: var(--solara-accent);
  background: var(--solara-accent);
  color: var(--solara-accent-text);
}
[data-solara-store] .solara-pagination .solara-pagination__ellipsis {
  min-width: 0;
  min-height: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--solara-muted);
}
[data-solara-store] .solara-checkout-form {
  display: grid;
  gap: .75rem;
  max-width: 38rem;
  padding-bottom: 7rem;
}
[data-solara-store] .solara-checkout-form textarea {
  min-height: 7rem;
  resize: vertical;
}
[data-solara-store] .solara-checkout-form button,
[data-solara-store] .solara-checkout-form a {
  width: fit-content;
  margin-top: .8rem;
}
[data-solara-store] .solara-checkout-form pre {
  max-width: 100%;
  margin: 1.4rem 0 0;
  padding: 1rem;
  overflow: auto;
  background: var(--solara-surface);
  white-space: pre-wrap;
}
[data-solara-store] .solara-category-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin: 2rem 0 1.25rem;
  padding-block: 0.85rem;
  border-block: 0;
  color: var(--solara-muted);
  font-size: 0.88rem;
}
[data-solara-store] .solara-category-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(18rem, 0.52fr);
  grid-template-areas: "copy media";
  align-items: start;
  gap: clamp(1.25rem, 3vw, 3rem);
  padding-top: clamp(2rem, 4vw, 3rem);
}
[data-solara-store] .solara-category-hero-copy {
  grid-area: copy;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: clamp(.65rem, 1.5vw, 1rem);
}
[data-solara-store] .solara-category-hero h1 {
  min-width: 0;
  margin: 0;
}
/* Texto editorial de categoria (seoIntro): refuerza long-tail SEO. */
[data-solara-store] .solara-category-intro {
  max-width: 46rem;
  margin: 1.5rem auto 0;
  color: var(--catalog-muted, inherit);
  font-size: 0.95rem;
  line-height: 1.7;
}
[data-solara-store] .solara-category-intro .sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
/* El título mantiene su ancla de edición sin agregar una caja visual alrededor. */
[data-solara-store] .solara-category-hero .solara-category-title-glass {
  display: inline;
  padding: 0;
  background: transparent;
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
  border: 0;
}
[data-solara-store] .solara-category-hero p {
  max-width: 62ch;
  margin: 0;
  color: var(--solara-muted);
}
[data-solara-store] .solara-category-hero > img,
[data-solara-store] .solara-category-hero > picture {
  grid-area: media;
  align-self: start;
  width: 100%;
  min-width: 0;
}
[data-solara-store] .solara-category-hero img {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  object-position: center;
  background: var(--solara-surface);
}
[data-solara-store] .solara-category-children {
  margin-top: 2rem;
  padding: 1rem 0;
  border-block: 1px solid var(--solara-border);
}
[data-solara-store] .solara-category-children h2 {
  margin: 0 0 0.85rem;
  font-size: 0.78rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
[data-solara-store] .solara-category-children ul {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: .5rem;
  list-style: none;
  margin: 0;
  padding: 0;
}
[data-solara-store] .solara-category-children li {
  min-width: 0;
}
[data-solara-store] .solara-category-children a {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: .75rem;
  min-height: 44px;
  min-width: 0;
  overflow-wrap: break-word;
  padding: .75rem .75rem;
  border: 1px solid var(--solara-border);
  color: var(--solara-text);
  text-decoration: none;
}
[data-solara-store] .solara-category-children a:hover {
  border-color: var(--solara-accent);
  color: var(--solara-accent);
}
[data-solara-store] .solara-category-children small {
  color: var(--solara-muted);
  white-space: nowrap;
}
[data-solara-store] .solara-error-page {
  min-height: 60svh;
  padding-block: 8rem;
}
[data-solara-store] .solara-related-products {
  border-top: 1px solid var(--solara-border);
}
[data-solara-store] .solara-related-products > .solara-container > h2 {
  margin-top: 3rem;
  padding-inline: 1.25rem;
}
[data-solara-store] .solara-category-toolbar > details {
  margin-left: auto;
}
[data-solara-store] .solara-category-toolbar details > div,
[data-solara-store] .solara-category-toolbar details > label {
  display: block;
  padding-top: .65rem;
}
[data-solara-store] .solara-category-toolbar details > div {
  display: grid;
  gap: .5rem;
  min-width: min(18rem, 80vw);
}
[data-solara-store] .solara-category-toolbar details input,
[data-solara-store] .solara-category-toolbar details select {
  max-width: 8rem;
  min-height: 2rem;
  margin-left: .3rem;
  border: 1px solid var(--solara-border);
  border-radius: var(--solara-radius);
  background: var(--solara-surface);
  color: var(--solara-text);
}
[data-solara-store] .solara-category-toolbar select {
  min-height: 2.4rem;
  margin-left: .35rem;
  padding: .25rem .55rem;
  border: 1px solid var(--solara-border);
  border-radius: var(--solara-radius);
  background: var(--solara-surface);
  color: var(--solara-text);
}
@media (max-width: 767px) {
  [data-solara-store] .solara-story-grid,
  [data-solara-store] .solara-contact-grid,
  [data-solara-store] .solara-search-results-grid,
  [data-solara-store] .solara-cart-page-grid {
    grid-template-columns: 1fr;
  }
  [data-solara-store] .solara-values-grid {
    grid-template-columns: 1fr;
  }
  [data-solara-store] .solara-values-grid article {
    min-height: auto;
    border-right: 0;
    border-bottom: 1px solid var(--solara-border);
  }
  [data-solara-store] .solara-values-grid article:last-child {
    border-bottom: 0;
  }
  [data-solara-store] .solara-search-form > div {
    display: grid;
  }
  [data-solara-store] .solara-category-toolbar {
    align-items: stretch;
    flex-wrap: wrap;
  }
  [data-solara-store] .solara-category-hero {
    grid-template-columns: 1fr;
    grid-template-areas: "copy" "media";
    gap: 1rem;
  }
  [data-solara-store] .solara-category-hero-copy { width: 100%; }
  [data-solara-store] .solara-category-hero > img,
  [data-solara-store] .solara-category-hero > picture { grid-area: media; }
  [data-solara-store] .solara-category-children ul {
    grid-template-columns: 1fr;
  }
  [data-solara-store] .solara-category-toolbar > details {
    margin-left: 0;
  }
  [data-solara-store] .solara-search-results-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  [data-solara-store] .solara-search-form .solara-primary-action {
    width: 100%;
  }
}
@media (prefers-reduced-motion: reduce) {
  [data-solara-store] *,
  [data-solara-store] *::before,
  [data-solara-store] *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
[data-solara-store] .solara-product-gallery-main video,
[data-solara-store] .catalog-product-gallery-main video{width:100%;height:100%;object-fit:cover;display:block}
[data-solara-store] .catalog-product-gallery-thumbs button,[data-solara-store] .solara-product-gallery-thumbs button{position:relative}
[data-solara-store] .catalog-product-thumb-badge,[data-solara-store] .solara-product-thumb-badge{position:absolute;right:4px;bottom:4px;font-size:11px;padding:2px 6px;border-radius:999px;background:rgba(0,0,0,.72);color:#fff}
[data-solara-store] .solara-cart-page [data-cart-lines] .solara-cart-empty {
  color: var(--solara-muted);
  padding: 2rem 0;
}
`;

export const MODULE_STYLE_BLOCKS: Readonly<Record<string, string>> = {
  "announcement-bar": `
[data-solara-module="announcement-bar"] {
  background: var(--solara-accent);
  color: var(--solara-accent-text);
}
[data-solara-module="announcement-bar"] .solara-announcement {
  align-items: center;
  display: flex;
  font-size: 0.72rem;
  font-weight: 650;
  gap: 1rem;
  justify-content: center;
  margin: 0 auto;
  max-width: var(--solara-container);
  min-height: 36px;
  overflow-wrap: anywhere;
  padding: .5rem 1rem;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}
[data-solara-module="announcement-bar"] a {
  font-weight: 700;
}
`,
  "editorial-header": `
[data-solara-module="editorial-header"] {
  background: color-mix(in srgb, var(--solara-background), transparent 2%);
  border-bottom: 1px solid var(--solara-border);
  position: sticky;
  top: 0;
  z-index: 10;
}
[data-solara-module="editorial-header"][data-scrolled="true"] {
  background: var(--solara-background);
}
[data-solara-module="editorial-header"] .solara-header {
  align-items: center;
  display: grid;
  gap: 1.25rem;
  grid-template-columns: minmax(8rem, 1fr) auto auto;
  margin: 0 auto;
  max-width: var(--solara-container);
  min-height: 80px;
  padding: 0 1.25rem;
}
[data-solara-module="editorial-header"] .solara-brand {
  font-family: var(--solara-font-display);
  font-size: 1.45rem;
  font-weight: 500;
  letter-spacing: -0.04em;
  text-decoration: none;
}
[data-solara-module="editorial-header"] .solara-logo {
  height: 34px;
  object-fit: contain;
  object-position: left center;
  width: auto;
}
[data-solara-module="editorial-header"] .solara-desktop-nav {
  display: flex;
  gap: 1.5rem;
  white-space: nowrap;
}
[data-solara-module="editorial-header"] .solara-desktop-nav a {
  color: var(--solara-muted);
  font-size: 0.9rem;
  min-width: 0;
  overflow: hidden;
  text-decoration: none;
  text-overflow: ellipsis;
  text-underline-offset: .45rem;
  white-space: nowrap;
}
[data-solara-module="editorial-header"] .solara-desktop-nav a:hover {
  color: var(--solara-text);
  text-decoration: underline;
}
[data-solara-module="editorial-header"] .solara-cart-trigger {
  background: var(--solara-text);
  border: 0;
  border-radius: var(--solara-radius);
  color: var(--solara-background);
  cursor: pointer;
  min-height: 42px;
  padding: .5rem 1rem;
  white-space: nowrap;
}
[data-solara-module="editorial-header"] .solara-mobile-nav {
  display: none;
}
@media (max-width: 767px) {
  [data-solara-module="editorial-header"] .solara-header {
    grid-template-columns: 1fr auto auto;
    min-height: 64px;
    padding: 0 1rem;
  }
  [data-solara-module="editorial-header"] .solara-desktop-nav {
    display: none;
  }
  [data-solara-module="editorial-header"] .solara-mobile-nav {
    display: block;
    grid-column: 3;
    grid-row: 1;
  }
[data-solara-module="editorial-header"] .solara-mobile-nav summary {
    cursor: pointer;
    font-weight: 650;
    list-style: none;
    min-height: 42px;
    padding: .5rem 0;
  }
  [data-solara-module="editorial-header"] .solara-mobile-nav nav {
    background: var(--solara-background);
    border: 1px solid var(--solara-border);
    border-radius: var(--solara-radius);
    display: grid;
    gap: .75rem;
    padding: 1rem;
    position: absolute;
    right: 1rem;
    top: 58px;
    width: min(18rem, calc(100vw - 2rem));
    box-shadow: var(--solara-shadow-overlay);
  }
  [data-solara-module="editorial-header"] .solara-nav-dropdown--wide > ul {
    grid-template-columns: 1fr;
    min-width: 0;
  }
  [data-solara-module="editorial-header"] .solara-cart-trigger {
    grid-column: 2;
    grid-row: 1;
  }
}
[data-solara-module="editorial-header"] .solara-header {
  grid-template-columns: auto minmax(0, 1fr) auto;
  min-height: 72px;
  padding-inline: max(1rem, calc((100% - var(--solara-container)) / 2));
}
[data-solara-module="editorial-header"] .solara-desktop-nav {
  align-items: center;
  justify-content: center;
  gap: clamp(.75rem, 2vw, 1.8rem);
}
[data-solara-module="editorial-header"] .solara-desktop-nav > a,
[data-solara-module="editorial-header"] .solara-nav-dropdown summary {
  color: var(--solara-text);
  cursor: pointer;
  font-size: 0.82rem;
  list-style: none;
}
[data-solara-module="editorial-header"] .solara-nav-dropdown {
  position: relative;
}
[data-solara-module="editorial-header"] .solara-nav-dropdown > ul {
  position: absolute;
  top: calc(100% + .8rem);
  left: -1rem;
  z-index: 20;
  display: grid;
  min-width: 13rem;
  gap: .25rem;
  margin: 0;
  padding: .75rem;
  border: 1px solid var(--solara-border);
  background: var(--solara-background);
  box-shadow: var(--solara-shadow-overlay);
  list-style: none;
}
[data-solara-module="editorial-header"] .solara-nav-dropdown--wide > ul {
  grid-template-columns: repeat(2, minmax(12rem, 1fr));
  min-width: min(30rem, 70vw);
}
[data-solara-module="editorial-header"] .solara-nav-dropdown ul ul {
  display: grid;
  gap: .25rem;
  margin: .2rem 0 0;
  padding: .5rem 0 .5rem .8rem;
  border-left: 1px solid var(--solara-border);
  list-style: none;
}
[data-solara-module="editorial-header"] .solara-nav-dropdown li a {
  display: block;
  padding: .5rem;
  text-decoration: none;
}
[data-solara-module="editorial-header"] .solara-nav-dropdown li a:hover {
  background: var(--solara-surface);
  color: var(--solara-accent);
}
[data-solara-module="editorial-header"] .solara-header-actions {
  display: flex;
  align-items: center;
  justify-content: end;
  gap: .75rem;
}
[data-solara-module="editorial-header"] .solara-search-trigger {
  text-decoration: none;
}
[data-solara-module="editorial-header"] .solara-search-trigger:hover {
  color: var(--solara-accent);
}
[data-solara-module="editorial-header"] .solara-brand {
  display: block;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (max-width: 767px) {
  [data-solara-module="editorial-header"] .solara-header {
    grid-template-columns: auto 1fr auto;
    padding-inline: 1rem;
  }
  [data-solara-module="editorial-header"] .solara-mobile-nav {
    grid-column: 1;
    grid-row: 1;
    justify-self: start;
  }
  [data-solara-module="editorial-header"] .solara-brand {
    grid-column: 2;
    grid-row: 1;
    justify-self: center;
  }
  [data-solara-module="editorial-header"] .solara-header-actions {
    grid-column: 3;
    grid-row: 1;
  }
  [data-solara-module="editorial-header"] .solara-header-actions {
    gap: .5rem;
  }
  [data-solara-module="editorial-header"] .solara-header-actions .solara-search-trigger {
    font-size: 0.78rem;
  }
  [data-solara-module="editorial-header"] .solara-cart-trigger {
    min-height: 44px;
    padding-inline: .55rem;
    font-size: 0;
  }
  [data-solara-module="editorial-header"] .solara-cart-trigger span {
    font-size: .8rem;
  }
  [data-solara-module="editorial-header"] .solara-nav-dropdown--wide > ul {
    grid-template-columns: 1fr;
    min-width: 0;
  }
}
`,
  "split-hero": `
[data-solara-module="split-hero"] {
  padding: 0;
}
[data-solara-module="split-hero"] .solara-split-hero {
  align-items: stretch;
  display: grid;
  grid-template-columns: minmax(18rem, 0.82fr) minmax(0, 1.18fr);
  margin: 0 auto;
  max-width: var(--solara-container);
  min-height: min(760px, calc(100dvh - 130px));
}
[data-solara-module="split-hero"] .solara-split-hero--right .solara-hero-copy {
  grid-column: 1;
}
[data-solara-module="split-hero"] .solara-split-hero--right .solara-hero-media {
  grid-column: 2;
  grid-row: 1;
}
[data-solara-module="split-hero"] .solara-split-hero--left .solara-hero-copy {
  grid-column: 2;
}
[data-solara-module="split-hero"] .solara-split-hero--left .solara-hero-media {
  grid-column: 1;
  grid-row: 1;
}
[data-solara-module="split-hero"] .solara-hero-copy {
  align-items: flex-start;
  display: flex;
  flex-direction: column;
  justify-content: center;
  background: var(--solara-surface);
  padding: clamp(2.5rem, 5vw, 5.5rem);
}
[data-solara-module="split-hero"] .solara-eyebrow {
  color: var(--solara-muted);
  font-size: .75rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  margin-bottom: clamp(2rem, 4vw, 4rem);
  text-transform: uppercase;
}
[data-solara-module="split-hero"] h1 {
  font-size: clamp(3rem, 5.2vw, 5.6rem);
  max-width: 10ch;
}
[data-solara-module="split-hero"] .solara-hero-body {
  color: var(--solara-muted);
  font-size: clamp(1rem, 1.5vw, 1.25rem);
  margin-top: 1.5rem;
  max-width: 36ch;
}
[data-solara-module="split-hero"] .solara-primary-action {
  margin-top: 2rem;
}
[data-solara-module="split-hero"] .solara-hero-media {
  background: var(--solara-surface);
  border-radius: 0;
  min-height: 28rem;
  overflow: hidden;
}
[data-solara-module="split-hero"] .solara-hero-image {
  height: 100%;
  object-fit: cover;
  transition: transform var(--solara-motion-normal, 700ms) var(--solara-motion-easing, cubic-bezier(0.16, 1, 0.3, 1));
  width: 100%;
}
[data-solara-module="split-hero"] .solara-split-hero:hover .solara-hero-image {
  transform: scale(1.012);
}
@media (max-width: 767px) {
  [data-solara-module="split-hero"] {
    padding: 1rem;
  }
  [data-solara-module="split-hero"] .solara-split-hero {
    grid-template-columns: 1fr;
    min-height: auto;
  }
  [data-solara-module="split-hero"] .solara-split-hero--left .solara-hero-copy,
  [data-solara-module="split-hero"] .solara-split-hero--left .solara-hero-media {
    grid-column: 1;
  }
  [data-solara-module="split-hero"] .solara-split-hero--left .solara-hero-media {
    grid-row: auto;
  }
  [data-solara-module="split-hero"] .solara-split-hero--right .solara-hero-copy,
  [data-solara-module="split-hero"] .solara-split-hero--right .solara-hero-media {
    grid-column: 1;
    grid-row: auto;
  }
  [data-solara-module="split-hero"] .solara-hero-copy {
    padding: 3rem 1.5rem 3.5rem;
  }
  [data-solara-module="split-hero"] h1 {
    font-size: clamp(2.5rem, 13vw, 4.2rem);
  }
  [data-solara-module="split-hero"] .solara-hero-media {
    min-height: 54vh;
  }
}
`,
  "editorial-hero": `
[data-solara-module="editorial-hero"] {
  padding: clamp(4rem, 10vw, 9rem) 1.25rem clamp(2rem, 4vw, 4rem);
}
[data-solara-module="editorial-hero"] .solara-editorial-hero {
  align-items: center;
  display: grid;
  gap: clamp(2rem, 5vw, 5rem);
  grid-template-columns: minmax(0, 1fr) minmax(18rem, 0.72fr);
  margin: 0 auto;
  max-width: var(--solara-container);
}
[data-solara-module="editorial-hero"] .solara-editorial-hero--left .solara-editorial-head {
  grid-column: 2;
  grid-row: 1;
}
[data-solara-module="editorial-hero"] .solara-editorial-hero--left .solara-hero-media {
  grid-column: 1;
  grid-row: 1;
}
[data-solara-module="editorial-hero"] .solara-editorial-hero--right .solara-editorial-head {
  grid-column: 1;
  grid-row: 1;
}
[data-solara-module="editorial-hero"] .solara-editorial-hero--right .solara-hero-media {
  grid-column: 2;
  grid-row: 1;
}
[data-solara-module="editorial-hero"] .solara-editorial-head {
  align-items: end;
  display: grid;
  gap: 2rem clamp(2rem, 8vw, 9rem);
  grid-template-columns: minmax(0, 1fr) minmax(17rem, 0.28fr);
}
[data-solara-module="editorial-hero"] .solara-eyebrow {
  color: var(--solara-muted);
  font-size: .75rem;
  font-weight: 700;
  grid-column: 1 / -1;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
[data-solara-module="editorial-hero"] h1 {
  font-size: clamp(4rem, 10vw, 1.5rem);
  max-width: 9ch;
}
[data-solara-module="editorial-hero"] .solara-editorial-head > p:not(.solara-eyebrow) {
  color: var(--solara-muted);
  font-size: 1.08rem;
  max-width: 32ch;
}
[data-solara-module="editorial-hero"] .solara-primary-action {
  justify-self: start;
}
[data-solara-module="editorial-hero"] figure {
  height: clamp(30rem, 58vw, 50rem);
  margin-left: clamp(0rem, 8vw, 9rem);
  overflow: hidden;
}
[data-solara-module="editorial-hero"] .solara-hero-image {
  height: 100%;
  object-fit: cover;
  width: 100%;
}
@media (max-width: 767px) {
  [data-solara-module="editorial-hero"] {
    padding: 3rem 1rem 1rem;
  }
  [data-solara-module="editorial-hero"] .solara-editorial-hero {
    grid-template-columns: 1fr;
  }
  [data-solara-module="editorial-hero"] .solara-editorial-head {
    align-items: start;
    grid-template-columns: 1fr;
  }
  [data-solara-module="editorial-hero"] h1 {
    font-size: clamp(3rem, 15vw, 5rem);
  }
  [data-solara-module="editorial-hero"] figure {
    height: 58vh;
    margin-left: 0;
  }
  [data-solara-module="editorial-hero"] .solara-editorial-hero--left .solara-editorial-head,
  [data-solara-module="editorial-hero"] .solara-editorial-hero--right .solara-editorial-head,
  [data-solara-module="editorial-hero"] .solara-editorial-hero--left .solara-hero-media,
  [data-solara-module="editorial-hero"] .solara-editorial-hero--right .solara-hero-media {
    grid-column: 1;
    grid-row: auto;
  }
}
`,
  "collection-grid": `
[data-solara-module="collection-grid"] {
  padding: clamp(4rem, 9vw, 8rem) 1.25rem;
}
[data-solara-module="collection-grid"] .solara-section-shell {
  margin: 0 auto;
  max-width: var(--solara-container);
}
[data-solara-module="collection-grid"] h2 {
  font-size: clamp(2rem, 4vw, 3.8rem);
  margin-bottom: clamp(2.5rem, 5vw, 4.5rem);
  max-width: 14ch;
}
[data-solara-module="collection-grid"] .solara-collection-grid {
  display: grid;
  gap: clamp(1rem, 2vw, 2rem);
  grid-template-columns: 1.15fr 0.85fr;
}
[data-solara-module="collection-grid"] .solara-collection-card:nth-child(3n) {
  grid-column: 1 / -1;
}
[data-solara-module="collection-grid"] .solara-collection-card a {
  display: grid;
  gap: 1rem;
  text-decoration: none;
}
[data-solara-module="collection-grid"] .solara-collection-card figure {
  aspect-ratio: 5 / 4;
  background: var(--solara-surface);
  border-radius: var(--solara-radius);
  overflow: hidden;
}
[data-solara-module="collection-grid"] .solara-collection-card:nth-child(3n) figure {
  aspect-ratio: 16 / 7;
}
[data-solara-module="collection-grid"] .solara-collection-image {
  height: 100%;
  object-fit: cover;
  transition: transform var(--solara-motion-normal, 500ms) var(--solara-motion-easing, cubic-bezier(0.16, 1, 0.3, 1));
  width: 100%;
}
[data-solara-module="collection-grid"] .solara-collection-card a:hover .solara-collection-image {
  transform: scale(1.025);
}
[data-solara-module="collection-grid"] .solara-collection-card div {
  display: grid;
  gap: .5rem;
}
[data-solara-module="collection-grid"] .solara-collection-card h3 {
  font-size: clamp(1.45rem, 2.2vw, 2rem);
}
[data-solara-module="collection-grid"] .solara-collection-card p {
  color: var(--solara-muted);
  max-width: 48ch;
}
@media (max-width: 767px) {
  [data-solara-module="collection-grid"] {
    padding: 4rem 1rem;
  }
  [data-solara-module="collection-grid"] .solara-collection-grid {
    grid-template-columns: 1fr;
  }
  [data-solara-module="collection-grid"] .solara-collection-card:nth-child(3n) {
    grid-column: auto;
  }
  [data-solara-module="collection-grid"] .solara-collection-card:nth-child(3n) figure {
    aspect-ratio: 5 / 4;
  }
}
`,
  "editorial-product-grid": `
[data-solara-module="editorial-product-grid"] {
  padding: clamp(4rem, 8vw, 7rem) 1.25rem;
}
[data-solara-module="editorial-product-grid"] .solara-section-shell {
  margin: 0 auto;
  max-width: var(--solara-container);
}
[data-solara-module="editorial-product-grid"] h2 {
  font-size: clamp(2rem, 4vw, 3.8rem);
  margin-bottom: clamp(2.5rem, 5vw, 4.5rem);
}
[data-solara-module="editorial-product-grid"] .solara-empty-state {
  color: var(--solara-muted);
  margin: 2.5rem 0;
}
[data-solara-module="editorial-product-grid"] [data-category-grid] + .solara-empty-state {
  color: var(--solara-muted);
  margin: 0;
  padding: 2rem 0;
}
[data-solara-module="editorial-product-grid"] .solara-editorial-products {
  display: grid;
  gap: clamp(2rem, 4vw, 4rem) clamp(1rem, 2.5vw, 2.5rem);
  align-items: start;
  grid-template-columns: repeat(12, minmax(0, 1fr));
}
[data-solara-module="editorial-product-grid"] .solara-product-card:nth-child(5n + 1) {
  grid-column: span 7;
}
[data-solara-module="editorial-product-grid"] .solara-product-card {
  grid-column: span 5;
}
[data-solara-module="editorial-product-grid"] .solara-product-card:nth-child(5n + 3),
[data-solara-module="editorial-product-grid"] .solara-product-card:nth-child(5n + 4) {
  grid-column: span 6;
}
[data-solara-module="editorial-product-grid"] .solara-product-media {
  aspect-ratio: 4 / 5;
  background: var(--solara-surface);
  border-radius: var(--solara-radius);
  display: block;
  overflow: hidden;
}
[data-solara-module="editorial-product-grid"] .solara-product-image {
  height: 100%;
  object-fit: cover;
  transition: transform var(--solara-motion-normal, 500ms) var(--solara-motion-easing, cubic-bezier(0.16, 1, 0.3, 1));
  width: 100%;
}
[data-solara-module="editorial-product-grid"] .solara-product-media:hover .solara-product-image {
  transform: scale(1.025);
}
[data-solara-module="editorial-product-grid"] .solara-product-copy {
  align-items: start;
  display: flex;
  gap: 1rem;
  justify-content: space-between;
  margin-top: 1rem;
}
[data-solara-module="editorial-product-grid"] .solara-product-copy > div {
  min-width: 0;
}
[data-solara-module="editorial-product-grid"] .solara-product-copy h3 {
  font-size: 1.2rem;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
[data-solara-module="editorial-product-grid"] .solara-product-copy h3 a {
  text-decoration: none;
}
[data-solara-module="editorial-product-grid"] .solara-product-brand,
[data-solara-module="editorial-product-grid"] .solara-product-description,
[data-solara-module="editorial-product-grid"] .solara-product-status {
  color: var(--solara-muted);
  font-size: 0.82rem;
}
[data-solara-module="editorial-product-grid"] .solara-product-description {
  margin-top: .75rem;
  max-width: 42ch;
}
[data-solara-module="editorial-product-grid"] .solara-product-status {
  margin-top: .5rem;
}
[data-solara-module="editorial-product-grid"] .solara-product-price {
  flex: 0 0 auto;
  font-weight: 650;
}
@media (max-width: 767px) {
  [data-solara-module="editorial-product-grid"] {
    padding: 4rem 1rem;
  }
  [data-solara-module="editorial-product-grid"] .solara-editorial-products {
    grid-template-columns: 1fr 1fr;
  }
[data-solara-module="editorial-product-grid"] .solara-product-card:nth-child(5n + 1) {
    grid-column: 1 / -1;
  }
  [data-solara-module="editorial-product-grid"] .solara-product-card,
  [data-solara-module="editorial-product-grid"] .solara-product-card:nth-child(5n + 3),
  [data-solara-module="editorial-product-grid"] .solara-product-card:nth-child(5n + 4) {
    grid-column: span 1;
  }
  [data-solara-module="editorial-product-grid"] .solara-product-copy {
    display: grid;
  }
}
`,
  "compact-product-grid": `
[data-solara-module="compact-product-grid"] {
  border-top: 1px solid var(--solara-border);
  padding: clamp(3rem, 5vw, 5rem) 1.25rem;
}
[data-solara-module="compact-product-grid"] .solara-section-shell {
  margin: 0 auto;
  max-width: var(--solara-container);
}
[data-solara-module="compact-product-grid"] h2 {
  font-size: clamp(1.8rem, 3vw, 3rem);
  margin-bottom: clamp(1.5rem, 3vw, 2.5rem);
}
[data-solara-module="compact-product-grid"] .solara-compact-products {
  display: grid;
  gap: clamp(1.5rem, 2.4vw, 2.25rem) clamp(.8rem, 1.7vw, 1.5rem);
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
[data-solara-module="compact-product-grid"] .solara-product-media {
  aspect-ratio: 1 / 1;
  background: var(--solara-surface);
  border-radius: var(--solara-radius);
  display: block;
  overflow: hidden;
}
[data-solara-module="compact-product-grid"] .solara-product-image {
  height: 100%;
  object-fit: cover;
  transition: transform var(--solara-motion-normal, 320ms) var(--solara-motion-easing, cubic-bezier(0.16, 1, 0.3, 1)), opacity var(--solara-motion-fast, 180ms) ease;
  width: 100%;
}
[data-solara-module="compact-product-grid"] .solara-product-media:hover .solara-product-image {
  opacity: 0.94;
  transform: scale(1.02);
}
[data-solara-module="compact-product-grid"] .solara-product-copy {
  display: grid;
  gap: .5rem;
  margin-top: .8rem;
}
[data-solara-module="compact-product-grid"] .solara-product-copy h3 {
  font-size: clamp(0.92rem, 1.2vw, 1.08rem);
  line-height: 1.15;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
[data-solara-module="compact-product-grid"] .solara-product-copy h3 a {
  text-decoration: none;
}
[data-solara-module="compact-product-grid"] .solara-product-brand,
[data-solara-module="compact-product-grid"] .solara-product-description,
[data-solara-module="compact-product-grid"] .solara-product-status {
  color: var(--solara-muted);
  font-size: 0.78rem;
}
[data-solara-module="compact-product-grid"] .solara-product-description {
  display: none;
}
[data-solara-module="compact-product-grid"] .solara-product-price {
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}
[data-solara-module="compact-product-grid"] .solara-empty-state {
  color: var(--solara-muted);
  margin: 2.5rem 0;
}
[data-solara-module="compact-product-grid"] [data-category-grid] + .solara-empty-state {
  color: var(--solara-muted);
  margin: 0;
  padding: 2rem 0;
}
@media (max-width: 1199px) {
  [data-solara-module="compact-product-grid"] .solara-compact-products {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 767px) {
  [data-solara-module="compact-product-grid"] {
    padding: 2.75rem 1rem;
  }
  [data-solara-module="compact-product-grid"] .solara-compact-products {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
`,
  "product-detail": `
[data-solara-module="product-detail"] {
  padding: clamp(2rem, 6vw, 6rem) 1.25rem;
}
[data-solara-module="product-detail"] .solara-product-detail {
  align-items: start;
  display: grid;
  gap: clamp(2rem, 6vw, 7rem);
  grid-template-columns: minmax(0, 1.15fr) minmax(20rem, 0.85fr);
  margin: 0 auto;
  max-width: var(--solara-container);
}
[data-solara-module="product-detail"] .solara-product-gallery {
  background: var(--solara-surface);
  border-radius: calc(var(--solara-radius) * 2);
  overflow: hidden;
}
[data-solara-module="product-detail"] .solara-product-gallery-main {
  aspect-ratio: 4 / 5;
  position: relative;
}
[data-solara-module="product-detail"] .solara-product-gallery-main figure {
  inset: 0;
  margin: 0;
  position: absolute;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--solara-motion-fast, 220ms) ease;
}
[data-solara-module="product-detail"] .solara-product-gallery-main figure[data-gallery-active="true"] {
  opacity: 1;
  pointer-events: auto;
}
[data-solara-module="product-detail"] .solara-product-gallery-image {
  height: 100%;
  object-fit: cover;
  width: 100%;
}
[data-solara-module="product-detail"] .solara-product-gallery-thumbs {
  display: flex;
  gap: .5rem;
  overflow-x: auto;
  padding: .75rem;
}
[data-solara-module="product-detail"] .solara-product-gallery-thumbs button {
  flex: 0 0 4.5rem;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--solara-radius);
  background: transparent;
  cursor: pointer;
  overflow: hidden;
}
[data-solara-module="product-detail"] .solara-product-gallery-thumbs button[aria-current="true"] {
  border-color: var(--solara-accent);
}
[data-solara-module="product-detail"] .solara-product-gallery-thumb {
  aspect-ratio: 1;
  height: auto;
  object-fit: cover;
  width: 100%;
}
[data-solara-module="product-detail"] .solara-product-image {
  height: auto;
  width: 100%;
}
[data-solara-module="product-detail"] .solara-product-info {
  padding-top: 1rem;
  position: sticky;
  top: 2rem;
}
[data-solara-module="product-detail"] .solara-product-brand {
  color: var(--solara-muted);
  font-size: 0.82rem;
  font-weight: 650;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}
[data-solara-module="product-detail"] h1 {
  font-size: clamp(2.7rem, 5vw, 5rem);
  margin-top: .6rem;
}
[data-solara-module="product-detail"] .solara-detail-price {
  font-size: 1.25rem;
  font-weight: 700;
  margin-top: 1.5rem;
  font-variant-numeric: tabular-nums;
}
[data-solara-module="product-detail"] .solara-detail-price del {
  color: var(--solara-muted);
  font-size: 0.95rem;
  font-weight: 400;
  margin-left: .5rem;
}
[data-solara-module="product-detail"] .solara-rich-text {
  color: var(--solara-muted);
  margin-top: 1.5rem;
  max-width: 60ch;
}
[data-solara-module="product-detail"] form {
  display: grid;
  gap: .75rem;
  margin-top: 2rem;
}
[data-solara-module="product-detail"] form label {
  font-size: 0.84rem;
  font-weight: 650;
  margin-top: .4rem;
}
[data-solara-module="product-detail"] form input,
[data-solara-module="product-detail"] form select {
  background: color-mix(in srgb, var(--solara-background), var(--solara-surface) 24%);
  border: 1px solid var(--solara-border);
  border-radius: var(--solara-radius);
  min-height: 48px;
  padding: .75rem .8rem;
}
[data-solara-module="product-detail"] form button {
  background: var(--solara-accent);
  border: 0;
  border-radius: var(--solara-radius);
  color: var(--solara-accent-text);
  cursor: pointer;
  font-weight: 700;
  margin-top: .75rem;
  min-height: 52px;
}
[data-solara-module="product-detail"] form button:hover {
  background: color-mix(in srgb, var(--solara-accent) 88%, var(--solara-accent-text));
  transform: translateY(-1px);
}
[data-solara-module="product-detail"] .solara-add-fallback {
  align-items: center;
  background: var(--solara-accent);
  border-radius: var(--solara-radius);
  color: var(--solara-accent-text);
  display: none;
  font-weight: 700;
  justify-content: center;
  margin-top: .75rem;
  min-height: 52px;
  text-decoration: none;
}
[data-solara-module="product-detail"] .solara-delivery-note {
  color: var(--solara-muted);
  font-size: 0.85rem;
  margin-top: 1rem;
}
[data-solara-module="product-detail"] .solara-product-specs {
  display: grid;
  gap: .5rem;
  margin-top: 1.5rem;
  padding-block: 1rem;
  border-block: 1px solid var(--solara-border);
}
[data-solara-module="product-detail"] .solara-product-specs div {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}
[data-solara-module="product-detail"] .solara-product-specs dt {
  color: var(--solara-muted);
}
[data-solara-module="product-detail"] .solara-product-specs dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
}
[data-solara-module="product-detail"] .solara-product-policies {
  display: grid;
  gap: .5rem;
  margin-top: 1rem;
}
[data-solara-module="product-detail"] .solara-product-policies details {
  padding-block: .6rem;
  border-bottom: 1px solid var(--solara-border);
}
[data-solara-module="product-detail"] .solara-product-policies summary {
  cursor: pointer;
  font-weight: 650;
}
[data-solara-module="product-detail"] .solara-product-policies p {
  max-width: 52ch;
  margin-top: .6rem;
  color: var(--solara-muted);
  font-size: 0.88rem;
}
[data-solara-module="product-detail"] .solara-empty-state {
  margin: 4rem auto;
  max-width: var(--solara-container);
  padding: 0 1rem;
}
@media (max-width: 767px) {
  [data-solara-module="product-detail"] {
    padding: 1rem;
  }
  [data-solara-module="product-detail"] .solara-product-detail {
    gap: 2rem;
    grid-template-columns: 1fr;
  }
  [data-solara-module="product-detail"] .solara-product-info {
    padding: 0 0 2rem;
    position: static;
  }
  [data-solara-module="product-detail"] .solara-product-gallery-main {
    aspect-ratio: 1 / 1.12;
  }
}
`,
  "image-text-content": `
[data-solara-module="image-text-content"] {
  padding: clamp(4rem, 10vw, 9rem) 1.25rem;
}
[data-solara-module="image-text-content"] .solara-image-text {
  align-items: center;
  display: grid;
  gap: clamp(2rem, 7vw, 8rem);
  grid-template-columns: minmax(0, 1.1fr) minmax(18rem, 0.9fr);
  margin: 0 auto;
  max-width: var(--solara-container);
}
[data-solara-module="image-text-content"] .solara-image-text--right figure {
  grid-column: 2;
}
[data-solara-module="image-text-content"] .solara-image-text--right > div {
  grid-column: 1;
  grid-row: 1;
}
[data-solara-module="image-text-content"] figure {
  background: var(--solara-surface);
  border-radius: calc(var(--solara-radius) * 2);
  min-height: 32rem;
  overflow: hidden;
}
[data-solara-module="image-text-content"] .solara-content-image {
  height: 100%;
  object-fit: cover;
  width: 100%;
}
[data-solara-module="image-text-content"] h2 {
  font-size: clamp(2.4rem, 5vw, 5rem);
  max-width: 12ch;
}
[data-solara-module="image-text-content"] .solara-rich-text {
  color: var(--solara-muted);
  margin-top: 1.5rem;
  max-width: 56ch;
  line-height: 1.75;
}
[data-solara-module="image-text-content"] .solara-rich-text > * + * {
  margin-top: 1rem;
}
[data-solara-module="image-text-content"] .solara-secondary-action {
  margin-top: 1.75rem;
}
@media (max-width: 767px) {
  [data-solara-module="image-text-content"] {
    padding: 4rem 1rem;
  }
  [data-solara-module="image-text-content"] .solara-image-text {
    grid-template-columns: 1fr;
  }
  [data-solara-module="image-text-content"] .solara-image-text--right figure,
  [data-solara-module="image-text-content"] .solara-image-text--right > div {
    grid-column: auto;
    grid-row: auto;
  }
  [data-solara-module="image-text-content"] figure {
    min-height: 50vh;
  }
}
`,
  "trust-strip": `
[data-solara-module="trust-strip"] {
  background: color-mix(in srgb, var(--solara-surface), var(--solara-background) 58%);
  border-top: 1px solid var(--solara-border);
  padding: clamp(4rem, 8vw, 7rem) 1.25rem;
}
[data-solara-module="trust-strip"] .solara-trust {
  margin: 0 auto;
  max-width: var(--solara-container);
}
[data-solara-module="trust-strip"] h2 {
  font-size: clamp(2rem, 4vw, 3.6rem);
  margin-bottom: 2.5rem;
}
[data-solara-module="trust-strip"] .solara-trust-grid {
  display: grid;
  gap: 1px;
  grid-template-columns: 1.4fr 0.8fr 0.8fr;
}
[data-solara-module="trust-strip"] article {
  border-left: 1px solid var(--solara-border);
  min-height: 11rem;
  padding: 0.25rem clamp(1rem, 3vw, 2.5rem) 1.2rem;
}
[data-solara-module="trust-strip"] article:first-child {
  border-left: 0;
  padding-left: 0;
}
[data-solara-module="trust-strip"] h3 {
  font-size: 1.35rem;
}
[data-solara-module="trust-strip"] article p {
  color: var(--solara-text);
  margin-top: .8rem;
  max-width: 32ch;
}
@media (max-width: 767px) {
  [data-solara-module="trust-strip"] {
    padding: 4rem 1rem;
  }
  [data-solara-module="trust-strip"] .solara-trust-grid {
    gap: 1.5rem;
    grid-template-columns: 1fr;
  }
  [data-solara-module="trust-strip"] article,
  [data-solara-module="trust-strip"] article:first-child {
    border-left: 0;
    border-top: 1px solid var(--solara-border);
    min-height: auto;
    padding: 1.5rem 0 0;
  }
}
`,
  "cart-drawer": `
[data-solara-module="cart-drawer"] .solara-cart-backdrop {
  background: color-mix(in srgb, var(--solara-text) 62%, transparent);
  backdrop-filter: blur(2px);
  inset: 0;
  position: fixed;
  z-index: 40;
}
[data-solara-module="cart-drawer"] .solara-cart-drawer {
  background: var(--solara-background);
  border-left: 1px solid var(--solara-border);
  box-shadow: var(--solara-shadow-overlay);
  display: grid;
  gap: 1.5rem;
  grid-template-rows: auto minmax(8rem, 1fr) auto minmax(0, 1fr);
  height: 100dvh;
  max-width: 30rem;
  overflow: hidden;
  padding: clamp(1.25rem, 3vw, 2rem);
  position: fixed;
  right: 0;
  top: 0;
  transform: translateX(105%);
  transition: transform var(--solara-motion-normal, 260ms) var(--solara-motion-easing, cubic-bezier(0.16, 1, 0.3, 1));
  width: 100%;
  z-index: 50;
}
[data-solara-module="cart-drawer"] .solara-cart-drawer[data-open="true"] {
  transform: translateX(0);
}
[data-solara-module="cart-drawer"] .solara-cart-drawer > header {
  align-items: center;
  border-bottom: 1px solid var(--solara-border);
  display: flex;
  justify-content: space-between;
  padding-bottom: 1rem;
}
[data-solara-module="cart-drawer"] .solara-cart-drawer > header h2 {
  font-size: 2rem;
}
[data-solara-module="cart-drawer"] .solara-cart-drawer > header button {
  background: transparent;
  border: 1px solid var(--solara-border);
  border-radius: var(--solara-radius);
  cursor: pointer;
  min-height: 42px;
  padding: .5rem .8rem;
}
[data-solara-module="cart-drawer"] .solara-empty-state {
  color: var(--solara-muted);
  padding: 2rem 0;
}
[data-solara-module="cart-drawer"] .solara-cart-drawer > [data-cart-lines],
[data-solara-module="cart-drawer"] .solara-cart-drawer > form {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}
[data-solara-module="cart-drawer"] .solara-cart-empty {
  color: var(--solara-muted);
  padding: 2rem 0;
}
[data-solara-module="cart-drawer"] .solara-cart-total {
  align-items: center;
  border-top: 1px solid var(--solara-border);
  display: flex;
  font-size: 1.1rem;
  justify-content: space-between;
  padding-top: 1rem;
}
[data-solara-module="cart-drawer"] form {
  display: grid;
  gap: .5rem;
}
[data-solara-module="cart-drawer"] form label {
  font-size: 0.82rem;
  font-weight: 650;
  margin-top: .35rem;
}
[data-solara-module="cart-drawer"] form input,
[data-solara-module="cart-drawer"] form textarea {
  background: color-mix(in srgb, var(--solara-background), var(--solara-surface) 24%);
  border: 1px solid var(--solara-border);
  border-radius: var(--solara-radius);
  min-height: 46px;
  padding: .75rem .8rem;
}
[data-solara-module="cart-drawer"] form textarea {
  min-height: 76px;
  resize: vertical;
}
[data-solara-module="cart-drawer"] form button {
  background: var(--solara-accent);
  border: 0;
  border-radius: var(--solara-radius);
  color: var(--solara-accent-text);
  cursor: pointer;
  font-weight: 700;
  margin-top: .75rem;
  min-height: 52px;
}
[data-solara-module="cart-drawer"] form button:hover {
  background: color-mix(in srgb, var(--solara-accent) 88%, var(--solara-accent-text));
}
@media print {
  [data-solara-module="cart-drawer"] .solara-cart-backdrop,
  [data-solara-module="cart-drawer"] [data-cart-drawer] {
    display: none !important;
  }
}
@media (prefers-reduced-motion: reduce) {
  [data-solara-module="cart-drawer"] .solara-cart-drawer {
    transition: none;
  }
}
`,
  "editorial-footer": `
[data-solara-module="editorial-footer"] {
  background: color-mix(in srgb, var(--solara-surface), var(--solara-background) 22%);
  border-top: 1px solid var(--solara-border);
  padding: clamp(3rem, 7vw, 6rem) 1.25rem 2rem;
}
[data-solara-module="editorial-footer"] .solara-footer {
  display: grid;
  gap: clamp(3rem, 7vw, 8rem);
  grid-template-columns: minmax(18rem, 1.6fr) 0.7fr 0.7fr;
  margin: 0 auto;
  max-width: var(--solara-container);
}
[data-solara-module="editorial-footer"] .solara-brand {
  font-family: var(--solara-font-display);
  font-size: clamp(2rem, 5vw, 4.5rem);
  font-weight: 500;
  letter-spacing: -0.05em;
  max-width: 100%;
  overflow-wrap: anywhere;
  text-decoration: none;
}
[data-solara-module="editorial-footer"] .solara-logo {
  height: 48px;
  object-fit: contain;
  object-position: left center;
  width: auto;
}
[data-solara-module="editorial-footer"] .solara-footer > div p {
  color: var(--solara-text);
  margin-top: 1rem;
  max-width: 46ch;
}
[data-solara-module="editorial-footer"] nav,
[data-solara-module="editorial-footer"] address {
  align-content: start;
  display: grid;
  font-style: normal;
  gap: .75rem;
}
[data-solara-module="editorial-footer"] nav a,
[data-solara-module="editorial-footer"] address a {
  text-decoration: none;
}
[data-solara-module="editorial-footer"] nav a:hover,
[data-solara-module="editorial-footer"] address a:hover {
  color: var(--solara-accent);
}
[data-solara-module="editorial-footer"] address span {
  color: var(--solara-text);
}
[data-solara-module="editorial-footer"] .solara-footer > * {
  min-width: 0;
}
[data-solara-module="editorial-footer"] .solara-footer p,
[data-solara-module="editorial-footer"] .solara-footer a,
[data-solara-module="editorial-footer"] .solara-footer address span,
[data-solara-module="editorial-footer"] .solara-footer small {
  overflow-wrap: anywhere;
}
[data-solara-module="editorial-footer"] small {
  color: var(--solara-text);
  grid-column: 1 / -1;
}
@media (max-width: 767px) {
  [data-solara-module="editorial-footer"] {
    padding: 4rem 1rem 2rem;
  }
  [data-solara-module="editorial-footer"] .solara-footer {
    grid-template-columns: 1fr;
  }
  [data-solara-module="editorial-footer"] small {
    grid-column: auto;
  }
}
`,
  "hero-media": `
[data-solara-module="hero-media"] {
  position: relative;
  min-height: calc(100svh - var(--solara-chrome-height, 116px));
  overflow: clip;
}
[data-solara-module="hero-media"] .solara-hero-media-shell {
  position: relative;
  display: grid;
  min-height: inherit;
  isolation: isolate;
  background: var(--solara-surface);
}
[data-solara-module="hero-media"] .solara-hero-media-backdrop,
[data-solara-module="hero-media"] .solara-hero-media-backdrop img,
[data-solara-module="hero-media"] .solara-hero-media-backdrop video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
[data-solara-module="hero-media"] .solara-hero-media-poster {
  z-index: 0;
}
[data-solara-module="hero-media"] .solara-hero-media-video {
  z-index: 1;
}
[data-solara-module="hero-media"] .solara-hero-media-backdrop img,
[data-solara-module="hero-media"] .solara-hero-media-backdrop video {
  object-fit: cover;
}
[data-solara-module="hero-media"] .solara-hero-media-backdrop::after {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, color-mix(in srgb, var(--solara-text) 72%, transparent), color-mix(in srgb, var(--solara-text) 8%, transparent) 64%, transparent);
  content: "";
  pointer-events: none;
}
[data-solara-module="hero-media"] .solara-hero-slide-panel {
  position: absolute;
  inset: 0;
  opacity: 0;
  visibility: hidden;
  transition: opacity var(--solara-motion-normal, 500ms) ease;
}
[data-solara-module="hero-media"] .solara-hero-slide-panel[data-hero-active="true"] {
  opacity: 1;
  visibility: visible;
}
[data-solara-module="hero-media"] .solara-hero-media-shell--overlay-light .solara-hero-media-backdrop::after {
  background: linear-gradient(90deg, color-mix(in srgb, var(--solara-background) 76%, transparent), color-mix(in srgb, var(--solara-background) 14%, transparent) 64%, transparent);
}
[data-solara-module="hero-media"] .solara-hero-media-shell--overlay-none .solara-hero-media-backdrop::after {
  display: none;
}
[data-solara-module="hero-media"] .solara-hero-media-copy {
  z-index: 1;
  align-self: center;
  width: min(100% - 2rem, var(--solara-container));
  margin: 0 auto;
  padding: clamp(4rem, 10vw, 9rem) 0;
  color: var(--solara-accent-text);
}
[data-solara-module="hero-media"] .solara-hero-media-shell--overlay-light .solara-hero-media-copy {
  color: var(--solara-text);
}
[data-solara-module="hero-media"] .solara-hero-media-shell--center .solara-hero-media-copy {
  text-align: center;
}
[data-solara-module="hero-media"] .solara-hero-media-copy h1 {
  max-width: 14ch;
  font-size: clamp(3rem, 6.4vw, 6.8rem);
}
[data-solara-module="hero-media"] .solara-hero-media-shell--center .solara-hero-media-copy h1 {
  margin-inline: auto;
}
[data-solara-module="hero-media"] .solara-hero-body {
  max-width: 38ch;
  margin-top: 1.25rem;
  font-size: clamp(1rem, 1.6vw, 1.3rem);
}
[data-solara-module="hero-media"] .solara-hero-media-shell--center .solara-hero-body {
  margin-inline: auto;
}
[data-solara-module="hero-media"] .solara-primary-action {
  margin-top: 2rem;
  background: var(--solara-accent-text);
  color: var(--solara-text);
}
[data-solara-module="hero-media"] .solara-hero-video-toggle,
[data-solara-module="hero-media"] .solara-hero-controls {
  position: absolute;
  z-index: 2;
  bottom: 1.25rem;
}
[data-solara-module="hero-media"] .solara-hero-video-toggle {
  right: 1.25rem;
  min-height: 44px;
  padding: .5rem 0.85rem;
  border: 1px solid color-mix(in srgb, var(--solara-accent-text) 56%, transparent);
  border-radius: var(--solara-radius);
  background: color-mix(in srgb, var(--solara-text) 52%, transparent);
  color: var(--solara-accent-text);
  cursor: pointer;
}
[data-solara-module="hero-media"] .solara-hero-controls {
  left: max(1rem, calc((100% - var(--solara-container)) / 2));
  display: flex;
  align-items: center;
  gap: .5rem;
}
[data-solara-module="hero-media"] .solara-hero-controls button {
  min-height: 44px;
  padding: .5rem .65rem;
  border: 1px solid color-mix(in srgb, var(--solara-accent-text) 54%, transparent);
  border-radius: var(--solara-radius);
  background: color-mix(in srgb, var(--solara-text) 44%, transparent);
  color: var(--solara-accent-text);
  cursor: pointer;
}
[data-solara-module="hero-media"] .solara-hero-indicators {
  display: flex;
  gap: .25rem;
  margin-left: .35rem;
}
[data-solara-module="hero-media"] .solara-hero-indicators button {
  position: relative;
  width: 2.5rem;
  min-height: 44px;
  padding: 0;
  border: 0;
  background: transparent;
}
[data-solara-module="hero-media"] .solara-hero-indicators button::after {
  position: absolute;
  inset: calc(50% - 2px) 0 auto;
  height: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--solara-accent-text) 48%, transparent);
  content: "";
}
[data-solara-module="hero-media"] .solara-hero-indicators button[aria-selected="true"] {
  background: transparent;
}
[data-solara-module="hero-media"] .solara-hero-indicators button[aria-selected="true"]::after {
  background: var(--solara-accent-text);
}
@media (max-width: 767px) {
  [data-solara-module="hero-media"] {
    min-height: calc(100svh - var(--solara-chrome-height, 96px));
  }
  [data-solara-module="hero-media"] .solara-hero-media-copy {
    align-self: end;
    padding: 5rem 0 6rem;
  }
  [data-solara-module="hero-media"] .solara-hero-media-copy h1 {
    max-width: 12ch;
    font-size: clamp(2.8rem, 14vw, 5rem);
  }
  [data-solara-module="hero-media"] .solara-hero-controls {
    left: 1rem;
  }
}
@media (prefers-reduced-motion: reduce) {
  [data-solara-module="hero-media"] .solara-hero-media-video {
    display: none;
  }
}
`,
  "catalog-modern": `
[data-solara-store].catalog-modern {
  --catalog-ink: var(--solara-text, #0b0b0c);
  --catalog-paper: var(--solara-background, #fcfcfb);
  --catalog-surface: var(--solara-surface, #f0f0ee);
  --catalog-muted: var(--solara-muted, #696966);
  --catalog-border: var(--solara-border, #dededa);
  --catalog-sale: var(--solara-sale, #d94a55);
  --catalog-rating: var(--solara-rating, #d99a12);
  --catalog-accent-alt: var(--solara-accent-alt, var(--solara-accent));
  background: var(--catalog-paper);
  color: var(--catalog-ink);
  font-family: var(--solara-font-body, "Archivo", "Arial Narrow", "Helvetica Neue", Arial, sans-serif);
}
[data-solara-store].catalog-modern a { color: inherit; }
[data-solara-store].catalog-modern .sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
}
[data-solara-store].catalog-modern .catalog-announcement-inner {
  position: relative; display: flex; align-items: center; justify-content: center; gap: .5rem; min-height: 44px; padding: .375rem 3rem; background: var(--catalog-ink); color: var(--catalog-paper); font-size: .72rem; text-align: center; overflow-wrap: anywhere;
}
[data-solara-store].catalog-modern .catalog-announcement-inner a { text-decoration: underline; text-underline-offset: .2em; }
[data-solara-store].catalog-modern .catalog-announcement-inner button { position: absolute; right: .5rem; display: grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 0; background: transparent; color: inherit; font-size: 1.2rem; line-height: 1; cursor: pointer; }
[data-solara-store].catalog-modern .catalog-header-inner {
  position: relative; display: grid; grid-template-columns: minmax(10rem, 1fr) auto minmax(16rem, 1fr); align-items: center; gap: clamp(1.25rem, 3vw, 3rem); width: min(calc(100% - 2rem), var(--solara-container)); min-height: 80px; margin-inline: auto; border-bottom: 1px solid var(--catalog-border); -webkit-user-select: none; user-select: none;
}
[data-solara-store].catalog-modern .catalog-brand { display: inline-flex; align-items: center; min-width: 0; max-width: min(42vw, 18rem); overflow: hidden; color: var(--catalog-ink); font-family: var(--solara-font-display, Georgia, "Times New Roman", serif); font-size: clamp(1.25rem, 4vw, 2.15rem); font-weight: 500; letter-spacing: -.06em; text-decoration: none; white-space: nowrap; text-overflow: ellipsis; }
[data-solara-store].catalog-modern .catalog-brand .solara-wordmark { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; overflow-wrap: anywhere; }
[data-solara-store].catalog-modern .catalog-wordmark { font-weight: 900; }
[data-solara-store].catalog-modern .catalog-desktop-nav { display: flex; align-items: center; justify-content: center; gap: clamp(.9rem, 2vw, 1.8rem); min-width: 0; font-size: .94rem; }
[data-solara-store].catalog-modern .catalog-desktop-nav > a,
[data-solara-store].catalog-modern .catalog-desktop-nav summary,
[data-solara-store].catalog-modern .catalog-nav-empty { display: inline-flex; align-items: center; min-height: 44px; min-width: 0; max-width: 100%; padding: .5rem 0; text-decoration: none; overflow-wrap: anywhere; cursor: pointer; -webkit-user-select: none; user-select: none; }
[data-solara-store].catalog-modern .catalog-desktop-nav > a:hover,
[data-solara-store].catalog-modern .catalog-desktop-nav summary:hover,
[data-solara-store].catalog-modern .catalog-nav-empty:hover { color: var(--catalog-muted); }
[data-solara-store].catalog-modern .catalog-desktop-nav > a:focus-visible,
[data-solara-store].catalog-modern .catalog-desktop-nav summary:focus-visible,
[data-solara-store].catalog-modern .catalog-nav-empty:focus-visible,
[data-solara-store].catalog-modern .catalog-search-link:focus-visible,
[data-solara-store].catalog-modern .catalog-cart-link:focus-visible { outline: 2px solid var(--catalog-ink); outline-offset: 4px; }
[data-solara-store].catalog-modern .catalog-nav-menu { position: static; }
[data-solara-store].catalog-modern .catalog-nav-menu summary { list-style: none; font-weight: 700; }
[data-solara-store].catalog-modern .catalog-nav-menu summary::-webkit-details-marker { display: none; }
[data-solara-store].catalog-modern .catalog-nav-chevron { display: inline-grid; place-items: center; flex: 0 0 auto; width: 1.1rem; height: 1.1rem; margin-left: .35rem; color: var(--catalog-muted); font-size: .85rem; line-height: 1; transition: transform var(--solara-motion-fast, 180ms) ease; }
[data-solara-store].catalog-modern .catalog-nav-chevron svg { width: .9rem; height: .9rem; fill: none; stroke: currentcolor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.8; }
[data-solara-store].catalog-modern .catalog-nav-chevron--forward { transform: none !important; }
[data-solara-store].catalog-modern .catalog-nav-menu[open] > summary .catalog-nav-chevron { transform: rotate(180deg); }
[data-solara-store].catalog-modern .catalog-mega-menu { position: absolute; z-index: 20; top: calc(100% + .85rem); left: 50%; width: min(var(--solara-container), calc(100vw - 2rem)); max-height: min(72vh, 640px); overflow: auto; transform: translateX(-50%); padding: clamp(2rem, 4vw, 3rem) clamp(1.5rem, 4vw, 3.5rem) 1.5rem; border: 1px solid var(--catalog-border); border-radius: 0 0 var(--solara-radius) var(--solara-radius); background: var(--catalog-paper); box-shadow: var(--solara-shadow-overlay); -webkit-user-select: none; user-select: none; }
[data-solara-store].catalog-modern .catalog-mega-menu__groups { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); grid-auto-rows: max-content; align-items: start; gap: calc(2.15rem * var(--solara-space-scale, 1)) calc(2.5rem * var(--solara-space-scale, 1)); margin: 0; padding: 0; list-style: none; }
[data-solara-store].catalog-modern .catalog-mega-group { min-width: 0; padding-inline-start: 1.5rem; border-inline-start: 1px solid var(--catalog-border); }
[data-solara-store].catalog-modern .catalog-mega-group__link { display: block; color: var(--catalog-ink); font-size: 1rem; font-weight: 700; text-decoration: none; }
[data-solara-store].catalog-modern .catalog-mega-group__link::after { display: none; }
[data-solara-store].catalog-modern .catalog-mega-group__link:hover,
[data-solara-store].catalog-modern .catalog-mega-group__link:focus-visible { color: var(--catalog-muted); }
[data-solara-store].catalog-modern .catalog-mega-group__link:focus-visible,
[data-solara-store].catalog-modern .catalog-mega-group__children a:focus-visible { outline: 2px solid var(--catalog-ink); outline-offset: 2px; border-radius: var(--solara-radius); }
[data-solara-store].catalog-modern .catalog-mega-group__children { display: grid; gap: .25rem; margin: .55rem 0 0; padding: 0; list-style: none; }
[data-solara-store].catalog-modern .catalog-mega-group__children a { display: block; min-height: 2.25rem; padding: .25rem 0; color: var(--catalog-muted); font-size: .9rem; font-weight: 500; text-decoration: none; }
[data-solara-store].catalog-modern .catalog-mega-group__children a:hover { color: var(--catalog-ink); text-decoration: underline; text-underline-offset: .25em; }
[data-solara-store].catalog-modern .catalog-mega-menu__all { display: inline-flex; align-items: center; gap: .5rem; margin-top: 2rem; padding-top: 1.25rem; color: var(--catalog-ink); font-size: .9rem; text-decoration: none; }
[data-solara-store].catalog-modern .catalog-header-actions { display: flex; align-items: center; justify-content: end; gap: .75rem; min-width: 0; }
[data-solara-store].catalog-modern .catalog-search-link,
[data-solara-store].catalog-modern .catalog-cart-link { display: inline-flex; align-items: center; gap: .25rem; min-height: 44px; border: 0; background: transparent; font-size: .82rem; text-decoration: none; cursor: pointer; -webkit-user-select: none; user-select: none; }
[data-solara-store].catalog-modern .catalog-search-link { width: min(18rem, 100%); max-width: 18rem; padding: .5rem 1rem; border: 1px solid var(--catalog-border); border-radius: 0; background: var(--catalog-surface); color: var(--catalog-muted); overflow: hidden; }
[data-solara-store].catalog-modern .catalog-search-link span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-solara-store].catalog-modern .catalog-search-noscript { display: none; }
[data-solara-store].catalog-modern .catalog-search-dialog { width: min(34rem, calc(100% - 2rem)); margin: auto; padding: 0; border: 1px solid var(--catalog-border); border-radius: 0; background: var(--catalog-paper); color: var(--catalog-ink); box-shadow: var(--solara-shadow-overlay); }
[data-solara-store].catalog-modern .catalog-search-dialog::backdrop { background: color-mix(in srgb, var(--catalog-ink) 50%, transparent); }
[data-solara-store].catalog-modern .catalog-search-dialog-form { display: grid; gap: 1rem; padding: clamp(1.25rem, 4vw, 2rem); }
[data-solara-store].catalog-modern .catalog-search-dialog-heading { display: flex; align-items: start; justify-content: space-between; gap: 1rem; }
[data-solara-store].catalog-modern .catalog-search-dialog-heading h2 { font-size: clamp(1.7rem, 4vw, 2.5rem); font-weight: 900; letter-spacing: -.055em; line-height: .98; overflow-wrap: anywhere; }
[data-solara-store].catalog-modern .catalog-search-dialog-heading button { min-height: 44px; padding: .5rem .8rem; border: 1px solid var(--catalog-border); border-radius: 0; background: transparent; color: inherit; cursor: pointer; }
[data-solara-store].catalog-modern .catalog-search-dialog-form label { color: var(--catalog-muted); font-size: .8rem; }
[data-solara-store].catalog-modern .catalog-search-dialog-controls { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .75rem; }
[data-solara-store].catalog-modern .catalog-search-dialog-controls input { min-height: 48px; padding: .75rem .85rem; border: 1px solid var(--catalog-border); border-radius: 0; background: var(--catalog-surface); color: var(--catalog-ink); }
[data-solara-store].catalog-modern .catalog-search-dialog-controls .catalog-primary-action { border-radius: 0; }
:root.catalog-search-open { overflow: hidden; }
[data-solara-store].catalog-modern .catalog-cart-link strong { display: inline-flex; align-items: center; justify-content: center; min-width: 1.9rem; height: 1.35rem; min-height: 1.35rem; padding: 0 .45rem; border-radius: 999px; background: var(--catalog-ink); color: var(--catalog-paper); font-size: .68rem; font-variant-numeric: tabular-nums; line-height: 1; text-align: center; box-sizing: border-box; flex-shrink: 0; white-space: nowrap; }
.cm.v2 .catalog-cart-link strong { display: inline-flex; align-items: center; justify-content: center; min-width: 1.9rem; height: 1.35rem; min-height: 1.35rem; padding: 0 .45rem; border-radius: 999px; background: var(--catalog-ink); color: var(--catalog-paper); font-size: .68rem; font-variant-numeric: tabular-nums; line-height: 1; text-align: center; box-sizing: border-box; flex-shrink: 0; white-space: nowrap; }
[data-solara-store].catalog-modern .catalog-mobile-menu-button,
[data-solara-store].catalog-modern .catalog-mobile-menu { display: none; }
[data-solara-store].catalog-modern .catalog-mobile-nav-icon { display: inline-grid; place-items: center; flex: 0 0 1.7rem; width: 1.7rem; height: 1.7rem; color: var(--catalog-ink); }
[data-solara-store].catalog-modern .catalog-mobile-nav-icon svg { width: 1.45rem; height: 1.45rem; fill: none; stroke: currentcolor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.6; }
:root.catalog-mobile-menu-open { overflow: hidden; }
[data-solara-store].catalog-modern .catalog-hero-inner { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); align-items: stretch; width: min(calc(100% - 2rem), var(--solara-container)); min-height: min(680px, calc(100svh - 104px)); margin: 1.5rem auto 0; overflow: hidden; border-radius: var(--solara-radius); background: var(--catalog-surface); }
[data-solara-store].catalog-modern .catalog-hero-copy { display: flex; flex-direction: column; justify-content: center; padding: clamp(2rem, 5vw, 5rem); }
[data-solara-store].catalog-modern .catalog-eyebrow { margin-bottom: 1rem; color: var(--catalog-muted); font-size: .75rem; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
[data-solara-store].catalog-modern .catalog-hero-copy h1 { max-width: 12ch; font-size: calc(clamp(2.8rem, 5vw, 5.5rem) * var(--solara-type-scale, 1)); font-weight: 900; letter-spacing: -.055em; line-height: 1.15; text-wrap: balance; overflow-wrap: break-word; }
[data-solara-store].catalog-modern .catalog-hero-copy > p:not(.catalog-eyebrow) { max-width: 32ch; margin-top: 1.25rem; color: var(--catalog-muted); }
[data-solara-store].catalog-modern .catalog-hero-actions { display: flex; flex-wrap: wrap; gap: calc(.65rem * var(--solara-space-scale, 1)); margin-top: 1.5rem; }
[data-solara-store].catalog-modern .catalog-primary-action,
[data-solara-store].catalog-modern .catalog-secondary-action,
[data-solara-store].catalog-modern .catalog-newsletter-action,
[data-solara-store].catalog-modern .solara-primary-action { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; overflow-wrap: anywhere; padding: .75rem 1.25rem; border-radius: var(--solara-radius); font-weight: 700; text-align: center; text-decoration: none; }
[data-solara-store].catalog-modern .catalog-primary-action { background: var(--solara-accent); color: var(--solara-accent-text); }
[data-solara-store].catalog-modern .solara-primary-action { background: var(--solara-accent); color: var(--solara-accent-text); }
[data-solara-store].catalog-modern .catalog-secondary-action { border: 1px solid var(--catalog-border); background: transparent; }
[data-solara-store].catalog-modern .catalog-primary-action:hover,
[data-solara-store].catalog-modern .catalog-newsletter-action:hover { transform: translateY(-1px); background: color-mix(in srgb, var(--solara-accent) 88%, var(--solara-accent-text)); }
[data-solara-store].catalog-modern .catalog-secondary-action:hover { background: var(--catalog-surface); border-color: var(--catalog-ink); }
[data-solara-store].catalog-modern .catalog-hero-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0; margin-top: 2.5rem; }
[data-solara-store].catalog-modern .catalog-hero-stats div { display: grid; grid-template-rows: auto minmax(2.5em, auto); align-content: start; min-width: 0; min-height: 4.6rem; padding: .25rem 1rem 0 0; border-right: 1px solid var(--catalog-border); }
[data-solara-store].catalog-modern .catalog-hero-stats div + div { padding-left: 1rem; }
[data-solara-store].catalog-modern .catalog-hero-stats div:last-child { border-right: 0; }
[data-solara-store].catalog-modern .catalog-hero-stats dt { font-variant-numeric: tabular-nums; font-size: clamp(1.1rem, 2.2vw, 1.55rem); font-weight: 900; letter-spacing: -.04em; line-height: 1.05; white-space: nowrap; }
[data-solara-store].catalog-modern .catalog-hero-stats dd { max-width: 12ch; margin: .35rem 0 0; color: var(--catalog-muted); font-size: .72rem; line-height: 1.25; }
[data-solara-store].catalog-modern .catalog-hero-media { min-height: 100%; background: var(--catalog-surface); }
[data-solara-store].catalog-modern .catalog-hero-image,
[data-solara-store].catalog-modern .catalog-hero-video { width: 100%; height: 100%; min-height: 100%; object-fit: cover; }
[data-solara-store].catalog-modern .catalog-hero-slide-stage,
[data-solara-store].catalog-modern .catalog-hero-slide-stage figure { height: 100%; min-height: 100%; margin: 0; }
[data-solara-store].catalog-modern .catalog-hero-slide-stage figure[hidden] { display: none; }
[data-solara-store].catalog-modern .catalog-hero-controls { grid-column: 2; display: flex; gap: .25rem; align-self: end; justify-content: center; margin: -3rem 0 1rem; z-index: 1; }
[data-solara-store].catalog-modern .catalog-hero-controls button { width: 44px; height: 6px; padding: 0; border: 0; border-radius: 999px; background: color-mix(in srgb, var(--catalog-paper) 55%, transparent); }
[data-solara-store].catalog-modern .catalog-hero-controls button[aria-selected="true"] { background: var(--catalog-paper); }
[data-solara-store].catalog-modern .catalog-brand-strip-inner { width: min(calc(100% - 2rem), var(--solara-container)); margin: 1rem auto 0; padding: 1.25rem 0; border-block: 1px solid var(--catalog-border); }
[data-solara-store].catalog-modern .catalog-brand-strip-inner h2 { color: var(--catalog-muted); font-size: .7rem; letter-spacing: .14em; text-align: center; text-transform: uppercase; }
[data-solara-store].catalog-modern .catalog-brand-strip-inner ul { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 1rem; align-items: center; margin: 1rem 0 0; padding: 0; list-style: none; font-size: clamp(1rem, 2vw, 1.4rem); font-weight: 800; text-align: center; }
[data-solara-store].catalog-modern .catalog-brand-strip-inner li { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
[data-solara-store].catalog-modern .catalog-product-grid-section,
[data-solara-store].catalog-modern .catalog-category-bento-section,
[data-solara-store].catalog-modern .catalog-testimonials-section { width: min(calc(100% - 2rem), var(--solara-container)); margin: 0 auto; padding: clamp(3.5rem, 7vw, 7rem) 0; }
[data-solara-store].catalog-modern .catalog-product-grid-section > header,
[data-solara-store].catalog-modern .catalog-testimonials-section > header { display: flex; align-items: end; justify-content: space-between; gap: 1rem; margin-bottom: 1.5rem; }
[data-solara-store].catalog-modern .catalog-product-grid-section h2,
[data-solara-store].catalog-modern .catalog-category-bento-section h2,
[data-solara-store].catalog-modern .catalog-testimonials-section h2 { min-width: 0; font-size: calc(clamp(2rem, 4vw, 3.4rem) * var(--solara-type-scale, 1)); font-weight: 900; letter-spacing: -.08em; overflow-wrap: anywhere; }
[data-solara-store].catalog-modern .catalog-view-all { border-bottom: 1px solid currentColor; font-size: .85rem; text-decoration: none; }
[data-solara-store].catalog-modern .catalog-product-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: calc(1.25rem * var(--solara-space-scale, 1)); }
[data-solara-store].catalog-modern .catalog-product-card { min-width: 0; }
[data-solara-store].catalog-modern .catalog-product-media { display: block; overflow: hidden; aspect-ratio: 1; border-radius: var(--solara-radius); background: var(--catalog-surface); }
[data-solara-store].catalog-modern .catalog-product-card-image { width: 100%; height: 100%; object-fit: cover; object-position: center; transition: transform var(--solara-motion-normal) var(--solara-motion-easing); }
[data-solara-store].catalog-modern .catalog-product-card:hover .catalog-product-card-image { transform: scale(1.02); }
[data-solara-store].catalog-modern .catalog-product-card-copy { padding-top: .75rem; min-width: 0; }
[data-solara-store].catalog-modern .catalog-product-category { min-height: 1em; color: var(--catalog-muted); font-size: .72rem; font-weight: 700; letter-spacing: .08em; line-height: 1.25; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
[data-solara-store].catalog-modern .catalog-product-card h3 { min-height: 2.3em; margin-top: .3rem; font-size: 1rem; font-weight: 700; line-height: 1.15; display: -webkit-box; overflow: hidden; overflow-wrap: anywhere; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
[data-solara-store].catalog-modern .catalog-product-card h3 a { text-decoration: none; }
[data-solara-store].catalog-modern .catalog-product-card h3 a:hover { text-decoration: underline; text-underline-offset: .16em; }
[data-solara-store].catalog-modern .catalog-product-rating { margin-top: .35rem; color: var(--catalog-rating); font-size: .82rem; letter-spacing: .08em; }
[data-solara-store].catalog-modern .catalog-product-rating span { margin-left: .35rem; color: var(--catalog-muted); font-size: .72rem; letter-spacing: 0; }
[data-solara-store].catalog-modern .catalog-product-price { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem; margin-top: .35rem; font-size: .95rem; }
[data-solara-store].catalog-modern .catalog-product-price strong { font-weight: 800; }
[data-solara-store].catalog-modern .catalog-product-price del { color: var(--catalog-muted); }
[data-solara-store].catalog-modern .catalog-discount { padding: .18rem .4rem; border-radius: 999px; background: color-mix(in srgb, var(--catalog-sale) 12%, transparent); color: color-mix(in srgb, var(--catalog-sale) 74%, var(--catalog-ink)); font-size: .68rem; font-weight: 700; }
[data-solara-store].catalog-modern .catalog-category-bento-section { margin-top: 1rem; padding: clamp(1.5rem, 3vw, 2.5rem); border-radius: var(--solara-radius); background: var(--catalog-surface); }
[data-solara-store].catalog-modern .catalog-category-bento-section > header { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 1rem; }
[data-solara-store].catalog-modern .catalog-category-bento-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-auto-flow: dense; grid-auto-rows: clamp(9rem, 10vw, 12rem); gap: calc(.75rem * var(--solara-space-scale, 1)); margin-top: 1.5rem; }
[data-solara-store].catalog-modern .catalog-category-bento-item { position: relative; display: grid; grid-template-rows: auto minmax(0, 1fr); min-height: 0; overflow: hidden; grid-column: span 1; grid-row: span 1; border-radius: var(--solara-radius); background: var(--catalog-paper); text-decoration: none; }
[data-solara-store].catalog-modern .catalog-category-bento-item--wide { grid-column: span 2; grid-row: span 1; }
[data-solara-store].catalog-modern .catalog-category-bento-item--tall { grid-column: span 1; grid-row: span 2; }
[data-solara-store].catalog-modern .catalog-category-bento-copy { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: .75rem; min-width: 0; padding: 1rem; }
[data-solara-store].catalog-modern .catalog-category-bento-label { min-width: 0; color: var(--catalog-ink); }
[data-solara-store].catalog-modern .catalog-category-bento-title { display: -webkit-box; overflow: hidden; color: var(--catalog-ink); font-size: 1rem; font-weight: 700; line-height: 1.15; overflow-wrap: anywhere; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
[data-solara-store].catalog-modern .catalog-category-bento-count { display: block; margin-top: .35rem; color: var(--catalog-muted); font-size: .72rem; font-weight: 600; line-height: 1.2; }
[data-solara-store].catalog-modern .catalog-category-bento-arrow { width: 1.1rem; height: 1.1rem; fill: none; stroke: currentcolor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; transition: transform var(--solara-motion-normal) var(--solara-motion-easing); }
[data-solara-store].catalog-modern .catalog-category-bento-item:hover .catalog-category-bento-arrow,
[data-solara-store].catalog-modern .catalog-category-bento-item:focus-visible .catalog-category-bento-arrow { transform: translateX(.2rem); }
[data-solara-store].catalog-modern .catalog-category-bento-media { position: relative; overflow: hidden; aspect-ratio: 1; background: var(--catalog-surface); }
[data-solara-store].catalog-modern .catalog-category-bento-image { position: absolute; z-index: 0; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: .78; transition: transform var(--solara-motion-normal) var(--solara-motion-easing); }
[data-solara-store].catalog-modern .catalog-category-bento-item:hover .catalog-category-bento-image { transform: scale(1.02); }
[data-solara-store].catalog-modern .solara-category-placeholder { position: absolute; z-index: 0; inset: 0; display: grid; place-items: center; margin: 0; background: color-mix(in srgb, var(--catalog-ink) 7%, var(--catalog-surface)); color: var(--catalog-ink); font-family: var(--solara-font-display, Georgia, "Times New Roman", serif); font-size: clamp(3rem, 5vw, 4.5rem); font-weight: 500; letter-spacing: -.06em; line-height: 1; }
[data-solara-store].catalog-modern .catalog-category-bento-all { border-bottom: 1px solid currentColor; font-size: .82rem; text-decoration: none; }
[data-solara-store].catalog-modern .catalog-testimonials-track { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(280px, 1fr); gap: calc(.8rem * var(--solara-space-scale, 1)); overflow-x: auto; overscroll-behavior-inline: contain; scroll-snap-type: x proximity; padding-bottom: .5rem; }
[data-solara-store].catalog-modern .catalog-testimonials-track:focus-visible { outline: 2px solid var(--catalog-ink); outline-offset: 2px; }
[data-solara-store].catalog-modern .catalog-testimonials-controls button:focus-visible { outline: 2px solid var(--catalog-ink); outline-offset: 2px; }
@media (min-width: 1200px) {
  [data-solara-store].catalog-modern .catalog-testimonials-track {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-auto-flow: row;
    grid-auto-columns: auto;
    overflow: visible;
    scroll-snap-type: none;
  }
}
[data-solara-store].catalog-modern .catalog-testimonial { min-height: 190px; padding: 1.25rem; border: 1px solid var(--catalog-border); border-radius: var(--solara-radius); scroll-snap-align: start; text-align: left; }
[data-solara-store].catalog-modern .catalog-testimonial-rating { color: var(--catalog-rating); letter-spacing: .08em; }
[data-solara-store].catalog-modern .catalog-testimonial h3 { margin-top: .9rem; font-size: 1rem; font-weight: 800; }
[data-solara-store].catalog-modern .catalog-testimonial-context { margin-top: .15rem; color: var(--catalog-muted); font-size: .75rem; }
[data-solara-store].catalog-modern .catalog-testimonial blockquote { margin: .75rem 0 0; color: var(--catalog-muted); font-size: .9rem; text-align: left; overflow-wrap: anywhere; }
[data-solara-store].catalog-modern .catalog-testimonials-controls { display: flex; gap: .25rem; }
[data-solara-store].catalog-modern .catalog-testimonials-controls button { width: 44px; height: 44px; border: 1px solid var(--catalog-border); border-radius: 999px; background: transparent; cursor: pointer; }
[data-solara-store].catalog-modern .catalog-testimonials-controls button:hover { border-color: var(--catalog-ink); }
[data-solara-store].catalog-modern .catalog-newsletter-inner { display: flex; align-items: center; justify-content: space-between; gap: calc(2rem * var(--solara-space-scale, 1)); width: min(calc(100% - 2rem), var(--solara-container)); margin: 0 auto clamp(2rem, 5vw, 5rem); padding: clamp(1.75rem, 4vw, 3rem); border-radius: var(--solara-radius); background: var(--catalog-ink); color: var(--catalog-paper); }
[data-solara-store].catalog-modern .catalog-newsletter-inner h2 { max-width: 16ch; font-size: calc(clamp(1.8rem, 4vw, 3rem) * var(--solara-type-scale, 1)); font-weight: 900; letter-spacing: -.08em; line-height: .95; }
[data-solara-store].catalog-modern .catalog-newsletter-inner p { max-width: 38ch; margin-top: .6rem; color: color-mix(in srgb, var(--catalog-paper) 72%, transparent); }
[data-solara-store].catalog-modern .catalog-newsletter-action { flex-shrink: 0; background: var(--catalog-paper); color: var(--catalog-ink); }
[data-solara-store].catalog-modern .catalog-footer-inner { display: grid; grid-template-columns: minmax(15rem, 1.45fr) repeat(4, minmax(0, 1fr)); gap: calc(2rem * var(--solara-space-scale, 1)); width: min(calc(100% - 2rem), var(--solara-container)); margin: 0 auto; padding: calc(3rem * var(--solara-space-scale, 1)) 0 calc(2rem * var(--solara-space-scale, 1)); border-top: 2px solid var(--solara-accent); }
[data-solara-store].catalog-modern .catalog-footer-inner > * { min-width: 0; }
[data-solara-store].catalog-modern .catalog-footer-inner nav a,
[data-solara-store].catalog-modern .catalog-footer-inner address,
[data-solara-store].catalog-modern .catalog-footer-brand p,
[data-solara-store].catalog-modern .catalog-footer-inner small { overflow-wrap: anywhere; }
[data-solara-store].catalog-modern .catalog-footer-inner a[href^="mailto:"] { word-break: keep-all; overflow-wrap: normal; }
[data-solara-store].catalog-modern .catalog-footer-inner nav { display: grid; align-content: start; gap: .6rem; font-size: .84rem; }
[data-solara-store].catalog-modern .catalog-footer-inner nav strong,
[data-solara-store].catalog-modern .catalog-footer-inner address strong { color: var(--catalog-muted); font-size: .68rem; letter-spacing: .14em; text-transform: uppercase; }
[data-solara-store].catalog-modern .catalog-footer-inner nav a { text-decoration: none; transition: color var(--solara-motion-fast, 180ms) var(--solara-motion-easing, ease), transform var(--solara-motion-fast, 180ms) var(--solara-motion-easing, ease); }
[data-solara-store].catalog-modern .catalog-footer-inner nav a:hover,
[data-solara-store].catalog-modern .catalog-footer-inner nav a:focus-visible { color: var(--solara-accent); transform: translateX(.2rem); }
[data-solara-store].catalog-modern .catalog-footer-brand { display: flex; flex-direction: column; align-items: flex-start; padding-inline-start: clamp(.9rem, 1.8vw, 1.5rem); border-inline-start: 2px solid var(--solara-accent); }
[data-solara-store].catalog-modern .catalog-footer-brand .catalog-brand { display: inline-flex; align-items: center; width: fit-content; max-width: min(100%, 16rem); min-height: 3rem; }
[data-solara-store].catalog-modern .catalog-footer-brand .catalog-brand .solara-logo { display: block; width: auto; max-width: 100%; height: clamp(2.75rem, 4vw, 4.75rem); object-fit: contain; object-position: left center; }
/* Primer frame: el <img> trae width/height del asset y reserva la caja; el alt
   no debe heredar la display del brand (~2rem) cuando la imagen aún no cargó. */
[data-solara-store].catalog-modern .catalog-brand .solara-logo { display: block; width: auto; height: auto; max-width: 100%; object-fit: contain; object-position: left center; overflow: hidden; font-size: 12px; line-height: 1.2; }
/* Appear de marca V1 (logo + hero-media): oculto pre-load sólo con motion
   listo y preset distinto de none; al cargar anima con duración/easing/delay/
   distancia/intensidad de la sección (panel Movimiento). Sin JS, con
   movimiento reducido o en error, visible directo. */
@media (prefers-reduced-motion: no-preference) {
  html[data-motion-ready="true"] [data-solara-store].catalog-modern:not(.v2) [data-motion-root]:not([data-motion-preset="none"]) :is(img.solara-logo, figure.solara-hero-media, .solara-hero-media):not([data-solara-loaded]):not([data-solara-broken]) {
    opacity: 0;
  }
  html[data-motion-ready="true"] [data-solara-store].catalog-modern:not(.v2) [data-motion-root][data-motion-preset="fade"][data-motion-visible="true"] :is(img.solara-logo, figure.solara-hero-media, .solara-hero-media)[data-solara-loaded] {
    animation: solara-motion-fade var(--motion-duration, 600ms) var(--motion-easing, cubic-bezier(.16, 1, .3, 1)) var(--motion-delay, 0ms) backwards;
  }
  html[data-motion-ready="true"] [data-solara-store].catalog-modern:not(.v2) [data-motion-root]:is([data-motion-preset="fade-up"], [data-motion-preset="stagger"])[data-motion-visible="true"] :is(img.solara-logo, figure.solara-hero-media, .solara-hero-media)[data-solara-loaded] {
    animation: solara-motion-fade-up var(--motion-duration, 600ms) var(--motion-easing, cubic-bezier(.16, 1, .3, 1)) var(--motion-delay, 0ms) backwards;
  }
  html[data-motion-ready="true"] [data-solara-store].catalog-modern:not(.v2) [data-motion-root][data-motion-preset="scale"][data-motion-visible="true"] :is(img.solara-logo, figure.solara-hero-media, .solara-hero-media)[data-solara-loaded] {
    animation: solara-motion-scale var(--motion-duration, 600ms) var(--motion-easing, cubic-bezier(.16, 1, .3, 1)) var(--motion-delay, 0ms) backwards;
  }
  html[data-motion-ready="true"] [data-solara-store].catalog-modern:not(.v2) [data-motion-root][data-motion-preset="slide"][data-motion-visible="true"] :is(img.solara-logo, figure.solara-hero-media, .solara-hero-media)[data-solara-loaded] {
    animation: solara-motion-slide var(--motion-duration, 600ms) var(--motion-easing, cubic-bezier(.16, 1, .3, 1)) var(--motion-delay, 0ms) backwards;
  }
}
[data-solara-store].catalog-modern .catalog-footer-brand .catalog-brand .solara-wordmark { max-width: 100%; overflow-wrap: anywhere; font-family: var(--solara-font-display, Georgia, "Times New Roman", serif); font-size: clamp(1.25rem, 2.4vw, 2rem); line-height: 1; }
[data-solara-store].catalog-modern .catalog-footer-brand p { max-width: 28ch; margin: 1rem 0 0; color: var(--catalog-muted); font-size: .84rem; }
[data-solara-store].catalog-modern .catalog-footer-whatsapp { display: inline-flex; align-items: center; justify-content: space-between; gap: 1rem; width: min(100%, 16rem); min-height: 2.75rem; margin-top: 1rem; padding: .65rem .8rem; border: 1px solid var(--solara-accent); border-radius: var(--solara-radius); color: var(--solara-accent); font-size: .78rem; font-weight: 800; text-decoration: none; }
[data-solara-store].catalog-modern .solara-search-form .solara-primary-action,
[data-solara-store].catalog-modern .catalog-search-dialog-controls .catalog-primary-action,
[data-solara-store].catalog-modern .catalog-cart-drawer .catalog-drawer-footer .catalog-primary-action,
[data-solara-store].catalog-modern .solara-cart-page .catalog-primary-action { border: 1px solid var(--solara-accent); background: transparent; color: var(--solara-accent); transition: background-color var(--solara-motion-fast, 180ms) var(--solara-motion-easing, ease), border-color var(--solara-motion-fast, 180ms) var(--solara-motion-easing, ease), color var(--solara-motion-fast, 180ms) var(--solara-motion-easing, ease); }
[data-solara-store].catalog-modern .catalog-footer-whatsapp:hover,
[data-solara-store].catalog-modern .catalog-footer-whatsapp:focus-visible,
[data-solara-store].catalog-modern .solara-search-form .solara-primary-action:hover,
[data-solara-store].catalog-modern .solara-search-form .solara-primary-action:focus-visible,
[data-solara-store].catalog-modern .catalog-search-dialog-controls .catalog-primary-action:hover,
[data-solara-store].catalog-modern .catalog-search-dialog-controls .catalog-primary-action:focus-visible,
[data-solara-store].catalog-modern .catalog-cart-drawer .catalog-drawer-footer .catalog-primary-action:hover,
[data-solara-store].catalog-modern .catalog-cart-drawer .catalog-drawer-footer .catalog-primary-action:focus-visible,
[data-solara-store].catalog-modern .solara-cart-page .catalog-primary-action:hover,
[data-solara-store].catalog-modern .solara-cart-page .catalog-primary-action:focus-visible { background: var(--solara-accent); color: var(--solara-accent-text); }
[data-solara-store].catalog-modern .solara-search-form .solara-primary-action:hover,
[data-solara-store].catalog-modern .solara-search-form .solara-primary-action:focus-visible,
[data-solara-store].catalog-modern .catalog-search-dialog-controls .catalog-primary-action:hover,
[data-solara-store].catalog-modern .catalog-search-dialog-controls .catalog-primary-action:focus-visible { transform: none; box-shadow: none; }
[data-solara-store].catalog-modern .catalog-footer-inner address { display: grid; align-content: start; gap: .6rem; padding-inline-start: 0; border-inline-start: 0; font-style: normal; font-size: .84rem; }
[data-solara-store].catalog-modern .catalog-footer-contact a { text-decoration: none; transition: color var(--solara-motion-fast, 180ms) var(--solara-motion-easing, ease), transform var(--solara-motion-fast, 180ms) var(--solara-motion-easing, ease); }
[data-solara-store].catalog-modern .catalog-footer-contact a:hover,
[data-solara-store].catalog-modern .catalog-footer-contact a:focus-visible { color: var(--solara-accent); transform: translateX(.2rem); }
[data-solara-store].catalog-modern .catalog-footer-meta { display: flex; flex: 1 1 100%; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .75rem 1.5rem; min-width: 0; padding-top: 1rem; border-top: 1px solid var(--catalog-border); grid-column: 1 / -1; }
[data-solara-store].catalog-modern .catalog-footer-meta > * { min-width: 0; margin: 0; flex: 1 1 18rem; }
[data-solara-store].catalog-modern .catalog-footer-meta small { color: var(--catalog-muted); }
[data-solara-store].catalog-modern .catalog-footer-meta .catalog-footer-made { text-align: right; }
[data-solara-store].catalog-modern .catalog-empty { grid-column: 1 / -1; padding: 2rem 0; color: var(--catalog-muted); }
[data-solara-store].catalog-modern .catalog-product-detail { width: min(calc(100% - 2rem), var(--solara-container)); margin: 0 auto; }
[data-solara-store].catalog-modern .catalog-product-detail-inner { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(320px, .9fr); gap: clamp(2rem, 5vw, 5rem); padding: clamp(2rem, 5vw, 4rem) 0 3rem; }
[data-solara-store].catalog-modern .catalog-product-gallery { display: grid; grid-template-columns: 5rem minmax(0, 1fr); gap: .75rem; align-content: start; }
[data-solara-store].catalog-modern .catalog-product-gallery-main { overflow: hidden; border-radius: var(--solara-radius); background: var(--catalog-surface); }
[data-solara-store].catalog-modern .catalog-product-gallery-main figure { display: none; aspect-ratio: 1 / 1.08; margin: 0; }
[data-solara-store].catalog-modern .catalog-product-gallery-main figure[data-gallery-active="true"] { display: block; }
[data-solara-store].catalog-modern .catalog-product-gallery-image { width: 100%; height: 100%; object-fit: cover; object-position: center; display: block; }
[data-solara-store].catalog-modern .catalog-product-gallery-thumbs { display: grid; align-content: start; gap: .5rem; }
[data-solara-store].catalog-modern .catalog-product-gallery-thumbs button { padding: 0; overflow: hidden; aspect-ratio: 1; border: 1px solid transparent; border-radius: var(--solara-radius); background: var(--catalog-surface); cursor: pointer; }
[data-solara-store].catalog-modern .catalog-product-gallery-thumbs button[aria-current="true"] { border-color: var(--catalog-ink); }
[data-solara-store].catalog-modern .catalog-product-gallery-thumb { width: 100%; height: 100%; object-fit: cover; object-position: center; display: block; }
[data-solara-store].catalog-modern .catalog-product-info { align-self: start; padding-top: .5rem; }
[data-solara-store].catalog-modern .catalog-product-info h1 { max-width: 14ch; margin-top: .35rem; font-size: calc(clamp(2.25rem, 4.2vw, 4.7rem) * var(--solara-type-scale, 1)); font-weight: 900; letter-spacing: -.03em; line-height: .92; overflow-wrap: anywhere; }
[data-solara-store].catalog-modern .catalog-detail-price { display: flex; flex-wrap: wrap; align-items: baseline; gap: .75rem; margin-top: 1.15rem; font-size: 1.55rem; font-weight: 800; }
[data-solara-store].catalog-modern .catalog-detail-price del { color: var(--catalog-muted); font-size: 1rem; font-weight: 500; }
[data-solara-store].catalog-modern .catalog-product-info > .catalog-product-rating { margin-top: .8rem; }
[data-solara-store].catalog-modern .catalog-product-rating { color: var(--catalog-rating); letter-spacing: .08em; }
[data-solara-store].catalog-modern .catalog-product-rating span { margin-left: .45rem; color: var(--catalog-muted); font-size: .78rem; letter-spacing: 0; }
[data-solara-store].catalog-modern .catalog-rich-text { max-width: 48ch; margin-top: 1.25rem; color: var(--catalog-muted); }
[data-solara-store].catalog-modern .catalog-add-form { display: grid; gap: .5rem; margin-top: 1.6rem; padding-top: 1.25rem; border-top: 1px solid var(--catalog-border); }
[data-solara-store].catalog-modern .catalog-add-form label { font-size: .78rem; font-weight: 700; }
[data-solara-store].catalog-modern .catalog-add-form select,
[data-solara-store].catalog-modern .catalog-add-form input,
[data-solara-store].catalog-modern .catalog-checkout-form input,
[data-solara-store].catalog-modern .catalog-checkout-form textarea { width: 100%; min-height: 46px; padding: .75rem .8rem; border: 1px solid var(--catalog-border); border-radius: var(--solara-radius); background: var(--catalog-paper); color: var(--catalog-ink); }
[data-solara-store].catalog-modern .catalog-quantity-row { display: grid; grid-template-columns: 1fr 6rem; align-items: center; gap: .75rem; margin-top: .55rem; }
[data-solara-store].catalog-modern .catalog-product-add { min-height: 50px; margin-top: .55rem; border: 1px solid var(--solara-accent); border-radius: var(--solara-radius); background: transparent; color: var(--solara-accent); font-weight: 800; cursor: pointer; transition: background-color var(--solara-motion-fast, 180ms) var(--solara-motion-easing, ease), border-color var(--solara-motion-fast, 180ms) var(--solara-motion-easing, ease), color var(--solara-motion-fast, 180ms) var(--solara-motion-easing, ease); }
[data-solara-store].catalog-modern .catalog-product-add:hover,
[data-solara-store].catalog-modern .catalog-product-add:focus-visible { background: var(--solara-accent); color: var(--solara-accent-text); border-color: var(--solara-accent); transform: none; box-shadow: none; }
[data-solara-store].catalog-modern .catalog-product-add:disabled { cursor: not-allowed; opacity: .5; }
[data-solara-store].catalog-modern .catalog-add-fallback { align-items: center; display: none; justify-content: center; min-height: 50px; margin-top: .55rem; border-radius: var(--solara-radius); background: var(--solara-accent); color: var(--solara-accent-text); font-weight: 800; text-decoration: none; }
[data-solara-store].catalog-modern .catalog-delivery-note { margin-top: 1.2rem; color: var(--catalog-muted); font-size: .8rem; }
[data-solara-store].catalog-modern .catalog-product-specs { display: grid; gap: .5rem; margin-top: 1.4rem; padding-top: 1rem; border-top: 1px solid var(--catalog-border); }
[data-solara-store].catalog-modern .catalog-product-specs div { display: flex; justify-content: space-between; gap: 1rem; font-size: .8rem; }
[data-solara-store].catalog-modern .catalog-product-specs dt { color: var(--catalog-muted); }
[data-solara-store].catalog-modern .catalog-product-specs dd { margin: 0; text-align: right; min-width: 0; overflow-wrap: anywhere; }
[data-solara-store].catalog-modern .catalog-product-policies { display: grid; margin-top: 1rem; border-top: 1px solid var(--catalog-border); }
[data-solara-store].catalog-modern .catalog-product-policies details { padding: .75rem 0; border-bottom: 1px solid var(--catalog-border); }
[data-solara-store].catalog-modern .catalog-product-policies summary { cursor: pointer; font-weight: 700; }
[data-solara-store].catalog-modern .catalog-product-policies p { margin-top: .6rem; color: var(--catalog-muted); font-size: .82rem; }
[data-solara-store].catalog-modern .catalog-search-link svg,
[data-solara-store].catalog-modern .catalog-mobile-menu-button svg { width: 1.05rem; height: 1.05rem; fill: none; stroke: currentcolor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.8; }
[data-solara-store].catalog-modern .catalog-product-info select { min-height: 42px; }
[data-solara-store].catalog-modern .catalog-product-tabs { display: none !important; }
[data-solara-store].catalog-modern .catalog-product-tabs button { display: none !important; }
[data-solara-store].catalog-modern .catalog-product-tabs button:hover,
[data-solara-store].catalog-modern .catalog-product-tabs button[aria-selected="true"] { border-bottom-color: var(--catalog-ink); color: var(--catalog-ink); }
[data-solara-store].catalog-modern .catalog-product-tabs button:focus-visible { outline: 2px solid var(--catalog-ink); outline-offset: -2px; }
[data-solara-store].catalog-modern [data-product-tab-panel][hidden] { display: none; }
[data-solara-store].catalog-modern .catalog-product-reviews { width: min(calc(100% - 2rem), var(--solara-container)); margin: 0 auto; padding: 2rem 0 4rem; border-top: 1px solid var(--catalog-border); }
[data-solara-store].catalog-modern .catalog-product-reviews > header { display: flex; align-items: end; justify-content: space-between; gap: 1rem; }
[data-solara-store].catalog-modern .catalog-product-reviews h2 { max-width: 18ch; margin-top: .3rem; font-size: calc(clamp(1.8rem, 3vw, 3rem) * var(--solara-type-scale, 1)); font-weight: 900; letter-spacing: -.08em; line-height: .95; }
[data-solara-store].catalog-modern .catalog-review-average { color: var(--catalog-muted); font-size: .85rem; }
[data-solara-store].catalog-modern .catalog-review-average strong { color: var(--catalog-ink); font-size: 1.5rem; }
[data-solara-store].catalog-modern .catalog-review-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: calc(.8rem * var(--solara-space-scale, 1)); margin-top: 1.5rem; }
[data-solara-store].catalog-modern .catalog-review { min-height: 170px; padding: 1.25rem; border: 1px solid var(--catalog-border); border-radius: var(--solara-radius); }
[data-solara-store].catalog-modern .catalog-review h3 { margin-top: .75rem; font-size: 1rem; font-weight: 800; }
[data-solara-store].catalog-modern .catalog-review blockquote { margin: .65rem 0; color: var(--catalog-muted); font-size: .88rem; overflow-wrap: anywhere; }
[data-solara-store].catalog-modern .catalog-review small { color: var(--catalog-muted); font-size: .7rem; }
[data-solara-store].catalog-modern .catalog-cart-drawer { position: fixed; z-index: 50; inset: 0 0 0 auto; display: flex; width: min(440px, 100%); flex-direction: column; padding: 1.25rem; overflow: hidden; transform: translateX(105%); background: var(--catalog-paper); box-shadow: var(--solara-shadow-overlay); transition: transform var(--solara-motion-normal, 260ms) var(--solara-motion-easing, cubic-bezier(.16,1,.3,1)); }
[data-solara-store].catalog-modern .catalog-cart-drawer [hidden] { display: none !important; }
[data-solara-store].catalog-modern .catalog-cart-drawer[data-cart-step="review"] [data-cart-checkout-label],
[data-solara-store].catalog-modern .catalog-cart-drawer[data-cart-step="review"] [data-cart-checkout-submit],
[data-solara-store].catalog-modern .catalog-cart-drawer[data-cart-step="review"] [data-order-verification-warning],
[data-solara-store].catalog-modern .catalog-cart-drawer[data-cart-step="checkout"] [data-cart-review-label],
[data-solara-store].catalog-modern .catalog-cart-drawer[data-cart-step="checkout"] [data-cart-checkout-next] { display: none !important; }
[data-solara-store].catalog-modern .catalog-cart-review { display: flex; flex: 1 1 auto; min-height: 0; flex-direction: column; }
[data-solara-store].catalog-modern .catalog-cart-review[hidden],
[data-solara-store].catalog-modern .catalog-cart-checkout-panel[hidden] { display: none; }
[data-solara-store].catalog-modern .catalog-cart-drawer .catalog-cart-scroll,
[data-solara-store].catalog-modern .catalog-cart-checkout-panel { flex: 1 1 auto; min-height: 0; padding-inline: .5rem 1rem; overflow-y: auto; overscroll-behavior: contain; scrollbar-color: color-mix(in srgb, var(--catalog-ink) 34%, transparent) transparent; scrollbar-gutter: stable; scrollbar-width: thin; }
[data-solara-store].catalog-modern .catalog-cart-drawer .catalog-cart-scroll::-webkit-scrollbar,
[data-solara-store].catalog-modern .catalog-cart-checkout-panel::-webkit-scrollbar { width: .55rem; }
[data-solara-store].catalog-modern .catalog-cart-drawer .catalog-cart-scroll::-webkit-scrollbar-thumb,
[data-solara-store].catalog-modern .catalog-cart-checkout-panel::-webkit-scrollbar-thumb { border: 2px solid transparent; border-radius: 999px; background: color-mix(in srgb, var(--catalog-ink) 34%, transparent); background-clip: padding-box; }
[data-solara-store].catalog-modern .catalog-cart-drawer[data-cart-empty="true"] .catalog-cart-scroll { flex: 0 0 auto; overflow: hidden; }
[data-solara-store].catalog-modern .catalog-cart-drawer[data-cart-empty="true"] { bottom: auto; height: auto; max-height: 100dvh; }
[data-solara-store].catalog-modern .catalog-cart-drawer[data-cart-empty="true"] .catalog-cart-summary,
[data-solara-store].catalog-modern .catalog-cart-drawer[data-cart-empty="true"] .catalog-checkout-form,
[data-solara-store].catalog-modern .catalog-cart-drawer[data-cart-empty="true"] .catalog-drawer-footer { display: none; }
[data-solara-store].catalog-modern .catalog-cart-drawer .catalog-drawer-footer { flex: 0 0 auto; display: grid; gap: .4rem; margin-top: .5rem; padding-top: .65rem; border-top: 1px solid var(--catalog-border); background: var(--catalog-paper); }
[data-solara-store].catalog-modern .catalog-cart-drawer .catalog-drawer-footer .catalog-primary-action { width: 100%; }
[data-solara-store].catalog-modern .catalog-cart-drawer .catalog-drawer-footer [data-order-verification-warning] { margin: 0; color: var(--catalog-muted); font-size: .72rem; line-height: 1.35; text-wrap: pretty; }
[data-solara-store].catalog-modern .catalog-cart-drawer[data-open="true"] { transform: translateX(0); }
[data-solara-store].catalog-modern .catalog-cart-drawer header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--catalog-border); }
[data-solara-store].catalog-modern .catalog-cart-heading { display: grid; min-width: 0; gap: .15rem; }
[data-solara-store].catalog-modern .catalog-cart-step-label { color: var(--catalog-muted); font-size: .68rem; font-weight: 700; letter-spacing: .08em; line-height: 1; text-transform: uppercase; }
[data-solara-store].catalog-modern .catalog-cart-drawer header button { min-height: 44px; padding: .5rem .8rem; border: 1px solid var(--catalog-border); border-radius: 999px; background: transparent; cursor: pointer; }
[data-solara-store].catalog-modern .catalog-cart-backdrop { position: fixed; z-index: 49; inset: 0; background: color-mix(in srgb, var(--catalog-ink) 42%, transparent); }
[data-solara-store].catalog-modern .catalog-cart-items { display: grid; gap: calc(.7rem * var(--solara-space-scale, 1)); padding: 1rem 0; }
[data-solara-store].catalog-modern .catalog-cart-items .solara-cart-empty,
[data-solara-store].catalog-modern .solara-cart-page [data-cart-lines] .solara-cart-empty { padding: 2rem 0; color: var(--catalog-muted); }
[data-solara-store].catalog-modern .catalog-cart-items .solara-cart-line { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .75rem; padding: .75rem 0; border-bottom: 1px solid var(--catalog-border); }
[data-solara-store].catalog-modern .catalog-cart-items .solara-cart-line > div:first-child,
[data-solara-store].catalog-modern .solara-cart-page-grid [data-cart-lines] .solara-cart-line > div:first-child { min-width: 0; }
[data-solara-store].catalog-modern .catalog-cart-items .solara-cart-line > div:first-child > div,
[data-solara-store].catalog-modern .solara-cart-page-grid [data-cart-lines] .solara-cart-line > div:first-child > div { min-width: 0; }
[data-solara-store].catalog-modern .catalog-cart-items .solara-cart-line strong,
[data-solara-store].catalog-modern .catalog-cart-items .solara-cart-line small,
[data-solara-store].catalog-modern .solara-cart-page-grid [data-cart-lines] .solara-cart-line strong,
[data-solara-store].catalog-modern .solara-cart-page-grid [data-cart-lines] .solara-cart-line small { display: block; overflow-wrap: anywhere; }
[data-solara-store].catalog-modern .solara-cart-line-warning { color: var(--catalog-sale); font-size: .7rem; font-weight: 700; margin-top: .15rem; }
[data-solara-store].catalog-modern .catalog-cart-items .solara-cart-line > div:first-child { display: grid; grid-template-columns: 3.5rem minmax(0, 1fr); gap: .75rem; align-items: center; }
[data-solara-store].catalog-modern .catalog-cart-items .solara-cart-line img { width: 3.5rem; height: 3.5rem; object-fit: cover; object-position: center; display: block; border-radius: var(--solara-radius); background: var(--catalog-surface); }
[data-solara-store].catalog-modern .catalog-cart-items .solara-cart-line > span:last-child { grid-column: 2; grid-row: 1; font-weight: 800; }
[data-solara-store].catalog-modern .catalog-cart-items .solara-cart-line label { grid-column: 1; grid-row: 2; }
[data-solara-store].catalog-modern .catalog-cart-items .solara-cart-line input { width: 5rem; min-height: 36px; padding: .25rem; border: 1px solid var(--catalog-border); border-radius: var(--solara-radius); }
[data-solara-store].catalog-modern .catalog-cart-items .solara-cart-line button { grid-column: 2; grid-row: 2; justify-self: end; border: 0; background: transparent; color: var(--catalog-sale); cursor: pointer; }
[data-solara-store].catalog-modern .catalog-cart-summary { flex: 0 0 auto; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .55rem 1rem; padding: .75rem 1rem .15rem 0; border-top: 1px solid var(--catalog-border); }
[data-solara-store].catalog-modern .catalog-cart-summary > p { display: grid; gap: .1rem; margin: 0; color: var(--catalog-muted); font-size: .78rem; }
[data-solara-store].catalog-modern .catalog-cart-summary > p strong { color: var(--catalog-ink); font-variant-numeric: tabular-nums; }
[data-solara-store].catalog-modern .catalog-cart-summary .catalog-cart-total { grid-column: 1 / -1; display: flex; justify-content: space-between; gap: 1rem; padding-top: .55rem; border-top: 1px solid var(--catalog-border); font-size: 1rem; }
[data-solara-store].catalog-modern .catalog-cart-checkout-panel { display: block; }
[data-solara-store].catalog-modern .catalog-cart-review-back { min-height: 44px; padding: 0; border: 0; background: transparent; color: var(--catalog-ink); font-weight: 700; text-align: left; cursor: pointer; }
[data-solara-store].catalog-modern .catalog-cart-checkout-intro { max-width: 42ch; margin: .25rem 0 .5rem; color: var(--catalog-muted); font-size: .82rem; line-height: 1.5; text-wrap: pretty; }
[data-solara-store].catalog-modern .catalog-checkout-form { display: grid; gap: .5rem; padding-top: .5rem; }
[data-solara-store].catalog-modern .catalog-checkout-form label { margin-top: .4rem; font-size: .78rem; font-weight: 700; }
[data-solara-store].catalog-modern .catalog-checkout-form textarea { min-height: 76px; resize: vertical; }
[data-solara-store].catalog-modern .catalog-cart-drawer .catalog-checkout-form textarea { min-height: 3rem; }
[data-solara-store].catalog-modern .catalog-checkout-form pre { white-space: pre-wrap; font-size: .75rem; }
[data-solara-store].catalog-modern .solara-category-page,
[data-solara-store].catalog-modern .solara-category-hero,
[data-solara-store].catalog-modern .solara-search-page,
[data-solara-store].catalog-modern .solara-cart-page,
[data-solara-store].catalog-modern .solara-checkout-page,
[data-solara-store].catalog-modern .solara-editorial-page { font-family: inherit; }
[data-solara-store].catalog-modern .solara-category-hero { display: grid; grid-template-columns: minmax(0, 1fr) minmax(18rem, .52fr); align-items: start; gap: clamp(1.25rem, 3vw, 2.75rem); padding: clamp(2rem, 4vw, 3.5rem) 0 clamp(1.25rem, 2.5vw, 2rem); }
[data-solara-store].catalog-modern .solara-page-intro h1,
[data-solara-store].catalog-modern .solara-cart-page h1,
[data-solara-store].catalog-modern .solara-checkout-page h1 { font-size: calc(clamp(2.8rem, 6vw, 5.5rem) * var(--solara-type-scale, 1)); font-weight: 900; letter-spacing: -.03em; line-height: .9; }
[data-solara-store].catalog-modern .solara-category-hero h1 { max-width: 14ch; font-size: calc(clamp(2.4rem, 4.2vw, 4.75rem) * var(--solara-type-scale, 1)); font-weight: 900; letter-spacing: -.03em; line-height: 1.05; overflow-wrap: break-word; text-wrap: balance; }
[data-solara-store].catalog-modern .solara-category-hero img { width: 100%; aspect-ratio: 16 / 7; object-fit: cover; object-position: center; background: var(--catalog-surface); border-radius: var(--solara-radius); }
[data-solara-store].catalog-modern .solara-category-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin: 1rem 0 1.5rem; padding: .75rem 0; border-block: 0; }
[data-solara-store].catalog-modern .solara-category-toolbar select,
[data-solara-store].catalog-modern .solara-category-toolbar input { min-height: 44px; padding: .5rem .55rem; border: 1px solid var(--catalog-border); border-radius: var(--solara-radius); background: var(--catalog-paper); }
[data-solara-store].catalog-modern .catalog-category-page { padding-bottom: clamp(2rem, 5vw, 5rem); }
[data-solara-store].catalog-modern .catalog-category-layout { display: grid; grid-template-columns: minmax(190px, 230px) minmax(0, 1fr); gap: clamp(1.5rem, 3vw, 3rem); align-items: start; }
[data-solara-store].catalog-modern .catalog-category-layout .solara-empty-state { grid-column: 1 / -1; padding: 2rem 0; color: var(--catalog-muted); }
[data-solara-store].catalog-modern .catalog-category-filters { position: sticky; top: 7.5rem; min-width: 0; padding: 1rem; border: 1px solid var(--catalog-border); border-block: 0; border-radius: var(--solara-radius); background: var(--catalog-surface); }
[data-solara-store].catalog-modern .catalog-category-filters details > summary { display: none; cursor: pointer; font-weight: 800; list-style: none; }
[data-solara-store].catalog-modern .catalog-filter-groups { display: grid; gap: 1rem; }
[data-solara-store].catalog-modern .catalog-filter-groups fieldset { min-width: 0; margin: 0; padding: 0 0 1rem; border: 0; }
[data-solara-store].catalog-modern .catalog-filter-groups fieldset:last-child { padding-bottom: 0; border-bottom: 0; }
[data-solara-store].catalog-modern .catalog-filter-groups legend { margin-bottom: .55rem; font-size: .78rem; font-weight: 800; overflow-wrap: anywhere; }
[data-solara-store].catalog-modern .catalog-filter-groups label { display: flex; align-items: center; gap: .5rem; color: var(--catalog-muted); font-size: .78rem; min-width: 0; overflow-wrap: anywhere; }
[data-solara-store].catalog-modern .catalog-filter-groups input[type="checkbox"] { width: 1rem; height: 1rem; accent-color: var(--catalog-ink); }
[data-solara-store].catalog-modern .catalog-filter-groups select,
[data-solara-store].catalog-modern .catalog-filter-groups input[type="number"] { width: 100%; min-height: 44px; padding: .5rem .5rem; border: 1px solid var(--catalog-border); border-radius: var(--solara-radius); background: var(--catalog-paper); color: var(--catalog-ink); }
[data-solara-store].catalog-modern .catalog-price-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .5rem; }
[data-solara-store].catalog-modern .catalog-price-fields label { display: grid; align-items: stretch; gap: .25rem; font-size: .68rem; }
[data-solara-store].catalog-modern .catalog-category-results { min-width: 0; }
[data-solara-store].catalog-modern .catalog-category-results .solara-category-toolbar { margin-top: 0; }
[data-solara-store].catalog-modern .catalog-category-results .catalog-product-grid-section { width: auto; margin: 0; padding: 0 0 1rem; }
[data-solara-store].catalog-modern .catalog-category-results .catalog-product-grid-section > header { margin-bottom: 1rem; }
[data-solara-store].catalog-modern .catalog-category-results .catalog-product-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.25rem 1rem; }
[data-solara-store].catalog-modern .catalog-product-grid[data-product-count="1"] { grid-template-columns: minmax(0, 20rem); justify-content: start; }
[data-solara-store].catalog-modern .catalog-product-grid[data-product-count="2"] { grid-template-columns: repeat(2, minmax(0, 20rem)); justify-content: space-between; }
[data-solara-store].catalog-modern .catalog-product-grid[data-product-count="3"] { grid-template-columns: repeat(3, minmax(0, 20rem)); justify-content: space-between; }
[data-solara-store].catalog-modern .catalog-product-grid[data-product-count="4"] { grid-template-columns: repeat(4, minmax(0, 20rem)); justify-content: space-between; }
[data-solara-store].catalog-modern .catalog-category-results .catalog-product-card-copy { padding-top: .55rem; }
[data-solara-store].catalog-modern .catalog-category-results .catalog-product-card h3 { font-size: .92rem; }
[data-solara-store].catalog-modern .catalog-category-page > .solara-pagination { margin-top: 1rem; }
[data-solara-store].catalog-modern .catalog-category-page > .solara-pagination a { min-height: 44px; }
[data-solara-store].catalog-modern .solara-category-children { margin: .5rem 0 1.5rem; padding: 1rem; border-radius: var(--solara-radius); background: var(--catalog-surface); }
[data-solara-store].catalog-modern .solara-category-children ul { display: flex; flex-wrap: wrap; gap: .5rem; margin: .8rem 0 0; padding: 0; list-style: none; }
[data-solara-store].catalog-modern .solara-category-children a { display: grid; gap: .25rem; padding: .75rem .8rem; border: 1px solid var(--catalog-border); border-radius: var(--solara-radius); background: var(--catalog-paper); text-decoration: none; }
[data-solara-store].catalog-modern .solara-category-children small { color: var(--catalog-muted); }
[data-solara-store].catalog-modern .solara-pagination { display: flex; align-items: center; justify-content: center; gap: .75rem; margin: 2rem auto 3rem; }
[data-solara-store].catalog-modern .solara-pagination a { padding: .5rem .8rem; min-height: 44px; border: 1px solid var(--catalog-border); border-radius: var(--solara-radius); text-decoration: none; }
[data-solara-store].catalog-modern .solara-pagination .solara-pagination__ellipsis { min-width: 0; min-height: 0; padding: 0; border: 0; background: transparent; color: var(--catalog-muted); }
[data-solara-store].catalog-modern .solara-search-page .solara-page-intro { max-width: 56rem; padding: clamp(2.5rem, 5vw, 4rem) 0 2.5rem; }
[data-solara-store].catalog-modern .solara-search-page .solara-page-intro h1 { max-width: 16ch; }
[data-solara-store].catalog-modern .solara-search-page-trigger { display: inline-flex; align-items: center; justify-content: center; width: fit-content; min-height: 44px; margin-top: 1.25rem; padding: .75rem 1rem; border: 1px solid var(--catalog-border); border-radius: 0; background: transparent; color: var(--catalog-ink); cursor: pointer; }
[data-solara-store].catalog-modern .solara-search-form { display: flex; gap: .5rem; margin: 1.5rem 0 2rem; }
[data-solara-store].catalog-modern .solara-search-form input { flex: 1; min-height: 48px; padding: .75rem .8rem; border: 1px solid var(--catalog-border); border-radius: 0; background: var(--catalog-paper); }
[data-solara-store].catalog-modern .solara-search-form .solara-primary-action { border-radius: 0; }
[data-solara-store].catalog-modern .solara-search-results { min-height: 10rem; padding-block: 1.5rem 4rem; }
[data-solara-store].catalog-modern .solara-search-summary { margin-bottom: 1rem; color: var(--catalog-muted); font-size: .9rem; }
[data-solara-store].catalog-modern .solara-editorial-page .solara-page-intro { max-width: 52rem; padding-top: clamp(2.5rem, 5vw, 4rem); padding-bottom: clamp(2.5rem, 5vw, 4rem); }
[data-solara-store].catalog-modern .solara-editorial-page .solara-page-intro h1 { max-width: 12ch; line-height: .95; text-wrap: balance; }
[data-solara-store].catalog-modern .solara-editorial-page .solara-story-grid { align-items: start; gap: clamp(2rem, 6vw, 6rem); padding-block: clamp(3rem, 6vw, 5rem); }
[data-solara-store].catalog-modern .solara-editorial-page .solara-story-grid > div { min-width: 0; }
[data-solara-store].catalog-modern .solara-editorial-page .solara-values-grid { margin-bottom: clamp(3rem, 7vw, 6rem); }
[data-solara-store].catalog-modern .solara-editorial-page .solara-values-grid article { min-width: 0; padding: 1.5rem 1.25rem 2rem; }
[data-solara-store].catalog-modern .solara-legal-article { max-width: 46rem; padding-block: clamp(2rem, 5vw, 3.5rem) clamp(3rem, 6vw, 5rem); color: var(--catalog-ink); line-height: 1.7; }
[data-solara-store].catalog-modern .solara-legal-article h2 { margin: 2.8rem 0 1rem; font-family: var(--solara-font-display, Georgia, "Times New Roman", serif); font-size: clamp(1.35rem, 2.8vw, 1.75rem); font-weight: 800; letter-spacing: -0.02em; line-height: 1.2; text-wrap: balance; }
[data-solara-store].catalog-modern .solara-legal-article h2:first-child { margin-top: 0.5rem; }
[data-solara-store].catalog-modern .solara-legal-article h3 { margin: 2rem 0 0.75rem; font-size: 1.05rem; font-weight: 700; letter-spacing: -0.01em; }
[data-solara-store].catalog-modern .solara-legal-article p { margin: 0 0 1.15rem; color: var(--catalog-ink); font-size: 0.95rem; overflow-wrap: anywhere; }
[data-solara-store].catalog-modern .solara-legal-article ul, [data-solara-store].catalog-modern .solara-legal-article ol { margin: 0 0 1.5rem 1.25rem; padding: 0; display: grid; gap: 0.5rem; color: var(--catalog-ink); font-size: 0.92rem; line-height: 1.6; }
[data-solara-store].catalog-modern .solara-legal-article li { padding-left: 0.25rem; }
[data-solara-store].catalog-modern .solara-legal-article li::marker { color: var(--catalog-ink); }
[data-solara-store].catalog-modern .solara-legal-article a { color: inherit; text-decoration: underline; text-underline-offset: 3px; }
[data-solara-store].catalog-modern .solara-legal-article em { color: var(--catalog-muted); font-style: normal; font-size: 0.85rem; }
[data-solara-store].catalog-modern .solara-cart-page-grid { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 2rem; padding: 2rem 0 5rem; }
[data-solara-store].catalog-modern .solara-cart-page-grid > aside { align-self: start; padding: 1.25rem; border-radius: var(--solara-radius); background: var(--catalog-surface); }
[data-solara-store].catalog-modern .solara-cart-summary { display: grid; gap: .75rem; }
[data-solara-store].catalog-modern .solara-cart-summary > p { display: flex; justify-content: space-between; gap: 1rem; margin: 0; color: var(--catalog-muted); font-size: .85rem; }
[data-solara-store].catalog-modern .solara-cart-summary > p strong { color: var(--catalog-ink); }
[data-solara-store].catalog-modern .solara-cart-summary > p:nth-of-type(3) { padding-top: .75rem; font-size: 1rem; }
[data-solara-store].catalog-modern .solara-cart-page-grid > aside .solara-primary-action { width: 100%; }
[data-solara-store].catalog-modern .solara-cart-page-grid [data-cart-lines] .solara-cart-line { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .5rem; padding: 1rem 0; border-bottom: 1px solid var(--catalog-border); }
@media (max-width: 1199px) {
  [data-solara-store].catalog-modern .catalog-desktop-nav { gap: .75rem; }
  [data-solara-store].catalog-modern .catalog-search-link span:last-child { display: none; }
  [data-solara-store].catalog-modern .catalog-product-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 767px) {
  [data-solara-store].catalog-modern .catalog-header-inner { grid-template-columns: auto 1fr auto; gap: .75rem; min-height: 64px; }
  [data-solara-store].catalog-modern .catalog-mobile-menu-button { display: inline-grid; place-items: center; width: 44px; height: 44px; min-width: 44px; min-height: 44px; border: 0; background: transparent; font-size: 1.15rem; -webkit-user-select: none; user-select: none; }
  [data-solara-store].catalog-modern .catalog-desktop-nav { display: none; }
  [data-solara-store].catalog-modern .catalog-header-actions { gap: .25rem; }
  [data-solara-store].catalog-modern .catalog-cart-link span { display: none; }
  [data-solara-store].catalog-modern .catalog-mobile-menu[hidden] { display: none; }
  [data-solara-store].catalog-modern .catalog-mobile-menu { position: fixed; z-index: 40; inset: 0; display: grid; justify-items: start; align-items: stretch; padding: 0; overflow: hidden; border: 0; background: transparent; box-shadow: none; -webkit-user-select: none; user-select: none; }
  [data-solara-store].catalog-modern .catalog-mobile-menu__backdrop { position: fixed; z-index: 0; inset: 0; background: color-mix(in srgb, var(--catalog-ink) 56%, transparent); opacity: 0; backdrop-filter: blur(3px); transition: opacity var(--solara-motion-normal, 260ms) var(--solara-motion-easing, cubic-bezier(.16,1,.3,1)); }
  [data-solara-store].catalog-modern .catalog-mobile-menu__panel { position: relative; z-index: 1; display: grid; grid-template-rows: auto auto minmax(0, 1fr); width: 100%; height: 100vh; height: 100dvh; max-height: 100dvh; overflow: hidden; transform: translateX(-100%); border: 0; background: var(--catalog-paper); box-shadow: var(--solara-shadow-overlay); transition: transform var(--solara-motion-normal, 260ms) var(--solara-motion-easing, cubic-bezier(.16,1,.3,1)); }
  [data-solara-store].catalog-modern .catalog-mobile-menu__panel:not(:has(.catalog-mobile-search)) { grid-template-rows: auto minmax(0, 1fr); }
  [data-solara-store].catalog-modern .catalog-mobile-menu[data-state="open"] .catalog-mobile-menu__backdrop { opacity: 1; }
  [data-solara-store].catalog-modern .catalog-mobile-menu[data-state="open"] .catalog-mobile-menu__panel { transform: translateX(0); }
  [data-solara-store].catalog-modern .catalog-mobile-menu__header { display: flex; flex: 0 0 auto; align-items: center; justify-content: space-between; gap: .75rem; min-height: 5.25rem; padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) 1rem max(1rem, env(safe-area-inset-left)); border-bottom: 1px solid var(--catalog-border); }
  [data-solara-store].catalog-modern .catalog-mobile-brand { display: inline-flex; align-items: center; width: fit-content; min-width: 0; max-width: min(14rem, calc(100% - 3.75rem)); max-height: 4.5rem; overflow: hidden; color: var(--catalog-ink); font-family: var(--solara-font-display, Georgia, "Times New Roman", serif); font-size: clamp(1.7rem, 8vw, 2.3rem); letter-spacing: -.06em; text-decoration: none; overflow-wrap: anywhere; }
  [data-solara-store].catalog-modern .catalog-mobile-brand .solara-logo { display: block; width: auto; height: auto; max-width: 100%; max-height: 4.5rem; object-fit: contain; overflow: hidden; font-size: 12px; line-height: 1.2; }
  [data-solara-store].catalog-modern .catalog-mobile-menu__close { display: inline-grid; flex: 0 0 48px; place-items: center; width: 48px; height: 48px; padding: 0; border: 1px solid var(--catalog-border); border-radius: var(--solara-radius); background: var(--catalog-paper); color: var(--catalog-ink); cursor: pointer; transition: color var(--solara-motion-fast, 180ms) var(--solara-motion-easing, ease), background-color var(--solara-motion-fast, 180ms) var(--solara-motion-easing, ease), transform var(--solara-motion-fast, 180ms) var(--solara-motion-easing, ease); }
  [data-solara-store].catalog-modern .catalog-mobile-menu__close:hover { background: var(--catalog-surface); color: var(--solara-accent); }
  [data-solara-store].catalog-modern .catalog-mobile-menu__close:active { transform: scale(.96); }
  [data-solara-store].catalog-modern .catalog-mobile-menu__close svg { width: 1.5rem; height: 1.5rem; fill: none; stroke: currentcolor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.7; }
  [data-solara-store].catalog-modern .catalog-mobile-menu__close:focus-visible,
  [data-solara-store].catalog-modern .catalog-mobile-menu-button:focus-visible { outline: 2px solid var(--catalog-ink); outline-offset: 4px; }
  [data-solara-store].catalog-modern .catalog-mobile-search { margin: 0; padding: 1rem; }
  [data-solara-store].catalog-modern .catalog-mobile-search__field { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: .75rem; min-height: 56px; padding: 0 .4rem 0 1rem; border: 1px solid var(--catalog-border); border-radius: 0; background: var(--catalog-surface); transition: border-color var(--solara-motion-fast, 180ms) var(--solara-motion-easing, ease), box-shadow var(--solara-motion-fast, 180ms) var(--solara-motion-easing, ease); }
  [data-solara-store].catalog-modern .catalog-mobile-search__field:focus-within { border-color: var(--solara-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--solara-accent) 22%, transparent); }
  [data-solara-store].catalog-modern .catalog-mobile-search__field > svg { width: 1.25rem; height: 1.25rem; fill: none; stroke: currentcolor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.7; }
  [data-solara-store].catalog-modern .catalog-mobile-search__field input { min-width: 0; min-height: 48px; padding: 0; border: 0; outline: 0; background: transparent; color: var(--catalog-ink); font: inherit; }
  [data-solara-store].catalog-modern .catalog-mobile-search__field input::placeholder { color: var(--catalog-muted); }
  [data-solara-store].catalog-modern .catalog-mobile-search__field button { display: inline-grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 1px solid var(--solara-accent); border-radius: 0; background: var(--solara-accent); color: var(--solara-accent-text); cursor: pointer; transition: transform var(--solara-motion-fast, 180ms) var(--solara-motion-easing, ease), filter var(--solara-motion-fast, 180ms) var(--solara-motion-easing, ease); }
  [data-solara-store].catalog-modern .catalog-mobile-search__field button:hover { filter: brightness(.92); }
  [data-solara-store].catalog-modern .catalog-mobile-search__field button:active { transform: scale(.96); }
  [data-solara-store].catalog-modern .catalog-mobile-search__field button:focus-visible { outline: 2px solid var(--catalog-ink); outline-offset: 2px; }
  [data-solara-store].catalog-modern .catalog-mobile-menu nav { display: grid; align-content: start; gap: 0; min-height: 0; padding: 0 1rem max(2rem, env(safe-area-inset-bottom)); overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; border-top: 1px solid var(--catalog-border); }
  [data-solara-store].catalog-modern .catalog-mobile-menu nav > .catalog-mobile-nav-link,
  [data-solara-store].catalog-modern .catalog-mobile-menu nav > .catalog-mobile-categories > summary { display: flex; align-items: center; gap: .75rem; min-height: 60px; padding: .8rem .75rem; border-bottom: 1px solid var(--catalog-border); color: var(--catalog-ink); font-size: 1rem; font-weight: 600; text-decoration: none; transition: color var(--solara-motion-fast, 180ms) var(--solara-motion-easing, ease), background-color var(--solara-motion-fast, 180ms) var(--solara-motion-easing, ease); }
  [data-solara-store].catalog-modern .catalog-mobile-nav-link > span:nth-child(2),
  [data-solara-store].catalog-modern .catalog-mobile-categories > summary > span:nth-child(2),
  [data-solara-store].catalog-modern .catalog-mobile-category > summary > span:nth-child(2) { flex: 1; min-width: 0; }
  [data-solara-store].catalog-modern .catalog-mobile-menu nav > .catalog-mobile-nav-link:hover,
  [data-solara-store].catalog-modern .catalog-mobile-menu nav > .catalog-mobile-categories > summary:hover,
  [data-solara-store].catalog-modern .catalog-mobile-category > summary:hover { background: var(--catalog-surface); color: var(--solara-accent); }
  [data-solara-store].catalog-modern .catalog-mobile-menu nav > [aria-current="page"],
  [data-solara-store].catalog-modern .catalog-mobile-menu nav > .catalog-mobile-categories > summary[aria-current="page"] { background: color-mix(in srgb, var(--solara-accent) 9%, transparent); color: var(--solara-accent); }
  [data-solara-store].catalog-modern .catalog-mobile-menu nav > .catalog-mobile-nav-link:focus-visible,
  [data-solara-store].catalog-modern .catalog-mobile-menu nav > .catalog-mobile-categories > summary:focus-visible,
  [data-solara-store].catalog-modern .catalog-mobile-category > summary:focus-visible,
  [data-solara-store].catalog-modern .catalog-mobile-category__children a:focus-visible { outline: 2px solid var(--catalog-ink); outline-offset: -2px; border-radius: var(--solara-radius); }
  [data-solara-store].catalog-modern .catalog-mobile-categories { display: block; border-bottom: 1px solid var(--catalog-border); }
  [data-solara-store].catalog-modern .catalog-mobile-categories > summary,
  [data-solara-store].catalog-modern .catalog-mobile-category > summary { list-style: none; cursor: pointer; }
  [data-solara-store].catalog-modern .catalog-mobile-categories > summary::-webkit-details-marker,
  [data-solara-store].catalog-modern .catalog-mobile-category > summary::-webkit-details-marker { display: none; }
  [data-solara-store].catalog-modern .catalog-mobile-categories__panel { margin: .35rem 0 1rem .75rem; padding: .35rem .6rem .55rem .75rem; border: 0; border-left: 2px solid var(--solara-accent); border-radius: 0; background: color-mix(in srgb, var(--catalog-surface) 78%, transparent); }
  [data-solara-store].catalog-modern .catalog-mobile-category { border-bottom: 1px solid var(--catalog-border); }
  [data-solara-store].catalog-modern .catalog-mobile-category:last-child { border-bottom: 0; }
  [data-solara-store].catalog-modern .catalog-mobile-category > summary { display: flex; align-items: center; gap: .75rem; min-height: 54px; padding: .75rem .4rem; }
  [data-solara-store].catalog-modern .catalog-mobile-category-link { display: flex; align-items: center; gap: .75rem; min-height: 54px; padding: .75rem .4rem; border-bottom: 1px solid var(--catalog-border); color: var(--catalog-ink); font-size: .95rem; text-decoration: none; transition: color var(--solara-motion-fast, 180ms) var(--solara-motion-easing, ease), background-color var(--solara-motion-fast, 180ms) var(--solara-motion-easing, ease); }
  [data-solara-store].catalog-modern .catalog-mobile-category-link:hover { background: var(--catalog-paper); color: var(--solara-accent); }
  [data-solara-store].catalog-modern .catalog-mobile-category-link:focus-visible { outline: 2px solid var(--catalog-ink); outline-offset: -2px; border-radius: var(--solara-radius); }
  [data-solara-store].catalog-modern .catalog-mobile-category-link > span:nth-child(2) { flex: 1; min-width: 0; }
  [data-solara-store].catalog-modern .catalog-mobile-category__children { margin: 0; padding: 0 0 .35rem 2.45rem; list-style: none; }
  [data-solara-store].catalog-modern .catalog-mobile-category__children a { display: flex; align-items: center; min-height: 48px; padding: .75rem .25rem; border-top: 1px solid var(--catalog-border); color: var(--catalog-muted); font-size: .92rem; text-decoration: none; }
  [data-solara-store].catalog-modern .catalog-mobile-category__children a.catalog-mobile-category__parent { color: var(--catalog-ink); font-weight: 700; }
  [data-solara-store].catalog-modern .catalog-mobile-category__children a.catalog-mobile-category__parent::before { display: none; }
  [data-solara-store].catalog-modern .catalog-mobile-category__children a::before { margin-right: .65rem; color: var(--catalog-ink); content: "•"; }
  [data-solara-store].catalog-modern .catalog-mobile-category[open] > summary .catalog-nav-chevron,
  [data-solara-store].catalog-modern .catalog-mobile-categories[open] > summary .catalog-nav-chevron { transform: rotate(180deg); }
  [data-solara-store].catalog-modern .catalog-hero-inner { display: flex; flex-direction: column; min-height: calc(100svh - 96px); margin-top: .75rem; border-radius: 0; }
  [data-solara-store].catalog-modern .catalog-hero-copy { padding: 2rem 1.25rem 1.5rem; }
  [data-solara-store].catalog-modern .catalog-hero-copy h1 { max-width: 10ch; font-size: calc(clamp(2.2rem, 9vw, 3.2rem) * var(--solara-type-scale, 1)); line-height: 1.15; }
  [data-solara-store].catalog-modern .catalog-hero-copy > p:not(.catalog-eyebrow) { max-width: 34ch; }
  [data-solara-store].catalog-modern .catalog-hero-actions { display: grid; grid-template-columns: 1fr; }
  [data-solara-store].catalog-modern .catalog-primary-action,
  [data-solara-store].catalog-modern .catalog-secondary-action { width: 100%; }
  [data-solara-store].catalog-modern .catalog-hero-stats { margin-top: 1.6rem; }
  [data-solara-store].catalog-modern .catalog-hero-stats div { padding-right: .55rem; }
  [data-solara-store].catalog-modern .catalog-hero-stats div + div { padding-left: .55rem; }
  [data-solara-store].catalog-modern .catalog-hero-stats dt { font-size: clamp(.9rem, 4vw, 1.1rem); }
  [data-solara-store].catalog-modern .catalog-hero-stats dd { font-size: .66rem; }
  [data-solara-store].catalog-modern .catalog-hero-media { min-height: 45svh; }
  [data-solara-store].catalog-modern .catalog-hero-controls { grid-column: auto; margin: -2.5rem 0 .75rem; }
  [data-solara-store].catalog-modern .catalog-brand-strip-inner ul { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem; font-size: 1rem; }
  [data-solara-store].catalog-modern .catalog-product-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: calc(1.1rem * var(--solara-space-scale, 1)) calc(.65rem * var(--solara-space-scale, 1)); }
  [data-solara-store].catalog-modern .catalog-product-grid-section,
  [data-solara-store].catalog-modern .catalog-category-bento-section,
  [data-solara-store].catalog-modern .catalog-testimonials-section { width: min(calc(100% - 2rem), var(--solara-container)); padding: 3.25rem 0; }
  [data-solara-store].catalog-modern .catalog-product-grid-section > header,
  [data-solara-store].catalog-modern .catalog-testimonials-section > header { align-items: start; flex-direction: column; }
  [data-solara-store].catalog-modern .catalog-category-bento-section { padding: 1.25rem; }
  [data-solara-store].catalog-modern .catalog-category-bento-grid { grid-template-columns: 1fr; }
  [data-solara-store].catalog-modern:not(.v2) .catalog-category-bento-item,
  [data-solara-store].catalog-modern:not(.v2) .catalog-category-bento-item--feature,
  [data-solara-store].catalog-modern:not(.v2) .catalog-category-bento-item--wide,
  [data-solara-store].catalog-modern:not(.v2) .catalog-category-bento-item--tall { min-height: 160px; grid-column: 1; grid-row: auto; }
  [data-solara-store].catalog-modern .catalog-search-dialog-controls { grid-template-columns: 1fr; }
  [data-solara-store].catalog-modern .catalog-search-dialog-controls .catalog-primary-action { width: 100%; }
  [data-solara-store].catalog-modern .catalog-newsletter-inner { align-items: stretch; flex-direction: column; margin-bottom: 2rem; }
  [data-solara-store].catalog-modern .catalog-newsletter-action { width: 100%; }
  [data-solara-store].catalog-modern .catalog-footer-inner { grid-template-columns: repeat(auto-fit, minmax(min(12rem, 100%), 1fr)); gap: calc(1.5rem * var(--solara-space-scale, 1)) calc(1rem * var(--solara-space-scale, 1)); padding-top: calc(2rem * var(--solara-space-scale, 1)); }
  [data-solara-store].catalog-modern .catalog-footer-brand { grid-column: 1 / -1; }
  [data-solara-store].catalog-modern .catalog-footer-inner address { grid-column: auto; }
  [data-solara-store].catalog-modern .catalog-product-detail { width: min(calc(100% - 2rem), var(--solara-container)); }
  [data-solara-store].catalog-modern .catalog-product-detail-inner { display: flex; flex-direction: column; gap: 1.5rem; padding-top: 1.25rem; }
  [data-solara-store].catalog-modern .catalog-product-gallery { display: flex; flex-direction: column; }
  [data-solara-store].catalog-modern .catalog-product-gallery-main { order: 0; }
  [data-solara-store].catalog-modern .catalog-product-gallery-thumbs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); order: 1; }
  [data-solara-store].catalog-modern .catalog-product-info h1 { width: 100%; max-width: 100%; font-size: calc(clamp(2.2rem, 12vw, 4rem) * var(--solara-type-scale, 1)); overflow-wrap: anywhere; }
  [data-solara-store].catalog-modern .catalog-product-reviews { width: min(calc(100% - 2rem), var(--solara-container)); }
  [data-solara-store].catalog-modern .catalog-product-reviews > header { align-items: start; flex-direction: column; }
  [data-solara-store].catalog-modern .catalog-review-grid { grid-template-columns: 1fr; }
  [data-solara-store].catalog-modern .solara-category-hero { display: flex; flex-direction: column; align-items: stretch; gap: 1rem; padding: 2rem 0 1rem; }
  [data-solara-store].catalog-modern .solara-page-intro h1,
  [data-solara-store].catalog-modern .solara-cart-page h1,
  [data-solara-store].catalog-modern .solara-checkout-page h1 { font-size: calc(clamp(2.7rem, 14vw, 4.5rem) * var(--solara-type-scale, 1)); }
  [data-solara-store].catalog-modern .solara-category-hero h1 { max-width: 14ch; font-size: calc(clamp(2.1rem, 8.5vw, 3.6rem) * var(--solara-type-scale, 1)); line-height: 1.05; }
  [data-solara-store].catalog-modern .catalog-category-layout { grid-template-columns: 1fr; gap: 1rem; }
  [data-solara-store].catalog-modern .catalog-category-filters { position: static; padding: 0; border-radius: var(--solara-radius); }
  [data-solara-store].catalog-modern .catalog-category-filters details > summary { display: flex; align-items: center; justify-content: space-between; min-height: 44px; padding: .75rem .8rem; }
  [data-solara-store].catalog-modern .catalog-category-filters details[open] > summary { border-bottom: 1px solid var(--catalog-border); }
  [data-solara-store].catalog-modern .catalog-filter-groups { padding: 1rem .8rem; }
  [data-solara-store].catalog-modern .catalog-category-results .catalog-product-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: calc(1.1rem * var(--solara-space-scale, 1)) calc(.65rem * var(--solara-space-scale, 1)); }
  [data-solara-store].catalog-modern .solara-category-toolbar { align-items: stretch; flex-direction: column; }
  [data-solara-store].catalog-modern .solara-search-form { flex-direction: column; }
  [data-solara-store].catalog-modern .solara-search-page .solara-page-intro { padding-bottom: 1.5rem; }
  [data-solara-store].catalog-modern .solara-editorial-page .solara-page-intro h1 { max-width: 10ch; line-height: .98; }
  [data-solara-store].catalog-modern .solara-editorial-page .solara-story-grid { gap: 2.5rem; }
  [data-solara-store].catalog-modern .solara-editorial-page .solara-values-grid article { padding-inline: 0; }
  [data-solara-store].catalog-modern .solara-cart-page-grid { grid-template-columns: 1fr; padding-bottom: 3rem; }
}
@media (min-width: 768px) and (max-width: 1199px) {
  [data-solara-store].catalog-modern .catalog-footer-inner {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: calc(1.75rem * var(--solara-space-scale, 1)) calc(1.25rem * var(--solara-space-scale, 1));
    padding-top: calc(2rem * var(--solara-space-scale, 1));
  }
  [data-solara-store].catalog-modern .catalog-footer-brand {
    grid-column: 1 / -1;
  }
  [data-solara-store].catalog-modern .catalog-footer-inner address {
    grid-column: auto;
  }
}
@media print {
  [data-solara-store].catalog-modern [data-cart-drawer],
  [data-solara-store].catalog-modern .solara-cart-backdrop,
  [data-solara-store].catalog-modern .catalog-cart-backdrop,
  [data-solara-store].catalog-modern .catalog-mobile-menu,
  [data-solara-store].catalog-modern .catalog-mobile-menu-button,
  [data-solara-store].catalog-modern .catalog-search-dialog,
  [data-solara-store].catalog-modern .catalog-search-dialog::backdrop { display: none !important; }
  [data-solara-store].catalog-modern .catalog-mega-menu,
  [data-solara-store].catalog-modern .catalog-cart-drawer,
  [data-solara-store].catalog-modern .catalog-nav-chevron,
  [data-solara-store].catalog-modern .catalog-mobile-categories[open] > summary .catalog-nav-chevron { transform: none !important; }
}
@media (prefers-reduced-motion: reduce) {
  [data-solara-store].catalog-modern * { scroll-behavior: auto !important; transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}
`,
  "catalog-modern-v2": `
.cm.v2 {
  --catalog-ink: var(--solara-text, #11110f);
  --catalog-paper: var(--solara-background, #f7f5f0);
  --catalog-surface: var(--solara-surface, #e9e5dd);
  --catalog-muted: var(--solara-muted, #6d6961);
  --catalog-border: var(--solara-border, #d8d2c7);
  --catalog-sale: var(--solara-sale, var(--solara-accent, #a63d2f));
  --catalog-rating: var(--solara-rating, var(--solara-accent, #8d6424));
  --catalog-accent-alt: var(--solara-accent-alt, var(--solara-accent));
  --catalog-v2-motion-response: var(--solara-motion-fast, 120ms);
  --catalog-v2-motion-control: var(--solara-motion-fast, 220ms);
  --catalog-v2-motion-component: var(--solara-motion-normal, 380ms);
  --catalog-v2-motion-editorial: var(--solara-motion-normal, 680ms);
  --catalog-v2-ease-out: var(--solara-motion-easing, cubic-bezier(.16, 1, .3, 1));
  --catalog-v2-wide: var(--solara-container, 1760px);
  --catalog-v2-space: var(--solara-space-scale, 1);
  letter-spacing: -.006em;
}
.cm.v2 [data-solara-module="catalog-header"] {
  position: sticky;
  top: 0;
  z-index: 30;
  background: color-mix(in srgb, var(--catalog-paper), transparent 3%);
  transition: box-shadow var(--catalog-v2-motion-control) ease;
  animation: solara-motion-fade var(--catalog-v2-motion-component) var(--catalog-v2-ease-out) both;
}
.cm.v2 [data-solara-module="catalog-header"]::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
}
.cm.v2 [data-solara-module="catalog-header"][data-scrolled="true"] {
  box-shadow: var(--catalog-v2-shadow-elevated);
}
.cm.v2 [data-solara-module="catalog-header"][data-scrolled="true"]::before {
  backdrop-filter: blur(14px);
}
.cm.v2 .catalog-header-inner.catalog-header-inner--no-divider {
  border-bottom: 0;
}
.cm.v2 .catalog-announcement-inner {
  min-height: 36px;
  background: var(--catalog-ink);
  font-size: .7rem;
  letter-spacing: .04em;
}
.cm.v2 .catalog-header-inner {
  width: min(calc(100% - 3rem), var(--catalog-v2-wide));
  grid-template-columns: minmax(0, 1fr) auto minmax(0, auto);
  min-height: 76px;
  border-color: color-mix(in srgb, var(--catalog-border), transparent 18%);
  transition: min-height var(--catalog-v2-motion-control) var(--catalog-v2-ease-out);
}
.cm.v2 .catalog-nav-menu:not([open]) .catalog-mega-menu {
  display: none;
}
.cm.v2 [data-scrolled="true"] .catalog-header-inner {
  min-height: 60px;
}
.cm.v2 .catalog-brand {
  width: fit-content;
  max-width: 100%;
  min-width: 0;
  justify-self: start;
  overflow: hidden;
  font-family: var(--solara-font-display, Georgia, "Times New Roman", serif);
  font-size: clamp(1.85rem, 2vw, 2.45rem);
  font-weight: 500;
  letter-spacing: -.03em;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: font-size var(--catalog-v2-motion-control) var(--catalog-v2-ease-out);
}
.cm.v2 .catalog-brand .solara-wordmark {
  display: block;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow-wrap: normal;
}
/* Primer frame: height:100% sobre el brand de alto auto no reservaba caja y el
   alt heredaba la display del brand (~2.45rem). Con max-height explícito la
   caja queda reservada y el alt contenido aunque la imagen tarde o falle. */
.cm.v2 .catalog-brand .solara-logo {
  display: block;
  width: auto;
  max-width: 100%;
  height: auto;
  max-height: 3.5rem;
  object-fit: contain;
  overflow: hidden;
  font-size: 12px;
  line-height: 1.2;
}
.cm.v2 .catalog-brand > picture {
  display: block;
  max-width: 100%;
  overflow: hidden;
}
.cm.v2 .catalog-brand > picture > .solara-logo {
  width: auto;
  max-width: 100%;
}
.cm.v2 .catalog-footer-brand .catalog-brand .solara-logo {
  width: auto;
  height: clamp(2.75rem, 4vw, 4.75rem);
  max-width: 100%;
  max-height: 4.75rem;
  object-fit: contain;
  overflow: hidden;
  font-size: 12px;
  line-height: 1.2;
}
.cm.v2 .catalog-mobile-brand .solara-wordmark {
  display: block;
  min-width: 0;
  max-width: 100%;
  overflow: visible;
  text-overflow: clip;
  white-space: normal;
  overflow-wrap: anywhere;
}
.cm.v2 [data-scrolled="true"] .catalog-brand {
  font-size: 1.7rem;
}
.cm.v2 .catalog-desktop-nav {
  font-size: .82rem;
  letter-spacing: .015em;
}
.cm.v2 .catalog-desktop-nav > a,.cm.v2 .catalog-desktop-nav summary{position:relative;white-space:nowrap}
.cm.v2 .catalog-desktop-nav > a::after,
.cm.v2 .catalog-desktop-nav summary::after {
  position: absolute;
  right: 0;
  bottom: .38rem;
  left: 0;
  height: 1px;
  transform: scaleX(0);
  transform-origin: right;
  background: currentcolor;
  content: "";
  transition: transform var(--catalog-v2-motion-control) var(--catalog-v2-ease-out);
}
.cm.v2 .catalog-desktop-nav > a:hover::after,
.cm.v2 .catalog-desktop-nav summary:hover::after,
.cm.v2 .catalog-desktop-nav [aria-current="page"]::after {
  transform: scaleX(1);
  transform-origin: left;
}
.cm.v2 .catalog-search-link {
  border-radius: 0;
  background: transparent;
}
.cm.v2 .catalog-hero-inner {
  grid-template-columns: minmax(20rem, .84fr) minmax(0, 1.16fr);
  width: min(calc(100% - 3rem), var(--catalog-v2-wide));
  /* La fila crece con el copy y con la proporción de la media; no se recorta
     contra una altura derivada del viewport. */
  height: auto;
  min-height: 0;
  margin-top: 0;
  overflow: hidden;
  isolation: isolate;
  border-radius: 0;
  background: transparent;
}
/* Variante editorial (V2 sin carousel): la media es siempre 9:16 y la columna
   de texto se estira horizontalmente. */
.cm.v2 .catalog-hero-editorial .catalog-hero-inner {
  position: relative;
  grid-template-columns: minmax(0, 1fr) auto;
}
.cm.v2 .catalog-hero-editorial [data-hero-media] {
  /* El viewport del navegador ya descuenta el chrome del sistema; el límite
     adicional contempla la banda y el header para que la media no invada el
     borde inferior del primer viewport. */
  width: calc(min(45vw, max(0px, calc((100svh - 7rem) * 9 / 16))) + 2px);
  height: auto;
  aspect-ratio: 9 / 16;
  margin: -1px -2px -1px 0;
  min-height: 0;
  align-self: start;
  position: relative;
  z-index: 1;
}
.cm.v2 .catalog-hero-editorial .catalog-hero-copy {
  padding-top: clamp(1.5rem, 4svh, 3.5rem);
  padding-bottom: clamp(.75rem, 1.25svh, 2rem);
}
.cm.v2 [data-solara-module="catalog-hero"].catalog-hero-editorial .catalog-hero-benefits {
  margin-top: clamp(.85rem, 1.75svh, 2rem);
  margin-bottom: clamp(.25rem, .75svh, 1rem);
}
.cm.v2 [data-solara-module="catalog-hero"].catalog-hero-editorial .catalog-hero-benefits--copy {
  padding-block: clamp(.5rem, 1svh, .95rem);
}
.cm.v2 [data-solara-module="catalog-hero"].catalog-hero-editorial--has-background [data-hero-media] {
  background: transparent;
}
/* Fondo editorial (desktop, detrás del copy): imagen editable desde el editor
   con un velo blanquizo de papel del lado del texto; el copy conserva la
   tinta oscura. La intensidad del velo la regula el setting (0-90%). */
.cm.v2 [data-solara-module="catalog-hero"].catalog-hero-editorial--has-background .catalog-hero-background {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}
.cm.v2 [data-solara-module="catalog-hero"].catalog-hero-editorial--has-background .catalog-hero-background img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: saturate(0.92);
  transform: scale(1.01);
}
.cm.v2 [data-solara-module="catalog-hero"].catalog-hero-editorial--has-background .catalog-hero-background::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--catalog-paper) 92%, transparent) 0%,
    color-mix(in srgb, var(--catalog-paper) 64%, transparent) 45%,
    color-mix(in srgb, var(--catalog-paper) 26%, transparent) 78%,
    transparent 100%
  );
  opacity: calc(0.3 + var(--catalog-hero-bg-dark, 0.6) * 0.7);
}
.cm.v2 .catalog-hero-copy {
  position: relative;
  z-index: 2;
  min-width: 0;
  padding: clamp(2rem, 3.4vw, 3.5rem) clamp(2rem, 3vw, 3.75rem) clamp(2rem, 3vw, 3rem) clamp(1rem, 3vw, 3.5rem);
}
.cm.v2 .catalog-eyebrow {
  margin-bottom: .85rem;
  color: var(--solara-accent);
  font-size: .68rem;
  letter-spacing: .2em;
}
.cm.v2 .catalog-hero-copy h1 {
  max-width: 100%;
  font-family: var(--solara-font-display, Georgia, "Times New Roman", serif);
  font-size: calc(clamp(4.75rem, 6.4vw, 8rem) * var(--solara-type-scale, 1));
  font-weight: 500;
  letter-spacing: -.065em;
  line-height: 1.15;
  overflow-wrap: anywhere;
  hyphens: none;
  word-break: normal;
  text-wrap: balance;
}
.cm.v2 [data-solara-module="catalog-hero"] .catalog-eyebrow,
.cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-line-inner,
.cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-body,
.cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-benefit-copy strong,
.cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-benefit-copy small {
  text-shadow: none;
}
.cm.v2 .catalog-hero-copy .catalog-hero-reveal--body > p {
  max-width: 54ch;
  margin-top: 0;
  font-size: clamp(1.05rem, 1.2vw, 1.28rem);
  line-height: 1.62;
}
.cm.v2 .catalog-primary-action,
.cm.v2 .catalog-secondary-action,
.cm.v2 .catalog-newsletter-action,
.cm.v2 .solara-primary-action {
  min-height: 50px;
  border-radius: var(--catalog-v2-radius);
  font-size: .78rem;
  letter-spacing: .035em;
  transition: transform var(--catalog-v2-motion-control) var(--catalog-v2-ease-out), box-shadow var(--catalog-v2-motion-control) var(--catalog-v2-ease-out), background-color var(--catalog-v2-motion-response) ease;
}
.cm.v2 .catalog-primary-action:hover,
.cm.v2 .catalog-newsletter-action:hover,
.cm.v2 .solara-primary-action:hover {
  transform: translateY(-3px);
  box-shadow: var(--catalog-v2-shadow-elevated);
}
.cm.v2 .catalog-hero-media {
  min-height: 100%;
  overflow: hidden;
  border-radius: var(--catalog-v2-radius);
}
.cm.v2 .catalog-hero-media figure {
  margin: 0;
  line-height: 0;
}
.cm.v2 .catalog-hero-media figure > * {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.cm.v2 .catalog-hero-stats {
  margin-top: clamp(1.25rem, 2vw, 2rem);
}
.cm.v2 .catalog-hero-stats dt {
  font-family: var(--solara-font-display, Georgia, "Times New Roman", serif);
  font-weight: 500;
}
/* Motion cinematográfico del hero V2 (familia imagen/video): la coreografía de
   entrada está gateada por [data-motion-visible="true"], que el runtime setea
   con el observer; sin el atributo el contenido queda visible sin animar. */
.cm.v2 [data-solara-module="catalog-hero"] [data-motion-zone]:not([data-solara-loaded]){animation:none!important}
.cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-line{display:block;overflow:hidden}
.cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-rule{width:3.5rem;height:1px;background:color-mix(in srgb,var(--catalog-ink) 35%,transparent);transform-origin:left;margin-block:1.35rem 1.05rem}
.cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-benefits{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:calc(1.5rem * var(--catalog-v2-space, 1)) calc(2.25rem * var(--catalog-v2-space, 1));margin:2rem 0 1rem;padding:0;list-style:none}
/* Los beneficios del copy del hero van en una caja con blur de fondo (desktop,
   sobre el velo y la imagen): se aísla el bloque del fondo fotográfico. */
.cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-benefits--copy{align-self:stretch;margin-inline:0;padding:.95rem 1.15rem;border-radius:var(--catalog-v2-radius);background:color-mix(in srgb,var(--catalog-paper) 38%,transparent);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border:none}
/* La banda duplicada (mobile) no existe en desktop: la copia interna queda visible. */
.cm.v2 [data-solara-module="catalog-hero"].catalog-hero-editorial .catalog-hero-benefits--band{display:none}
.cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-benefit{display:flex;align-items:center;gap:.65rem;min-width:0}
.cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-benefit + .catalog-hero-benefit{border-left:none;padding-left:1.25rem}
.cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-benefit-icon{width:22px;height:22px;flex:0 0 auto}
.cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-benefit-copy{display:flex;flex-direction:column;gap:.15rem;min-width:0}
.cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-benefit-copy small{color:var(--catalog-muted)}
.cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-benefit-icon,.cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-benefit strong{transition:transform var(--catalog-v2-motion-control) var(--catalog-v2-ease-out),color var(--catalog-v2-motion-control)}
.cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-benefit:hover .catalog-hero-benefit-icon,.cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-benefit:focus-visible .catalog-hero-benefit-icon{transform:translateY(-2px)}
.cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-benefit:hover strong,.cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-benefit:focus-visible strong{color:var(--solara-accent)}
.cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-actions .catalog-primary-action{position:relative;display:inline-flex;align-items:center;gap:calc(.6rem * var(--catalog-v2-space, 1));overflow:hidden;isolation:isolate}
.cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-actions .catalog-primary-action::before{content:"";position:absolute;inset:0;z-index:-1;background:color-mix(in srgb,var(--solara-accent) 82%,var(--solara-accent-text));transform:translateY(101%);transition:transform var(--catalog-v2-motion-control) var(--catalog-v2-ease-out)}
.cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-actions .catalog-primary-action:hover,.cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-actions .catalog-primary-action:focus-visible{transform:none;box-shadow:none}
.cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-actions .catalog-primary-action:hover::before,.cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-actions .catalog-primary-action:focus-visible::before{transform:translateY(0)}
.cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-cta-label{display:inline-block;white-space:nowrap}
.cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-cta-icon{width:16px;height:16px;flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center}
.cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-cta-label,.cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-cta-icon{transition:transform var(--catalog-v2-motion-control) var(--catalog-v2-ease-out),color var(--catalog-v2-motion-control)}
.cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-actions .catalog-primary-action:hover .catalog-hero-cta-label,.cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-actions .catalog-primary-action:focus-visible .catalog-hero-cta-label{color:color-mix(in srgb,var(--solara-accent-text) 80%,var(--catalog-paper) 20%)}
.cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-actions .catalog-primary-action:hover .catalog-hero-cta-icon,.cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-actions .catalog-primary-action:focus-visible .catalog-hero-cta-icon{color:color-mix(in srgb,var(--solara-accent-text) 80%,var(--catalog-paper) 20%)}
.cm.v2 [data-solara-module="catalog-hero"][data-motion-visible="true"] .catalog-hero-reveal--eyebrow{--hero-v2-rise:14px;animation:solara-hero-rise var(--hero-v2-dur-eyebrow,380ms) var(--catalog-v2-ease-out) 60ms both}
.cm.v2 [data-solara-module="catalog-hero"][data-motion-visible="true"] .catalog-hero-title{--hero-v2-rise:-10px;animation:solara-hero-rise var(--hero-v2-dur-title,380ms) var(--catalog-v2-ease-out) 100ms both}
.cm.v2 [data-solara-module="catalog-hero"][data-motion-visible="true"] .catalog-hero-line-inner{animation:solara-hero-line var(--hero-v2-dur-line,560ms) var(--catalog-v2-ease-out) var(--hero-v2-line-delay,120ms) both}
.cm.v2 [data-solara-module="catalog-hero"][data-motion-visible="true"] .catalog-hero-line:nth-child(2){--hero-v2-line-delay:190ms}
.cm.v2 [data-solara-module="catalog-hero"][data-motion-visible="true"] .catalog-hero-rule{animation:solara-hero-rule var(--hero-v2-dur-rule,480ms) var(--catalog-v2-ease-out) 300ms both}
.cm.v2 [data-solara-module="catalog-hero"][data-motion-visible="true"] .catalog-hero-reveal--body{animation:solara-hero-rise var(--hero-v2-dur-body,420ms) var(--catalog-v2-ease-out) 360ms both}
.cm.v2 [data-solara-module="catalog-hero"][data-motion-visible="true"] .catalog-hero-reveal--actions{--hero-v2-rise:18px;animation:solara-hero-rise var(--hero-v2-dur-actions,420ms) var(--catalog-v2-ease-out) 430ms both}
.cm.v2 [data-solara-module="catalog-hero"][data-motion-visible="true"] .catalog-hero-benefits--copy .catalog-hero-benefit{animation:solara-hero-rise var(--hero-v2-dur-benefit,420ms) var(--catalog-v2-ease-out) var(--hero-v2-benefit-delay,500ms) both}
.cm.v2 [data-solara-module="catalog-hero"][data-motion-visible="true"] .catalog-hero-benefits--copy .catalog-hero-benefit:nth-child(2){--hero-v2-benefit-delay:560ms}
.cm.v2 [data-solara-module="catalog-hero"][data-motion-visible="true"] .catalog-hero-benefits--copy .catalog-hero-benefit:nth-child(3){--hero-v2-benefit-delay:620ms}
.cm.v2 [data-solara-module="catalog-hero"][data-motion-visible="true"] .catalog-hero-image{animation:solara-hero-media-zoom var(--hero-v2-dur-zoom,1200ms) var(--catalog-v2-ease-out) 80ms backwards}
@keyframes solara-hero-rise{from{opacity:0;transform:translateY(var(--hero-v2-rise,16px))}to{opacity:1;transform:translateY(0)}}
@keyframes solara-hero-line{from{transform:translateY(115%)}to{transform:translateY(0)}}
@keyframes solara-hero-rule{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes solara-hero-media-zoom{from{transform:scale(1.06)}to{transform:scale(1)}}
/* Appear de marca V2 (logo + hero-media): oculto pre-load sólo con motion
   listo y preset distinto de none; al cargar anima con duración/easing/delay/
   distancia/intensidad de la sección (panel Movimiento). Sin JS, con
   movimiento reducido o en error, visible directo. */
@media (prefers-reduced-motion: no-preference) {
  html[data-motion-ready="true"] .cm.v2 [data-motion-root]:not([data-motion-preset="none"]) :is(img.solara-logo, [data-hero-media], .catalog-hero-media):not([data-solara-loaded]):not([data-solara-broken]) {
    opacity: 0;
  }
  html[data-motion-ready="true"] .cm.v2 [data-motion-root][data-motion-preset="fade"][data-motion-visible="true"] :is(img.solara-logo, [data-hero-media], .catalog-hero-media)[data-solara-loaded] {
    animation: solara-motion-fade var(--motion-duration, 600ms) var(--motion-easing, cubic-bezier(.16, 1, .3, 1)) var(--motion-delay, 0ms) backwards;
  }
  html[data-motion-ready="true"] .cm.v2 [data-motion-root]:is([data-motion-preset="fade-up"], [data-motion-preset="stagger"])[data-motion-visible="true"] :is(img.solara-logo, [data-hero-media], .catalog-hero-media)[data-solara-loaded] {
    animation: solara-motion-fade-up var(--motion-duration, 600ms) var(--motion-easing, cubic-bezier(.16, 1, .3, 1)) var(--motion-delay, 0ms) backwards;
  }
  html[data-motion-ready="true"] .cm.v2 [data-motion-root][data-motion-preset="scale"][data-motion-visible="true"] :is(img.solara-logo, [data-hero-media], .catalog-hero-media)[data-solara-loaded] {
    animation: solara-motion-scale var(--motion-duration, 600ms) var(--motion-easing, cubic-bezier(.16, 1, .3, 1)) var(--motion-delay, 0ms) backwards;
  }
  html[data-motion-ready="true"] .cm.v2 [data-motion-root][data-motion-preset="slide"][data-motion-visible="true"] :is(img.solara-logo, [data-hero-media], .catalog-hero-media)[data-solara-loaded] {
    animation: solara-motion-slide var(--motion-duration, 600ms) var(--motion-easing, cubic-bezier(.16, 1, .3, 1)) var(--motion-delay, 0ms) backwards;
  }
  @media (max-width: 767px) {
    html[data-motion-ready="true"] .cm.v2 .catalog-hero-editorial[data-motion-root]:not([data-motion-preset="none"])[data-motion-visible="true"] [data-hero-media][data-solara-loaded] {
      animation: solara-motion-fade var(--motion-duration, 600ms) var(--motion-easing, cubic-bezier(.16, 1, .3, 1)) var(--motion-delay, 0ms) backwards;
    }
  }
}
.cm.v2 .catalog-brand-strip-inner,
.cm.v2 .catalog-product-grid-section,
.cm.v2 .catalog-category-bento-section,
.cm.v2 .catalog-testimonials-section,
.cm.v2 .catalog-footer-inner,
.cm.v2 .catalog-newsletter-inner {
  width: min(calc(100% - 3rem), var(--catalog-v2-wide));
}
/* El hero colisiona con el borde de la franja (margin-top 0); el contenido
   respira con padding vertical parejo arriba y abajo. */
.cm.v2 .catalog-brand-strip-inner {
  margin-top: 0;
  padding-block: clamp(2.5rem, 4vw, 4rem);
}
/* El padding-block de product-grid-section y testimonials-section lo define
   la regla de secciones con var(--solara-section-y) más adelante en el
   template; la declaración previa de 4.6vw quedó invalidada y se elimina. */
.cm.v2 .catalog-product-grid-section h2,
.cm.v2 .catalog-category-bento-section h2,
.cm.v2 .catalog-testimonials-section h2 {
  max-width: 12ch;
  font-family: var(--solara-font-display, Georgia, "Times New Roman", serif);
  font-size: calc(clamp(1.8rem, 4vw, 3rem) * var(--solara-type-scale, 1));
  font-weight: 500;
  letter-spacing: -.03em;
  line-height: .9;
}
.cm.v2 .catalog-product-grid-section > header,
.cm.v2 .catalog-testimonials-section > header {
  margin-bottom: clamp(1.3rem, 2.6vw, 2.6rem);
}
.cm.v2 .catalog-testimonials-track {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-auto-flow: row;
  grid-auto-columns: auto;
  gap: calc(clamp(1rem, 1.6vw, 1.5rem) * var(--catalog-v2-space, 1));
  overflow: visible;
  overscroll-behavior: auto;
  scroll-snap-type: none;
  padding-bottom: 0;
}
.cm.v2 .catalog-testimonial {
  min-width: 0;
  text-align: left;
}
.cm.v2 .catalog-testimonial blockquote {
  margin: .75rem 0 0;
  text-align: left;
}
.cm.v2 .catalog-product-grid {
  grid-template-columns: repeat(auto-fill,minmax(min(100% / 5, 20rem),1fr));
  justify-content: start;
  /* El gap efectivo lo fija la regla global de grillas con
     var(--solara-card-gap) más adelante; la fórmula previa de 2.4vw quedó
     invalidada y se elimina. */
  margin: 0 auto;
}
@media (min-width: 1200px) {
  .cm.v2 .catalog-product-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
  .cm.v2 main.solara-container:has(> [data-solara-module="catalog-product-grid"]) {
    padding-inline: 0;
  }
  .cm.v2 main.solara-container:has(> [data-solara-module="catalog-product-grid"]) > [data-solara-module="catalog-product-grid"] > .catalog-product-grid-section {
    width: min(calc(100% - 1.5rem), var(--catalog-v2-wide));
  }
  .cm.v2 main.solara-container > [data-solara-module="catalog-product-grid"] > .catalog-product-grid-section .catalog-product-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
    width: 100%;
    max-width: none;
  }
}
/* Relacionados del product-detail: hasta 8 items pedían 5+3 con la grilla
   general; cuatro por fila deja 4+4, 4+2 o 4+1 simétricas. */
@media (min-width: 1200px) {
  .cm.v2 [data-solara-section$="-related"] .catalog-product-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
/* Tablet de 768px a 1199px: 3 columnas y wrapping seguro. */
@media (max-width: 1199px) {
  .cm.v2 .catalog-hero-copy h1,
  .cm.v2 .catalog-hero-line-inner,
  .cm.v2 .catalog-hero-body,
  .cm.v2 .catalog-hero-cta-label {
    overflow-wrap: anywhere;
    word-break: normal;
  }
  .cm.v2 .catalog-hero-cta-label {
    white-space: normal;
  }
  .cm.v2 .catalog-product-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  /* En retratos de tablet el ancho 9:16 se recorta contra 45vw; la media
     estira a la altura del hero para no dejar vacío debajo. */
  .cm.v2 .catalog-hero-editorial [data-hero-media] {
    height: calc(100% + 2px);
    aspect-ratio: auto;
  }
}
.cm.v2 .catalog-product-card {
  transition: transform var(--catalog-v2-motion-component) var(--catalog-v2-ease-out);
}
.cm.v2 .catalog-product-card:hover,
.cm.v2 .catalog-product-card:focus-within {
  transform: translateY(-6px);
}
/* Rayita de 3px animada en el borde izquierdo de la IMAGEN al hover: crece
   desde abajo con transform (compositor, sin layout). La media es el ancla
   (position: relative) y NO se escala en hover: la barra queda exactamente
   sobre la foto sin escala, sin salirse ni entrar al copy. */
.cm.v2 .catalog-product-media {
  position: relative;
}
.cm.v2 .catalog-product-media::before,
.cm.v2 .catalog-category-bento-media::before {
  content: "";
  position: absolute;
  left: 0;
  bottom: 0;
  width: 3px;
  height: 100%;
  z-index: 2;
  transform: scaleY(0);
  transform-origin: bottom;
  background: var(--solara-accent);
  opacity: 0;
  transition:
    transform var(--catalog-v2-motion-component) var(--catalog-v2-ease-out),
    opacity var(--catalog-v2-motion-response) var(--catalog-v2-ease-out);
  pointer-events: none;
}
.cm.v2 .catalog-product-card:hover .catalog-product-media::before,
.cm.v2 .catalog-product-card:focus-within .catalog-product-media::before,
.cm.v2 .catalog-category-bento-item:hover .catalog-category-bento-media::before,
.cm.v2 .catalog-category-bento-item:focus-within .catalog-category-bento-media::before {
  transform: scaleY(1);
  opacity: 1;
}
.cm.v2 .catalog-product-media {
  aspect-ratio: 1;
  border-radius: 0;
  border: var(--solara-border-width, 1px) solid var(--catalog-border);
}
.cm.v2 .catalog-product-card-image {
  object-fit: cover;
  transition: transform var(--catalog-v2-motion-editorial) var(--catalog-v2-ease-out);
}
.cm.v2 .catalog-product-card:hover .catalog-product-card-image,
.cm.v2 .catalog-product-card:focus-within .catalog-product-card-image {
  transform: scale(1.055);
}
.cm.v2 .catalog-product-card-copy {
  padding-top: 1.25rem;
}
.cm.v2 .catalog-product-card h3 {
  min-height: 0;
  font-family: var(--solara-font-body, Arial, sans-serif);
  font-size: 1.18rem;
  font-weight: 600;
  letter-spacing: -.02em;
}
/* Metadata de card escalada con la columna más ancha (+15-25% sobre la base). */
.cm.v2 .catalog-product-category {
  font-size: .82rem;
}
.cm.v2 .catalog-product-rating {
  font-size: .95rem;
}
.cm.v2 .catalog-product-rating span {
  font-size: .82rem;
}
.cm.v2 .catalog-product-price {
  font-size: 1.1rem;
}
.cm.v2 .catalog-discount {
  font-size: .78rem;
}
.cm.v2 .catalog-view-all,
.cm.v2 .catalog-category-bento-all,
.cm.v2 .catalog-mega-menu__all {
  position: relative;
  border-bottom: 0;
  padding-bottom: .2rem;
  font-size: .72rem;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.cm.v2 .catalog-view-all::after,
.cm.v2 .catalog-category-bento-all::after,
.cm.v2 .catalog-mega-menu__all::after {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 1px;
  transform: scaleX(.35);
  transform-origin: left;
  background: currentcolor;
  content: "";
  transition: transform var(--catalog-v2-motion-control) var(--catalog-v2-ease-out);
}
.cm.v2 .catalog-view-all:hover::after,
.cm.v2 .catalog-view-all:focus-visible::after,
.cm.v2 .catalog-category-bento-all:hover::after,
.cm.v2 .catalog-category-bento-all:focus-visible::after,
.cm.v2 .catalog-mega-menu__all:hover::after,
.cm.v2 .catalog-mega-menu__all:focus-visible::after {
  transform: scaleX(1);
}
.cm.v2 .catalog-category-bento-section {
  margin-top: 0;
  padding-inline: 0;
  border-radius: 0;
  background: transparent;
}
.cm.v2 .catalog-category-bento-item {
  overflow: hidden;
  border-radius: 0;
  transition: transform var(--catalog-v2-motion-component) var(--catalog-v2-ease-out), box-shadow var(--catalog-v2-motion-component) var(--catalog-v2-ease-out);
}
.cm.v2 .catalog-category-bento-grid {
  grid-auto-rows: auto;
}
.cm.v2 .catalog-category-bento-item,
.cm.v2 .catalog-category-bento-item--wide,
.cm.v2 .catalog-category-bento-item--tall {
  grid-column: span 1;
  grid-row: span 1;
}
.cm.v2 .catalog-category-bento-grid[data-category-count="1"] .catalog-category-bento-item {
  grid-column: 1 / -1;
}
.cm.v2 .catalog-category-bento-item img {
  transition: transform var(--catalog-v2-motion-editorial) var(--catalog-v2-ease-out), filter var(--catalog-v2-motion-component) ease;
}
.cm.v2 .solara-category-placeholder {
  font-size: calc(clamp(3rem, 5vw, 4.5rem) * var(--solara-type-scale, 1));
}
.cm.v2 .catalog-category-bento-item:hover,
.cm.v2 .catalog-category-bento-item:focus-visible {
  transform: translateY(-4px);
  box-shadow: var(--catalog-v2-shadow-card);
}
.cm.v2 .catalog-category-bento-item:hover img,
.cm.v2 .catalog-category-bento-item:focus-visible img {
  transform: scale(1.06);
  filter: saturate(.82) contrast(1.06);
}
.cm.v2 .catalog-category-bento-copy {
  padding: 1rem 0;
}
.cm.v2 .catalog-category-bento-label {
  font-family: var(--solara-font-body, Arial, sans-serif);
}
.cm.v2 .catalog-category-bento-title {
  font-size: 1.05rem;
  letter-spacing: -.02em;
}
.cm.v2 .catalog-category-bento-count {
  color: var(--catalog-muted);
  font-size: .72rem;
  font-weight: 500;
}
.cm.v2 .catalog-category-bento-item::after {
  content: none;
}
.cm.v2 .catalog-category-bento-image {
  opacity: 1;
}
.cm.v2 .catalog-testimonial {
  border-radius: 0;
  background: color-mix(in srgb, var(--catalog-surface), transparent 34%);
}
/* Entrada coreografiada estilo hero para reseñas: header primero y cada
   testimonio entra con stagger. */
.cm.v2 [data-solara-module="catalog-testimonials"][data-motion-visible="true"] .catalog-testimonials-section > header {
  --hero-v2-rise: 14px;
  animation: solara-hero-rise var(--catalog-v2-motion-component) var(--catalog-v2-ease-out) 60ms backwards;
}
.cm.v2 [data-solara-module="catalog-testimonials"][data-motion-visible="true"] .catalog-testimonial {
  --hero-v2-rise: 18px;
  animation: solara-hero-rise var(--catalog-v2-motion-component) var(--catalog-v2-ease-out) calc(140ms + var(--catalog-t-index, 0) * 70ms) backwards;
}
.cm.v2 [data-solara-module="catalog-testimonials"][data-motion-visible="true"] .catalog-testimonial:nth-child(1) {
  --catalog-t-index: 1;
}
.cm.v2 [data-solara-module="catalog-testimonials"][data-motion-visible="true"] .catalog-testimonial:nth-child(2) {
  --catalog-t-index: 2;
}
.cm.v2 [data-solara-module="catalog-testimonials"][data-motion-visible="true"] .catalog-testimonial:nth-child(3) {
  --catalog-t-index: 3;
}
.cm.v2 [data-solara-module="catalog-testimonials"][data-motion-visible="true"] .catalog-testimonial:nth-child(4) {
  --catalog-t-index: 4;
}
.cm.v2 [data-solara-module="catalog-testimonials"][data-motion-visible="true"] .catalog-testimonial:nth-child(5) {
  --catalog-t-index: 5;
}
.cm.v2 [data-solara-module="catalog-testimonials"][data-motion-visible="true"] .catalog-testimonial:nth-child(6) {
  --catalog-t-index: 6;
}
.cm.v2 [data-solara-module="catalog-testimonials"][data-motion-visible="true"] .catalog-testimonial:nth-child(7) {
  --catalog-t-index: 7;
}
.cm.v2 [data-solara-module="catalog-testimonials"][data-motion-visible="true"] .catalog-testimonial:nth-child(8) {
  --catalog-t-index: 8;
}
.cm.v2 [data-solara-module="catalog-testimonials"][data-motion-visible="true"] .catalog-testimonial:nth-child(9) {
  --catalog-t-index: 9;
}
.cm.v2 [data-solara-module="catalog-testimonials"][data-motion-visible="true"] .catalog-testimonial:nth-child(10) {
  --catalog-t-index: 10;
}
.cm.v2 [data-solara-module="catalog-testimonials"][data-motion-visible="true"] .catalog-testimonial:nth-child(11) {
  --catalog-t-index: 11;
}
.cm.v2 [data-solara-module="catalog-testimonials"][data-motion-visible="true"] .catalog-testimonial:nth-child(12) {
  --catalog-t-index: 12;
}
  /* Footer: copia exacta de newsletter-cta (Recibí las próximas novedades) para appear consistente. */
  .cm.v2 [data-solara-module="catalog-footer"][data-motion-visible="true"] .catalog-footer-inner {
    --hero-v2-rise: 14px;
    animation: solara-hero-rise var(--catalog-v2-motion-component) var(--catalog-v2-ease-out) 80ms backwards;
  }
  .cm.v2 [data-solara-module="catalog-footer"][data-motion-visible="true"] .catalog-footer-meta {
    --hero-v2-rise: 16px;
    animation: solara-hero-rise var(--catalog-v2-motion-component) var(--catalog-v2-ease-out) 200ms backwards;
  }
  .cm.v2 .catalog-footer-made {
  margin: 0;
  font-size: .72rem;
  letter-spacing: .02em;
}
.cm.v2 .catalog-footer-made a {
  color: var(--catalog-muted);
  text-decoration: none;
  transition: color var(--catalog-v2-motion-control) ease;
}
.cm.v2 .catalog-footer-made a:hover,
.cm.v2 .catalog-footer-made a:focus-visible {
  color: var(--solara-accent);
}
.cm.v2 .catalog-footer-inner {
  padding-top: clamp(2rem, 4.6vw, 4.6rem);
}
.cm.v2 .catalog-footer-meta {
  grid-column: 1 / -1;
  width: 100%;
}
/* El CTA de newsletter hereda de V1 un margen inferior de hasta 5rem; en la
   composición V2 respira con las secciones y se acerca al pie. */
.cm.v2 .catalog-newsletter-inner {
  margin-bottom: clamp(1.3rem, 3.3vw, 3.3rem);
  padding: clamp(1.15rem, 2.6vw, 2rem);
}
.cm.v2 .solara-related-products > .solara-container > h2 {
  margin-top: 2rem;
}
.cm.v2 .solara-category-hero {
  grid-template-columns: minmax(0, 1.08fr) minmax(20rem, .58fr);
  align-items: start;
  gap: clamp(1.25rem, 3vw, 3rem);
  padding: clamp(2rem, 4vw, 3.5rem) 0 clamp(1.25rem, 2.5vw, 2rem);
}
.cm.v2 .solara-page-intro h1,
.cm.v2 .solara-cart-page h1,
.cm.v2 .solara-checkout-page h1 {
  font-family: var(--solara-font-display, Georgia, "Times New Roman", serif);
  font-size: calc(clamp(3.8rem, 5vw, 6rem) * var(--solara-type-scale, 1));
  font-weight: 500;
  letter-spacing: -.03em;
  line-height: .88;
  overflow-wrap: normal;
}
.cm.v2 .solara-category-hero h1 {
  max-width: 14ch;
  font-size: calc(clamp(3rem, 4.2vw, 4.75rem) * var(--solara-type-scale, 1));
  overflow-wrap: break-word;
  text-wrap: balance;
  line-height: 1.15;
}
.cm.v2 .solara-category-hero img { aspect-ratio: 5 / 3; object-fit: cover; object-position: center; background: var(--catalog-surface); border-radius: var(--catalog-v2-radius); }
.cm.v2 .solara-search-page .solara-page-intro { max-width: none; padding: clamp(3rem, 5vw, 5rem) 0 1.5rem; }
.cm.v2 .solara-search-page .solara-page-intro h1 { max-width: none; font-size: calc(clamp(3.5rem, 4.5vw, 5.75rem) * var(--solara-type-scale, 1)); line-height: .95; }
.cm.v2 .solara-search-page .solara-page-intro > p:not(.solara-eyebrow) { margin: 1rem 0 0; color: var(--catalog-muted); font-size: 1rem; line-height: 1.55; }
.cm.v2 .solara-search-form { display: grid; gap: .75rem; max-width: 72rem; margin: 2rem 0 0; padding-bottom: 0; }
.cm.v2 .solara-search-form > label { font-size: .72rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.cm.v2 .solara-search-form > div { display: grid; grid-template-columns: minmax(0, 1fr) 8rem; gap: .75rem; }
.cm.v2 .solara-search-form input { min-height: 52px; padding-inline: 1rem; border-radius: 0; background: transparent; }
.cm.v2 .solara-search-form .solara-primary-action { border-radius: 0; }
.cm.v2 .solara-search-results { min-height: 18rem; padding-block: clamp(2.5rem, 5vw, 5rem); }
.cm.v2 .solara-search-results > p:only-child { max-width: 34rem; margin: 1rem auto; font-family: var(--solara-font-display, Georgia, "Times New Roman", serif); font-size: clamp(1.55rem, 2.5vw, 2.35rem); line-height: 1.15; text-align: center; }
.cm.v2 .solara-search-summary { margin: 0 0 1.75rem; font-size: 1rem; font-weight: 650; }
.cm.v2 .solara-search-results-grid { grid-template-columns: repeat(auto-fill,minmax(11rem,1fr)); justify-content: start; gap: 3rem clamp(.8rem, 1.4vw, 1.6rem); max-width: 1320px; margin: 0 auto; }
.cm.v2 .solara-search-result { min-width: 0; overflow: hidden; }
.cm.v2 .solara-search-result a { gap: .75rem; }
.cm.v2 .solara-search-result img { height: auto; aspect-ratio: 1; object-fit: cover; object-position: center; transition: transform var(--catalog-v2-motion-editorial) var(--catalog-v2-ease-out); }
.cm.v2 .solara-search-result a:hover img { transform: scale(1.035); }
.cm.v2 .solara-search-result a > div { display: flex; flex-direction: column; align-items: flex-start; gap: .25rem; }
.cm.v2 .solara-search-result h2 { font-family: var(--solara-font-body, Arial, sans-serif); font-size: .98rem; font-weight: 600; letter-spacing: -.02em; }
.cm.v2 .solara-search-result p { order: -1; font-size: .68rem; font-weight: 650; letter-spacing: .07em; text-transform: uppercase; }
.cm.v2 .solara-search-result strong { font-size: .92rem; font-weight: 500; }
.cm.v2 .catalog-category-layout {
  grid-template-columns: 270px minmax(0, 1fr);
  /* El gap efectivo es el global de 1rem por v2-space (regla posterior); el
     clamp de 4vw quedó invalidado y se elimina. */
}
.cm.v2 .catalog-category-filters {
  position: sticky;
  top: 6.5rem;
  align-self: start;
  max-height: calc(100dvh - 6.5rem);
  overflow-y: auto;
  padding: 1.25rem 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}
.cm.v2 .catalog-filter-groups legend {
  font-size: .68rem;
  letter-spacing: .1em;
  text-transform: uppercase;
}
.cm.v2 .catalog-category-results .solara-category-toolbar {
  min-height: 54px;
  margin-bottom: 1.75rem;
}
.cm.v2 .catalog-category-results .catalog-product-grid{grid-template-columns:repeat(auto-fill,minmax(min(100% / 5, 20rem),1fr));justify-content:space-between;gap:2rem 1.5rem;width:100%;max-width:none;margin-inline:0}
/* La grilla de categorías usa todo el rail disponible y conserva 3 columnas
   hasta 1199px para mantener una lectura cómoda en tablet. */
@media (max-width: 1199px) {
  .cm.v2 .catalog-category-results .catalog-product-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
.cm.v2 .catalog-product-detail,
.cm.v2 .catalog-product-tabs,
.cm.v2 .catalog-product-reviews {
  width: min(calc(100% - 3rem), var(--catalog-v2-wide));
}
.cm.v2 .catalog-category-page,
.cm.v2 .solara-search-page,
.cm.v2 .solara-cart-page,
.cm.v2 .solara-checkout-page,
.cm.v2 .solara-editorial-page,
.cm.v2 .solara-error-page {
  width: min(calc(100% - 3rem), var(--catalog-v2-wide));
  margin-inline: auto;
}
/* Alineación de márgenes V2: el contenido de las páginas con contenedor, los
   relacionados y el mega menú comparten la línea vertical del gutter de 3rem
   (24px por lado) que ya usan el header y el footer; sin heredar el
   padding-inline de 1rem del contenedor base. */
.cm.v2 main.solara-container {
  padding-inline: 0;
}
.cm.v2 .solara-related-products > .solara-container {
  width: 100%;
  margin-inline: 0;
  padding-inline: 0;
}
/* El mega menú es absoluto respecto del header-inner: width 100% lo deja
   exactamente en la línea vertical del gutter v2 (24px por lado en desktop,
   12px en móvil) y el padding horizontal queda contenido. */
.cm.v2 .catalog-mega-menu {
  width: 100%;
  padding: clamp(2rem, 4vw, 3rem) clamp(1.5rem, 3vw, 2.5rem) 1.5rem;
}
.cm.v2 .catalog-category-page > .solara-pagination {
  padding-left: calc(270px + 1rem);
}
.cm.v2 .catalog-product-detail-inner {
  grid-template-columns: minmax(0, 1.1fr) minmax(460px, .9fr);
  gap: clamp(2rem, 3vw, 4rem);
  padding-block: clamp(2rem, 4vw, 4rem);
}
.cm.v2 .catalog-product-gallery {
  grid-template-columns: minmax(0, 1fr) 5.5rem;
  gap: 1rem;
}
.cm.v2 .catalog-product-gallery-main,
.cm.v2 .catalog-product-gallery-thumbs button {
  border-radius: 0;
}
.cm.v2 .catalog-product-gallery-main {
  aspect-ratio: 1;
}
.cm.v2 .catalog-product-gallery-main figure {
  display: none;
  width: 100%;
  height: 100%;
}
.cm.v2 .catalog-product-gallery-image {
  object-fit: cover;
  transition: transform var(--catalog-v2-motion-editorial) var(--catalog-v2-ease-out);
}
.cm.v2 .catalog-product-gallery-main:hover .catalog-product-gallery-image {
  transform: scale(1.025);
}
.cm.v2 .catalog-product-info {
  position: sticky;
  top: 1.5rem;
  padding-top: 1rem;
}
.cm.v2 .catalog-product-info h1 {
  max-width: 11ch;
  font-family: var(--solara-font-display, Georgia, "Times New Roman", serif);
  font-size: calc(clamp(3.4rem, 4.2vw, 5.5rem) * var(--solara-type-scale, 1));
  font-weight: 500;
  letter-spacing: -.03em;
  line-height: .88;
  overflow-wrap: normal;
}
.cm.v2 .catalog-detail-price {
  margin-top: 1.5rem;
  font-size: 1.4rem;
  font-weight: 650;
}
.cm.v2 .catalog-add-form {
  margin-top: 2rem;
  padding-top: 1.5rem;
}
.cm.v2 .catalog-product-info select,
.cm.v2 .catalog-product-tabs button {
  border-radius: var(--catalog-v2-radius);
}
.cm.v2 .catalog-product-tabs {
  margin-top: 0;
}
.cm.v2 .catalog-cart-drawer {
  width: min(520px, 100%);
  padding: clamp(1.5rem, 3vw, 2.5rem);
  box-shadow: var(--catalog-v2-shadow-overlay);
  transition: transform var(--catalog-v2-motion-component) var(--catalog-v2-ease-out);
}
.cm.v2 .catalog-cart-drawer[aria-hidden="true"] {
  visibility: hidden;
}
.cm.v2 .catalog-cart-drawer[data-open="true"] {
  visibility: visible;
}
.cm.v2 .catalog-cart-drawer header h2 {
  font-family: var(--solara-font-display, Georgia, "Times New Roman", serif);
  font-size: clamp(2.2rem, 4vw, 3.4rem);
  font-weight: 500;
  letter-spacing: -.065em;
}
.cm.v2 .catalog-cart-drawer header button {
  border-radius: var(--catalog-v2-radius);
}
.cm.v2 .catalog-cart-items .solara-cart-line {
  grid-template-columns: minmax(0, 1fr) auto;
  gap: .75rem;
}
.cm.v2 .catalog-cart-items .solara-cart-line > div:first-child {
  min-width: 0;
}
.cm.v2 .catalog-cart-items .solara-cart-line > input {
  grid-column: 1;
  width: 5rem;
}
.cm.v2 .catalog-cart-items .solara-cart-line > button {
  grid-column: 2;
  justify-self: end;
}
.cm.v2 .catalog-cart-items .solara-cart-line > span:last-child {
  grid-column: 2;
  grid-row: 1;
  align-self: center;
  white-space: nowrap;
}
.cm.v2 .catalog-cart-backdrop {
  background: color-mix(in srgb, var(--catalog-ink), transparent 45%);
  backdrop-filter: blur(3px);
}
.cm.v2 .solara-cart-page > .solara-page-intro { max-width: none; padding: clamp(2rem, 4vw, 4rem) 0 1rem; }
.cm.v2 .solara-cart-page > .solara-page-intro h1 { max-width: none; font-size: calc(clamp(3.5rem, 4.5vw, 5.75rem) * var(--solara-type-scale, 1)); line-height: .95; }
.cm.v2 .solara-cart-page-grid { grid-template-columns: minmax(0, 1fr) clamp(22.5rem, 27vw, 24rem); gap: clamp(3rem, 6vw, 5rem); padding: 2rem 0 clamp(5rem, 8vw, 8rem); }
.cm.v2 .solara-cart-page-grid > aside { position: sticky; top: 6.5rem; padding: 1.25rem 0 1.5rem clamp(2rem, 4vw, 4rem); border: 0; border-radius: 0; background: transparent; }
.cm.v2 .solara-cart-summary { gap: 1rem; }
.cm.v2 .solara-cart-summary > p { min-height: 2rem; align-items: center; font-size: .92rem; }
.cm.v2 .solara-cart-summary > p strong,
.cm.v2 .solara-cart-page-grid aside strong { max-width: 60%; color: var(--catalog-ink); font-family: var(--solara-font-body, Arial, sans-serif); font-size: 1rem; font-weight: 650; line-height: 1.35; text-align: right; }
.cm.v2 .solara-cart-summary > p:nth-of-type(3) { margin-top: .35rem; padding-top: 1rem; font-size: 1rem; }
.cm.v2 .solara-cart-summary > p:nth-of-type(3) strong { font-size: 1.35rem; }
.cm.v2 .solara-cart-page-grid > aside .solara-primary-action { margin-top: .5rem; }
.cm.v2 .solara-cart-page [data-cart-lines] .solara-cart-empty { max-width: 34rem; padding: 1.5rem 0; font-size: 1.05rem; line-height: 1.6; }
.cm.v2 .solara-cart-page-grid [data-cart-lines] .solara-cart-line { grid-template-columns: minmax(0, 1fr) 7rem auto; gap: 1rem; align-items: center; padding: 1.25rem 0; }
.cm.v2 .solara-cart-page-grid [data-cart-lines] .solara-cart-line > div:first-child { display: grid; grid-template-columns: 8rem minmax(0, 1fr); gap: 1rem; align-items: center; }
.cm.v2 .solara-cart-page-grid [data-cart-lines] .solara-cart-line img { width: 8rem; height: 8rem; object-fit: cover; object-position: center; display: block; border-radius: 0; }
.cm.v2 .solara-cart-page-grid [data-cart-lines] .solara-cart-line > label { grid-column: 2; grid-row: 1; }
.cm.v2 .solara-cart-page-grid [data-cart-lines] .solara-cart-line input { width: 100%; min-height: 44px; }
.cm.v2 .solara-cart-page-grid [data-cart-lines] .solara-cart-line > button { grid-column: 3; grid-row: 2; justify-self: end; }
.cm.v2 .solara-cart-page-grid [data-cart-lines] .solara-cart-line > span:last-child { grid-column: 3; grid-row: 1; font-family: var(--solara-font-body, Arial, sans-serif); font-weight: 650; white-space: nowrap; }
/* Carrito sin líneas: la columna izquierda vacía dejaba un hueco enorme; sin
   items la grilla pasa a una columna con el resumen debajo. */
.cm.v2 .solara-cart-page-grid:has([data-cart-lines] > .solara-empty-state),
.cm.v2 .solara-cart-page-grid:has([data-cart-lines] > .solara-cart-empty) {
  grid-template-columns: minmax(0, 1fr);
}
.cm.v2 .solara-cart-page-grid:has([data-cart-lines] > .solara-empty-state) > aside,
.cm.v2 .solara-cart-page-grid:has([data-cart-lines] > .solara-cart-empty) > aside {
  position: static;
  padding: 1.5rem 0 0;
  border-left: 0;
}
.cm.v2 .solara-error-hero { display: grid; grid-template-columns: minmax(0, .8fr) minmax(28rem, 1.2fr); min-height: min(520px, calc(100svh - 220px)); overflow: hidden; position: relative; isolation: isolate; }
.cm.v2 .solara-error-copy { padding-block: 2rem; }
.cm.v2 .solara-error-copy { position: relative; z-index: 1; }
.cm.v2 .solara-error-copy h1 { margin-top: 1rem; font-size: calc(clamp(4rem, 5.5vw, 7rem) * var(--solara-type-scale, 1)); letter-spacing: -.07em; line-height: .92; }
.cm.v2 .solara-error-copy > p:not(.solara-eyebrow) { max-width: 36rem; margin-top: 1.5rem; color: var(--catalog-muted); font-size: 1.05rem; }
.cm.v2 .solara-error-code { position: relative; z-index: 0; pointer-events: none; color: color-mix(in srgb, var(--catalog-border), transparent 25%); font-family: var(--solara-font-display, Georgia, "Times New Roman", serif); font-size: clamp(18rem, 31vw, 36rem); letter-spacing: -.1em; line-height: .7; text-align: center; }
.cm.v2 .solara-error-actions { display: flex; align-items: flex-start; flex-wrap: wrap; gap: .75rem; margin-top: 2rem; }
@media (max-width: 1199px) {
  .cm.v2 .solara-error-hero { display: flex; min-height: 0; flex-direction: column; align-items: stretch; padding: 2rem 0 4rem; }
  .cm.v2 .solara-error-copy { padding-block: 1rem 0; }
  .cm.v2 .solara-error-copy h1 { font-size: calc(clamp(3.4rem, 14vw, 4.8rem) * var(--solara-type-scale, 1)); }
  .cm.v2 .solara-error-code { order: 2; margin: 2rem 0 .5rem; font-size: clamp(10rem, 48vw, 14rem); }
  .cm.v2 .solara-error-actions { display: grid; width: 100%; }
  .cm.v2 .solara-error-actions > * { width: 100%; }
}
.cm.v2 .solara-checkout-page {
  padding-bottom: clamp(5rem, 9vw, 9rem);
}
.cm.v2 .solara-checkout-page > .solara-page-intro {
  max-width: 72rem;
  padding-top: clamp(3rem, 6vw, 6rem);
  padding-bottom: 1rem;
}
.cm.v2 .solara-checkout-page h1 {
  max-width: none;
  font-size: calc(clamp(4rem, 5vw, 6.5rem) * var(--solara-type-scale, 1));
}
.cm.v2 .solara-checkout-form-v2 {
  grid-template-columns: minmax(0, 1fr) minmax(25rem, .78fr);
  align-items: start;
  gap: clamp(3rem, 6vw, 8rem);
  max-width: none;
  padding-top: 1rem;
  padding-bottom: 0;
}
.cm.v2 .solara-checkout-fields {
  display: grid;
  gap: .75rem;
}
.cm.v2 .solara-checkout-fields label {
  margin-top: 1rem;
  font-size: .86rem;
  font-weight: 700;
}
.cm.v2 .solara-checkout-fields input,
.cm.v2 .solara-checkout-fields textarea {
  width: 100%;
  min-height: 54px;
  padding: .75rem 1rem;
  border: 1px solid var(--catalog-border);
  border-radius: var(--catalog-v2-radius);
  background: transparent;
  color: var(--catalog-ink);
}
.cm.v2 .solara-checkout-fields textarea {
  min-height: 96px;
  resize: vertical;
}
.cm.v2 .solara-checkout-fields input:focus-visible,
.cm.v2 .solara-checkout-fields textarea:focus-visible {
  border-color: var(--solara-accent);
  outline: 2px solid color-mix(in srgb, var(--solara-accent), transparent 35%);
  outline-offset: 2px;
}
.cm.v2 .solara-checkout-fields .solara-primary-action {
  width: min(100%, 24rem);
  margin-top: 1.25rem;
}
.cm.v2 .solara-checkout-order-panel {
  position: sticky;
  top: 2rem;
  min-width: 0;
  padding: .5rem 0 2rem clamp(2rem, 4vw, 5rem);
  border-left: 1px solid var(--catalog-border);
}
.cm.v2 .solara-checkout-order-panel h2 {
  margin: .35rem 0 .75rem;
  font-family: var(--solara-font-display, Georgia, "Times New Roman", serif);
  font-size: calc(clamp(1.8rem, 4vw, 3rem) * var(--solara-type-scale, 1));
  font-weight: 500;
  letter-spacing: -.06em;
  line-height: .95;
}
.cm.v2 .solara-checkout-order-panel > p:not(.solara-eyebrow) {
  max-width: 34rem;
  color: var(--catalog-muted);
}
.cm.v2 .solara-checkout-order-panel pre {
  min-height: 10rem;
  margin: 2rem 0;
  padding: 1.25rem 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  border-block: 1px solid var(--catalog-border);
  color: var(--catalog-ink);
  font: inherit;
}
.cm.v2 .solara-checkout-order-panel pre:empty {
  display: none;
}
@media (max-width: 1199px) {
  .cm.v2 .solara-search-results-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .cm.v2 .catalog-hero-inner {
    grid-template-columns: minmax(17rem, 1.5fr) minmax(0, 1fr);
    height: auto;
    min-height: 0;
  }
  .cm.v2 .catalog-hero-copy {
    padding: clamp(1.75rem, 3vw, 2.5rem) clamp(1.25rem, 2.5vw, 2rem);
  }
  .cm.v2 .catalog-hero-copy h1 {
    font-size: calc(clamp(3.6rem, 7vw, 5.5rem) * var(--solara-type-scale, 1));
  }
  .cm.v2 .catalog-hero-benefits {
    gap: .5rem .5rem;
  }
  .cm.v2 .catalog-hero-benefit {
    gap: .5rem;
  }
  .cm.v2 .catalog-hero-benefit-icon {
    width: 18px;
    height: 18px;
  }
  .cm.v2 .catalog-hero-benefit-copy strong {
    font-size: .8rem;
  }
  .cm.v2 .catalog-hero-benefit-copy small {
    font-size: .68rem;
  }
  .cm.v2 .catalog-hero-benefit + .catalog-hero-benefit {
    padding-left: .6rem;
  }
  .cm.v2 .catalog-testimonials-track {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .cm.v2 .catalog-category-bento-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .cm.v2 .catalog-product-detail-inner {
    grid-template-columns: 1fr 1fr;
    gap: 3rem;
  }
  .cm.v2 .catalog-product-info {
    position: static;
  }
}
/* En tablet el hero editorial conserva una única composición hasta 1199px:
   copy y media en carriles propios, con los beneficios en una banda aparte. */
@media (min-width: 768px) and (max-width: 1199px) {
  .cm.v2 .catalog-hero-editorial .catalog-hero-inner {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(15rem, min(42vw, 26rem));
    width: min(calc(100% - 3rem), var(--catalog-v2-wide));
    height: auto;
    min-height: 0;
  }
  .cm.v2 .catalog-hero-editorial [data-hero-media] {
    position: relative;
    inset: auto;
    width: 100%;
    height: auto;
    min-height: 0;
    aspect-ratio: 9 / 16;
    margin: 0;
    border-radius: var(--catalog-v2-radius);
  }
  .cm.v2 .catalog-hero-editorial [data-hero-media]::after {
    display: none;
  }
  .cm.v2 .catalog-hero-editorial .catalog-hero-copy {
    color: var(--catalog-ink);
  }
  .cm.v2 .catalog-hero-editorial .catalog-hero-copy .catalog-hero-body {
    color: var(--catalog-muted);
  }
  .cm.v2 .catalog-hero-editorial .catalog-hero-benefits--copy {
    display: none;
  }
  .cm.v2 .catalog-hero-editorial [data-hero-background] {
    display: none;
  }
  .cm.v2 [data-solara-module="catalog-hero"].catalog-hero-editorial .catalog-hero-benefits--band {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: calc(.75rem * var(--catalog-v2-space, 1));
    width: min(calc(100% - 3rem), var(--catalog-v2-wide));
    margin: 1rem auto 1.75rem;
    padding: 0;
  }
  .cm.v2 [data-solara-module="catalog-hero"].catalog-hero-editorial .catalog-hero-benefits--band .catalog-hero-benefit {
    gap: .65rem;
  }
  .cm.v2 [data-solara-module="catalog-hero"].catalog-hero-editorial .catalog-hero-benefits--band .catalog-hero-benefit + .catalog-hero-benefit {
    padding-left: .75rem;
  }
}
@media (max-width: 767px) {
  .cm.v2 .catalog-header-inner {
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: .75rem;
    min-height: 64px;
  }
  .cm.v2 .catalog-header-inner,
  .cm.v2 .catalog-hero-inner,
  .cm.v2 .catalog-brand-strip-inner,
  .cm.v2 .catalog-product-grid-section,
  .cm.v2 .catalog-category-bento-section,
  .cm.v2 .catalog-testimonials-section,
  .cm.v2 .catalog-footer-inner,
  .cm.v2 .catalog-newsletter-inner,
  .cm.v2 .catalog-product-detail,
  .cm.v2 .catalog-product-tabs,
  .cm.v2 .catalog-product-reviews,
  .cm.v2 .catalog-category-page,
  .cm.v2 .solara-search-page,
  .cm.v2 .solara-cart-page,
  .cm.v2 .solara-checkout-page,
  .cm.v2 .solara-editorial-page,
  .cm.v2 .solara-error-page,
  .cm.v2 .solara-home-contact {
    width: min(calc(100% - 1.5rem), var(--catalog-v2-wide));
  }
  .cm.v2 .catalog-hero-inner {
    display: flex;
    height: auto;
    min-height: 0;
    margin-top: 0;
  }
  .cm.v2 .catalog-hero-copy {
    min-height: 0;
    padding: 2.75rem 1rem 2rem;
  }
  .cm.v2 .catalog-hero-copy h1 {
    max-width: 100%;
    font-size: calc(clamp(2.3rem, 9vw, 3.4rem) * var(--solara-type-scale, 1));
  }
  .cm.v2 .catalog-hero-media {
    min-height: 42svh;
  }
  /* Editorial en mobile: la foto es el fondo full-bleed del hero con scrim,
     el copy queda encima y los beneficios bajan a una banda debajo. */
  .cm.v2 .catalog-hero-editorial .catalog-hero-inner {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    width: 100%;
    min-height: 82svh;
  }
  .cm.v2 .catalog-hero-editorial [data-hero-media] {
    position: absolute;
    inset: 0;
    z-index: 0;
    width: 100%;
    height: 100%;
    min-height: 0;
    aspect-ratio: auto;
    border-radius: 0;
  }
  .cm.v2 .catalog-hero-editorial [data-hero-media]::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 1;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--catalog-ink) 14%, transparent) 0%,
      color-mix(in srgb, var(--catalog-ink) 30%, transparent) 45%,
      color-mix(in srgb, var(--catalog-ink) 76%, transparent) 100%
    );
    pointer-events: none;
  }
  .cm.v2 .catalog-hero-editorial .catalog-hero-copy {
    position: relative;
    z-index: 2;
    padding: 4.5rem 1.25rem 2.25rem;
    color: var(--catalog-paper);
  }
  .cm.v2 .catalog-hero-editorial .catalog-hero-copy .catalog-hero-body {
    color: var(--catalog-paper);
  }
  .cm.v2 .catalog-hero-editorial .catalog-hero-benefits--copy {
    display: none;
  }
  .cm.v2 .catalog-hero-editorial [data-hero-background] {
    display: none;
  }
  .cm.v2 [data-solara-module="catalog-hero"].catalog-hero-editorial .catalog-hero-benefits--band {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: .75rem;
    width: min(calc(100% - 1.5rem), var(--catalog-v2-wide));
    margin: .75rem auto 1.5rem;
    padding: 0;
  }
  .cm.v2 [data-solara-module="catalog-hero"].catalog-hero-editorial .catalog-hero-benefits--band .catalog-hero-benefit {
    gap: .65rem;
  }
  .cm.v2 [data-solara-module="catalog-hero"].catalog-hero-editorial .catalog-hero-benefits--band .catalog-hero-benefit + .catalog-hero-benefit {
    padding-left: 0;
    border-left: 0;
  }
  .cm.v2 [data-solara-module="catalog-hero"].catalog-hero-editorial .catalog-hero-benefits--band .catalog-hero-benefit-copy {
    gap: .25rem;
  }
  .cm.v2 [data-solara-module="catalog-hero"].catalog-hero-editorial .catalog-hero-benefits--band .catalog-hero-benefit-copy small {
    line-height: 1.35;
  }
  /* El padding-block móvil de 3.25rem de estas secciones y del bento quedó
     invalidado por la regla de secciones con var(--solara-section-y); se
     elimina. El bento hereda padding-inline: 0 de su regla base. */
  .cm.v2 .catalog-product-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 2rem .7rem;
  }
  .cm.v2 .catalog-testimonials-track {
    grid-template-columns: 1fr;
  }
  .cm.v2 .catalog-category-results .catalog-product-grid {
    grid-template-columns: repeat(2,1fr);
  }
  .cm.v2 .catalog-product-card:hover {
    transform: none;
  }
  .cm.v2 .catalog-footer-meta {
    justify-content: center;
    text-align: center;
  }
  .cm.v2 .catalog-footer-meta .catalog-footer-made {
    text-align: center;
  }
  .cm.v2 .catalog-filter-toggle:not([open]) + .catalog-filter-groups {
    display: none;
  }
  .cm.v2 .catalog-filter-toggle[open] .catalog-filter-disclosure{transform:rotate(180deg)}
  .cm.v2 .catalog-category-filters:has(details[open]) {
    position: fixed;
    z-index: 52;
    inset: auto 0 0;
    width: 100%;
    max-height: 88dvh;
    padding: 1rem 1rem calc(1.25rem + env(safe-area-inset-bottom));
    overflow-y: auto;
    border: 1px solid var(--catalog-border);
    border-bottom: 0;
    border-radius: var(--catalog-v2-radius) var(--catalog-v2-radius) 0 0;
    background: var(--catalog-paper);
    box-shadow: var(--catalog-v2-shadow-overlay), 0 0 0 100vmax color-mix(in srgb, var(--catalog-ink), transparent 50%);
  }
  .cm.v2 .catalog-category-bento-item > span:not(.solara-category-placeholder) {
    max-width: calc(100% - .8rem);
    margin: .4rem;
    padding: .55rem .85rem;
    font-family: var(--solara-font-body, Arial, sans-serif);
    font-size: .82rem;
    font-weight: 600;
    letter-spacing: -.02em;
    line-height: 1.16;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .cm.v2 .catalog-category-bento-item .catalog-category-bento-title {
    display: block;
    max-width: 100%;
    overflow-wrap: anywhere;
  }
  .cm.v2 .catalog-product-detail,
  .cm.v2 .catalog-product-tabs,
  .cm.v2 .catalog-product-reviews {
    width: min(calc(100% - 1.5rem), var(--catalog-v2-wide));
  }
  .cm.v2 .catalog-product-info {
    position: static;
  }
  .cm.v2 .catalog-product-info h1 {
    max-width: 10ch;
    font-size: calc(clamp(3.1rem, 15vw, 5.5rem) * var(--solara-type-scale, 1));
  }
  .cm.v2 .solara-search-page .solara-page-intro { padding: 2.5rem 0 1.25rem; }
  .cm.v2 .solara-page-intro h1 {
    font-size: calc(clamp(3.25rem, 14vw, 5.2rem) * var(--solara-type-scale, 1));
  }
  .cm.v2 .solara-category-hero h1 {
    max-width: 14ch;
    font-size: calc(clamp(2.1rem, 8.5vw, 3.6rem) * var(--solara-type-scale, 1));
    line-height: 1.05;
  }
  .cm.v2 .catalog-category-layout { grid-template-columns: 1fr; }
  .cm.v2 .solara-search-page .solara-page-intro h1,
  .cm.v2 .solara-cart-page > .solara-page-intro h1 { font-size: calc(clamp(3.15rem, 13.5vw, 4.25rem) * var(--solara-type-scale, 1)); line-height: .98; }
  .cm.v2 .solara-search-page .solara-page-intro > p:not(.solara-eyebrow) { margin-top: .85rem; }
  .cm.v2 .solara-search-form { margin-top: 1.75rem; }
  .cm.v2 .solara-search-form > div { grid-template-columns: minmax(0, 1fr); }
  .cm.v2 .solara-search-form .solara-primary-action { width: 100%; }
  .cm.v2 .solara-search-results { min-height: 14rem; padding-block: 2.5rem 4rem; }
  .cm.v2 .solara-search-results > p:only-child { margin-inline: 0; font-size: 1.55rem; text-align: left; }
  .cm.v2 .solara-search-results-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2rem .7rem; }
  .cm.v2 .solara-cart-page > .solara-page-intro { padding: 2.5rem 0 1rem; }
  .cm.v2 .solara-cart-page-grid { grid-template-columns: minmax(0, 1fr); gap: 3rem; padding: 1.5rem 0 4rem; }
  .cm.v2 .solara-cart-page-grid > aside { position: static; padding: 2rem 0 0; border: 0; }
  .cm.v2 .solara-cart-summary > p strong,
  .cm.v2 .solara-cart-page-grid aside strong { max-width: 55%; font-size: 1rem; }
  .cm.v2 .solara-cart-summary > p:nth-of-type(3) strong { font-size: 1.25rem; }
  .cm.v2 .solara-cart-page-grid [data-cart-lines] .solara-cart-line { grid-template-columns: minmax(0, 1fr) auto; gap: .75rem 1rem; }
  .cm.v2 .solara-cart-page-grid [data-cart-lines] .solara-cart-line > div:first-child { grid-column: 1 / -1; grid-template-columns: 4.5rem minmax(0, 1fr); gap: .75rem; }
  .cm.v2 .solara-cart-page-grid [data-cart-lines] .solara-cart-line img { width: 4.5rem; height: 4.5rem; }
  .cm.v2 .solara-cart-page-grid [data-cart-lines] .solara-cart-line > label { grid-column: 1; grid-row: 2; width: 7rem; }
  .cm.v2 .solara-cart-page-grid [data-cart-lines] .solara-cart-line > button { grid-column: 2; grid-row: 3; }
  .cm.v2 .solara-cart-page-grid [data-cart-lines] .solara-cart-line > span:last-child { grid-column: 2; grid-row: 2; justify-self: end; }
  .cm.v2 .solara-checkout-page h1 {
    max-width: 10ch;
    font-size: calc(clamp(3.25rem, 14vw, 5rem) * var(--solara-type-scale, 1));
  }
  .cm.v2 .solara-checkout-form-v2 {
    grid-template-columns: minmax(0, 1fr);
    gap: 3.5rem;
    padding-top: 1rem;
  }
  .cm.v2 .solara-checkout-fields .solara-primary-action {
    width: 100%;
  }
  .cm.v2 .solara-checkout-order-panel {
    position: static;
    padding: 3rem 0 0;
    border-top: 1px solid var(--catalog-border);
    border-left: 0;
  }
  .cm.v2 .catalog-cart-drawer {
    inset: 0;
    width: 100%;
    height: 100dvh;
    max-height: 100dvh;
    border-radius: 0;
    transform: translateY(105%);
  }
  .cm.v2 .catalog-cart-drawer[data-open="true"] {
    transform: translateY(0);
  }
  .cm.v2 .catalog-cart-summary {
    padding-inline: 0;
    border-top: 0;
  }
  .cm.v2 .catalog-cart-summary > p:nth-child(2) {
    justify-items: end;
    text-align: right;
  }
  .cm.v2 .catalog-cart-summary .catalog-cart-total,
  .cm.v2 .catalog-cart-drawer .catalog-drawer-footer {
    border-top: 0;
  }
  .cm.v2 [data-solara-module="catalog-hero"]{--hero-v2-dur-eyebrow:var(--catalog-v2-motion-component);--hero-v2-dur-title:var(--catalog-v2-motion-component);--hero-v2-dur-line:var(--catalog-v2-motion-component);--hero-v2-dur-rule:var(--catalog-v2-motion-component);--hero-v2-dur-body:var(--catalog-v2-motion-component);--hero-v2-dur-actions:var(--catalog-v2-motion-component);--hero-v2-dur-benefit:var(--catalog-v2-motion-component);--hero-v2-dur-media:var(--catalog-v2-motion-editorial);--hero-v2-dur-zoom:var(--catalog-v2-motion-editorial)}
  .cm.v2 [data-solara-module="catalog-hero"][data-motion-visible="true"] .catalog-hero-reveal--eyebrow{--hero-v2-rise:7px}
  .cm.v2 [data-solara-module="catalog-hero"][data-motion-visible="true"] .catalog-hero-title{--hero-v2-rise:-5px}
  .cm.v2 [data-solara-module="catalog-hero"][data-motion-visible="true"] .catalog-hero-reveal--body,.cm.v2 [data-solara-module="catalog-hero"][data-motion-visible="true"] .catalog-hero-benefit{--hero-v2-rise:8px}
  .cm.v2 [data-solara-module="catalog-hero"][data-motion-visible="true"] .catalog-hero-reveal--actions{--hero-v2-rise:9px}
  .cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-benefits{grid-template-columns:1fr;gap:1rem}
  .cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-benefit + .catalog-hero-benefit{border-left:0;padding-left:0}
}
@media (min-width: 600px) and (max-width: 767px) {
  .cm.v2 .catalog-cart-drawer {
    inset: 0 0 0 auto;
    width: min(520px, calc(100% - 3rem));
    height: 100dvh;
    max-height: 100dvh;
    transform: translateX(105%);
  }
  .cm.v2 .catalog-cart-drawer[data-open="true"] {
    transform: translateX(0);
  }
}
@media (max-width: 599px) {
  .cm.v2 .catalog-cart-drawer {
    padding: 1rem;
  }
  .cm.v2 .catalog-cart-drawer header {
    padding-bottom: .75rem;
  }
  .cm.v2 .catalog-cart-drawer header h2 {
    font-size: clamp(2rem, 11vw, 2.5rem);
  }
  .cm.v2 .catalog-cart-items {
    gap: 0;
    padding-block: .45rem;
  }
  .cm.v2 .catalog-cart-items .solara-cart-line {
    gap: .45rem .6rem;
    padding: .65rem 0;
  }
  .cm.v2 .catalog-cart-items .solara-cart-line > div:first-child {
    grid-template-columns: 3rem minmax(0, 1fr);
    gap: .6rem;
  }
  .cm.v2 .catalog-cart-items .solara-cart-line img {
    width: 3rem;
    height: 3rem;
  }
  .cm.v2 .catalog-cart-items .solara-cart-line strong {
    font-size: .9rem;
    line-height: 1.2;
    text-wrap: pretty;
  }
  .cm.v2 .catalog-cart-items .solara-cart-line small {
    font-size: .7rem;
  }
  .cm.v2 .catalog-cart-items .solara-cart-line input {
    width: 4.25rem;
    min-height: 44px;
  }
  .cm.v2 .catalog-cart-items .solara-cart-line > button {
    min-width: 44px;
    min-height: 44px;
  }
  .cm.v2 .catalog-cart-summary {
    gap: .4rem .75rem;
    padding-top: .6rem;
  }
  .cm.v2 .catalog-cart-summary > p {
    font-size: .72rem;
  }
  .cm.v2 .catalog-cart-summary .catalog-cart-total {
    padding-top: .4rem;
    font-size: .9rem;
  }
  .cm.v2 .catalog-cart-checkout-intro {
    margin-bottom: .25rem;
    font-size: .76rem;
  }
  .cm.v2 .catalog-cart-drawer .catalog-drawer-footer {
    margin-top: .35rem;
    padding-top: .5rem;
  }
}
/* En resultados de búsqueda y categoría, una columna conserva el detalle en
   retratos mínimos. La grilla destacada de Home mantiene dos columnas para no
   duplicar el largo de la portada por un solo píxel. */
@media (max-width: 339px) {
  .cm.v2 .catalog-category-results .catalog-product-grid,
  .cm.v2 .catalog-search-results-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .cm.v2 [data-solara-module="catalog-product-grid"] .catalog-product-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap-inline: .5rem;
  }
  .cm.v2 [data-solara-module="catalog-product-grid"] > .catalog-product-grid-section {
    width: min(calc(100% - .75rem), var(--catalog-v2-wide));
  }
}
/* Contacto vive únicamente como sección de Home. */
.cm.v2 .solara-home-contact {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(18rem, 1fr);
  gap: 0 clamp(2rem, 5vw, 5rem);
  width: min(calc(100% - 3rem), var(--catalog-v2-wide));
  margin-inline: auto;
}
.cm.v2 .solara-home-contact > [data-solara-module] {
  min-width: 0;
  border-top: 0;
}
.cm.v2 .solara-home-contact > [data-solara-module="contact-form"] {
  grid-column: 1;
}
.cm.v2 .solara-home-contact > [data-solara-module="contact-channels"] {
  grid-column: 2;
}
.cm.v2 .solara-home-contact > [data-solara-module] > .contact-main-grid,
.cm.v2 .solara-home-contact > [data-solara-module] > .contact-channels {
  border-top: 0;
}
.cm.v2 .contact-channel-row {
  display: grid;
  grid-template-columns: 1.5rem minmax(0, 1fr) auto;
  align-items: center;
  gap: .75rem;
  min-height: 4.4rem;
  border-top: 1px solid var(--catalog-border);
  color: var(--catalog-ink);
  text-decoration: none;
}
.cm.v2 .contact-channel-row:last-child {
  border-bottom: 1px solid var(--catalog-border);
}
.cm.v2 .solara-contact-icon {
  display: inline-grid;
  place-items: center;
  width: 1.3rem;
  height: 1.3rem;
}
.cm.v2 .solara-contact-icon svg {
  width: 100%;
  height: 100%;
}
.cm.v2 .contact-channel-row > span:nth-child(2) {
  display: grid;
  gap: .25rem;
  min-width: 0;
}
.cm.v2 .contact-channel-row small {
  color: var(--catalog-muted);
  font-size: .78rem;
  line-height: 1.35;
}
.cm.v2 .contact-main-grid,
.cm.v2 .contact-channels {
  min-width: 0;
  margin: 0;
  padding-block: clamp(2.5rem, 5vw, 4rem);
  border-top: 1px solid var(--catalog-border);
}
.cm.v2 .contact-main-grid h2,
.cm.v2 .contact-channels h2 {
  margin: 0 0 .45rem;
  font-family: var(--solara-font-display, Georgia, "Times New Roman", serif);
  font-size: clamp(1.7rem, 3vw, 2.5rem);
  font-weight: 500;
  letter-spacing: -.04em;
}
.cm.v2 .contact-main-grid > p,
.cm.v2 .contact-form > p,
.cm.v2 .contact-channels > header p {
  margin: 0 0 1.5rem;
  color: var(--catalog-muted);
}
.cm.v2 .contact-form-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: .75rem 1rem;
}
.cm.v2 .contact-form-fields label {
  display: grid;
  gap: .25rem;
  color: var(--catalog-ink);
  font-size: .76rem;
  font-weight: 600;
}
.cm.v2 .contact-form-fields label.contact-form-message {
  grid-column: 1 / -1;
}
.cm.v2 .contact-form-fields input,
.cm.v2 .contact-form-fields select,
.cm.v2 .contact-form-fields textarea {
  width: 100%;
  min-height: 2.8rem;
  padding: .75rem .75rem;
  border: 1px solid var(--catalog-border);
  border-radius: 0;
  background: var(--catalog-paper);
  color: var(--catalog-ink);
  font: inherit;
}
.cm.v2 .contact-form-fields textarea {
  resize: vertical;
}
.cm.v2 .contact-form .catalog-primary-action {
  margin-top: 0;
}
.cm.v2 .contact-form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: .75rem;
  margin-top: 1.2rem;
}
.cm.v2 .contact-form-actions .catalog-primary-action {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: .5rem;
  overflow: hidden;
  isolation: isolate;
  margin-top: 0;
}
.cm.v2 .contact-form-actions .contact-form-whatsapp {
  background: var(--catalog-ink);
  color: var(--catalog-paper);
}
.cm.v2 .contact-form-actions .catalog-primary-action::before {
  position: absolute;
  z-index: -1;
  inset: 0;
  background: color-mix(in srgb, var(--solara-accent) 82%, var(--solara-accent-text));
  content: "";
  transform: translateY(101%);
  transition: transform var(--catalog-v2-motion-control) var(--catalog-v2-ease-out);
}
.cm.v2 .contact-form-actions .contact-form-whatsapp::before {
  background: color-mix(in srgb, var(--catalog-ink) 82%, var(--catalog-paper));
}
.cm.v2 .contact-form-actions .catalog-primary-action:hover,
.cm.v2 .contact-form-actions .catalog-primary-action:focus-visible {
  transform: none;
  box-shadow: none;
}
.cm.v2 .contact-form-actions .contact-form-whatsapp:hover,
.cm.v2 .contact-form-actions .contact-form-whatsapp:focus-visible {
  background: var(--catalog-ink);
}
.cm.v2 .contact-form-actions .catalog-primary-action:hover::before,
.cm.v2 .contact-form-actions .catalog-primary-action:focus-visible::before {
  transform: translateY(0);
}
.cm.v2 .contact-form-actions .catalog-hero-cta-label,
.cm.v2 .contact-form-actions .catalog-hero-cta-icon {
  transition: color var(--catalog-v2-motion-control), transform var(--catalog-v2-motion-control) var(--catalog-v2-ease-out);
}
.cm.v2 .contact-form-actions .catalog-hero-cta-icon {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.cm.v2 .contact-form-actions .catalog-primary-action:hover .catalog-hero-cta-label,
.cm.v2 .contact-form-actions .catalog-primary-action:focus-visible .catalog-hero-cta-label,
.cm.v2 .contact-form-actions .catalog-primary-action:hover .catalog-hero-cta-icon,
.cm.v2 .contact-form-actions .catalog-primary-action:focus-visible .catalog-hero-cta-icon {
  color: color-mix(in srgb, var(--solara-accent-text) 80%, var(--catalog-paper) 20%);
}
.cm.v2 .contact-form-actions .contact-form-whatsapp:hover .catalog-hero-cta-label,
.cm.v2 .contact-form-actions .contact-form-whatsapp:focus-visible .catalog-hero-cta-label,
.cm.v2 .contact-form-actions .contact-form-whatsapp:hover .catalog-hero-cta-icon,
.cm.v2 .contact-form-actions .contact-form-whatsapp:focus-visible .catalog-hero-cta-icon {
  color: color-mix(in srgb, var(--catalog-paper) 80%, var(--catalog-ink) 20%);
}
.cm.v2 .contact-form-fallback:not(.catalog-primary-action),
.cm.v2 .contact-form noscript {
  display: block;
  margin-top: .75rem;
  color: var(--catalog-muted);
  font-size: .78rem;
}
.cm.v2 .contact-form-status {
  min-height: 1.2em;
  margin: .75rem 0 0;
  color: var(--catalog-muted);
  font-size: .78rem;
}
.cm.v2 .contact-form-status:empty {
  display: none;
}
.cm.v2 .contact-channel-list {
  display: grid;
}
.cm.v2 .contact-channel-row {
  min-height: 4.7rem;
}
.cm.v2 [data-solara-module="contact-channels"] > .contact-channels {
  border-top: 0;
}
.cm.v2 [data-solara-module="contact-channels"] .contact-channel-row,
.cm.v2 [data-solara-module="contact-channels"] .contact-channel-row:last-child {
  border-top: 0;
  border-bottom: 0;
}
.cm.v2 .contact-channel-row > span:last-child {
  color: var(--catalog-ink);
  transition: color var(--catalog-v2-motion-control), transform var(--catalog-v2-motion-control) var(--catalog-v2-ease-out);
}
.cm.v2 .contact-channel-row:hover > span:last-child,
.cm.v2 .contact-channel-row:focus-visible > span:last-child {
  color: var(--solara-accent);
  transform: translateX(3px);
}
@media (max-width: 767px) {
  .cm.v2 [data-solara-module="contact-channels"] .contact-channel-list {
    row-gap: calc(.75rem * var(--catalog-v2-space, 1));
  }
  .cm.v2 [data-solara-module="contact-channels"] .contact-channel-row {
    padding-block: .15rem;
  }
}
.cm.v2 [data-solara-module="contact-form"][data-motion-visible="true"] .contact-main-grid,
.cm.v2 [data-solara-module="contact-channels"][data-motion-visible="true"] .contact-channels {
  --hero-v2-rise: 16px;
  animation: solara-hero-rise var(--catalog-v2-motion-component) var(--catalog-v2-ease-out) 60ms backwards;
}
@media (max-width: 1199px) {
  .cm.v2 .solara-home-contact {
    width: min(calc(100% - 1.5rem), var(--catalog-v2-wide));
    grid-template-columns: minmax(0, 1fr);
  }
  .cm.v2 .solara-home-contact > [data-solara-module="contact-form"],
  .cm.v2 .solara-home-contact > [data-solara-module="contact-channels"] {
    grid-column: 1;
  }
  .cm.v2 .contact-form-fields {
    grid-template-columns: minmax(0, 1fr);
  }
  .cm.v2 .contact-form-fields label.contact-form-message {
    grid-column: auto;
  }
  .cm.v2 .contact-form-actions {
    flex-direction: column;
  }
  .cm.v2 .contact-form-actions .catalog-primary-action {
    width: 100%;
  }
}
/* Los listados cortos no deben convertir una sola tarjeta en una portada. */
.cm.v2 .catalog-product-grid[data-product-count="1"] {
  grid-template-columns: minmax(0, 20rem);
  justify-content: start;
}
.cm.v2 .catalog-product-grid[data-product-count="2"] {
  grid-template-columns: repeat(2, minmax(0, 20rem));
  justify-content: space-between;
}
.cm.v2 .catalog-product-grid[data-product-count="3"] {
  grid-template-columns: repeat(3, minmax(0, 20rem));
  justify-content: space-between;
}
.cm.v2 .catalog-product-grid[data-product-count="4"] {
  grid-template-columns: repeat(4, minmax(0, 20rem));
  justify-content: space-between;
}
@media (max-width: 1199px) {
  .cm.v2 .catalog-product-grid[data-product-count="3"] {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .cm.v2 .catalog-product-grid[data-product-count="4"] {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 767px) {
  .cm.v2 .catalog-hero-editorial .catalog-hero-inner {
    min-height: 90svh;
  }
  .cm.v2 .catalog-product-grid[data-product-count="1"] {
    grid-template-columns: minmax(0, min(17rem, 100%));
    justify-content: center;
  }
  .cm.v2 .catalog-product-grid[data-product-count="2"],
  .cm.v2 .catalog-product-grid[data-product-count="3"],
  .cm.v2 .catalog-product-grid[data-product-count="4"] {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    justify-content: stretch;
  }
  .cm.v2 .catalog-product-detail-shell,
  .cm.v2 .catalog-product-detail-inner,
  .cm.v2 .catalog-product-info,
  .cm.v2 .catalog-product-gallery,
  .cm.v2 .catalog-product-tabs,
  .cm.v2 [data-product-tab-panel] {
    min-width: 0;
    max-width: 100%;
    box-sizing: border-box;
  }
  /* En columna móvil la info es ítem flex: align-self:start la encogería a su
     contenido y dejaría un hueco a la derecha. En desktop (grid) no aplica. */
  .cm.v2 .catalog-product-info {
    align-self: stretch;
  }
  .cm.v2 .catalog-product-tabs {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
    overflow: hidden;
  }
  .cm.v2 .catalog-product-tabs button {
    min-width: 0;
    padding-inline: .35rem;
    overflow-wrap: anywhere;
    white-space: normal;
    text-align: center;
  }
  .cm.v2 [data-product-tab-panel],
  .cm.v2 [data-product-tab-panel] p,
  .cm.v2 [data-product-tab-panel] dd,
  .cm.v2 [data-product-tab-panel] summary {
    max-width: 100%;
    overflow-wrap: anywhere;
  }
}
@media (max-width: 767px) {
  .cm.v2 .catalog-header-inner,
  .cm.v2 .catalog-hero-inner,
  .cm.v2 .catalog-brand-strip-inner,
  .cm.v2 .catalog-product-grid-section,
  .cm.v2 .catalog-category-bento-section,
  .cm.v2 .catalog-testimonials-section,
  .cm.v2 .catalog-footer-inner,
  .cm.v2 .catalog-newsletter-inner,
  .cm.v2 .catalog-product-detail,
  .cm.v2 .catalog-product-tabs,
  .cm.v2 .catalog-product-reviews,
  .cm.v2 .catalog-category-page,
  .cm.v2 .solara-search-page,
  .cm.v2 .solara-cart-page,
  .cm.v2 .solara-checkout-page,
  .cm.v2 .solara-editorial-page,
  .cm.v2 .solara-error-page,
  .cm.v2 .solara-home-contact {
    width: min(calc(100% - 1.5rem), var(--catalog-v2-wide));
  }
  .cm.v2 .catalog-brand {
    width: fit-content;
    min-width: 0;
    max-width: 100%;
    justify-self: start;
    overflow: hidden;
    overflow-wrap: normal;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cm.v2 .catalog-mobile-brand {
    min-width: 0;
    max-width: min(68vw, 16rem);
    overflow-wrap: anywhere;
    white-space: normal;
  }
  .cm.v2 .catalog-brand .solara-wordmark {
    white-space: nowrap;
    overflow-wrap: normal;
    text-overflow: ellipsis;
    overflow: hidden;
  }
  .cm.v2 .catalog-mobile-brand .solara-wordmark {
    white-space: normal;
    overflow-wrap: anywhere;
    text-overflow: clip;
    overflow: visible;
  }
@media (max-width: 767px) {
  .cm.v2 .catalog-footer-inner {
    grid-template-columns: minmax(0, 1fr);
    gap: 1.5rem;
  }
  .cm.v2 .catalog-category-bento-item > span:not(.solara-category-placeholder) {
    max-width: calc(100% - .8rem);
    margin: .4rem;
    padding: .55rem .85rem;
    font-family: var(--solara-font-body, Arial, sans-serif);
    font-size: .82rem;
    font-weight: 600;
    letter-spacing: -.02em;
    line-height: 1.16;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}
  @media (max-width: 767px) {
    .cm.v2 .catalog-category-filters {
      position: static;
      top: auto;
      max-height: none;
      overflow: visible;
    }
  }
  .cm.v2 .catalog-category-filters:hover,
  .cm.v2 .catalog-category-filters.solara-search-filters:hover {
    border-color: var(--solara-accent);
  }
  .cm.v2 .catalog-category-filters:active,
  .cm.v2 .catalog-category-filters:focus,
  .cm.v2 .catalog-category-filters:focus-within,
  .cm.v2 .catalog-category-filters.solara-search-filters:active,
  .cm.v2 .catalog-category-filters.solara-search-filters:focus,
  .cm.v2 .catalog-category-filters.solara-search-filters:focus-within {
    border-color: var(--catalog-border);
    outline: none !important;
    box-shadow: none !important;
  }
  .cm.v2 .catalog-category-filters:hover {
      border-color: var(--solara-accent);
    }
  .cm.v2 .catalog-category-filters:active,
  .cm.v2 .catalog-category-filters:focus,
  .cm.v2 .catalog-category-filters:focus-within {
    border-color: var(--catalog-border);
    outline: none !important;
    box-shadow: none !important;
  }
  .cm.v2 .catalog-hero-editorial .catalog-hero-copy {
    min-width: 0;
    padding: 3.5rem .75rem 1.5rem;
  }
  .cm.v2 .catalog-hero-editorial .catalog-hero-copy h1 {
    max-width: 10ch;
    font-size: calc(clamp(2.65rem, 12.5vw, 4.2rem) * var(--solara-type-scale, 1));
    line-height: 1.15;
    overflow-wrap: anywhere;
  }
  .cm.v2 .catalog-hero-editorial .catalog-hero-body {
    max-width: 29ch;
    font-size: .94rem;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
  .cm.v2 .catalog-hero-actions,
  .cm.v2 .catalog-hero-actions .catalog-primary-action {
    width: 100%;
  }
  .cm.v2 .catalog-hero-actions .catalog-primary-action {
    justify-content: center;
  }
  .cm.v2 .catalog-category-bento-grid {
    gap: .5rem;
  }
  .cm.v2 .catalog-category-bento-item > span:not(.solara-category-placeholder) {
    max-width: calc(100% - .8rem);
    margin: .4rem;
    padding: .55rem .85rem;
    font-family: var(--solara-font-body, Arial, sans-serif);
    font-size: .82rem;
    font-weight: 600;
    letter-spacing: -.02em;
    line-height: 1.16;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .cm.v2 .catalog-category-bento-item small {
    right: .4rem;
    bottom: .4rem;
    font-size: .55rem;
  }
  .cm.v2 .catalog-product-grid {
    gap: 1.5rem .5rem;
  }
  .cm.v2 .catalog-product-card-copy {
    padding-top: .7rem;
  }
  .cm.v2 .catalog-product-card h3 {
    font-size: .82rem;
    line-height: 1.16;
  }
  .cm.v2 .catalog-product-category,
  .cm.v2 .catalog-product-rating span,
  .cm.v2 .catalog-discount {
    font-size: .62rem;
  }
  .cm.v2 .catalog-product-price {
    font-size: .82rem;
  }
  .cm.v2 .catalog-product-gallery {
    grid-template-columns: minmax(0, 1fr) 3rem;
    gap: .5rem;
  }
  .cm.v2 .catalog-product-info h1 {
    max-width: 100%;
    font-size: calc(clamp(2.35rem, 12vw, 3.8rem) * var(--solara-type-scale, 1));
    overflow-wrap: anywhere;
  }
  .cm.v2 .catalog-product-tabs button {
    min-height: 3.2rem;
    font-size: .66rem;
    line-height: 1.1;
  }
  .cm.v2 .catalog-footer-meta {
    align-items: center;
    flex-direction: column;
    gap: .5rem;
    text-align: center;
  }
  .cm.v2 .catalog-footer-meta > *,
  .cm.v2 .catalog-footer-meta .catalog-footer-made {
    flex: 0 1 auto;
    text-align: center;
  }
}
@media (max-width: 1199px) and (min-width: 768px) {
  .cm.v2 .catalog-footer-inner {
    grid-template-columns: repeat(auto-fit, minmax(min(12rem, 100%), 1fr));
    gap: 1.75rem 1.5rem;
  }
  .cm.v2 .catalog-footer-brand {
    grid-column: 1 / -1;
  }
  .cm.v2 .catalog-footer-inner address {
    grid-column: auto;
  }
}
@media (max-width: 767px) {
  .cm.v2 .catalog-footer-inner {
    grid-template-columns: repeat(auto-fit, minmax(min(12rem, 100%), 1fr));
    gap: 1.5rem 1rem;
    padding-top: clamp(2rem, 4.6vw, 4.6rem);
  }
  .cm.v2 .catalog-footer-brand {
    grid-column: 1 / -1;
  }
  .cm.v2 .catalog-footer-inner address {
    grid-column: auto;
  }
}
@media (max-width: 339px) {
  .cm.v2 .catalog-category-bento-item > span:not(.solara-category-placeholder) {
    max-width: calc(100% - .6rem);
    margin: .3rem;
    padding: .55rem .85rem;
    font-size: .78rem;
    display: block;
    overflow: visible;
    -webkit-line-clamp: unset;
  }
  .cm.v2 .catalog-category-bento-item .catalog-category-bento-title {
    display: block;
    overflow: visible;
    -webkit-box-orient: initial;
    -webkit-line-clamp: unset;
  }
}
@media (prefers-reduced-motion: reduce) {
    .cm.v2 [data-solara-module="catalog-header"],
    .cm.v2 [data-solara-module="catalog-hero"],
    .cm.v2 .catalog-product-card,
    .cm.v2 .catalog-product-card .catalog-product-media::before,
    .cm.v2 .catalog-product-card-image,
    .cm.v2 .catalog-category-bento-media::before,
    .cm.v2 .catalog-category-bento-item img,
    .cm.v2 [data-solara-module="catalog-testimonials"] .catalog-testimonials-section > header,
    .cm.v2 [data-solara-module="catalog-testimonials"] .catalog-testimonial,
    .cm.v2 [data-solara-module="catalog-footer"] .catalog-footer-inner,
    .cm.v2 [data-solara-module="catalog-footer"] .catalog-footer-meta,
  .cm.v2 [data-solara-module="contact-form"] .contact-main-grid,
  .cm.v2 [data-solara-module="contact-channels"] .contact-channels,
  .cm.v2 .catalog-hero-image,
  .cm.v2 .catalog-hero-video,
  .cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-reveal--eyebrow,
  .cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-title,
  .cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-line-inner,
  .cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-rule,
  .cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-reveal--body,
  .cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-reveal--actions,
  .cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-benefit,
  .cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-benefit-icon,
  .cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-cta-label,
  .cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-cta-icon,
  .cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-actions .catalog-primary-action,
  .cm.v2 [data-solara-module="catalog-hero"] [data-hero-media][data-motion-zone] {
    animation: none !important;
    transition: none !important;
    transform: none !important;
  }
  .cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-actions .catalog-primary-action::before {
    transition: none !important;
  }
}
  /* Héroes editoriales: mismo shell, escala y respiración que Inicio V2; sólo
     usan una imagen estática, nunca video. */
  .cm.v2 .catalog-hero-page .catalog-hero-inner {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0;
    width: 100%;
    height: auto;
    min-height: 0;
    margin: 0 auto;
    padding: 0;
    overflow: hidden;
    isolation: isolate;
    border-radius: 0;
    background: transparent;
  }
  .cm.v2 .catalog-hero-page .catalog-hero-copy {
    position: relative;
    z-index: 2;
    display: flex;
    min-width: 0;
    flex-direction: column;
    justify-content: center;
    padding: clamp(2rem, 3.4vw, 3.5rem) clamp(2rem, 3vw, 3.75rem) clamp(2rem, 3vw, 3rem) clamp(1rem, 3vw, 3.5rem);
    color: var(--catalog-ink);
  }
  .cm.v2 .catalog-hero-page .catalog-hero-copy h1 {
    max-width: 100%;
    margin: 0;
    font-family: var(--solara-font-display, Georgia, "Times New Roman", serif);
    font-size: calc(clamp(4.75rem, 6.4vw, 8rem) * var(--solara-type-scale, 1));
    font-weight: 500;
    letter-spacing: -.065em;
    line-height: 1.15;
    overflow-wrap: normal;
    hyphens: none;
    word-break: normal;
    text-wrap: balance;
  }
  .cm.v2 .catalog-hero-page .catalog-hero-copy .catalog-hero-body {
    max-width: 54ch;
    margin-top: 0;
    color: var(--catalog-muted);
    font-size: clamp(1.05rem, 1.2vw, 1.28rem);
    line-height: 1.62;
  }
  .cm.v2 .catalog-hero-page .catalog-hero-media {
    position: relative;
    z-index: 1;
    width: calc(min(90svh * 9 / 16, 45vw) + 2px);
    height: auto;
    aspect-ratio: 9 / 16;
    min-height: 0;
    margin: -1px -2px -1px 0;
    overflow: hidden;
    border-radius: var(--catalog-v2-radius);
  }
  .cm.v2 .catalog-hero-page .catalog-hero-media figure { height: 100%; margin: 0; line-height: 0; }
  .cm.v2 .catalog-hero-page .catalog-hero-media figure > * { width: 100%; height: 100%; object-fit: cover; }
  .cm.v2 .catalog-hero-page .catalog-hero-video { display: none !important; }
  .cm.v2 .catalog-hero-page .catalog-hero-background { position: absolute; z-index: 0; inset: 0; overflow: hidden; pointer-events: none; }
  .cm.v2 .catalog-hero-page .catalog-hero-background img { width: 100%; height: 100%; object-fit: cover; filter: saturate(.92); transform: scale(1.01); }
  .cm.v2 .catalog-hero-page .catalog-hero-background::after { position: absolute; inset: 0; background: linear-gradient(90deg, color-mix(in srgb, var(--catalog-paper) 92%, transparent), color-mix(in srgb, var(--catalog-paper) 64%, transparent) 45%, color-mix(in srgb, var(--catalog-paper) 26%, transparent) 78%, transparent); content: ""; opacity: calc(.3 + var(--catalog-hero-bg-dark, .6) * .7); }
  .cm.v2 .catalog-hero-page .catalog-hero-benefits { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.5rem 2.25rem; margin: 2rem 0 1rem; padding: 0; list-style: none; }
  .cm.v2 .catalog-hero-page .catalog-hero-benefits--copy { align-self: stretch; margin-inline: 0; padding: .95rem 1.15rem; border: none; border-radius: 0; background: color-mix(in srgb, var(--catalog-paper) 38%, transparent); backdrop-filter: blur(14px); }
  .cm.v2 .catalog-hero-page .catalog-hero-benefits--band { display: none; }
  .cm.v2 .catalog-hero-page .catalog-hero-benefit { display: flex; align-items: center; gap: .75rem; min-width: 0; }
  .cm.v2 .catalog-hero-page .catalog-hero-benefit + .catalog-hero-benefit { padding-left: 1.25rem; border-left: none; }
  .cm.v2 .catalog-hero-page .catalog-hero-benefit-icon { flex: 0 0 auto; width: 22px; height: 22px; }
  .cm.v2 .catalog-hero-page .catalog-hero-benefit-copy { display: flex; min-width: 0; flex-direction: column; gap: .25rem; }
  .cm.v2 .catalog-hero-page .catalog-hero-benefit-copy small { color: var(--catalog-muted); }
  .cm.v2 .catalog-hero-page > .catalog-hero-inner[data-motion-zone],
  .cm.v2 .catalog-hero-page .catalog-hero-media[data-motion-zone]:not([data-solara-loaded]),
  .cm.v2 [data-solara-module^="contact-"]:not(.catalog-hero-page) [data-motion-zone] { animation: none !important; }
  .cm.v2 .catalog-hero-page[data-motion-visible="true"] .catalog-hero-reveal--eyebrow { --hero-v2-rise: 14px; animation: solara-hero-rise var(--hero-v2-dur-eyebrow, 380ms) var(--catalog-v2-ease-out) 60ms both; }
  .cm.v2 .catalog-hero-page[data-motion-visible="true"] .catalog-hero-title { --hero-v2-rise: -10px; animation: solara-hero-rise var(--hero-v2-dur-title, 380ms) var(--catalog-v2-ease-out) 100ms both; }
  .cm.v2 .catalog-hero-page[data-motion-visible="true"] .catalog-hero-line-inner { animation: solara-hero-line var(--hero-v2-dur-line, 560ms) var(--catalog-v2-ease-out) var(--hero-v2-line-delay, 120ms) both; }
  .cm.v2 .catalog-hero-page[data-motion-visible="true"] .catalog-hero-line:nth-child(2) .catalog-hero-line-inner { --hero-v2-line-delay: 190ms; }
  .cm.v2 .catalog-hero-page[data-motion-visible="true"] .catalog-hero-rule { animation: solara-hero-rule var(--hero-v2-dur-rule, 480ms) var(--catalog-v2-ease-out) 300ms both; }
  .cm.v2 .catalog-hero-page[data-motion-visible="true"] .catalog-hero-reveal--body { animation: solara-hero-rise var(--hero-v2-dur-body, 420ms) var(--catalog-v2-ease-out) 360ms both; }
  .cm.v2 .catalog-hero-page[data-motion-visible="true"] .catalog-hero-reveal--actions { --hero-v2-rise: 18px; animation: solara-hero-rise var(--hero-v2-dur-actions, 420ms) var(--catalog-v2-ease-out) 430ms both; }
  .cm.v2 .catalog-hero-page[data-motion-visible="true"] .catalog-hero-benefits--copy .catalog-hero-benefit { animation: solara-hero-rise var(--hero-v2-dur-benefit, 420ms) var(--catalog-v2-ease-out) var(--hero-v2-benefit-delay, 500ms) both; }
  .cm.v2 .catalog-hero-page[data-motion-visible="true"] .catalog-hero-benefits--copy .catalog-hero-benefit:nth-child(2) { --hero-v2-benefit-delay: 560ms; }
  .cm.v2 .catalog-hero-page[data-motion-visible="true"] .catalog-hero-benefits--copy .catalog-hero-benefit:nth-child(3) { --hero-v2-benefit-delay: 620ms; }
  .cm.v2 .catalog-hero-page[data-motion-visible="true"] .catalog-hero-image { animation: solara-hero-media-zoom var(--hero-v2-dur-zoom, 1200ms) var(--catalog-v2-ease-out) 80ms backwards; }
  @media (max-width: 767px) {
    .cm.v2 .catalog-hero-page .catalog-hero-inner {
      display: flex;
      width: 100%;
      height: auto;
      min-height: 82svh;
      margin: 0;
      flex-direction: column;
      justify-content: flex-end;
    }
    .cm.v2 .catalog-hero-page .catalog-hero-media {
      position: absolute;
      inset: 0;
      z-index: 0;
      width: 100%;
      height: 100%;
      min-height: 0;
      margin: 0;
      border-radius: 0;
    }
    .cm.v2 .catalog-hero-page .catalog-hero-media::after {
      position: absolute;
      z-index: 1;
      inset: 0;
      background: linear-gradient(180deg, color-mix(in srgb, var(--catalog-ink) 30%, transparent), color-mix(in srgb, var(--catalog-ink) 86%, transparent));
      content: "";
      pointer-events: none;
    }
    .cm.v2 .catalog-hero-page .catalog-hero-copy {
      position: relative;
      z-index: 2;
      padding: 4.5rem 1.25rem 2.25rem;
      color: var(--catalog-paper);
    }
    .cm.v2 .catalog-hero-page .catalog-hero-copy .catalog-hero-body { color: var(--catalog-paper); }
    .cm.v2 .catalog-hero-page .catalog-hero-copy .catalog-eyebrow,
    .cm.v2 [data-solara-module="catalog-hero"] .catalog-eyebrow { color: var(--catalog-surface); font-size: .68rem; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; }
    .cm.v2 .catalog-hero-page .catalog-hero-background { display: none; }
    .cm.v2 .catalog-hero-page .catalog-hero-benefits--copy { display: none; }
    .cm.v2 .catalog-hero-page .catalog-hero-benefits--band { display: grid; grid-template-columns: 1fr; gap: .75rem; width: min(calc(100% - 1.5rem), var(--catalog-v2-wide)); margin: .75rem auto 1.5rem; padding: 0; }
    .cm.v2 .catalog-hero-page .catalog-hero-benefit { gap: .65rem; }
    .cm.v2 .catalog-hero-page .catalog-hero-benefit + .catalog-hero-benefit { padding-left: 0; border-left: 0; }
    .cm.v2 .catalog-hero-page .catalog-hero-benefit-copy { gap: .25rem; }
    .cm.v2 .catalog-hero-page .catalog-hero-benefit-copy small { line-height: 1.35; }
  }

  /* Theme contract for Editorial V2: the visual family keeps its editorial
     composition, while configurable geometry, spacing and motion remain live. */
  .cm.v2 {
    --catalog-v2-wide: var(--solara-container, 1760px);
    --catalog-v2-space: var(--solara-space-scale, 1);
    --catalog-v2-radius: var(--solara-radius, 0px);
    --catalog-v2-shadow-card: var(--solara-shadow-card, none);
    --catalog-v2-shadow-elevated: var(--solara-shadow-elevated, none);
    --catalog-v2-shadow-overlay: var(--solara-shadow-overlay, none);
    --catalog-v2-motion-response: var(--solara-motion-fast, 120ms);
    --catalog-v2-motion-control: var(--solara-motion-fast, 220ms);
    --catalog-v2-motion-component: var(--solara-motion-normal, 380ms);
    --catalog-v2-motion-editorial: var(--solara-motion-normal, 680ms);
    --catalog-v2-ease-out: var(--solara-motion-easing, cubic-bezier(.16, 1, .3, 1));
    --hero-v2-dur-eyebrow: var(--catalog-v2-motion-component);
    --hero-v2-dur-title: var(--catalog-v2-motion-component);
    --hero-v2-dur-line: var(--catalog-v2-motion-component);
    --hero-v2-dur-rule: var(--catalog-v2-motion-component);
    --hero-v2-dur-body: var(--catalog-v2-motion-component);
    --hero-v2-dur-actions: var(--catalog-v2-motion-component);
    --hero-v2-dur-benefit: var(--catalog-v2-motion-component);
    --hero-v2-dur-media: var(--catalog-v2-motion-editorial);
    --hero-v2-dur-zoom: var(--catalog-v2-motion-editorial);
    font-weight: var(--solara-font-weight-body, 400);
  }
  .cm.v2 h1,
  .cm.v2 h2,
  .cm.v2 h3 {
    font-weight: var(--solara-font-weight-display, 500);
    letter-spacing: var(--solara-letter-spacing-display, -.02em);
    line-height: var(--solara-line-height-tight, 1.15);
  }
  .cm.v2 .catalog-product-grid,
  .cm.v2 .catalog-testimonials-track,
  .cm.v2 .catalog-category-results .catalog-product-grid,
  .cm.v2 .catalog-search-results-grid {
    gap: var(--solara-card-gap, 1rem);
  }
  .cm.v2 .catalog-product-grid-section,
  .cm.v2 .catalog-testimonials-section,
  .cm.v2 .catalog-category-bento-section,
  .cm.v2 .solara-search-results {
    padding-block: var(--solara-section-y, clamp(3rem, 6vw, 6rem));
  }
  .cm.v2 .catalog-product-card:hover,
  .cm.v2 .catalog-product-card:focus-within,
  .cm.v2 .catalog-category-bento-item:hover,
  .cm.v2 .catalog-category-bento-item:focus-visible {
    box-shadow: none;
  }
  .cm.v2 [data-solara-module="catalog-header"][data-scrolled="true"],
  .cm.v2 .catalog-cart-drawer,
  .cm.v2 .catalog-search-dialog,
  .cm.v2 .catalog-mobile-menu__panel {
    box-shadow: var(--catalog-v2-shadow-overlay);
  }
  .cm.v2 .catalog-header-inner {
    border-bottom-color: var(--catalog-border);
    border-bottom-width: var(--solara-border-width, 1px);
    border-bottom-style: var(--solara-border-style, solid);
  }
  .cm.v2 .catalog-search-dialog,
  .cm.v2 .catalog-product-gallery-main,
  .cm.v2 .catalog-product-gallery-thumbs button,
  .cm.v2 .solara-checkout-fields input,
  .cm.v2 .solara-checkout-fields textarea,
  .cm.v2 .contact-form-fields input,
  .cm.v2 .contact-form-fields select,
  .cm.v2 .contact-form-fields textarea,
  .cm.v2 .catalog-hero-benefits--copy {
    border-color: var(--catalog-border);
    border-width: var(--solara-border-width, 1px);
    border-style: var(--solara-border-style, solid);
  }
  .cm.v2 .catalog-category-filters {
    border-top: 0;
    border-bottom: 0;
  }
  .cm.v2 .solara-checkout-order-panel {
    border-left-width: var(--solara-border-width, 1px);
    border-left-style: var(--solara-border-style, solid);
  }
  .cm.v2 .catalog-hero-inner,
  .cm.v2 .catalog-hero-media,
  .cm.v2 .catalog-product-media,
  .cm.v2 .catalog-category-bento-item,
  .cm.v2 .catalog-category-bento-item > span:not(.solara-category-placeholder),
  .cm.v2 .catalog-product-gallery-main,
  .cm.v2 .catalog-product-gallery-thumbs button,
  .cm.v2 .solara-category-hero img,
  .cm.v2 .catalog-product-info select,
  .cm.v2 .catalog-product-tabs button,
  .cm.v2 .catalog-cart-drawer header button,
  .cm.v2 .solara-checkout-fields input,
  .cm.v2 .solara-checkout-fields textarea,
  .cm.v2 .contact-form-fields input,
  .cm.v2 .contact-form-fields select,
  .cm.v2 .contact-form-fields textarea {
    border-radius: var(--catalog-v2-radius);
  }
  .cm.v2 .catalog-category-filters:has(details[open]),
  .cm.v2 .catalog-cart-drawer {
    border-radius: var(--catalog-v2-radius) var(--catalog-v2-radius) 0 0;
  }
  .cm.v2 .catalog-product-grid,
  .cm.v2 .catalog-testimonials-track,
  .cm.v2 .catalog-category-results .catalog-product-grid,
  .cm.v2 .catalog-search-results-grid {
    gap: calc(var(--solara-card-gap, 1rem) * var(--catalog-v2-space));
  }
  .cm.v2 .catalog-hero-actions,
  .cm.v2 .catalog-hero-benefits,
  .cm.v2 .catalog-category-layout,
  .cm.v2 .catalog-product-detail-inner,
  .cm.v2 .solara-checkout-form-v2 {
    gap: calc(1rem * var(--catalog-v2-space));
  }
  .cm.v2 .catalog-primary-action,
  .cm.v2 .catalog-secondary-action,
  .cm.v2 .catalog-newsletter-action,
  .cm.v2 .solara-primary-action,
  .cm.v2 .contact-form-actions .catalog-primary-action {
    border-radius: var(--catalog-v2-radius);
  }
  /* La media V2 monta picture directamente dentro del figure. Las reglas
     antiguas apuntaban a un figure interno que el renderer ya no genera, por
     lo que la imagen conservaba su alto intrínseco y dejaba un vacío. */
  .cm.v2 .catalog-hero-media > picture,
  .cm.v2 .catalog-hero-media > img,
  .cm.v2 .catalog-hero-media > video,
  .cm.v2 .catalog-hero-media > .catalog-hero-slide-stage {
    display: block;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 100%;
    margin: 0;
  }
  .cm.v2 .catalog-hero-media > picture > img,
  .cm.v2 .catalog-hero-media > img,
  .cm.v2 .catalog-hero-media > video {
    display: block;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 100%;
    object-fit: cover;
    object-position: center;
  }
  .cm.v2 .catalog-hero-media > .catalog-hero-slide-stage > figure,
  .cm.v2 .catalog-hero-media > .catalog-hero-slide-stage > figure > picture,
  .cm.v2 .catalog-hero-media > .catalog-hero-slide-stage > figure > img {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 100%;
    margin: 0;
  }
  .cm.v2 .catalog-hero-media > .catalog-hero-slide-stage > figure[hidden] {
    display: none;
  }
  .cm.v2 .catalog-hero-media > .catalog-hero-slide-stage > figure > picture > img,
  .cm.v2 .catalog-hero-media > .catalog-hero-slide-stage > figure > img {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 100%;
    object-fit: cover;
    object-position: center;
  }
  /* Las portadas internas conservan su carril vertical en tablet angosta. */
  @media (min-width: 768px) and (max-width: 1199px) {
    .cm.v2 .catalog-hero-page .catalog-hero-inner {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(15rem, min(42vw, 26rem));
      width: min(calc(100% - 3rem), var(--catalog-v2-wide));
      height: auto;
      min-height: 0;
    }
    .cm.v2 .catalog-hero-page .catalog-hero-media {
      position: relative;
      inset: auto;
      width: 100%;
      height: auto;
      min-height: 0;
      margin: 0;
      aspect-ratio: 9 / 16;
      border-radius: var(--catalog-v2-radius);
    }
    .cm.v2 .catalog-hero-page .catalog-hero-copy {
      color: var(--catalog-ink);
    }
    .cm.v2 .catalog-hero-page .catalog-hero-copy .catalog-hero-body {
      color: var(--catalog-muted);
    }
    .cm.v2 .catalog-hero-page .catalog-hero-media::after {
      display: none;
    }
    .cm.v2 .catalog-hero-page .catalog-hero-benefits--copy {
      display: none;
    }
  }
  /* En mobile la foto conserva el encuadre vertical sin convertir el borde
     de 767px en un hero de más de una pantalla. */
  @media (max-width: 767px) {
    /* La sombra configurable del título necesita salir de su carril de reveal
       para no cortarse en los laterales del hero móvil. */
    .cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-line {
      overflow: visible;
    }
    .cm.v2 .catalog-hero-editorial .catalog-hero-inner,
    .cm.v2 .catalog-hero-page .catalog-hero-inner {
      min-height: clamp(35.5rem, min(82svh, calc(100vw * 16 / 9)), 43rem);
      border-radius: 0;
    }
    .cm.v2 .catalog-hero-editorial [data-hero-media],
    .cm.v2 .catalog-hero-page .catalog-hero-media {
      aspect-ratio: 9 / 16;
      border-radius: 0;
    }
    .cm.v2 .catalog-category-bento-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .cm.v2 .catalog-product-detail-inner {
      gap: 1.25rem;
      padding-top: 1rem;
    }
    .cm.v2 .catalog-product-gallery {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: .625rem;
    }
    .cm.v2 .catalog-product-gallery-main {
      width: 100%;
      max-height: none;
      aspect-ratio: 1;
    }
    .cm.v2 .catalog-product-gallery-thumbs {
      display: flex;
      gap: .5rem;
      min-width: 0;
      overflow-x: auto;
      overscroll-behavior-inline: contain;
      scrollbar-width: thin;
    }
    .cm.v2 .catalog-product-gallery-thumbs:has(> button:only-child) {
      display: none;
    }
    .cm.v2 .catalog-product-gallery-thumbs button {
      flex: 0 0 44px;
      width: 44px;
      min-width: 44px;
      height: 44px;
      min-height: 44px;
    }
    .cm.v2 .catalog-product-info h1 {
      width: 100%;
      max-width: 100%;
      font-size: calc(clamp(2rem, 9.5vw, 2.75rem) * var(--solara-type-scale, 1));
      line-height: 1;
      overflow-wrap: anywhere;
      text-wrap: wrap;
    }
    .cm.v2 .catalog-detail-price {
      margin-top: .75rem;
    }
    .cm.v2 .catalog-add-form {
      margin-top: 1rem;
      padding-top: 1rem;
    }
    .cm.v2 .catalog-product-add {
      width: 100%;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .cm.v2 .catalog-hero-page [data-motion-zone],
    .cm.v2 .catalog-hero-page .catalog-hero-reveal,
    .cm.v2 .catalog-hero-page .catalog-hero-line-inner,
    .cm.v2 .catalog-hero-page .catalog-hero-rule,
    .cm.v2 .catalog-hero-page .catalog-hero-benefit,
    .cm.v2 .catalog-hero-page[data-motion-visible="true"] [data-hero-media],
    .cm.v2 .catalog-hero-page[data-motion-visible="true"] .catalog-hero-image {
      animation: none !important;
      transition: none !important;
      transform: none !important;
    }
  }
  @media (max-width: 767px) {
    .cm.v2 .catalog-category-page > .solara-pagination {
      padding-left: 0;
    }
    /* El anuncio libera espacio útil en móvil: aire a la izquierda y hueco
       reservado a la derecha para el botón de cerrar. */
    .cm.v2 .catalog-announcement-inner {
      padding-left: 1rem;
      padding-right: 3.25rem;
    }
  }
  /* En mobile el repeater editable de confianza se agrupa en una banda sobria
     debajo del hero: cada item conserva su icono y copy, sin sumar un CTA no
     editable ni alterar la composición de escritorio. */
  @media (max-width: 767px) {
    .cm.v2 [data-solara-module="catalog-hero"].catalog-hero-editorial .catalog-hero-benefits--band {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 1rem;
      width: 100%;
      margin: 0;
      padding: .75rem 1rem 1rem;
      background: color-mix(in srgb, var(--solara-accent) 6%, var(--catalog-paper));
    }
    .cm.v2 [data-solara-module="catalog-hero"].catalog-hero-editorial .catalog-hero-benefits--band .catalog-hero-benefit {
      display: grid;
      grid-template-columns: 2.25rem minmax(0, 1fr);
      align-items: center;
      gap: .75rem;
      min-height: 3.4rem;
      padding: .45rem 0;
    }
    .cm.v2 [data-solara-module="catalog-hero"].catalog-hero-editorial .catalog-hero-benefits--band .catalog-hero-benefit + .catalog-hero-benefit {
      padding-left: 0;
      border-left: 0;
    }
    .cm.v2 [data-solara-module="catalog-hero"].catalog-hero-editorial .catalog-hero-benefits--band .catalog-hero-benefit-icon {
      display: grid;
      place-items: center;
      width: 2.25rem;
      height: 2.25rem;
      padding: .5rem;
      border: 1px solid color-mix(in srgb, var(--solara-accent) 22%, var(--catalog-border));
      border-radius: var(--catalog-hero-benefit-icon-radius, calc(var(--catalog-v2-radius) + .35rem));
      background: color-mix(in srgb, var(--solara-accent) 12%, var(--catalog-paper));
      color: var(--solara-accent);
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .cm.v2 [data-solara-module="catalog-hero"].catalog-hero-editorial .catalog-hero-benefits--band .catalog-hero-benefit-icon svg {
      width: 1.15rem;
      height: 1.15rem;
    }
    .cm.v2 [data-solara-module="catalog-hero"].catalog-hero-editorial .catalog-hero-benefits--band .catalog-hero-benefit-copy {
      gap: .18rem;
    }
    .cm.v2 [data-solara-module="catalog-hero"].catalog-hero-editorial .catalog-hero-benefits--band .catalog-hero-benefit-copy strong {
      color: var(--catalog-ink);
      font-size: .82rem;
      line-height: 1.2;
      letter-spacing: .01em;
    }
    .cm.v2 [data-solara-module="catalog-hero"].catalog-hero-editorial .catalog-hero-benefits--band .catalog-hero-benefit-copy small {
      color: var(--catalog-muted);
      font-size: .72rem;
      line-height: 1.38;
    }
  }
`,
};

/** Shared consumers for theme fields that apply after module-specific skin rules. */
export const STORE_THEME_TOKEN_STYLES = `
[data-solara-store] {
  font-weight: var(--solara-font-weight-body, 400);
  line-height: var(--solara-line-height-body, 1.6);
}
[data-solara-store] h1,
[data-solara-store] h2,
[data-solara-store] h3 {
  font-weight: var(--solara-font-weight-display, 500);
  letter-spacing: var(--solara-letter-spacing-display, -.02em);
  line-height: var(--solara-line-height-tight, 1.15);
}
@media (max-width: 767px) {
  [data-solara-store][data-page-type="home"] [data-solara-module="split-hero"] .solara-hero-copy > :is(.solara-eyebrow, h1, .solara-hero-body),
  [data-solara-store][data-page-type="home"] [data-solara-module="editorial-hero"] .solara-editorial-head > :is(.solara-eyebrow, h1, .solara-hero-body),
  [data-solara-store][data-page-type="home"] [data-solara-module="hero-media"] .solara-hero-media-copy > :is(.solara-eyebrow, h1, .solara-hero-body),
  [data-solara-store][data-page-type="home"] [data-solara-module="catalog-hero"] .catalog-hero-copy .catalog-eyebrow,
  [data-solara-store][data-page-type="home"] [data-solara-module="catalog-hero"] .catalog-hero-copy .catalog-hero-title,
  [data-solara-store][data-page-type="home"] [data-solara-module="catalog-hero"] .catalog-hero-copy .catalog-hero-line-inner,
  [data-solara-store][data-page-type="home"] [data-solara-module="catalog-hero"] .catalog-hero-copy .catalog-hero-body {
    text-shadow: var(--solara-hero-text-shadow, none);
  }
  [data-solara-store].cm.v2[data-page-type="home"] [data-solara-module="catalog-hero"] .catalog-hero-copy .catalog-eyebrow,
  [data-solara-store].cm.v2[data-page-type="home"] [data-solara-module="catalog-hero"] .catalog-hero-copy .catalog-hero-title,
  [data-solara-store].cm.v2[data-page-type="home"] [data-solara-module="catalog-hero"] .catalog-hero-copy .catalog-hero-line-inner,
  [data-solara-store].cm.v2[data-page-type="home"] [data-solara-module="catalog-hero"] .catalog-hero-copy .catalog-hero-body {
    text-shadow: var(--solara-hero-text-shadow-v2, var(--solara-hero-text-shadow, none));
  }
}
`;

export const STOREFRONT_PERF_STYLES = `
[data-solara-store] .catalog-product-grid,
[data-solara-store] .catalog-category-bento {
  contain: layout paint;
  content-visibility: auto;
  contain-intrinsic-size: 600px 400px;
}
[data-solara-store] .catalog-product-grid img,
[data-solara-store] .catalog-category-bento img {
  content-visibility: auto;
  contain-intrinsic-size: 300px 200px;
}
`;

export const CATALOG_UNIFIED_CTA_STYLES = `
[data-solara-store].catalog-modern .catalog-footer-whatsapp,
[data-solara-store].catalog-modern .catalog-newsletter-action,
[data-solara-store].catalog-modern .solara-consumer-rights a,
[data-solara-store].catalog-modern .catalog-product-add,
[data-solara-store].catalog-modern .catalog-cart-drawer .catalog-primary-action,
[data-solara-store].catalog-modern .solara-cart-page .catalog-primary-action,
[data-solara-store].catalog-modern .catalog-cart-drawer header button,
[data-solara-store].catalog-modern .catalog-cart-drawer .catalog-secondary-action {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  width: min(100%, 16rem);
  min-height: 2.75rem;
  margin-top: 1rem;
  padding: .65rem .8rem;
  border: 1px solid var(--solara-accent);
  border-radius: var(--solara-radius);
  color: var(--solara-accent);
  background: transparent;
  font-size: .78rem;
  font-weight: 800;
  text-decoration: none;
  cursor: pointer;
  transition: background-color var(--solara-motion-fast, 180ms) var(--solara-motion-easing, ease), color var(--solara-motion-fast, 180ms) var(--solara-motion-easing, ease), border-color var(--solara-motion-fast, 180ms) var(--solara-motion-easing, ease);
}
[data-solara-store].catalog-modern .catalog-footer-whatsapp:hover,
[data-solara-store].catalog-modern .catalog-footer-whatsapp:focus-visible,
[data-solara-store].catalog-modern .catalog-newsletter-action:hover,
[data-solara-store].catalog-modern .catalog-newsletter-action:focus-visible,
[data-solara-store].catalog-modern .solara-consumer-rights a:hover,
[data-solara-store].catalog-modern .solara-consumer-rights a:focus-visible,
[data-solara-store].catalog-modern .catalog-product-add:hover,
[data-solara-store].catalog-modern .catalog-product-add:focus-visible,
[data-solara-store].catalog-modern .catalog-cart-drawer .catalog-primary-action:hover,
[data-solara-store].catalog-modern .catalog-cart-drawer .catalog-primary-action:focus-visible,
[data-solara-store].catalog-modern .solara-cart-page .catalog-primary-action:hover,
[data-solara-store].catalog-modern .solara-cart-page .catalog-primary-action:focus-visible,
[data-solara-store].catalog-modern .catalog-cart-drawer header button:hover,
[data-solara-store].catalog-modern .catalog-cart-drawer header button:focus-visible,
[data-solara-store].catalog-modern .catalog-cart-drawer .catalog-secondary-action:hover,
[data-solara-store].catalog-modern .catalog-cart-drawer .catalog-secondary-action:focus-visible {
  background: var(--solara-accent);
  color: var(--solara-accent-text);
  border-color: var(--solara-accent);
  transform: none;
  box-shadow: none;
}
[data-solara-store].catalog-modern .solara-consumer-rights {
  grid-column: 1;
  justify-self: start;
  width: min(100%, 16rem);
  max-width: none;
  margin-top: .5rem;
  padding: 0;
  border: 0;
  background: transparent;
  border-radius: 0;
}
[data-solara-store].catalog-modern .catalog-newsletter-inner { gap: calc(1.5rem * var(--solara-space-scale, 1)); }
`;

export const MODULE_STYLES = `${STORE_BASE_STYLES}\n${Object.values(MODULE_STYLE_BLOCKS).join(
  "\n",
)}\n${STORE_THEME_TOKEN_STYLES}\n${STOREFRONT_PERF_STYLES}\n${CATALOG_UNIFIED_CTA_STYLES}\n${PRODUCT_GALLERY_MOBILE_FIX}\n${MOBILE_HERO_SQUARE_FIX}`;
