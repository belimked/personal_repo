import { test, expect } from "@playwright/test";
import { openScene } from "./v6-helpers";

test("TC-26 我了解的你：删掉一条后不再出现，开了通用模式首页不再说“因为”", async ({ page }) => {
  await openScene(page, "me.html?persona=p1&stage=30");

  const item = page.locator('.me-item[data-pid="pr14"]');
  await expect(item).toContainText("历史爱好者");
  const layerBadge = page.locator('.me-layer[data-layer="2"] .card-head .badge');
  await expect(layerBadge).toHaveText("5");

  await item.getByRole("button", { name: "删" }).click();
  await expect(page.getByText(/已删除：历史爱好者/)).toBeVisible();
  await expect(item).toHaveCount(0);
  await expect(layerBadge).toHaveText("4");

  // 开关的 input 被 .switch 样式隐藏（opacity:0/宽高 0），点可见的 label 来切换
  await page.locator("label.me-sw").filter({ hasText: "通用模式" }).click();
  await expect(page.locator("#me-general-sw")).toBeChecked();

  await page.goto("/ITER1/v6/home.html?persona=p1&stage=30");
  await expect(page.getByRole("heading", { name: "管家汇报" })).toBeVisible();
  await expect(page.locator("#butler .pa-card").first()).toBeVisible();
  await expect(page.locator("#butler .pc-because")).toHaveCount(0);
});
