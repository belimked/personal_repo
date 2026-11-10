# 录音与推送设备 API（Go 后台）

用户接口均需 `Authorization: Bearer <token>`；管理员访问返回 403；未登录 401；错误格式 `{ "error": "...", "message": "..." }`。录音仅对所属用户可见，其他用户访问返回 404。

| 方法 | 路径 | 返回 / 用途 |
|---|---|---|
| POST | `/api/recordings` | multipart `file`（m4a/opus/mp3/wav，95 MiB 上限）、可选 `title`/`recorded_at`（ISO 时间）；`{recording:{id,status:"queued",title,created_at}}`；超限 413。每日每用户 20 条、已转写时长加未转写音频按 size_bytes / 4000 估算的时长总计 5 小时。 |
| GET | `/api/recordings?since=<ISO>` | `{recordings:[...]}`，可用更新时间增量查询。 |
| GET | `/api/recordings/{id}` | `{recording:{...,status,queue_position,error}}`；状态 queued/transcribing/summarizing/done/failed。 |
| GET | `/api/recordings/{id}/transcript` | `{text,segments:[{start_ms,end_ms,speaker,text}],speakers}`，未生成 404。 |
| GET | `/api/recordings/{id}/minutes` | `{title,summary,points,decisions,action_items:[{text,owner,due,is_self}]}`，未生成 404。 |
| POST | `/api/recordings/{id}/retry` | 失败后重新排队，`{ok:true,status}`；不可重试时 409。 |
| POST | `/api/recordings/{id}/regenerate` | 已完成录音重新整理纪要；确定性事项 ID 更新原事项而非重复建立。 |
| DELETE | `/api/recordings/{id}` | `{ok:true}`；删除音频、转写、纪要，保留已生成的事项。 |
| POST | `/api/devices` | JSON `{token:"64位十六进制",platform:"ios",env:"production"|"sandbox"}`；同 token 再注册会变更归属；`{ok:true}`。 |
| DELETE | `/api/devices/{token}` | 仅注销本人 token；`{ok:true}`。 |
| GET | `/api/admin/asr` | 管理员专用：`{online,queue,recent:[{id,status,attempts,created_at,finished_at,duration_s,asr_elapsed_s}]}`，不含会议内容。 |

录音异步处理，63 不可用时退避重试；失败可在详情页查看原因并手动重试。音频成功后保留 7 天、失败后保留 30 天，文本/纪要保留到用户删除。推送只发送处理结果和 recording_id，不发送标题或转写文本。
