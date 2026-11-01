import { test, expect } from "@playwright/test";
import { openScene, switchStage } from "./v6-helpers";

test("TC-21 演示控制条切到第 30 天，首页变成管家汇报", async ({ page }) => {
  await openScene(page, "home.html?persona=p1&stage=1");
  const bar = page.locator("#demo-bar");
  await expect(bar.getByLabel("人物")).toHaveValue("p1");
  await expect(bar.locator(".demo-stage.on")).toHaveText("第 1 天");

  await switchStage(page, 30);

  await expect(bar.locator(".demo-stage.on")).toHaveText("第 30 天");
  await expect(page.getByRole("heading", { name: "管家汇报" })).toBeVisible();
  await expect(page.getByText(/本周替你省下/)).toBeVisible();
  await expect(bar.getByLabel("人物")).toHaveValue("p1");
});
