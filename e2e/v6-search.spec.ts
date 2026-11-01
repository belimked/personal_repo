import { test, expect } from "@playwright/test";
import { openScene } from "./v6-helpers";

test("TC-25 按意思搜索样例 a：先纠正地点，同意人脸后给出视频和照片", async ({ page }) => {
  await openScene(page, "files.html?persona=p1&stage=30");

  await page.getByRole("link", { name: /去年去新疆在纳木错拍的视频/ }).click();
  await expect(page.locator("#sem .sem-tag").first()).toBeVisible();
  await expect(page.getByText(/纳木错在西藏，不在新疆/)).toBeVisible();
  // 纠错前不直接给结果
  await expect(page.locator("#sem .sem-group")).toHaveCount(0);

  await page.getByRole("button", { name: /连着走/ }).click();
  await expect(page.getByText(/要认照片里的人，先问你一声/)).toBeVisible();
  await page.getByRole("button", { name: "同意并开启" }).click();

  await expect(page.locator("#sem .sem-total")).toHaveText("4");
  const video = page.locator('#sem .sem-group[data-kind="video"]');
  await expect(video).toBeVisible();
  await expect(video).toContainText("纳木错");
  await expect(video).toContainText("12:34");
  const photos = page.locator('#sem .sem-group[data-kind="photo"] .sem-item');
  expect(await photos.count()).toBeGreaterThanOrEqual(2);
  await expect(page.locator("#sem .sem-time")).toContainText("用时 1.2 秒");
});
