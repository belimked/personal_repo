import { test, expect } from "@playwright/test";
import { openScene } from "./v6-helpers";

test("TC-23 说明模式出现规则角标，点开能看到规则和功能说明章节", async ({ page }) => {
  await openScene(page, "home.html?persona=p1&stage=1&explain=1");

  // 同一条规则会挂在多个带 data-rule 的元素上（控制条、卡片、助手区），这里只看助手区里的角标
  const badge = page.locator('#butler .rule-badge[data-rule-id="R-冷启动-01"]').first();
  await expect(badge).toBeVisible();
  await expect(page.locator(".rule-badge")).not.toHaveCount(0);

  await badge.click();
  const pop = page.locator(".rule-pop");
  await expect(pop).toBeVisible();
  await expect(pop).toContainText("R-冷启动-01");
  await expect(pop).toContainText("首问一件事");
  await expect(pop).toContainText("功能说明 §4.1");

  await pop.getByRole("button", { name: "关闭" }).click();
  await expect(page.locator(".rule-pop")).toHaveCount(0);
});
