import { test, expect } from "@playwright/test";
import { openScene } from "./v6-helpers";

test("TC-27 海报点数：草稿不扣点，确认档位后按点数扣，剩余一起告知", async ({ page }) => {
  await openScene(page, "home.html?persona=p4&stage=30&moment=p4-qixi");

  const card = page.locator('.pa-card[data-delivery-id="p4-d-qixi"]');
  await expect(card).toContainText("草稿不扣点");

  await card.getByRole("button", { name: "生成正式海报" }).click();
  await expect(page.getByRole("heading", { name: "生成正式海报" })).toBeVisible();
  await expect(page.getByText("约消耗 20 点，本月还剩 120 点")).toBeVisible();
  await expect(page.getByRole("radio", { name: /快速/ })).toBeChecked();

  await page.getByRole("radio", { name: /精细/ }).check();
  await expect(page.getByText("约消耗 40 点，本月还剩 120 点")).toBeVisible();

  await page.getByRole("button", { name: "确认生成" }).click();
  await expect(page.getByText(/正式海报生成好了，扣 40 点，还剩 80 点/)).toBeVisible();
  await expect(card).toContainText("正式海报已生成（精细，扣 40 点）");
  await expect(page.locator(".modal-mask")).toHaveCount(0);
});
