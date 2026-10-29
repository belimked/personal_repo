import { test, expect } from "@playwright/test";
import { V5 } from "./helpers";

test("TC-01 首页能打开、无脚本报错", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const res = await page.goto(`${V5}index.html`);
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "个人日常助手" })).toBeVisible();
  await expect(page.getByRole("button", { name: "登录" })).toBeVisible();
  await expect(page.getByText("原型演示账号", { exact: false })).toBeVisible();
  expect(errors).toEqual([]);
});
