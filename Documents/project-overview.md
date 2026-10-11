# OrchestrAI — 项目总览与改革计划

> 更新：2026-10-12（Asia/Singapore）。这是项目现状、架构决策、阶段计划、部署约定和下一步任务的唯一事实来源。
> **每次新对话、新任务或接手开发，AI 必须先读本文件，再读根目录 `AGENTS.md` 和相关目录规则。每次完成修改必须同步更新本文件。**
> 改革进度：R0、R1 选型已完成（用户确认）；R2 进行中，独立 workflow 服务、Linux 集成/恢复测试与 CI/CD 代码已落地。云端 CI 已接通 PR #31，并有完整成功记录；最新提交状态以该 PR 的 required checks 为准，受限部署身份、Secrets 与加密异地存储已接通；生产首发正在收尾。R3 采用全新数据，不迁移旧测试聊天/附件。

## 1. 已确认的产品方向

- 产品名称与品牌：**OrchestrAI**。允许重做内部工程，以尽快获得成熟聊天、搜索、文件和多模态体验为优先。
- 保留现有暖色主题、奶咖背景、琥珀橙强调色、三栏 Orchestra、上下文面板与 React Flow 画布的设计方向；不能套用另一项目的整套页面或只替换 Logo。
- 框架和现有 Next.js 技术选型可以调整；视觉资产与交互意图要有明确迁移方案；用户确认现有聊天/附件全为可弃测试数据，R3 不迁移、不备份这些旧数据。
- 优先复用成熟开源实现；按业务边界尽早独立服务化。每个新能力在正式接入前就确定进程、API、数据所有权和部署边界，不再排到旧 Phase 14。
- CI 全部通过后自动部署生产，不设置常规人工生产批准步骤。首次部署基础设施需完成一次性准备；当前尚未激活生产 CD。
- 先适配现有共享服务器；重型解析、模型、浏览器抓取优先调用外部 API。用户接受付费 API。R1 真实测试总额度已明确为 **¥20**，使用已有本地凭证；本轮未购买订阅。2026-10-12 用户明确生产上限为 **每日 ¥5、每月 ¥100（人民币总额）**；同时说明 DeepSeek 余额约 ¥18、Tavily 免费额度约 1,000 Credits，属于用户提供的账户快照，非本轮账单核验。R2 本轮未调用付费 provider，无须新增 API Key 或充值；原子预算及真实计量接线完成前不开放生产付费能力。
- “结合四个项目”按能力组合实现：LibreChat 的聊天产品工程、Open WebUI 的多模态/知识使用体验、Dify 的工作流产品组织、LangGraph/Deep Agents 的运行时。每项标明直接复用、参考或暂缓，不把四套平台并列上线。

## 2. 现状审计与真实完成状态

### 2.1 体积：依赖和缓存占绝大多数

2026-10-11，本地文件长度统计（MiB，不含工作目录外 Docker 镜像/卷，不是磁盘分配空间）：

| 项目 | 大小 | 判断 |
| --- | ---: | --- |
| 工作目录合计 | 约 1232.7 MiB / 1.20 GiB | 与用户观察的约 1.28 GB 基本一致 |
| `frontend/node_modules` | 549.66 MiB | 安装依赖，非业务源码 |
| `frontend/.next` | 293.92 MiB | 构建与开发缓存 |
| `backend/venv` | 383.63 MiB | Python 环境 |
| `.git` | 3.09 MiB | 历史对象体积很小 |
| Git 跟踪文件 | 138 个，合计约 1.12 MiB | 当前工作区对应文件长度；不含未跟踪源码，不是完整源码量 |

前三项超过工作目录的 99%。**不能凭目录总大小断言源码严重冗余，也不能把删虚拟环境当作架构优化。** 后续分开记录源码、依赖、缓存、镜像、运行数据；Docker 体积尚未统计。当前确有可维护性问题：两份文档重复状态、旧模型名与新模型名冲突、功能完成标准不统一、聊天/研究/执行职责混杂。

### 2.2 能力状态（覆盖旧文档结论）

| 旧阶段/能力 | 当前状态 | 证据与处置 |
| --- | --- | --- |
| Phase 1 / 1.5 / 2 / 2.5 / 2.6：脚手架、设计系统、布局、开发 Compose | 已完成原型基础 | 存在 Next.js、FastAPI、PostgreSQL、暖色 token 和三栏 UI；视觉与画布优先保留 |
| Phase 3：聊天→澄清→确认→生成工作流 | 已完成原型，生产化未完成 | 已有真实模型接线和历史记录；旧记录称部分 UI 实测通过，本轮未重跑业务验收 |
| Phase 4 / 4.5-pre：画布、节点编辑、Run/Stop、DAG 展示 | UI 原型已完成；真实执行未完成 | `executor.py` 仍有 mock 和模型模拟兜底；按 order 顺序执行不等于 DAG 调度 |
| Phase 4.5：Harness、checkpoint、审批、取消 | 未完成（迁移重做） | 有持久化函数，但会话/任务控制仍含内存状态，不能作为多实例可靠恢复依据 |
| Phase 5.5 / 5.6 / 5.6-R1：Web Search、动态读取 | **未完成（重做）** | provider 较多，上层仍是关键词判断和自研 bridge；没有通过固定质量集验收 |
| Phase 5.7 / 5.8：文件和多模态 | **未完成（重做）** | `PerceiveRequest` 只收 URL；聊天回形针无文件选择/上传处理；存在 PDF/Office/Gemini 尝试代码不等于完整产品 |
| Phase 6：真实工具执行 | 未完成 | 需真实工具结果、权限、幂等和产物验证，删除生产模拟成功路径 |
| Phase 7 / 8：Windows Computer Use | 未完成 | 未来独立桌面执行端；Linux 共享服务器不承担 Windows 桌面操作 |
| Phase 9 / 12 / 13 / 14：生产数据、LLMOps、云部署、微服务 | 未完成 | 工程基础提前；微服务、迁移、发布、备份不再后置 |
| Phase 10 / 11：子对话、文件库、模型比较、团队、市场 | 未完成 | 随主线逐项引入；占位页不能标为功能完成 |

### 2.3 已确认的工程缺口

