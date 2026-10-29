import { test, expect } from "@playwright/test";
import { login, V5 } from "./helpers";

test("TC-05 待办页没有“待安排”栏", async ({ page }) => {
  await login(page);
  await page.goto(`${V5}todos.html`);

  await expect(page.getByText(/未完成（\d+）/)).toBeVisible();
  await expect(page.getByText(/已完成（\d+）/)).toBeVisible();
  await expect(page.getByText(/已删除（\d+）/)).toBeVisible();
  await expect(page.getByText(/全部（\d+）/)).toBeVisible();

  await expect(page.getByText("待安排", { exact: false })).toHaveCount(0);
  const table = page.getByRole("table");
  await expect(table).toBeVisible();
  await expect(table).toContainText("提交季度报告给王经理");
});

test("TC-06 标签树取消“工作”即排除这类待办", async ({ page }) => {
  await login(page);
  await page.goto(`${V5}todos.html`);

  const table = page.getByRole("table");
  await expect(table).toContainText("工作/报告");

  const workTag = page.locator(".tree-item").filter({ hasText: "工作" }).first();
  await workTag.getByTitle("勾上 = 看这一类，取消 = 排除").click();

  const tagSummary = page.locator("#tagsum");
  await expect(tagSummary).toContainText("标签：除了");
  await expect(tagSummary).toContainText("工作");
  await expect(table).not.toContainText("工作/");
  await expect(table).toContainText("续交物业费");
});
