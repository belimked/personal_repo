import { test, expect } from "@playwright/test";
import { openScene } from "./v6-helpers";

test("TC-24 秋假：p1 先给交通行程，p2 先给行李和孩子用品", async ({ page }) => {
  await openScene(page, "home.html?persona=p1&stage=30&moment=d30-trip");
  await expect(page.getByText("秋假长沙 4 天：交通和行程已排好")).toBeVisible();
  await expect(page.getByText(/交通行程：周六 08:05 深圳北—长沙南 G6012/)).toBeVisible();

  await page.goto("/ITER1/v6/home.html?persona=p2&stage=30&moment=p2-trip");
  await expect(page.locator("#demo-bar").getByLabel("人物")).toHaveValue("p2");
  await expect(page.getByText("秋假长沙 4 天：行李和孩子用品清单")).toBeVisible();
  await expect(page.getByText(/晕车贴/)).toBeVisible();
  // p1 的交通卡片不该还留在 p2 的首页
  await expect(page.getByText(/G6012/)).toHaveCount(0);
  await expect(page.getByText("秋假长沙 4 天：交通和行程已排好")).toHaveCount(0);
});