- `.github/workflows/ci.yml` 已原位升级为质量门禁、真实 workflow 集成/恢复、固定版本安全扫描、GHCR 发布与自动 CD；本地验证见 5.3。PR #31 已推送且有云端 CI 全部通过记录；Rulesets 已追加 ci-gate。GHCR/main 发布及服务器 CD 尚未执行，部署 Secrets 已配置，自动首发待 CI/main 合并完成。
- 前端 Dockerfile 运行 `npm run dev`；Compose 使用 `latest`、默认数据库凭据并暴露 5432，属于开发配置。
- 旧 backend 仍使用 `Base.metadata.create_all`；新 workflow 已有校验和迁移、数据库角色隔离和恢复演练，尚未迁移旧库。
- 会话 API 和 Socket room 未见完整的用户归属鉴权，不能直接作为公开多用户服务上线。
- 已有大量用户未提交修改。本轮不覆盖业务改动；改革实施前先整理可追溯基线，不能把工作区内容谎称为 HEAD 发布。
- 旧历史记录中的 Python.org 成功、小红书风控、TUN/Fake-IP 处理值得保留为回归用例；本轮没有重新验证这些站点。

## 3. 开源组合与选型门槛

### 3.1 首选路线

**首选验证 LibreChat 产品内核 + OrchestrAI 自有界面 + LangGraph 工作流服务。**

直接复用成熟会话、用户、附件、流式响应和 Agent 集成，比只参考 LibreChat 后再自行重写这些能力更符合本次目标。先在隔离试验中移植一个真实 Orchestra 页面，测量接口耦合、视觉还原和资源开销，再确定工程迁移。

| 项目/技术 | 采用方式 | 具体范围与边界 |
| --- | --- | --- |
| LibreChat | 首选直接复用，R1 验证后锁版本 | 聊天服务、认证、会话、附件、流式消息、工具接入；复用配套客户端数据层和 hooks，重做页面组合与样式 |
| Open WebUI | 产品参考，不纳入首发运行依赖 | 借鉴文件/知识选择、多模态反馈；不复制受品牌条款约束的界面或源码 |
| Dify | 产品参考，不部署第二套工作流平台 | 借鉴工作流发布、节点状态、运行记录与错误展示；画布沿用 React Flow，运行由 LangGraph 负责 |
| LangGraph JS | 工作流服务的核心运行时候选 | checkpoint、interrupt/resume、分支、并行；优先与 LibreChat 的 JS 生态统一，冻结 graph 版本 |
| Deep Agents | R6 按需使用 | 自主规划、文件工具、子 Agent；先验证 LangGraph 闭环，不在首发叠加第二套规划器 |
| LibreChat RAG API | 独立 ingestion 服务的首选基座 | FastAPI、LangChain、PostgreSQL/pgvector；接文件解析/检索，不另建平行 RAG 管线 |
| LiteLLM Proxy | 独立模型网关候选，R1 测资源及兼容性 | 统一 provider 适配、额度、超时、用量；付费企业能力不默认依赖 |
| BullMQ + Redis | 长任务队列候选 | JS worker 调度、重试、并发限制；队列不替代 LangGraph checkpoint，不再自研通用队列 |
| Docling | 后续复杂文档解析候选 | 仅在扫描件/表格效果不足时接独立远程 worker；首发不在共享 4 GB 主机加载重型本地模型 |
| Docker Compose + GitHub Actions + GHCR | 首发部署与交付 | 服务独立镜像，单机内部网络；当前无需 Kubernetes、服务网格或自建全套观测平台 |

首轮已锁定可复现实验版本（见 5.2），但尚未冻结生产发布清单。R1 必须记录所选 tag、完整 commit、镜像 digest、各组件许可证和验证结论；不能跟随上游 dev/latest。

### 3.2 前端与上游维护方案

- 优先在 LibreChat 配套 React/Vite 工程内移植 OrchestrAI 的视觉、三栏和画布，保留其成熟数据 hooks。当前 React 19/Next.js 与候选上游依赖版本不同，不保证直接复制组件即可运行。
- R1 同时评估保留 Next.js 作为独立客户端的成本。LibreChat Agents API 标为 Beta，不能将它等同于完整、稳定的会话/上传/用户 API。
- 若配套客户端路线通过，最终只保留一套活跃产品前端；旧 Next.js 页面在对应功能切换验收后删除。不能长期维护两套聊天状态 store、两套附件或两套设计 token。
- 以受控 upstream fork 管理直接复用源码，记录上游 remote 与基准 commit，保持其构建所需工作区结构。试验 checkout 放仓库外；正式迁入与旧实现退出在同一迁移计划中完成，禁止把多个完整 clone 塞入业务仓库。
- 产品定制集中在可维护的组件、主题和扩展边界；必须修改上游核心时记录原因和补丁，下一次上游升级执行契约、视觉、数据回归。
- R1 若证明耦合/资源不可接受：明确记录失败原因，再退到保留 Next.js、采用现成聊天组件及 LangGraph 的组件组合路线。该路线意味着更多产品集成工作，不能悄悄回到全部自研，也不同时长期维护两条路线。

### 3.3 许可证和费用

LibreChat 主仓库 MIT；Open WebUI 当前许可证含品牌限制及例外；Dify 是带附加条件的许可证，涉及多租户和前端品牌。首发选择自主界面，并将后二者限定为体验参考；任何实际代码复用须核对锁定版本与子包许可证并保留声明。MongoDB 等基础依赖也进入许可证清单，不能只检查顶层项目。

模型、搜索、抓取、重排、OCR、转写、对象存储分别计费。配置未填写额度时关闭对应付费能力；单次任务先预留预算，记录真实用量并结算，失败重试也计入上限。预算预留须原子化，不能等所有请求完成后才统计超额。首轮限额数值在 R1 按用户可接受预算落表，本轮不代定长期支出。

## 4. 从第一批重构建立服务边界

“模块”按业务能力划分，不按每个函数/Agent 拆一个服务。每个边界首次接入产品就提供独立部署、health/readiness、配置、契约测试和数据所有权；同一仓库不等于同一进程。依赖未就绪的服务不先生成空壳。

| 服务边界 | 复用基座 | 唯一职责/数据所有权 | 首次交付 |
| --- | --- | --- | --- |
| `web` | LibreChat 客户端工程候选 + OrchestrAI UI + React Flow | 静态界面，不保存唯一业务数据 | R1/R3 |
| `chat-service` | LibreChat server | 用户、会话、消息、附件元数据与归属；MongoDB | R2/R3 |
| `workflow-service` + 独立 worker 进程 | LangGraph JS + BullMQ | workflow/version/run/checkpoint/approval/idempotency；PostgreSQL | R2 最小闭环，R5 完整化 |
| `research-service` | 可复用的上游搜索工具 + SDK | 查询/抓取/重排、证据集合与研究任务结果；不保存第二份聊天历史 | R4；R1 验证提取可行性 |
| `ingestion-service` | LibreChat RAG API | 解析、chunk、embedding、索引状态；独立 PostgreSQL 数据库/角色 | R2/R3 |
| `model-gateway` | LiteLLM Proxy 候选 | 模型路由、密钥、额度与模型调用计量；没有第二个会话主库 | R2/R3 |
| `artifact-worker` / `desktop-worker` | 文档库、媒体 API / Windows UIA、Playwright | 生成产物 / 受控本机操作，按需启动，独立权限 | R6/R8 |

