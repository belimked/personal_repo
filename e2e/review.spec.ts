import { test, expect } from "@playwright/test";
import { login, V5 } from "./helpers";

test("TC-08 每周回顾演示：列想做的事、不含灵光一现、可点“排个时间”", async ({ page }) => {
  await login(page);
  await page.goto(`${V5}home.html?review=week`);

  const review = page.locator('[data-kind="reviewWeek"]');
  await expect(review).toBeVisible();
  await expect(review).toContainText("有要排进这周的吗");
  await expect(review).toContainText("不含灵光一现");
  await expect(review).not.toContainText("周报可以加个图表");
  await expect(
    review.getByRole("link", { name: /研究新能源车的购车补贴/ }),
  ).toBeVisible();

  await review.getByRole("button", { name: "排个时间" }).first().click();
  await expect(page.getByText(/想排在哪天？/)).toBeVisible();
});
