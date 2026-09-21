import { escapeAttribute, escapeHtml, formatMoneyForProject } from "@solara/module-sdk";
import { getCategoryAncestors, type StoreProjectV1 } from "@solara/project-schema";

/** HTML completo: el runtime sólo filtra y redistribuye filas, sin pedir el catálogo. */
export function renderProductList(project: StoreProjectV1): string {
  const copy = project.publicCopy;
  const labels = copy.productList;
  const products = project.products.filter((product) => product.status === "active");
  const categories = project.categories.filter((category) => category.status !== "hidden");
  const rows = products.map((product) => {
    const prices = product.variants.map((variant) => variant.price);
    const minimum = Math.min(...prices);
    const from = prices.some((price) => price !== minimum)
      ? `<small data-product-list-from>${escapeHtml(copy.product.from)}</small> `
      : "";
    const scope = new Set(
      product.categoryIds.flatMap((id) => [
        id,
        ...getCategoryAncestors(project, id).map((category) => category.id),
      ]),
    );
    return `<tr data-product-list-row data-list-title="${escapeAttribute(product.title)}" data-list-categories="${escapeAttribute(JSON.stringify([...scope]))}"><td><a href="/productos/${escapeAttribute(product.slug)}/">${escapeHtml(product.title)}</a></td><td>${from}<span>${escapeHtml(formatMoneyForProject(minimum, project))}</span></td></tr>`;
  });
  const middle = Math.ceil(rows.length / 2);
  const table = (items: string[], index: number): string =>
    `<div data-product-list-column${items.length ? "" : " hidden"}><table aria-label="${escapeAttribute(labels.title)}"><thead><tr><th scope="col">${escapeHtml(labels.product)}</th><th scope="col">${escapeHtml(copy.filters.price)}</th></tr></thead><tbody data-product-list-body="${index}">${items.join("")}</tbody></table></div>`;
  const count = labels.count.replaceAll("{count}", String(products.length));
  const currency = labels.pricesIn.replaceAll("{currency}", project.currency);
  return `<main class="solara-product-list solara-container" data-product-list>
    <header class="solara-product-list-intro"><div><h1>${escapeHtml(labels.title)}</h1><p><span data-product-list-count data-count-template="${escapeAttribute(labels.count)}" role="status">${escapeHtml(count)}</span><span aria-hidden="true"> · </span>${escapeHtml(currency)}</p></div>
    <form class="solara-product-list-controls" data-product-list-controls hidden role="search">
      <label>${escapeHtml(labels.search)}<input type="search" name="q" autocomplete="off" data-product-list-search></label>
      <label>${escapeHtml(labels.category)}<select name="category" data-product-list-category><option value="">${escapeHtml(labels.allCategories)}</option>${categories.map((category) => `<option value="${escapeAttribute(category.id)}">${escapeHtml(category.title)}</option>`).join("")}</select></label>
      <button type="reset">${escapeHtml(labels.clear)}</button>
    </form></header>
    <div class="solara-product-list-columns">${table(rows.slice(0, middle), 0)}${table(rows.slice(middle), 1)}</div>
    <p data-product-list-empty${products.length ? " hidden" : ""}>${escapeHtml(products.length ? copy.empty.filteredProducts : copy.empty.products)}</p>
  </main>`;
}
