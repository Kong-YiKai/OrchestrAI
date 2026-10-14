# OrchestrAI — 项目总览

> 更新：2026-10-15（Asia/Singapore）。本文件只记录**当前状态、架构、阶段计划和下一步**；过程细节与历史见 `phase-history-and-handoff.md`，执行规则见根目录 `AGENTS.md`。2026-10-14 之前的完整长版 overview 保留在 Git 历史中（`Documents/project-overview.md` 在提交 `867e76d` 及更早版本）。

## 1. 当前状态一览

| 项目 | 状态 |
| --- | --- |
| 生产入口 | `https://orchestrai.elysiumgrid.space/login`，公开注册关闭；账号在本机忽略文件 `deploy/private/production-account.json` |
| 生产版本 | main `a51fe84`（Actions #38646564674 全部成功，含部署），发布清单 schema=3：9 种镜像、10 个常驻进程 |
| 当前阶段 | **R4 已完成**（代码、CI/CD、生产普通聊天实测，待用户统一手动验收）；下一阶段 R5 |
| 工程结构调整 | 2026-10-14 完成：拆分 LibreChat 巨型补丁、CI 按输入复用镜像、文档与规则精简（见第 5 节） |
| 预算 | 模型与搜索共用原子人民币预算：每日 ¥5、每月 ¥100；Tavily 另限每日 30、每月 1,000 credits |

## 2. 产品方向（已确认）

