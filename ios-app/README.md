# 小禾 iOS App（v7 原型）

按 `public/ITER1/v7-sketch/app-ios-unslop/` 定稿 6 屏用 Expo（SDK 58）写的原生 App，演示数据，不连后端。

| 屏 | 文件 |
|---|---|
| 01 简报封面 / 03 结束页（3 件都过完后） | `src/app/(tabs)/index.tsx` |
| 02 逐件过（右滑或“稍后”暂存） | `src/app/review.tsx` |
| 04 下拉面板（点顶部“禾 管家”） | `src/components/Panel.tsx` |
| 05 我的 | `src/app/(tabs)/me.tsx` |
| 06 隐私与个人信息 | `src/app/privacy.tsx` |
| 盯着（Tab 占位列表） | `src/app/(tabs)/watch.tsx` |

演示数据重置：我的 → 通用 → 重置演示数据。

## 出包

- 推送 `main` 且改动了 `ios-app/` 时，`.github/workflows/ios-adhoc.yml` 自动 Ad Hoc 签名出包（约 15 分钟），发布到安装页 https://belimked.github.io/personal_repo/ 。
- Team `8J42Q87M5P`，Bundle ID `com.blk.dailyassistant`，描述文件 `dailyassistant adhoc`（到 2027-10-19），证书与 AusFlow 共用 Apple Distribution。
- 仓库 Secrets：`IOS_DIST_P12_BASE64`、`IOS_DIST_P12_PASSWORD`、`IOS_ADHOC_PROFILE_BASE64`。
- 加测试机：开发者网站 Devices 登记 UDID → 编辑描述文件勾上新设备 → 下载 → 更新 `IOS_ADHOC_PROFILE_BASE64` → 重跑工作流。
