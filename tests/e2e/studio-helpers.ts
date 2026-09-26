import { expect, type Page } from "@playwright/test";

export async function openStudioDashboard(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Tus tiendas", exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator(".dashboard-cosmic-count")).toHaveText(/\d+ visibles/, {
    timeout: 15_000,
  });
}
