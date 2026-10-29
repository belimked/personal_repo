import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("TC-02 登录 lily 后进入助手页", async ({ page }) => {
  await login(page);
  await expect(page.getByText("小禾")).toBeVisible();
  await expect(
    page.getByPlaceholder("跟我说就行，比如：周五3点体检"),
  ).toBeVisible();
});

test("TC-03 菜单按钮：展开后有 5 个入口，点“待办事项”能跳转", async ({ page }) => {
  await login(page);
  // 默认菜单收起，箭头按钮名称为“展开菜单”；展开后变为“收起菜单”
  const navToggle = page.getByRole("button", { name: /菜单/ });
  await navToggle.click();
  await expect(navToggle).toHaveAttribute("title", "收起菜单");
  for (const name of ["助手", "待办事项", "想做的事", "个人知识库", "个人设置"]) {
    await expect(page.getByRole("link", { name: new RegExp(name) }).first()).toBeVisible();
  }
  await page.getByRole("link", { name: /待办事项/ }).first().click();
  await expect(page).toHaveURL(/todos\.html$/);
  await expect(page.getByRole("button", { name: "＋ 新建待办" })).toBeVisible();
});