- 品牌为 **OrchestrAI**：暖色奶咖主题、琥珀橙强调色、三栏工作台，画布特色保留。界面依据 2026-10-13 的 [Figma 设计](https://www.figma.com/design/eN0Gjqa8PggrWnYIUXDrLN) 合理适配。
- 优先复用成熟开源实现：LibreChat 提供聊天产品内核，LangGraph JS 提供工作流运行时，LiteLLM 作为网关，RAG API 负责文档检索；Open WebUI 和 Dify 只作产品参考，不复制代码。
- 按业务能力划分独立服务；CI 全部通过后自动部署生产，不设人工批准步骤。
- 重型解析、模型和抓取优先调用外部 API；共享服务器为 2 核 / 4 GB，与 Tarot、BuddyUp 同机。
- 改革前的旧聊天和附件都是可弃测试数据，不迁移。

## 3. 架构

| 服务 | 基座 | 职责 / 数据所有权 |
| --- | --- | --- |
| `web` | Nginx 静态资源 | 同源入口，不保存业务数据 |
| `chat` | LibreChat v0.8.8 + 自有 overlay | 用户、会话、消息、附件元数据（MongoDB 8.0.20）；联网工具 `web_search` 委托 research 服务 |
| `research` | Node + `@librechat/agents` Tavily 工具 + BM25 | 查询、读取、重排、证据和研究记录（PostgreSQL 独立库）；BullMQ（Redis DB1）队列可重建 |
| `gateway` | LiteLLM 1.105.0 | 模型路由、密钥、原子预算（SQLite）；受限 Tavily / Jina Reader transport |
| `ingestion` | LibreChat RAG API v0.9.0 + 补丁 | PDF/TXT 解析、embedding（百炼 text-embedding-v4，1024 维）、pgvector |
| `workflow` | LangGraph JS + BullMQ | run、checkpoint、审批、产物（PostgreSQL）；目前只有确定性流程，未接画布 |
| `postgres` / `redis` / `mongo` | 固定 digest 加固镜像 | 各服务独立库或角色，不跨库写表 |

- 浏览器 → web → chat；chat 用真实登录身份签发短期委托，调用 research、ingestion 和 workflow。服务密钥不进浏览器。
- 普通聊天：输入框中的“联网搜索”开关决定是否加载 `web_search` 工具，工具调用唯一的 research 服务；用户提供的链接优先直接读取，Tavily 直接读取失败时只做一次匿名 Jina Reader 回退。
- 侧栏“联网研究”是独立的研究记录入口，可以把结果手动带入草稿。
- 附件：支持 TXT、文本型 PDF、PNG、JPEG、WebP；单个 10 MiB，每条消息 5 个，总计 25 MiB；PDF 不超过 200 页；不支持 OCR 和 DOCX。

### 代码组织

- `services/chat/`：`overlay/` 存放自有源码（Orchestra 组件、`orchestra/research.ts` 和 `workflow.ts`、样式、图标），是普通文件，直接编辑；`patches/` 存放对上游文件的最小改动，分为 `client.patch`、`server.patch`、`dependencies.patch`。`scripts/prepare-upstreams.py` 依次执行：校验归档 → 打补丁 → 复制 overlay → 删除 `remove` 列表 → 生成 `.build/librechat`。
- `services/ingestion/upstream.patch`：RAG API 加固补丁。
- `deploy/`：Compose、受限发布控制器 `release.py`、备份与证书单元、`upstreams.json`（上游版本、校验和、补丁/overlay 声明）。
- `scripts/`：构建、配置、烟测和治理脚本。退役的 `frontend/`、`backend/` 已退出 Git，仅在本机忽略保留。

## 4. 阶段计划

| 阶段 | 状态 | 交付 / 结束条件 |
| --- | --- | --- |
| R0 盘点与规则 | 已完成 | 单一 overview、规则、替换计划 |
| R1 选型验证 | 已完成 | LibreChat + LangGraph + LiteLLM + RAG API 路线确认 |
| R2 微服务与交付基础 | 已完成（待用户手动验收） | workflow 服务、CI/CD、受限部署身份、加密异地备份 |
| R3 聊天与附件 | 已完成（待用户手动验收） | 登录、历史、图片/PDF/TXT、文档问答、六份协调备份 |
| R4 Web Research | 已完成（待用户手动验收） | 普通聊天中天气查询和网页总结都真实调用 research，并展示来源或具体失败；Reader 回退上线；必要 CI 和部署烟测通过 |
| R5 真实工作流执行 | 未完成 | 画布映射真实 graph；DAG、审批、取消、重启恢复；评估 Deep Agents JS；成果库 |
| R6 音视频与产物生成 | 未完成 | 转写、视频摘要、PPT/文档、图片生成，独立 worker |
| R7 运行质量 | 未完成 | 评测回归、成本看板、依赖升级机制、观测 |
| R8 桌面与扩展 | 未完成 | Windows 执行端、子对话、团队等 |

### R4 完成情况（2026-10-15）

- 普通聊天联网已在生产实测通过：
  - **天气：** 用具体日期检索，展示已读来源。
  - **知乎专栏：** 经 Reader 回退读取正文，长文会说明只基于前一部分。
  - **Python 文档：** 读取并总结。
  - **受限链接（小红书）：** 先调用工具，再如实说明只取到页面框架。
  - **关闭联网后追问：** 沿用会话证据，不重新搜索。
- 实测中发现并修复了四个问题（PR #46/#47）：
  - 回答中出现字面 `\n`；
  - 长文被截到 3000 字并被误报为抓取中断；
  - 发链接时模型未调用工具就拒答；
  - 同一消息中天气和链接混问时，天气搜索被替换成链接。
  另外修复了 `20~25℃` 被显示成删除线的问题。
- 用户手动验收项（不阻塞）：30 条搜索质量集、容量、完整恢复、许可证审核，以及第 7 节列出的已知限制。

## 5. 工程结构调整（2026-10-14）

起因：小修改耗时数小时、波及几十个文件。根因及处置如下：

| 根因 | 处置 |
| --- | --- |
| 所有 LibreChat 定制集中在一个 334 KB 的累计补丁里，改一行就要重新生成整份补丁 | 拆成 overlay 源码（11 个自有文件、3 个整体替换的上游文件、6 个图标）、三份小补丁（client 32 KB、server 10 KB、依赖 45 KB）和 4 项删除列表。验证：新旧方式生成的源码树 5624 个文件逐字节一致；RAG 树同样一致 |
| `.build` 和补丁不一致时脚本拒绝覆盖，AI 只能绕路处理 | 由脚本生成的目录在输入变化后自动重建；没有生成标记的目录仍然拒绝覆盖。overlay 替换上游文件时必须声明上游哈希，升级 LibreChat 时会明确报错 |
| CI 每次全量构建 9 个镜像，并在 feature、develop、main 各跑一遍 | 产品镜像按输入内容寻址，输入没变就复用 main 已发布的镜像；纯文档改动跳过构建和发布；取消 push develop 的重复运行 |
| 复用镜像带旧 revision 标签，被发布控制器拒绝（release 66，拒绝发生在停机前，生产未受影响） | 复用时只重打 revision 标签（各层不变）。实测：只改 chat 时 main 全流程约 16 分钟，调整前约 32 分钟 |
| 97 KB 的 overview 每次必须通读，还被强制追加 | overview 压缩为当前状态；历史移入 handoff；取消“每次改动必须更新 overview”的 CI 门禁，改为 40 KiB 体积上限 |
| 规则不限制范围，修复和维护混在一起交付 | AGENTS.md 新增“删改为主”、单任务范围上限和改动地图 |

本地 1 GB 多的体积来自已退役原型的依赖（`frontend/node_modules`、`.next`、`backend/venv`），不是 Git 源码；Git 跟踪源码约 1 MB。清理记录见 handoff。

## 6. 部署与运维约定

- 发布流程：`feature → PR → develop → PR → main →` CI → 发布镜像（GHCR digest）→ 受限 SSH 身份提交清单 → root 控制器 `release.py`：发布锁、停写、age 加密七份协调快照、Cloudflare R2 回读校验、迁移、readiness、烟测、公网 `/login` 检查；失败时恢复旧应用镜像，不回退数据库。
- 服务器上 `/opt/orchestrai/deploy` 的配置文件必须与清单的 `config_digest` 一致。相关文件列表见 AGENTS.md 第 3 节；改动这些文件时需要管理员同步。
- 每日 03:00–03:15 备份，daily 对象保留 35 天（含 research），发布快照另行保留。age 恢复私钥在本机 `deploy/private/age-recovery.key`，需要用户另行妥善保存。
- 证书到期日 2027-01-10，由 systemd timer 使用跨站 flock 自动续期。
- 资源快照（空闲时）：OrchestrAI 十个进程约 1.2 GiB，整机可用约 1.5 GiB / 3.7 GiB。未做混合负载压测。

## 7. 已知限制与到期项

- `deploy/vulnerability-policy.json` 中的例外 **2026-11-12 到期**，到期后 CI 会阻断，需要在此之前重新评估或升级相关依赖。
- 研究服务为单实例：每用户最多一个活跃任务，全局排队最多 20 个；多副本前需要租约协调。网关预算使用单实例 SQLite。
- 取消研究无法撤销已经发到 provider 的请求；未知结果的付费调用不自动重试。
- 窄屏下长 URL 标题有局部截断，随 R5 界面维护修正。
- Reader 回退可能把只有标题和页脚的登录壳页面（如小红书 explore）标为“已读取”；模型会如实说明缺少正文，但研究服务的壳页面识别还可以加强。
- 新建对话时“联网搜索”默认开启，不会继承上一个对话里的关闭选择；同一对话内刷新后保留选择。
- 模型偶尔用英文写一句开场白；正文会遵循用户的语言。
- **一轮里有两次联网调用时（如同一消息混问天气和链接），正文中的来源角标可能指向另一次调用的来源**，例如天气段落显示 Python 文档角标；正文内容和底部来源列表是对的。原因是两次调用的来源都从 S1 开始编号，与上游角标的映射冲突。这是下一个待修项。
- 画布、成果库、自动研究上下文共享尚未接通，界面明确标注为不可用。
- 用户手动验收项：完整产品、故障恢复（隔离环境）、混合容量、许可证审核、30 条搜索质量集。

## 8. 验证命令

```bash
python scripts/prepare-upstreams.py          # 生成 .build（校验 + 补丁 + overlay）
python scripts/build-product.py [--service chat]
python scripts/test-product.py --start --research   # 确定性烟测，无付费调用
python scripts/test-research.py
python scripts/test-services.py               # workflow
python scripts/test-release.py
python scripts/check-repository.py
git diff --check
```