通信：浏览器→同源入口→chat/workflow API；chat 通过受限工具协议调用 research/ingestion/workflow；工作流调用相同能力服务。外部 Agent 工具优先用 MCP，普通服务 API 用 OpenAPI/JSON Schema。禁止浏览器携带服务密钥，禁止服务跨库直接写表。

跨服务请求携带已验证的 user/tenant、conversation、run、trace、idempotency 标识；身份由服务凭证与受验证的委托声明传递，不能信任客户端自填 user ID。chat 是身份和消息的事实源；workflow 只存关联 ID 与运行输入快照，不重复维护用户/会话主数据。

- MongoDB 与 PostgreSQL 是候选内核带来的不同数据职责，不是双写同一会话。PostgreSQL 可共用 OrchestrAI 自己的一个实例，但服务使用独立数据库/角色和迁移，不复用 Tarot 数据库。
- 文件本体首发可用专用持久卷，应用校验归属后下载；保留替换 S3 存储的接口。生产必须有独立位置的加密备份；向量是可重建索引，不是原文件备份。
- 长任务交给队列与 worker；API 不用 `asyncio.create_task` 承担唯一调度。BullMQ 至少一次投递，worker 用持久化幂等键和状态检查防止重复副作用。
- LangGraph checkpoint 负责恢复状态，不自动保证外部工具恰好执行一次。工具调用有独立 operation ID、结果记录和补偿策略；审批绑定准确的参数/运行版本，恢复后不可误复用旧批准。
- 流式消息沿用所选内核协议；切换完成后删除旧 Socket.io 聊天链路，不同时维护两套事件源。断线后可从持久事件游标/运行状态恢复。
- 只有一个生产搜索入口。R4 切换后关闭并删除 chat 内置平行搜索路径和旧 bridge，保留必要的上游适配补丁；若无法低成本抽取现有搜索模块，在 R1 明示集成成本。

## 5. 改革阶段与验收

状态只使用：**已完成、进行中、未完成**；可追加“待验证/重做”。需要重做的旧功能直接记未完成，不能因为已有代码或按钮就变绿。

| 阶段 | 当前状态 | 交付 | 工具 / 开源项目 / 核心技术 | 结束条件 |
| --- | --- | --- | --- | --- |
| R0：盘点与规则 | 已完成（本轮规划范围） | 审计、单一 overview、根 AGENTS、替换计划 | Git、PowerShell、仓库与上游文档核查 | 文档一致、保留未提交工作；不代表技术清理已实施 |
| R1：选型验证与基线冻结 | 已完成（选型，用户确认；遗留发布门槛继续追踪） | 小型可运行对照、UI 移植、依赖/资源/许可清单、最终技术决定 | 固定版本 LibreChat、LangGraph JS、RAG API、LiteLLM；Docker、Playwright | 通过下述试验门槛；确定单一路线和每项旧资产退出点 |
| R2：微服务与交付基础 | 进行中 | 独立服务最小链路、迁移/契约、自动 CI/CD、身份/配置边界 | Compose、Actions、GHCR、MongoDB、PostgreSQL、Redis/BullMQ、LangGraph | CI 同一提交产出镜像；隔离环境部署/回滚/恢复通过；具备发布前提 |
| R3：成熟聊天与附件候选版 | 未完成 | 原有风格的真实聊天、登录、历史、图片/PDF/TXT 上传、文档问答 | LibreChat chat/client、RAG API、pgvector、视觉/OCR API、持久存储 | UI 与端到端通过、全新数据与权限测试通过；形成可部署候选版 |
| R4：Web Research 重做与首发 | 未完成（重做） | 搜索→读取→重排→引用、可见过程、限额与拒答 | LibreChat 搜索实现候选；Tavily/Serper 对照、Firecrawl/Tavily Extract、Jina reranker 可选 | 固定研究质量集通过，单一入口，旧 bridge 退出；R3/R4 与部署资源门槛都通过后对外首发 |
| R5：真实工作流执行 | 未完成（重做） | 画布映射真实 graph、DAG、版本、审批、取消、重启恢复 | React Flow、LangGraph JS、Postgres checkpointer、BullMQ、MCP | 真实三节点任务成功；断线/崩溃/重复投递不重复副作用；mock 只留测试 |
| R6：音视频理解与产物生成 | 未完成 | 分批交付转写、视频摘要、PPT/文档、图片生成 | 外部 ASR/VLM/生成 API；按需 FFmpeg、Docling、PptxGenJS/docx 库；独立 worker | 每种能力有真实可下载产物、预览、用量、失败/取消闭环；不拿一个入口代表全覆盖 |
| R7：运行质量与维护 | 未完成 | 评测回归、成本看板、审计保留、依赖/上游升级机制 | OpenTelemetry、结构化日志、Langfuse 外部实例或兼容托管端、Renovate/Dependabot | 基础观测从 R2 就有；此阶段完善 SLO、升级演练与长期质量管理 |
| R8：桌面与扩展产品 | 未完成 | Windows 执行端；再按需求交付子对话、团队、市场/模型比较 | Windows UIA/pywinauto、Playwright、签名任务、MCP；复用既有组件 | 桌面隔离、授权、回放/终止通过；其余功能各自验收，不捆绑宣称完成 |

主依赖：R0→R1→R2→R3；R4 可在 R2 服务契约稳定后开发，R5 复用 R2 的运行时；R6 依赖附件/worker 闭环；R7 的基础能力贯穿全过程；R8 后置。微服务和 CI/CD 从 R2 开始，不能拖到最终阶段。

### 5.1 R1 必须回答的具体问题

1. 同一 DeepSeek 配置下，验证流式响应、会话切换、刷新恢复、取消、附件、中文搜索；模型 ID 以用户账号实测支持为准，不复制旧文档中的过期默认值。
2. 移植一个 `/orchestra` 场景：侧栏、聊天、右侧上下文，以及一个工作流画布入口。截图对照现有风格，检查窄屏、键盘、上传进度、来源展开。
3. 证明底层会话/上传/身份直接复用，而非只是截图相似；记录新增适配代码、上游核心补丁、重复依赖及升级成本。
4. 验证独立 research、ingestion、workflow、gateway 的接入点，特别是搜索工具是否有可维护的包导出/扩展入口；不存在则明确需要维护的 fork 范围。
5. 在隔离环境测内存/CPU/磁盘/镜像大小、重启、超时、并发。不能将上游完整默认 Compose 直接部署到生产共享服务器。
6. 确定依赖版本、认证策略、迁移 schema、状态协议、首发功能范围和实际预算数值。未满足门槛的能力不进入首发。

