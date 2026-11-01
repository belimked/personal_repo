import { test, expect } from "@playwright/test";
import { loginV6 } from "./v6-helpers";

test("TC-20 登录 lily 后进入 v6 助手页，第 1 天只问一件事", async ({ page }) => {
  await loginV6(page);
  await expect(page.getByRole("heading", { name: "这周最想搞定的一件事是什么？" })).toBeVisible();
  await expect(page.getByRole("button", { name: "秋假带孩子出去玩" })).toBeVisible();
  // 演示控制条在登录后的页面上挂着
  await expect(page.locator("#demo-bar")).toBeVisible();
  await expect(page.getByText("小禾")).toBeVisible();
});
