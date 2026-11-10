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

## 测试

```sh
go vet ./...
go test -count=1 ./...
CGO_ENABLED=0 go build ./cmd/xiaohe
```