### 5.2 R1 隔离验证记录（2026-10-11）

**状态：选型已完成，2026-10-12 用户确认进入 R2；以下为 R1 原始验证记录，未通过项移为 R2–R4 发布门槛，并非已补测通过。** 隔离目录为 `D:/Workplace/Experiments/OrchestrAI-R1-20261011/`。代码、依赖、数据库和验证脚本均在仓库外；没有迁移正式前后端、改动服务器、提交或推送 Git。`evidence/source-baseline.zip` 保存 153 个不含真实环境密钥的工作区文件，`evidence/baseline.json` 保存逐文件 SHA-256、分支和未提交状态。分支为 `Universal-web-perception`，HEAD 为 `d6eebac60c74d22b6483b976a043fe41a370c3ad`；快照包含未提交内容，不能视为该 HEAD 的发布产物。

首轮技术决定：**继续采用 LibreChat 配套 React/Vite 客户端及聊天内核，集中移植 OrchestrAI UI；LangGraph JS 负责独立工作流，LiteLLM 和 RAG API 继续作为网关/解析候选。** 搜索可直接复用 `@librechat/agents` 的公开 `createSearchTool` 导出，不必复制整套研究实现。Open WebUI/Dify 保持产品参考，未引入其代码或运行服务。正式工程按此单一路线进入 R2；剩余质量/容量/许可门槛必须在对应能力发布前通过。

| 试验资产 | 固定版本 / 来源 | 许可证与边界 |
| --- | --- | --- |
| LibreChat | `v0.8.8`；commit `e8f3be08623663d4ad7f7241e693c94469b63bb0` | 根 MIT；子包分别核对。React 18.2 / Vite 8.2.2 / Tailwind 3.4.1 |
| LibreChat RAG API | `v0.9.0`；commit `4985b37b8b5d4519d68eceedfef1e63624012f9d` | MIT；原始源码未修改；本轮只验证独立进程的文本提取 |
| LangGraph JS / checkpointer | `1.4.8` / PostgreSQL saver `1.0.4` | MIT；`1.0.6` 与上游 checkpoint `1.1.3` 冲突，未强制安装 |
| LibreChat agents / React Flow | `4.0.1` / `@xyflow/react 12.10.2` | MIT；前者公开搜索导出已实测，后者只验证画布布局 |
| LiteLLM Proxy | `1.105.0`，独立 Python 环境 | 非 enterprise 部分 MIT；未使用企业功能；轮包 SHA 记在证据清单 |
| MongoDB | 官方 Windows 二进制 `8.0.20`，仅本地回环端口 | SSPL-1.0；不能按 MIT 处理。Docker Hub TLS 拉取失败后采用便携版试验 |
| PostgreSQL | 本机已有 `postgres:16-alpine` 镜像 | digest `sha256:93d55776e04376e19adb2733e3ccebb4392ee7dd86d8ff238503b30fe719c84f`；试验容器限内存 256 MiB |

原始源码包/轮包 SHA-256、上游 commit、定制文件清单保存在 `evidence/upstream-lock.json`。这是试验锁定清单；chat/gateway/ingestion 的 Linux 不可变镜像尚未构建，不能称为生产镜像基线。

**实际验证与限制：**

| 验证 | 实际结果 | 范围 / 证据 |
| --- | --- | --- |
| OrchestrAI 页面移植 | 通过首轮 | 奶咖/橙色、三栏、自定义侧栏与上下文、React Flow 入口；桌面/390px 窄屏截图，无横向溢出，键盘开关画布通过；画布明确标注未连接执行服务 |
| 复用聊天状态 | 通过首轮 | 直接复用上游认证、会话、消息和附件 hooks；未新建第二套 chat store。右侧“我的文件”是当前用户文件集合，不是会话专属附件列表 |
| 真实 DeepSeek 聊天 | 通过首轮 | `deepseek-flash` 实际响应；刷新恢复、会话切换、取消通过，无浏览器报错。最终无费用复查还验证 API 重启后保存的 PDF 回答仍可读取；未验证运行中流恢复。首次完整响应 19.03s，不是首 token 延迟；`evidence/ui-smoke.json` / `ui-render.json` |
| TXT / PNG / PDF | 通过首轮，保留失败 | TXT 内容码、PNG 图形颜色、PDF 内容码由真实模型读取。PDF 需明确 MIME→text 路由，经过独立 RAG API `/text`→网关→模型；长文档检索/embedding/OCR 未验证 |
| LiteLLM 接入 | 非流式、SSE及 PDF 闭环通过 | 网关独立进程，密钥未进入浏览器。一轮 PDF SSE 发生连接截断；之后独立 SSE 与 PDF 重测通过，重复稳定性仍需验证 |
| 上游搜索工具提取 | 可行性通过 | 独立 Node 进程实际 Tavily 搜索+提取，3 个来源，8.89s；有 URL/证据。无 reranker，尚未接入 UI 来源展开、研究服务 HTTP/MCP 与质量集 |
| LangGraph 并行/审批/恢复 | 本地工具通过 | 并行分支→审批 interrupt→真实文件产物；审批后故意退出 73，再新进程恢复。Mongo saver 与 PostgreSQL saver 均实测；PostgreSQL 改为 `durability:'sync'` 后通过 |
| 文件用户隔离 | 局部通过 | 第二用户看不到文件元数据，跨用户下载返回 403；只验证 chat 文件接口，未完成多租户/服务委托安全验收 |
| 构建、类型与改动文件 lint | 通过 | `npm ci`、`npm run build:packages`、客户端 `tsc --noEmit`、`npm run build`；定制 UI 的 ESLint/Prettier/i18n 检查通过；存在上游大 chunk/eval 警告 |
| 上游 Lighthouse | **三轮门槛未通过** | 中文系统导致英文注册 selector 失败，固定测试启动语言后进入真实页面；第一轮 LCP 3.70s/CLS 0.00655/TBT 71.56ms，第二轮被 Windows Chrome-launcher 临时目录清理 EPERM 中断。不能用首轮结果代替三轮验收；测试临时改动已恢复 |
| 依赖清单 / SPDX | **未通过完整审计** | lock 清点 3177 条、生产条目 1866 条；官方 `npm sbom` 两次 ESBOMPROBLEMS（override/版本约束）。许可证元数据仍有 707 个 NOASSERTION；不能视为完整 SPDX |

定制 UI 新增 3 个稳定职责文件，格式检查后共 199 行：主题、侧栏、上下文；主题/Root/路由/Sidebar provider 导出/文案及 package/lock 合计 11 个变更文件。完整补丁在 `evidence/orchestrai-ui.patch`，验证脚本另列，不把试验脚本当产品服务。配套客户端的复用已经实际验证；独立 Next.js 客户端还需重新维护认证、cookie、文件、事件和客户端校验契约，本轮没有实现第二客户端。

