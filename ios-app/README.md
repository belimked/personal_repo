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

- 推送 `main` 且改动了 `ios-app/` 时，`.github/workflows/ios-adhoc.yml` 自动 Ad Hoc 签名出包（约 15 分钟），发布到安装页 https://personal-app.saulxj.ggff.net/ 。
- Team `8J42Q87M5P`，Bundle ID `com.blk.dailyassistant`，描述文件 `dailyassistant adhoc`（到 2027-10-19），证书与 AusFlow 共用 Apple Distribution。
- 仓库 Secrets：`IOS_DIST_P12_BASE64`、`IOS_DIST_P12_PASSWORD`、`IOS_ADHOC_PROFILE_BASE64`。
- 加测试机：开发者网站 Devices 登记 UDID → 编辑描述文件勾上新设备 → 下载 → 更新 `IOS_ADHOC_PROFILE_BASE64` → 重跑工作流。

### 安卓 APK

- 同样推送 `main` 改动 `ios-app/` 时，`.github/workflows/android-apk.yml` 在 ubuntu 上 `expo prebuild` + `gradlew assembleRelease`（仅 arm64），用正式密钥重签。
- 和 iOS 共用安装页 https://personal-app.saulxj.ggff.net/ （安卓手机打开时安卓排前面）；APK 直链 https://personal-app.saulxj.ggff.net/DailyAssistant.apk ，Release `android-latest` 里也有一份。任何安卓手机允许“安装未知应用”即可装，不用登记设备。
- 包名 `com.blk.dailyassistant`；versionCode 取工作流 run 号。
- 仓库 Secrets：`ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD`（别名 `dailyassistant`）。密钥原件在本机 `/root/.config/dailyassistant-android/`，**丢了就无法覆盖升级**，请另行备份。
- 已知限制：图标用的 SF Symbols（`expo-symbols`）在安卓不显示；推送只做了 iOS（未接 FCM）。
- 两个工作流部署同一个 Pages 站点：部署任务共用并发组 `pages-install` 排队，部署前用 `ci/pages-merge.sh` 拉取线上另一平台的文件合并，互不覆盖。
