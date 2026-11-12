# 小禾 v7 原型后台接口约定（Web 与 iOS 共用）

- 部署：同一个 Cloudflare Worker（`wrangler.json` 增加 `main`，静态资源仍由 assets 提供），D1 数据库 `daily-assistant-db`。
- 地址：`https://personal-repo.saulxj.ggff.net/api/...`
- 鉴权：`Authorization: Bearer <token>`。不用 cookie。`/api/*` 允许 CORS `*`。
- 返回统一 JSON；错误：`{ "error": "<code>", "message": "<中文说明>" }`，状态码 400/401/403/404/429/500。
- 密钥（LLM key）只放在 Worker secret `LLM_API_KEY`，前端和仓库都不出现。

## 数据表（D1，migrations/0001_init.sql）
- users(id TEXT PK, email UNIQUE, name, role 'user'|'admin', pw_hash, pw_salt, disabled INT, deleted_at, created_at)
- sessions(token PK, user_id, created_at, expires_at)  —— 30 天有效
- items(id TEXT PK, user_id, kind, data TEXT(JSON), created_at, updated_at, deleted INT)
  - kind：`todo` | `idea` | `stash`（先放着） | `watch`（我盯着的事） | `fact`（记得的事，data: {text, source?, created_from?}） | `setting`（用户端偏好，data: {key, value}） | `file`（资料，阶段 2）
- messages(id PK, user_id, thread, role 'user'|'assistant', content, model, created_at)
- audit(id PK, actor_email, action, target, created_at)
- settings(key PK, value)  —— 管理端非敏感配置（模型选择等），不存任何密钥
- 演示账号在首次请求时自动写入（表为空时）：lily@demo.com（user，显示名“苏晴”）、admin@demo.com（admin），密码 demo1234。密码 PBKDF2-SHA256（WebCrypto，10 万次，随机盐）。

## 接口
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/health | `{ok:true, version}`，不需登录 |
| POST | /api/auth/login | `{email,password}` → `{token, user:{id,email,name,role}}`；停用/删除的账号返回 403 |
| POST | /api/auth/logout | 作废当前 token |
| GET | /api/me | `{user}` |
| GET | /api/items?kind=todo&since=<ISO> | `{items:[{id,kind,data,created_at,updated_at,deleted}]}`，含 deleted=1 的项便于同步 |
| POST | /api/items | `{id?,kind,data}` → `{item}`（id 可由客户端生成 UUID，重复 id 视为更新） |
| PATCH | /api/items/:id | `{data}`，与原 data 浅合并 → `{item}` |
| DELETE | /api/items/:id | 软删除 → `{ok:true}` |
| POST | /api/chat | `{message, thread?='home', mode?='chat'\|'make'}` → `{reply, model, thread, fallback}` |
| GET | /api/messages?thread=home&limit=50&before=<created_at> | `{messages:[{id,role,content,model,created_at}],has_more}`；before 为严格小于该时间的消息，取最近 limit 条，时间正序；不带 before 时保持原分页行为 |

| GET | /api/home?msg_limit=10 | `{user,items,messages,has_more,brief,server_time}`；items 同 `/api/items`，home 消息最近 10 条（最多 50，正序），brief 为台北当天最新简报或 null |
| POST | /api/chat/stream | 请求体同 `/api/chat`；SSE 多条 `data: {"delta":"..."}`，最后 `data: {"done":true,"reply":"...","model":"...","fallback":false}`；错误时发送兜底 delta 后 done |
| POST | /api/ask | `{q}`（最多 200 字）→ `{answer,filter,said,things,files,mode}`；filter 包含 from/to/kinds/status/scope/keywords/answer_hint，解析失败退回关键词模式；things 包含 kind、due |
| GET | /api/briefs?limit=10 | `{briefs:[{id,kind,text,created_at}]}`，仅当前用户 |

`/api/` 的 JSON 响应在客户端发送 `Accept-Encoding: gzip` 时压缩；SSE 不压缩。

### /api/chat
- 上游：`https://api.belimked.com/v1/chat/completions`（OpenAI 兼容）。
- `chat`：`deepseek-v4-flash`，`"thinking":{"type":"disabled"}`，max_tokens 800。
- `make`（“当场做出来”：写周报、改简版、出清单）：`deepseek-v4-pro`，开推理，max_tokens 3000。
- 上下文：同一 thread 最近 20 条消息 + 系统提示（小禾的人设与说话方式，取自 `docs/ITER1/review/产品方向共识.md` 与 v7 文案；称呼用户为其显示名）。
- 限流：每个用户每分钟 10 次、每天 200 次，超出 429。
- 上游失败/超时（25 秒）：返回预设兜底回复，`fallback:true`，仍为 200。
- 用户消息和回复都写入 messages。

## 管理端（role=admin，否则 403；只能看账号信息，看不到用户的 items / messages）
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/users | `{users:[{id,email,name,role,disabled,deleted_at,created_at,last_login}]}` |
| POST | /api/admin/users | `{email,name,role}` → `{user, temp_password}` |
| PATCH | /api/admin/users/:id | `{name?,role?,disabled?}` |
| POST | /api/admin/users/:id/reset-password | → `{temp_password}`，同时作废该用户全部 token |
| DELETE | /api/admin/users/:id | 软删除（deleted_at），30 天内可恢复，作废 token |
| POST | /api/admin/users/:id/restore | 恢复 |
| POST | /api/admin/test-model | `{model}` → `{ok, latency_ms, model, message}`（发一句极短请求） |
| GET/PUT | /api/admin/settings | 非敏感配置 |
| GET | /api/admin/audit?limit=50 | 操作记录 |
| GET | /api/admin/jobs | `{jobs:{morning|remind|profile|weekly:{enabled,at,runs:[...]}}}`；每项最近 10 次运行，含 started_at/finished_at/duration_ms/status/detail/user_id/run_key |
| PUT | /api/admin/jobs/:name | `{enabled:boolean,at:"HH:MM"}`，保存到 settings 的 `job.<name>` |
| POST | /api/admin/jobs/:name/run | `{user_id?:string}`；立即运行，忽略去重；返回 `{ok,processed_users}`，可仅指定用户 |

## 定期任务与数据（Go 后台）

新增 `job_runs(id,job,user_id,run_key,status,detail,started_at,finished_at)`（同一 job/user/run_key 唯一）和 `briefs(id,user_id,kind,text,data,created_at)`。任务使用 Asia/Taipei 时间：morning 每天 08:00、remind 每 5 分钟、profile 每天 02:00、weekly 周五 17:00；可由管理员修改 enabled/at（remind 固定每 5 分钟）。`XIAOHE_JOBS=off` 停止自动调度；手动运行仍可用。主动服务 on/quiet/off 控制简报与画像（remind 不受影响）。

## 阶段 2（暂不做）
- `/api/files`（R2 存储上传/下载）、录音转写（63 上的 FunASR，经 Cloudflare Tunnel 接入）。
