import { test, expect } from "@playwright/test";
import { openScene } from "./v6-helpers";

test("TC-22 第 1 天说出一件事，当场给结果并追问一句就记下", async ({ page }) => {
  await openScene(page, "home.html?persona=p1&stage=1");

  await page.getByRole("button", { name: "秋假带孩子出去玩" }).click();
  await expect(page.getByText("秋假去哪：三个短途去处")).toBeVisible();
  await expect(page.getByText(/打算玩几天？/)).toBeVisible();

  await page.getByRole("button", { name: "四五天" }).click();
  await expect(page.getByText(/我记下了：出行时长：秋假想玩四五天/)).toBeVisible();
  // 还没有确认过孩子信息（出行时长不敏感），不应该弹同意卡片
  await expect(page.getByText(/要记下孩子的信息，先问你一声/)).toHaveCount(0);
});
