import { test, expect } from "@playwright/test";
import { login, V5 } from "./helpers";

test("TC-04 记一件想做的事并排时间", async ({ page }) => {
  await login(page);
  await page.goto(`${V5}ideas.html`);

  const title = "整理露营装备";
  const input = page.getByPlaceholder(/记一件想做的事/);
  await input.fill(title);
  await input.press("Enter");

  const card = page
    .locator(".idea-card")
    .filter({ has: page.getByRole("link", { name: title }) });
  await expect(card).toBeVisible();

  await card.getByRole("button", { name: "排个时间" }).click();
  await expect(card.getByText("排到：")).toBeVisible();
  await card.locator("[data-d]").filter({ hasText: "明天" }).first().click();

  await expect(card.getByText(/已排 1 条/)).toBeVisible();

  await page.goto(`${V5}todos.html`);
  await expect(page.getByRole("table")).toContainText(title);
});

test("TC-07 想做的事页筛选与生成待办", async ({ page }) => {
  await login(page);
  await page.goto(`${V5}ideas.html`);

  await page
    .locator(".idea-filters")
    .getByText("灵光一现", { exact: true })
    .click();
  await expect(page.locator(".idea-card")).toHaveCount(2);
  await expect(
    page.getByRole("link", { name: "研究新能源车的购车补贴" }),
  ).toHaveCount(0);

  const card = page
    .locator(".idea-card")
    .filter({ has: page.getByRole("link", { name: "周报可以加个图表" }) });
  await card.getByRole("button", { name: "排个时间" }).click();
  await card.locator("[data-d]").filter({ hasText: "明天" }).first().click();
  await expect(card.getByText(/已排 1 条/)).toBeVisible();

  await page.goto(`${V5}todos.html`);
  const table = page.getByRole("table");
  await expect(table).toContainText("周报可以加个图表");

  // 列表行不显示来源行，“来自：…”在待办详情里（tc 方案 TC-07 的“标注来自”）
  const row = table.locator("tr").filter({ hasText: "周报可以加个图表" }).first();
  await row.getByRole("link", { name: "详情" }).click();
  await expect(page).toHaveURL(/todo(\.html)?\?id=/);
  const from = page.locator("[data-from]");
  await expect(from).toContainText("来自：");
  await expect(
    from.getByRole("link", { name: /周报可以加个图表/ }),
  ).toBeVisible();
});
