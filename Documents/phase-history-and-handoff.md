# OrchestrAI — 交接手册与历史归档

> 新的 AI 或开发者先读本文件的“交接”一节，再读 `project-overview.md` 和 `AGENTS.md`，然后按 AGENTS.md 的改动地图只打开相关文件，**不需要通读全部源码或历史**。历史条目按时间倒序，每次交付追加一条，每条不超过 10 行。更早的长篇过程记录在 Git 历史中，可查看 `Documents/project-overview.md` 在提交 `867e76d` 及更早的版本。

## 交接（随每次交付更新）

- **当前阶段：** R4 收尾。剩余工作见 overview 第 4 节“R4 剩余工作”。
- **Git：** 生产版本为 main `0c4f93e`；Reader 回退在分支 `codex/r4-reader-fallback`（PR #42）。
- **服务器：** 腾讯云 Ubuntu 22.04，2 核 / 4 GB，与 Tarot、BuddyUp、共享 Nginx（`/opt/shared-ingress`）同机。部署目录 `/opt/orchestrai`，Compose 项目 `orchestrai-production`，只绑定回环端口 `127.0.0.1:3088`。SSH 别名 `tarot-tencent` 在用户本机。
- **本机：** Windows + Docker Desktop（context 为 `desktop-linux`）。候选环境 `http://localhost:3180`，Compose 项目 `orchestrai-r3`，账号在 `deploy/private/candidate-account.json`。本机 TUN/Fake-IP 会把公网域名解析成 198.18.x.x，research 的私网保护会拒绝这些地址，所以本机真实联网测试不可靠，联网验收以服务器为准。
- **私有文件（Git 忽略，绝不提交或发到聊天里）：** `deploy/private/`，包括 `product.env`、`model.env`、`providers.json`、账号文件和 `age-recovery.key`。
- **Key：** DeepSeek、Tavily、百炼都已配置，目前不需要新增 Key 或充值。
- **改 chat 的方式：** 直接编辑 `services/chat/overlay/` 下的源码；只有上游文件的接入点才改 `services/chat/patches/*.patch`。`.build/` 会自动重建，不要手动编辑。
- **CI 耗时参考（调整前）：** product job 15–21 分钟、publish 约 6.5 分钟、deploy 约 4 分钟。调整后，只改一个非 chat 服务时，chat 和 web 镜像直接复用。

## 历史（倒序）

### 2026-10-14 工程结构调整与规则精简
- 拆分 `deploy/patches/librechat-ui.patch`（334 KB）为 `services/chat/overlay/` 和三份小补丁（client、server、dependencies），外加 `remove` 删除列表；`rag.patch` 移到 `services/ingestion/upstream.patch`。等价验证：LibreChat 生成树 5624 个文件逐字节一致，RAG 树一致。
- `prepare-upstreams.py`：生成目录在输入变化后自动重建；overlay 替换上游文件时必须声明上游哈希。
- CI：增加 `changes` job，纯文档改动跳过构建和发布；产品镜像按输入哈希复用 main 发布的 `inputs-<hash>` 标签；取消 push develop 触发。
- 文档：overview 由 97 KB 压缩为当前状态；新建本文件；AGENTS.md 新增“删改为主”、范围上限和改动地图；`check-repository.py` 允许两份文档，取消强制更新 overview 的门禁，改为 40 KiB 上限。
- 本地清理：用户确认只删除退役原型的依赖和缓存，保留源码。

### 2026-10-14 R4 普通聊天联网（PR #37–#42）
- 自有前端和聊天联网接线随 main `1048340` 发布；URL 定位、相对日期转具体日期、只把已读取的证据传给模型（PR #40/#41）随 main `0c4f93e` 发布。
- 用户在 3180 复测时链接仍然失败。原因：模型丢掉了 URL 协议导致走了普通检索；把“当前日期”塞进查询引入了噪声。已修复：首轮绑定用户提供的完整 URL，相对日期直接替换为具体日期。
- 服务器上 Tavily 直接读取知乎专栏返回 `Failed to fetch url`（0 credits）；匿名 Jina Reader 诊断能取得正文（约 2.4 万字）。据此在 gateway/research 中原位加入 Reader 回退：只在 Tavily 直接 URL 读取确认失败后尝试一次，复用预算账本和幂等围栏。提交 `90e5b9b`，PR #42。
- 教训：只验证独立研究入口就宣布 R4 完成，漏掉了普通聊天入口的验收；修复、功能和运维混在一次交付里，范围失控；CI 未收敛就推送，导致多轮重跑。

### 2026-10-13 自有前端重做（PR #37）
- 按 Figma 七个画面原位重做：任务首页、三栏布局、导航与历史、对话/研究/画布/成果视图、登录页、品牌图标。复用 LibreChat 的数据层 hooks，没有建第二套 chat store。
- 退出上游的 `Chat/Header.tsx`、`Chat/Landing.tsx` 及对应测试，移除 `@xyflow/react`（R5 再引入）。画布和成果库明确标注未接入。

### 2026-10-12～13 R4 独立研究服务（PR #35/#36）
- 新增 research 服务（API 和 worker 在同一容器）、独立数据库角色和迁移，复用 PostgreSQL/Redis；Tavily 凭据只在 gateway；预算和 credits 原子预留。
- DNS `orchestrai.elysiumgrid.space` → `43.173.126.57`，HTTPS 证书和续期 timer 已上线。main `312b37a` 部署成功；七份协调加密快照回读校验通过。
- 生产小样本：Python 文档 completed（6 条精确引用）；小红书 partial（无正文，明确失败）。

### 2026-10-12～13 R3 聊天与附件（PR #33/#34）
- chat（LibreChat）、ingestion（RAG API）、gateway（LiteLLM）、web、mongo 上线，共八种镜像。main `901beb6` 部署成功，六份协调快照回读校验通过。
- 真实联调通过：百炼 1024 维检索、PDF 页码引用、PNG 识别、跨用户 404。旧 frontend/backend 退出 Git。

### 2026-10-12 R2 微服务与交付基础（PR #31/#32）
- workflow 服务（LangGraph JS 1.4.8、Postgres saver、BullMQ）、受限部署身份、root 发布控制器、age + rclone 备份到 Cloudflare R2。main `e9309c5` 部署成功。

### 2026-10-11 R0/R1 盘点与选型
- 确定 LibreChat 客户端和内核、LangGraph JS、LiteLLM、RAG API 路线；Open WebUI/Dify 只作参考。R1 真实测试预算 ¥20。
- 本地体积审计：工作目录约 1.2 GiB，其中 99% 是依赖和构建缓存，Git 跟踪源码约 1 MB。
