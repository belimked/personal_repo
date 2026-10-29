import { expect, type Page } from "@playwright/test";

/** v5 原型入口（登录页） */
export const V5 = "/ITER1/v5/";
export const LOGIN_EMAIL = "lily@demo.com";
export const LOGIN_PASSWORD = "demo1234";

/**
 * 登录演示账号。每个用例用自己的 browser context（localStorage 干净），
 * 所以这里总是先打开登录页再填表。
 */
export async function login(page: Page, email = LOGIN_EMAIL, password = LOGIN_PASSWORD) {
  await page.goto(`${V5}index.html`);
  await page.getByPlaceholder("name@example.com / 13800000000").fill(email);
  await page.getByPlaceholder("8~16 位").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  // wrangler 静态资源会把 home.html 规整成 /home（有无扩展名都接受）
  await expect(page).toHaveURL(/home(\.html)?$/);
}