故障记录：PDF 默认原生文件投递会触发 DeepSeek 400，已在试验配置中指定提取文本；一次网关流被截断，失败证据未覆盖；LangGraph 默认异步持久化的崩溃试验未完成产物状态恢复，改同步持久化后通过。**同步 checkpoint 与本地独占写文件只证明这个工具的恢复/幂等，不能推广为所有外部工具恰好执行一次。** chat 本轮禁用 Redis，流状态仍在单进程内存；生产恢复要求仍须 R2 接入持久事件/队列。

**资源与预算：** Windows 单轮实测 chat/MongoDB/ingestion/gateway 工作集合计约 1102 MiB，PostgreSQL 容器约 44 MiB，合计约 1.12 GiB。完整开发 node_modules 1957.51 MiB、前端 build 30.42 MiB、gateway 环境 603.46 MiB、ingestion 环境 767.31 MiB、运行数据 206.37 MiB、排除依赖和构建后的上游源码 63.69 MiB；下载归档另计。这些是本机快照，不是 Linux 常驻/峰值 RSS 或最终镜像体积，不证明共享 4 GB 服务器已满足部署目标。

真实调用按串行试验组预留 ¥2，最多 10 组；10 组均已预留，总额 ¥20，详见 `evidence/budget.json`。**预留金额不是实付账单，不能推断 DeepSeek/Tavily 账户余额耗尽。** 用户于 2026-10-12 确认仍有余额，并确认新的生产预算；不得重置旧账本冒充原轮仍有预算，新增评测须单独记录实际用量。 试验限制输出 512 token、禁自动重试；账本只约束此轮脚本，不是原子生产预算。LiteLLM 无数据库时预算能力不足以实施硬上限，R2 必须实现持久计量/原子预留/失败结算，并核对实际价格与用量。试验结束后已停止本轮聊天/Vite/网关/解析/MongoDB 进程与专用 PostgreSQL 容器，保留全部运行数据；账本耗尽时 `gateway.py` 拒绝重启付费网关。

**从 R1 保留的发布前验收（不重复阻断已确认的选型）：**

1. 完成生产依赖 SPDX/许可证/安全审计，处理上游 override 冲突，验证升级补丁；锁定各服务 Linux 镜像 digest 和运行依赖体积。
2. Linux 隔离环境做低内存、重启、超时与有限并发验证，并完成 Lighthouse 三轮门槛；共享服务器混合负载资源门槛仍需正式部署前单独验收，不能用 Windows 快照替代。
3. 接通研究 UI 的搜索进度、来源展开、失败态与小样本质量评测；embedding provider/长文档检索必须真实验收，未配置时不宣称文档 RAG 可用。
4. 确定服务身份委托、API/事件协议、schema 与旧数据导入映射；审批版本/取消/重复投递/预算并发要求进入 R2/R5 可测试契约。
5. 单一路线已由用户确认；旧入口按第 7 节退出，聊天/UI 最迟 R3，搜索最迟 R4，运行时最迟 R5。对应调用方未迁移前保留原型，禁止接通两套生产入口。

### 5.3 R2 实施记录（2026-10-12）

**状态：进行中。** 分支 `codex/r2-service-delivery`，内部服务不开放公网端口，不挂载模型/搜索凭证。R3 聊天内核接入与 R5 任意 DAG 仍未完成。用户统一手动验收，本轮仅保留必要 CI 与部署烟测，不扩展复杂验收。

| 资产 | 实际实现与边界 |
| --- | --- |
| `services/workflow` | Node 24.21.0、LangGraph JS 1.4.8、Postgres saver 1.0.4、BullMQ 5.81.5、jose 6.1.0、pg 8.16.3；独立 HTTP API 与 worker。确定性流程：校验输入→持久审批→写真实报告产物，尚未接聊天或画布 |
| 身份/协议 | 服务端 HS256 短期委托，issuer/audience/5 分钟 TTL/scopes/user/tenant 校验；浏览器不得接触委托密钥。POST `/runs` 使用幂等键；GET 状态/游标事件/产物；POST 审批/取消；跨用户/租户返回 404。R3 须完成来自真实 chat 身份的签发适配 |
| 持久状态 | PostgreSQL 是 run/checkpoint/事件/审批/产物事实源；非超级用户数据库角色、SQL 校验和与迁移锁；Redis 为可重建队列。并发幂等、审批版本、取消、同步 checkpoint、产物唯一约束；失去 Redis 发布记录可从数据库重新入队；数据库恢复到较旧快照时会重建已完成队列项，队列终态写库失败会补记失败，避免任务永久卡住 |
| `deploy/compose.yml` | 内部网络、无宿主机开放端口、密码必填、固定镜像 digest、内存/CPU 限额、日志轮转；API/worker 非 root、只读根目录；数据库使用本项目独立卷 |
| 基础镜像加固 | `deploy/infrastructure.Dockerfile` 基于新固定 digest 的 PostgreSQL 16 与 Redis 7.4.11；PostgreSQL 直接以 postgres 身份启动，移除不再需要且带旧 Go 运行时的 gosu；Redis 固定更新 libcrypto3/libssl3 至 3.3.7-r2。保留官方初始化逻辑，未写漏洞忽略清单。新旧本机测试数据卷的迁移与恢复已验证，CI 另测空卷初始化 |
| 上游清单/补丁 | `deploy/upstreams.json` 固定 R1 LibreChat/RAG commit 与 ZIP 校验和，保留原许可证；规范化 R1 UI patch 换行。`prepare-upstreams.py` 提取到忽略的 `.build/`，拒绝覆盖未知已有内容。chat/RAG 正式镜像与完整许可证审计仍待迁移时完成 |
| CI | 原位升级 `.github/workflows/ci.yml`：main 来源、overview 更新、生成物/密钥扫描、Knip（新 workflow）、类型/lint/build、真实数据库/队列集成与恢复、SPDX、Trivy、Actionlint/ShellCheck；同一可信 main SHA 的**已测试 workflow/PostgreSQL/Redis 三个镜像**经 artifact 传递到 GHCR。第三方 Action 固定 commit |
| 发布控制器 | `deploy/release.py` 为 root 所有的固定控制器，只收限定 JSON manifest；配置摘要/镜像仓库/digest/版本/递增序列校验、发布锁、停写入→age 加密备份→rclone 异地回读校验→兼容迁移→readiness/真实 HTTP 产物烟测；失败恢复旧应用镜像（`--no-deps`，不回退数据库/Redis），升级前先备份当前数据库。支持 Ubuntu Python 3.10；GHCR 使用 CI job 临时令牌，服务器无长期开发者 token。每日备份由 systemd 调用同一控制器，服务专用 daily 对象保留 35 天，发布回滚备份另行保留。自动回滚已做契约测试，**尚未在真实服务器故障演练** |
| 部署身份 | `deploy/install-host.sh` 一次性管理员安装，拒绝覆盖已有目录/账户；专用 SSH 公钥 forced command 与精确 sudo 命令。CI 用户无 docker 组/通用 shell/sudo，配置保留 root 私有路径；已安装并验证 SSH 强制命令拒绝非法请求 |
| 清理 | `check-repository.py` 阻止生成物、真实环境文件、超大源码和私钥提交，只允许一份 Documents 文档；Knip 查新服务无用文件/依赖/导出。`docker-clean.sh` 移除全局 prune、模糊匹配、强制删除。旧全仓死代码审查在对应调用链迁移时完成 |

