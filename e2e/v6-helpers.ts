import { expect, type Page } from "@playwright/test";

/** v6 原型入口（登录页） */
export const V6 = "/ITER1/v6/";
export const LOGIN_EMAIL = "lily@demo.com";
export const LOGIN_PASSWORD = "demo1234";

/**
 * 登录演示账号。每个用例用自己的 browser context（localStorage 干净），
 * 所以这里总是先打开登录页再填表。
 */
export async function loginV6(page: Page, email = LOGIN_EMAIL, password = LOGIN_PASSWORD) {
  await page.goto(`${V6}index.html`);
  await page.getByPlaceholder("name@example.com / 13800000000").fill(email);
  await page.getByPlaceholder("8~16 位").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  // wrangler 静态资源会把 home.html 规整成 /home（有无扩展名都接受）
  await expect(page).toHaveURL(/home(\.html)?$/);
}

/**
 * 登录后按演示参数直达场景，如 "home.html?persona=p2&stage=30&moment=p2-trip"。
 * demo.js 应用参数后会从地址栏去掉，所以断言只看页面内容。
 */
export async function openScene(page: Page, rel: string) {
  await loginV6(page);
  await page.goto(`${V6}${rel}`);
}

/** 演示控制条里的某个阶段按钮（第 1 / 7 / 30 天），点击会整页刷新 */
export async function switchStage(page: Page, stage: 1 | 7 | 30) {
  const btn = page.locator("#demo-bar").getByRole("button", { name: `第 ${stage} 天` });
  await expect(btn).toBeVisible();
  await Promise.all([page.waitForEvent("load"), btn.click()]);
}
