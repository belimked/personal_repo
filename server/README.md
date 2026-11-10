# 小禾 Go 服务

## 编译与运行

在 `server/` 目录下运行：

```sh
CGO_ENABLED=0 go build -ldflags "-X main.version=$(git rev-parse --short HEAD)" -o xiaohe ./cmd/xiaohe
./xiaohe serve
```

未注入版本时 `/api/health` 报告 `go-dev`；注入的提交号显示为 `go-<commit>`。服务默认监听 `127.0.0.1:8080`，首次运行自动创建并迁移 SQLite 数据库；空用户库会写入演示账号（`lily@demo.com`、`admin@demo.com`，密码 `demo1234`）。

子命令：

- `serve`：启动 HTTP 服务（不传子命令时默认执行），自动迁移数据库。
- `migrate`：仅执行尚未应用的迁移。
- `backup <路径>`：使用 SQLite `VACUUM INTO` 创建备份；目标路径须不存在。
- `import-d1 [--replace] <sql 文件>`：导入 Wrangler D1 SQL 导出的应用表数据，打印六张应用表的行数。目标应用表非空时默认拒绝；`--replace` 在同一事务中清空六张表并导入。导入失败会回滚。请勿将含用户数据的 SQL 文件公开。

## 环境变量

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `XIAOHE_ADDR` | `127.0.0.1:8080` | HTTP 监听地址（仅 serve） |
| `XIAOHE_DB` | `xiaohe.db` | SQLite 数据库路径 |
| `LLM_API_KEY` | 空 | 上游模型 API Key；空值时聊天返回兜底回复 |
| `LLM_BASE_URL` | `https://api.belimked.com/v1` | 模型接口地址 |
| `CORS_ORIGINS` | 空 | 允许跨域的 Origin，多个用逗号分隔；空值不允许跨域 |
| `XIAOHE_AUDIO_DIR` | `audio` | 上传音频目录，按用户 ID 分子目录 |
| `ASR_URL` / `ASR_TOKEN` | 空 | 63 转写服务地址、`X-ASR-Token` 共享密钥 |
| `APNS_TEAM_ID` / `APNS_KEY_ID` / `APNS_KEY_FILE` / `APNS_TOPIC` | 空 | Apple Team、Key ID、P-256 `.p8` 文件路径、App bundle ID；不设置 key 文件时关闭推送 |
| `APNS_ENV` | `production` | `production` 或 `sandbox`（设备登记时的 env 决定实际推送端点） |

## 录音与设备接口

所有接口需用户 Bearer token，管理员不能访问用户录音或设备。`POST /api/recordings` 用 multipart `file`（m4a/opus/mp3/wav，最大 95 MiB）、可选 `title`、`recorded_at`；立即返回 `{recording:{id,status:"queued",...}}`。每用户每日最多 20 条、累计时长 5 小时；未转写音频按文件大小 / 4000 估算秒数。

- `GET /api/recordings?since=<ISO>`、`GET /api/recordings/{id}`：列表和状态、排队位置。
- `GET /api/recordings/{id}/transcript`、`GET /api/recordings/{id}/minutes`：转写与结构化纪要。
- `POST /api/recordings/{id}/retry`：重试失败任务；`POST /api/recordings/{id}/regenerate`：对已完成录音重新整理纪要。
- `DELETE /api/recordings/{id}`：删除音频、转写、纪要，保留自动创建的事项。
- `POST /api/devices`：`{token,platform:"ios",env:"production"|"sandbox"}`；`DELETE /api/devices/{token}`：注销当前用户的设备。
- `GET /api/admin/asr`：仅管理员可查 ASR 在线状态、排队数量及最近任务元数据（无内容）。

serve 进程单并发轮询队列；重启恢复未完成任务。成功音频 7 天、失败音频 30 天后删除，清理每小时运行一次；文本、纪要不随音频清理。APNs 通知不包含录音标题和转写内容。

## 测试

```sh
go vet ./...
go test -count=1 ./...
CGO_ENABLED=0 go build ./cmd/xiaohe
```