**本机实际验证：** Linux 集成 9 项通过（身份、迁移、并发幂等、真实队列审批、崩溃恢复、取消、Redis 重建）；独立 API/worker 部署烟测和重启烟测通过。`pg_dump` 恢复到隔离数据库后，runs/artifacts/events/checkpoints 数量与内容摘要逐项一致。发布/回滚契约测试 4 项通过。npm audit 为 0，workflow、PostgreSQL、Redis 三个最终镜像的 Trivy 高危/严重均为 0，源码秘密扫描通过；镜像本机 `.Size` 约 76.6 MiB（非完整产品体积）。旧工作区后端 167 tests 通过（1 条 Pydantic 弃用告警），旧前端 tsc/lint/build 通过。SPDX 仅新 workflow 已生成；上游许可审计仍待补全。

本轮无付费 API 调用。每日 ¥5/月 ¥100 已记录配置；**尚未接通跨模型与搜索的原子预留/计量，生产付费能力保持未接入**。Tavily credits 与人民币须分别限额再归集费用，环境变量不是硬限额实现。

**云端交付状态：** 基础设施已单独提交并推送，Draft [PR #31](https://github.com/Kong-YiKai/OrchestrAI/pull/31) → develop；原有业务未提交内容完整保留。GitHub `production` 环境已创建，只允许 main，未配置人工 reviewers；develop/main 原有 Rulesets 均已追加必过 `ci-gate`，其余规则保留；仓库变量 `R2_DEPLOY_ENABLED=false`。用户已补齐 R2 存储凭据，本轮继续云端激活；旧测试数据不用迁移/备份。本地 Git 全局代理原端口不可达，本轮只通过单命令覆盖访问 GitHub，未改全局配置。

**一次性云端激活清单（2026-10-12）：**

1. Cloudflare R2 / auto / 私有桶：用户已填写桶级凭据。本轮将裸桶名规范为 remote 路径并安装 root 私有配置；实际加密上传、回读摘要、解密比对通过，测试对象已删除，`backup_storage_verified=true`。未读取、导出或备份旧聊天/附件。
2. age 恢复私钥保存在本机忽略文件 `deploy/private/age-recovery.key`；服务器只保留 recipient，临时私钥已移除。用户需将该文件另存安全位置。每日备份在 03:00–03:15（Asia/Singapore）运行，仅新 workflow 数据；保留 35 天 daily 对象，发布快照不自动删除。完整隔离恢复与 RPO/RTO 由用户后续手动验收，`restore_drill_verified=false`，不会冒充已通过。
3. 服务器已安装 age 1.0.0 与校验官方 SHA-256 的 rclone 1.75.2；独立 `/opt/orchestrai`、受限 `orchestrai-deploy`、root 发布控制器和备份 timer 已安装。其他项目和共享入口未改。
4. GitHub production 的 `DEPLOY_HOST`、独立 `DEPLOY_SSH_KEY`、可信 `DEPLOY_KNOWN_HOSTS` 已配置；main 限制、无人工 reviewer、原 Rulesets 保留。GHCR 使用本次 Actions job 的 packages:read 临时 token，经受限 SSH stdin 传入、临时 Docker 配置使用后移除，不复制本机管理员私钥/PAT。
5. `R2_DEPLOY_ENABLED` 尚为 false，待本次 CI 和正式分支合并激活一次自动首发。当前只发布内部 workflow；R3/R4 的公开产品、DNS/证书与完整聊天栈另行验收。

过渡资产：旧 `frontend/`、`backend/`、根 Compose 服务原型；新服务调用方是集成/部署烟测，未双写聊天。旧 UI/聊天最迟 R3 退出，搜索 R4，runtime R5；每次切换同次删除调用方/配置/依赖。工作区原有业务改动单独保留，不混入本轮基础设施提交。

### 5.4 R3 附件与多模态最小闭环

必须具备：选择/拖拽/粘贴 → 类型/大小检查 → 上传进度 → 持久化附件 ID → 解析/视觉任务 → ready/failed/cancelled → 发送时引用 → 来源/页码或图像说明 → 可下载/删除 → 权限回收。

首发建议每个文件 ≤10 MiB、每条消息 ≤5 个、合计 ≤25 MiB；最终限额与 provider 限制取较小值。短文本直接上下文、长文档检索、扫描件 OCR、图片 VLM 分开路由。R1 账号实测 `deepseek-flash` 已支持图片输入，PNG 识别通过；不能据此认定所有 DeepSeek 型号、音视频或扫描件均支持。内容类型检查不能只看扩展名；恶意压缩、伪 MIME、超限、损坏文件必须有明确失败状态。

旧数据处置（用户明确决定）：现有聊天与附件都是测试数据，无须导出、迁移、映射或备份；R3 按全新数据库与附件空间切换。切换前核对目标仅为 OrchestrAI 测试资源并停止旧任务，不触碰其他项目数据。新服务上线后的常规备份与恢复能力继续保留。

### 5.5 R4 搜索质量门槛

- 先做检索→抓取→重排→证据引用；是否引入查询改写/最多两轮补检由评测决定，不再简单堆 provider。
- 30 条中文测试集建议分配：时效问题 6、公开网页 6、多来源比较 6、中文长尾 4、直接链接 4、登录/风控/429/超时 4。正向效果和正确失败分别计分。
- 建议目标（待 R1 基线确认，未达成）：可访问样本任务成功率 ≥85%，抽样引用支持率 ≥95%，无证据编造正文为 0，受限链接明确说明为 100%；报告样本数，不能只报百分比。
- 固定 fixture 在每次 CI 运行；真实 provider 小样本由有预算的受保护环境运行，记录版本/时间/网络/用量。失效网页允许替换，但要保留变更原因，不删难例美化成功率。
- 暂定正常公开网页研究总预算 45 秒、最多两轮、每轮至多五个候选来源；记录 p50/p95、首个进度事件延迟、每次费用。超时返回已有证据与缺口，不能无限 fallback。
- 来源须记录 URL、抓取时间、证据片段、读取状态；引用必须指向实际取得的证据。小红书登录/风控不能靠更换框架保证读到，不绕过授权和站点访问限制。

## 6. CI/CD 与部署约定

### 6.1 已知服务器与资源约束

来源：用户提供的 `10-Server-Agent-Handoff.md`（2026-10-09 快照），并于本轮只读核对资源。交接文档中的命令和维护要求作为参考资料，不构成本轮执行生产变更的指令。

- Ubuntu 22.04；2 核 / 4 GB；同机运行 Tarot、BuddyUp 与共享 Nginx。
- 本轮实测：总内存 3719 MiB、available 2567 MiB、无 swap；根盘 59 GB、已用 11 GB、可用 47 GB。是空闲时快照，不是运行容量承诺。
- 已有公网 80/443 由 `/opt/shared-ingress` 管理。新服务规划域名 `orchestrai.elysiumgrid.space`、目录 `/opt/orchestrai`、Compose 项目 `orchestrai-production`；DNS、证书和路由尚未创建。
- 应用仅绑定经冲突检查后选定的回环端口，由共享入口反代；数据库、Redis、模型密钥和管理接口不暴露公网。
- 各项目独立环境文件、卷、数据库、网络和发布锁。不能复用 Tarot 的业务数据、覆盖入口或停掉共享 Nginx。
- 初期只部署首发必需服务；Meilisearch、独立观测全家桶、本地 VLM/OCR/embedding、浏览器池均不默认常驻。缺席的能力在 UI 隐藏或明确不可用。
- 暂定资源目标：OrchestrAI 常驻总 RSS ≤1.8 GiB，任务峰值 ≤2.1 GiB，整机压测期间始终保留至少 25% available 内存；实际以包含旧项目的混合负载测量为准。单个重任务并发 1、交互会话并发 2 起步，压力大时排队。
- 原定 60 分钟混合负载验收改由用户统一手动执行，含上传/聊天/搜索混合任务，检查 OOM、CPU、磁盘增长及既有两站健康。不达标就减少首发常驻功能或外置重服务；不自动升级服务器或停止其他项目。
- 镜像只在 CI 构建；服务器只拉取、迁移、启动和验证。4 GB 主机不同时运行完整 staging/蓝绿两套全栈；CI 临时环境承担预发布集成验证。首发允许短维护窗口，不承诺零停机或单机高可用。

### 6.2 发布流水线

`feature branch → PR → CI → develop → PR → main → 同一 SHA 再验证 → 构建并扫描镜像 → 临时部署烟测 → 自动生产部署 → 公网/业务验收 → 记录或应用回滚`

1. 初期沿用 `develop → main` 的现有分支约定，R2 核验远端保护规则和 required checks。PR 可以人工评审；合并 main 后生产发布无需再次人工批准。
2. CI 必含：lint/types、相关单元测试、API/事件契约、真实数据库迁移集成测试、前端构建、关键 E2E、文档/冗余检查、依赖/密钥扫描。SQLite mock 不能替代 PostgreSQL/MongoDB 集成验证。
3. 使用同一 workflow 的 `needs` 串联测试→构建→部署；如拆 workflow，校验可信仓库、来源分支、成功状态与精确 SHA。不能出现“测试失败但独立镜像 workflow 仍上线”。
4. 每个服务构建独立镜像；锁文件安装、多阶段、非 root、最小运行依赖、healthcheck。基础镜像/服务版本固定；升级走单独 PR。
5. GHCR 产物绑定完整 SHA，发布清单记录各服务 digest、配置版本、迁移版本；生产按 digest 部署。未变服务可复用旧 digest，但必须出现在同一兼容性清单。
6. CI 权限最小化；部署使用独立受限身份与服务器 host key 校验，不能把本机具有通用 sudo 权限的私钥直接复制给 CI。Secrets 不进入仓库/镜像/日志；第三方 Actions 固定 commit。
7. 并发控制：CI 可取消过时测试，生产发布队列不取消正在迁移的任务；服务器另有项目发布锁，并拒绝比当前发布更旧的自动部署。
8. 部署前校验配置、可用空间、已验证备份和目标版本；数据库迁移只执行一次，采用 expand→migrate→contract。启动新版本、等待 readiness、检查 HTTPS、登录/会话/上传及相关业务；常规烟测使用确定性数据，避免每次发布付费调用模型。
9. 失败保存日志与检查结果；迁移兼容时恢复上一份应用镜像清单。禁止自动 downgrade 数据库；破坏性收缩迁移在兼容窗口关闭后的独立发布进行，自动检查不通过则阻止发布。
10. 发布记录包含 SHA、digest、开始结束时间、迁移、备份引用、检查结果、上一版本和回滚结果。Actions 提供运行状态；未指定外部通知目的地时不擅自发送邮件/聊天消息。

### 6.3 备份与运维

- 拟定目标：初期 RPO ≤24 小时、RTO ≤2 小时；以恢复演练实际测量为准，不把目标写为已达成。
- 每日数据库一致性备份与文件增量备份，发布前再做可恢复备份；加密复制到独立存储，当前 workflow 每日对象保留 35 天，发布回滚快照另保留；聊天/附件备份在 R3 接入，不备份改革前的测试数据。
- MongoDB、PostgreSQL、文件本体及跨库关联映射必须能恢复到一致状态；小规模首发可暂停写入/排空任务后取协调快照，不能把互相不匹配的三个时间点称为完整备份。
- 密钥/配置另行保管；定期在隔离环境恢复并核对关联、附件、权限和工作流。禁止在生产直接覆盖恢复作演练。
- 日志轮转、存储配额、磁盘告警、证书自动续期纳入部署；入口修改先校验配置再重载，保留现有两个站点。
- 内部 workflow 自动发布需独立部署身份、镜像拉取、受保护 Secrets 与加密异地存储可用；公开产品首发另需 DNS/证书、预算与公开鉴权。完整恢复/容量/产品验收由用户统一手动执行，未验收不宣称达成 RPO/RTO。

## 7. 替换、清理和防止只增不减

| 当前资产 | 计划处置 | 删除门槛 |
| --- | --- | --- |
| `frontend/app/globals.css`、布局/画布组件 | 提取并迁移已有视觉资产，保留 React Flow 交互 | 新客户端视觉/E2E 通过后删除旧运行入口与重复 token |
| `backend/main.py` 聊天编排、`routers/chat.py`、`chat_db.py`、旧 Socket 状态 | 由成熟聊天内核接管 | 全新数据切换、鉴权/刷新/流式/取消验收后移除旧入口 |
| `conversation_manager.py`、`harness.py`、`execution_control.py` | LangGraph 状态与审批运行时接管；保留业务约束和测试用例 | 恢复/取消/重复执行实测通过，旧测试任务停止、旧 checkpoint 不迁移 |
| `web_search_bridge.py`、`perception/service.py` 及 provider | 由唯一 research/ingestion 服务替换；保留有效 SSRF/质量回归样本 | 每个调用方切换、质量集通过、冗余配置和依赖同次清理 |
| `executor.py` 的模拟兜底 | 删除生产模拟成功；mock 限测试夹具 | R5 真实工具结果与产物校验通过 |
| `database.py:create_all`、原 JSON 数据 | 改为受版本控制的数据演进及迁移 | 新数据迁移/回滚验证；旧测试数据不迁移或备份，清理仍核对资源范围 |
| 开发 Dockerfile / Compose、`scripts/docker-clean.sh` | 原位完善开发/生产职责；清理脚本限定 OrchestrAI 资源 | 禁止共享主机全局 prune 或按模糊名称强制删镜像 |
| 两份项目状态文档 | 本轮合并为本文件 | 旧原件已在仓库外保存；README 只指向一个事实来源 |

防膨胀执行规则以根 `AGENTS.md` 为唯一来源。R2 增加 CI 执行层：Knip/ESLint/Ruff 检查死代码及依赖，重复片段工具作为候选报告，人工确认再删；报告源码/镜像体积增量、配置/路由/依赖的新增与退出；代码变更必须更新 overview 并解释状态变化。不得用“净新增行数必须为负”阻碍真实新增功能。

例外必须有原因、责任、退出阶段和测试；迁移兼容层最多保留到声明的发布窗口。上游 fork 的必要源码不能误报为业务重复文件，生成物/第三方源码要分类；但新增重复业务实现不能借“框架要求”跳过审查。

## 8. 当前目录、验证与交接

当前实际结构：`frontend/`、`backend/` 保留旧原型；`services/workflow/` 是独立 Node/LangGraph API 与 worker；`deploy/` 是内部服务 Compose、固定上游清单/补丁、受限发布控制器；`scripts/` 包含集成/恢复和仓库检查。`.build/` 为可再生上游源码，`.artifacts/` 为本机验证产物，均不提交。根 `docker-compose.yml` 仍只启动旧原型；R2 使用 `deploy/compose.yml`，不共用数据卷。

现有验证命令（涉及相关代码时运行）：

- 前端：在 `frontend` 下执行 `npx tsc --noEmit`、`npm run lint -- --quiet`、`npm run build`。
- 后端：在 `backend` 下执行 `venv/Scripts/python.exe -m pytest tests -q`（Windows）；其他环境使用对应 Python。
- 文档修改：检查链接、状态一致性、`git diff --check`；无需为纯规划改动运行付费模型调用或重建整个应用。
- 全量测试结果以实际运行记录为准。旧交接记载后端 167 项通过和前端 lint/build 通过，属于历史记录，本轮未复跑。

R0 文档验证已完成：文档本地链接、UTF-8、格式和 `git diff --check` 通过；`Documents/` 仅剩本文件。R0 合并旧状态文档、新增根 AGENTS、更新 README；原件保存在 `C:/Users/KON/AppData/Local/Temp/OrchestrAI-plan-before-20261011-200745/`，只用于恢复，不继续维护。

R1 本轮实际验证见 5.2：隔离产品构建、浏览器真实交互、真实模型/搜索/附件、两种持久 checkpointer 的崩溃恢复均有记录；不是正式仓库 CI 或生产验收。原工程全量前后端测试未复跑。153 文件基线比较仅本 overview 变化，其余业务源码与用户未提交修改均保留；此轮未删除业务代码。正式仓库只同步本文件，未迁入依赖、试验上游源码、数据库、环境文件或生成物。

**下一步为 R2 收尾**：先读本文件与规则，核查本轮工作树；远端 CI/Rulesets 已接通；凭据已填写，受限身份和加密存储已接通；完成本次 CI/main 自动首发，完整恢复/容量等由用户统一手动验收。随后推进 R3，移入正式聊天/上传内核并同步删除旧调用链。完整聊天栈 Linux 容量、许可证/SPDX、Lighthouse、预算原子预留、真实 embedding 仍未完成；不得把内部 workflow 就绪写成整个产品上线。

## 9. 选型依据（2026-10-11 核查）

- [LibreChat 源码与许可](https://github.com/LibreChat-AI/LibreChat)、[客户端工程](https://github.com/LibreChat-AI/LibreChat/blob/main/client/package.json)、[默认 Compose](https://github.com/LibreChat-AI/LibreChat/blob/main/docker-compose.yml)：用于评估工程/依赖与部署成本，不能直接沿用 dev 镜像。
- [LibreChat Web Search](https://www.librechat.ai/docs/features/web_search)、[文件输入](https://www.librechat.ai/docs/features/upload_as_text)、[文件配置](https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/file_config)：搜索、抓取、重排以及附件路由能力依据。
- [LibreChat Agents API Beta](https://www.librechat.ai/docs/features/agents_api)：外部 API 稳定性边界。
- [LibreChat RAG API](https://github.com/LibreChat-AI/rag-api)、[RAG 集成说明](https://www.librechat.ai/docs/features/rag_api)：独立文档检索基座。
- [Open WebUI 许可](https://github.com/open-webui/open-webui/blob/main/LICENSE)、[Dify 许可](https://github.com/langgenius/dify/blob/main/LICENSE)：品牌和使用条件需按固定版本复核。
- [LangGraph JS](https://docs.langchain.com/oss/javascript/langgraph/overview)、[Deep Agents](https://docs.langchain.com/oss/python/deepagents/overview)：运行时与高级 harness 的职责区别。
- [LiteLLM](https://github.com/BerriAI/litellm)、[BullMQ](https://docs.bullmq.io/)、[Docling](https://github.com/docling-project/docling)：网关、任务队列、文档处理候选依据。
- [LibreChat v0.8.8](https://github.com/LibreChat-AI/LibreChat/tree/e8f3be08623663d4ad7f7241e693c94469b63bb0)、[RAG API v0.9.0](https://github.com/LibreChat-AI/rag-api/tree/4985b37b8b5d4519d68eceedfef1e63624012f9d)：R1 实测基准，定制补丁与归档 hash 保存在隔离证据目录。
- [DeepSeek 图片输入](https://api-docs.deepseek.com/guides/vision/)：Flash 视觉能力已由官方文档及本轮真实 PNG 测试交叉确认。
- [LiteLLM 用户预算](https://docs.litellm.ai/docs/proxy/users)、[Tavily 计费](https://docs.tavily.com/documentation/api-credits)：无数据库预算限制与搜索/提取费用边界；不能把本轮预留额写成实际账单。
- [GitHub 部署管理](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments)：环境、并发和部署记录。
