# OrchestrAI — 项目总览与改革计划

> 更新：2026-10-14（Asia/Singapore）。这是项目现状、架构决策、阶段计划、部署约定和下一步任务的唯一事实来源。
> **每次新对话、新任务或接手开发，AI 必须先读本文件，再读根目录 `AGENTS.md` 和相关目录规则。每次完成修改必须同步更新本文件。**
> 改革进度：R0、R1 选型已完成（用户确认）；R2 代码与内部部署已完成，待用户统一手动验收。PR #31/#32 已合并，main 提交 e9309c5 的 CI、GHCR 发布与自动 CD 全部成功；受限部署身份、Secrets 与加密异地存储已接通。R3 采用全新数据，不迁移旧测试聊天/附件。

> **R3 已完成代码与服务器内部候选部署，待用户统一手动验收。** PR #33/#34 已合并；main `901beb6` 的 CI、八种不可变镜像发布、自动 CD 与部署烟测全部通过。新服务六份协调加密快照及完成清单已在 Cloudflare R2 回读校验，服务恢复健康。百炼 1024 维检索与聊天/PDF/图片真实联调此前通过；本轮收尾无付费 provider 调用。公网 DNS/TLS/搜索留 R4，画布与通用 harness 留 R5，见 5.4。

> **R4 进行中：独立研究服务已公开部署，普通聊天联网闭环未完成。** PR #35/#36 与 main `312b37a` 的 CI/CD、独立研究入口和备份验证记录仍有效，但不能代表聊天内 Web Search 已交付。2026-10-13 用户截图及代码核查确认普通聊天没有调用 research，之前将阶段整体标为已完成不准确；先补齐 R4 聊天联网与网页读取，再进入 R5，见 5.5。

> **自有前端重做：代码与本机交互验证已完成，交付检查进行中。** 按用户确认的七个 Figma 画面合理适配，原位替换页面与交互，继续复用聊天/附件/身份数据层；真实任意画布、成果库和自动研究上下文共享未接通，见 5.7。自有前端与首轮接线已随 main `1048340` 发布，链接补修仍在交付。

## 1. 已确认的产品方向

- 产品名称与品牌：**OrchestrAI**。允许重做内部工程，以尽快获得成熟聊天、搜索、文件和多模态体验为优先。
- 保留现有暖色主题、奶咖背景、琥珀橙强调色、三栏 Orchestra、上下文面板与 React Flow 画布的设计方向；不能套用另一项目的整套页面或只替换 Logo。
- 2026-10-13 用户提供的 [Figma 设计](https://www.figma.com/design/eN0Gjqa8PggrWnYIUXDrLN) 与 [交互原型](https://www.figma.com/proto/eN0Gjqa8PggrWnYIUXDrLN?node-id=0-1) 是自有界面的风格与大致布局依据；原型可能不完整，功能逻辑须结合真实服务契约核查。复用工程内核不等于沿用上游整页客户体验；读取审计见 5.6，实际重做与能力边界见 5.7。
- 框架和现有 Next.js 技术选型可以调整；视觉资产与交互意图要有明确迁移方案；用户确认现有聊天/附件全为可弃测试数据，R3 不迁移、不备份这些旧数据。
- 优先复用成熟开源实现；按业务边界尽早独立服务化。每个新能力在正式接入前就确定进程、API、数据所有权和部署边界，不再排到旧 Phase 14。
- CI 全部通过后自动部署生产，不设置常规人工生产批准步骤。R2 一次性准备和内部 workflow 首发已完成，自动 CD 已激活；公开聊天产品待 R3/R4。
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

2026-10-12 本地空间清理：已确认 Docker context 为 `desktop-linux`，Endpoint 为本机 Docker Desktop named pipe，未操作服务器或 GHCR。按精确镜像 ID 非强制删除 9 个无容器引用的旧镜像：`multi-agent-tarot/{backend:local,frontend:local,postgres:16-alpine,langfuse:2}`、`myspace/{postgres:17-alpine,nats:2.12-alpine,minio:latest}`、`node:24.16.0-alpine`、`redis:7.4.2-alpine`。本地镜像由 21 个减为 12 个；保留当前 OrchestrAI 运行/测试镜像、固定基础镜像、Trivy/Actionlint。清理前后核对 4 个容器、13 个数据卷均未变；未执行全局 prune 或删除数据。删除的镜像再次本地使用时须拉取或重新构建。

本轮实测仍保留：`frontend/node_modules` 549.66 MiB、`backend/venv` 383.63 MiB、`services/workflow/node_modules` 75.24 MiB，均为开发/测试所需依赖；`frontend/.next` 293.92 MiB 为可重新生成的构建缓存。本轮只删除上述 Docker 镜像，不删除工作区缓存或依赖。Docker 构建缓存另占约 25.08 GB，其中约 20.83 GB 标为可回收（Docker CLI 口径，镜像/缓存层存在共享，不与镜像大小相加，也不等于 Windows 已释放的物理空间）。需要额外清理时，停止相关构建后按本地 builder 和闲置时间过滤缓存；不能把未运行的数据库卷判定为无用。

同日 R3 接手后进一步清理：在本机 `desktop-linux` 按精确 ID 非强制删除 9 个无容器引用的镜像，分别为 `orchestrai/{workflow:local,workflow-test:local,redis:local,postgres:local}`、`rhysd/actionlint:1.7.7`、`aquasec/trivy:0.75.0` 以及 3 个可重新拉取的固定 Node/Redis/PostgreSQL 基础镜像。镜像从 12 个减为 3 个，剩余 `orchestrai/backend:latest`、`orchestrai/frontend:latest`、`postgres:16-alpine` 均被旧的已停止容器引用；新聊天候选版启动并核对引用后再处理这些旧容器/镜像。清理前后 4 个容器、13 个卷均未变；未清理其他项目的构建缓存、服务器镜像或 GHCR。逐 ID 记录在忽略文件 `.artifacts/r3/image-cleanup.json`，不将镜像逻辑大小相加当作物理空间释放量。

### 2.2 能力状态（覆盖旧文档结论）

| 旧阶段/能力 | 当前状态 | 证据与处置 |
| --- | --- | --- |
| Phase 1 / 1.5 / 2 / 2.5 / 2.6：脚手架、设计系统、布局、开发 Compose | 已完成原型基础 | 存在 Next.js、FastAPI、PostgreSQL、暖色 token 和三栏 UI；视觉与画布优先保留 |
| Phase 3：聊天→澄清→确认→生成工作流 | 已完成原型，生产化未完成 | 已有真实模型接线和历史记录；旧记录称部分 UI 实测通过，本轮未重跑业务验收 |
| Phase 4 / 4.5-pre：画布、节点编辑、Run/Stop、DAG 展示 | UI 原型已完成；真实执行未完成 | `executor.py` 仍有 mock 和模型模拟兜底；按 order 顺序执行不等于 DAG 调度 |
| Phase 4.5：Harness、checkpoint、审批、取消 | 未完成（迁移重做） | 有持久化函数，但会话/任务控制仍含内存状态，不能作为多实例可靠恢复依据 |
| Phase 5.5 / 5.6 / 5.6-R1：Web Search、动态读取 | **未完成（重做）** | provider 较多，上层仍是关键词判断和自研 bridge；没有通过固定质量集验收 |
| Phase 5.7 / 5.8：文件和多模态 | R3 图片/PDF/TXT 最小闭环已完成；扩展未完成 | 旧 URL 感知/回形针入口已退出；新聊天内核支持真实上传、图片理解与文档检索。OCR、Office、音视频与生成能力留后续阶段 |
| Phase 6：真实工具执行 | 未完成 | 需真实工具结果、权限、幂等和产物验证，删除生产模拟成功路径 |
| Phase 7 / 8：Windows Computer Use | 未完成 | 未来独立桌面执行端；Linux 共享服务器不承担 Windows 桌面操作 |
| Phase 9 / 12 / 13 / 14：生产数据、LLMOps、云部署、微服务 | 未完成 | 工程基础提前；微服务、迁移、发布、备份不再后置 |
| Phase 10 / 11：子对话、文件库、模型比较、团队、市场 | 未完成 | 随主线逐项引入；占位页不能标为功能完成 |

### 2.3 已确认的工程缺口

- `.github/workflows/ci.yml` 已原位升级为质量门禁、真实 workflow 集成/恢复、固定版本安全扫描、GHCR 发布与自动 CD；本地验证见 5.3。PR #31 已推送且有云端 CI 全部通过记录；Rulesets 已追加 ci-gate。GHCR/main 发布及服务器 CD 已执行成功；独立 workflow 是内部服务，公开产品尚未上线。
- 旧前端开发 Dockerfile、根 Compose 与 backend `create_all` 已随原型退出活跃 Git/CI。当前静态客户端与独立服务按 digest 发布、强制私有凭据；数据库/Redis 不开放公网。旧测试库未迁移。
- 会话身份与附件归属由 LibreChat 接管，ingestion/workflow 独立校验服务委托及用户权限；生产 smoke 已走真实登录身份。公网首发和完整权限产品验收仍在 R4/手动验收范围。
- 原有用户未提交原型已保存源码快照并在本机忽略保留，未覆盖；实际服务器发布来自受保护 main 的精确 SHA，与原型工作区分开。
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
| Deep Agents JS | 提前至 R5 的首选 harness 评估，尚未接入 | 复用 LangGraph 上的 Agent 执行循环、上下文管理、文件工具、子 Agent、审批与 MCP；在现有 workflow worker 内接入，不启动第二套工作流平台 |
| DeepSeek Harness | 隔离对照候选，不进入当前生产依赖 | 官方 MIT、插件架构；当前为开发者预览，官方明确不能视为生产就绪。仅在独立试验验证插件、服务嵌入及恢复能力；未安装、未运行或做性能评测 |
| LibreChat RAG API | 独立 ingestion 服务的首选基座 | FastAPI、LangChain、PostgreSQL/pgvector；接文件解析/检索，不另建平行 RAG 管线 |
| LiteLLM Proxy | 独立模型网关候选，R1 测资源及兼容性 | 统一 provider 适配、额度、超时、用量；付费企业能力不默认依赖 |
| BullMQ + Redis | 长任务队列候选 | JS worker 调度、重试、并发限制；队列不替代 LangGraph checkpoint，不再自研通用队列 |
| Docling | 后续复杂文档解析候选 | 仅在扫描件/表格效果不足时接独立远程 worker；首发不在共享 4 GB 主机加载重型本地模型 |
| Docker Compose + GitHub Actions + GHCR | 首发部署与交付 | 服务独立镜像，单机内部网络；当前无需 Kubernetes、服务网格或自建全套观测平台 |

首轮实验版本见 5.2；R3 已冻结 schema=2 生产发布清单，记录八种镜像 digest、完整 main SHA 和配置摘要。上游固定 tag/commit、归档校验和与许可证声明保存在 `deploy/`，不跟随 dev/latest；完整许可证人工审核仍待用户验收。

2026-10-12 harness 选型补充：用户提出优先利用现成框架解决真实执行难点。核查官方资料后，R5 优先评估 Deep Agents JS 与既有 LangGraph 的组合；这是基于当前 JS 运行时的兼容性判断，不是已验证的生产选型。确定性画布 graph 继续由 LangGraph 调度，自主任务的工具循环优先交给成熟 harness，不再自研通用规划器、上下文压缩器或子 Agent 调度器。Deep Agents 支持具备工具调用能力的 LangChain chat model，DeepSeek 的具体模型/网关适配仍须真实联调。接入前锁版本、检查许可证和传递依赖、确认与现有 checkpointer 的兼容性；不因为候选成立就立即增加依赖或替换已部署的 R2。

框架复用的交付边界：搜索/解析/产物生成通过现有能力服务或 MCP 接线，workflow 保存运行输入快照及 operation ID；chat 继续作为用户/会话事实源。harness 的默认文件工具和 shell 不直接获得共享生产主机、Docker socket、数据库管理员或所有模型密钥。需要代码执行时接独立受限 worker/沙箱。租户鉴权、预算预留、业务幂等、审批参数绑定和产物校验仍须产品接入；checkpoint、插件列表或模型文字不能充当实际完成证据。验收保持小型真实任务、失败态与必要恢复烟测，完整容量/产品验收由用户手动完成。

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
| `chat-service` | LibreChat server | 用户、会话、消息、附件元数据与归属；MongoDB | R3 |
| `workflow-service` + 独立 worker 进程 | LangGraph JS + BullMQ | workflow/version/run/checkpoint/approval/idempotency；PostgreSQL | R2 最小闭环，R5 完整化 |
| `research-service` | 可复用的上游搜索工具 + SDK | 查询/抓取/重排、证据集合与研究任务结果；不保存第二份聊天历史 | R4；R1 验证提取可行性 |
| `ingestion-service` | LibreChat RAG API | 解析、chunk、embedding、索引状态；独立 PostgreSQL 数据库/角色 | R3 |
| `model-gateway` | LiteLLM Proxy 候选 | 模型路由、密钥、额度与模型调用计量；没有第二个会话主库 | R3 |
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
| R2：微服务与交付基础 | 已完成（代码与内部部署；待用户手动验收） | 独立服务最小链路、迁移/契约、自动 CI/CD、身份/配置边界 | Compose、Actions、GHCR、PostgreSQL、Redis/BullMQ、LangGraph | CI 同一提交产出镜像；隔离环境部署/回滚/恢复通过；具备发布前提 |
| R3：成熟聊天与附件候选版 | 已完成（代码、CI/CD 与内部部署；待用户手动验收） | 原有风格的真实聊天、登录、历史、图片/PDF/TXT 上传、文档问答与新服务协调备份 | LibreChat chat/client、RAG API、pgvector、百炼 text-embedding-v4、DeepSeek 视觉、LiteLLM、持久存储；OCR 未接入 | 核心真实联调与权限烟测通过；可信 main 部署候选版、六份加密快照异地回读通过 |
| R4：Web Research 重做与首发 | 进行中（独立服务已部署；普通聊天联网未完成） | 普通聊天调用唯一 research：搜索→读取→重排→引用、可见过程、限额与拒答 | 固定 LibreChat agents 搜索工具、Tavily 搜索/读取、BM25 初始重排；复用 PostgreSQL/Redis 与模型网关预算，新增独立 research 服务 | 普通聊天天气查询/网页总结真实调用研究并展示来源或具体失败；必要 CI/部署烟测通过；完整质量/容量由用户手动验收 |
| R5：真实工作流执行 | 未完成（重做） | 画布映射真实 graph、DAG、版本、审批、取消、重启恢复；自主任务复用成熟 harness | React Flow、LangGraph JS、Deep Agents JS 首选评估、Postgres checkpointer、BullMQ、MCP | 真实三节点任务成功；断线/崩溃/重复投递不重复副作用；mock 只留测试 |
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
4. 确定服务身份委托、API/事件协议与 schema；旧测试聊天/附件已按用户决定免迁移；审批版本/取消/重复投递/预算并发要求进入 R2/R5 可测试契约。
5. 单一路线已由用户确认；旧入口按第 7 节退出，聊天/UI 最迟 R3，搜索最迟 R4，运行时最迟 R5。对应调用方未迁移前保留原型，禁止接通两套生产入口。

### 5.3 R2 实施记录（2026-10-12）

**状态：已完成代码与内部部署，待用户手动验收。** 分支 `codex/r2-service-delivery`，内部服务不开放公网端口，不挂载模型/搜索凭证。R3 聊天内核接入与 R5 任意 DAG 仍未完成。用户统一手动验收，本轮仅保留必要 CI 与部署烟测，不扩展复杂验收。

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

**本机实际验证：** Linux 集成 9 项通过（身份、迁移、并发幂等、真实队列审批、崩溃恢复、取消、Redis 重建）；独立 API/worker 部署烟测和重启烟测通过。`pg_dump` 恢复到隔离数据库后，runs/artifacts/events/checkpoints 数量与内容摘要逐项一致。发布/回滚/备份保留契约测试 5 项通过。npm audit 为 0，workflow、PostgreSQL、Redis 三个最终镜像的 Trivy 高危/严重均为 0，源码秘密扫描通过；镜像本机 `.Size` 约 76.6 MiB（非完整产品体积）。旧工作区后端 167 tests 通过（1 条 Pydantic 弃用告警），旧前端 tsc/lint/build 通过。SPDX 仅新 workflow 已生成；上游许可审计仍待补全。

R2 本轮交付范围为独立 workflow 与交付基础；原规划中的 chat/ingestion/gateway 和原子预算接线随 R3 首次接入完成，独立服务边界不变。R2 本轮无付费 API 调用。每日 ¥5/月 ¥100 已记录配置；**尚未接通跨模型与搜索的原子预留/计量，生产付费能力保持未接入**。Tavily credits 与人民币须分别限额再归集费用，环境变量不是硬限额实现。

**云端交付状态：** [PR #31](https://github.com/Kong-YiKai/OrchestrAI/pull/31) → develop、[PR #32](https://github.com/Kong-YiKai/OrchestrAI/pull/32) → main 均已合并。main SHA `e9309c5bb7cc71902e133db5e8abfaaa42e97433` 的 [Actions #38163770676](https://github.com/Kong-YiKai/OrchestrAI/actions/runs/38163770676) 全部检查、三个镜像发布和自动部署均成功；服务器发布记录 `outcome=deployed`。`R2_DEPLOY_ENABLED=true`，production 只允许 main、无人工 reviewers，原 Rulesets 保留。实际完成：受限 SSH 身份、临时 GHCR 登录、发布前加密备份、迁移、readiness 与真实 HTTP 审批→产物烟测。又实际运行一次 systemd daily backup，退出 0 且异地回读校验成功；完整隔离恢复与真实故障回滚仍由用户手动验收。

部署后一次快照：API 42.14 MiB、worker 38.77 MiB、PostgreSQL 45.20 MiB、Redis 3.89 MiB，合计约 130 MiB（Docker stats 内存口径，非全聊天栈 RSS/压测峰值）；整机 available 2434 MiB。Tarot、BuddyUp、共享 Nginx 保持正常运行。原有业务未提交内容完整保留；旧聊天/附件无迁移、备份或删除操作。本轮无付费 provider 调用，无需充值或新增 API Key。

**一次性云端激活清单（2026-10-12）：**

1. Cloudflare R2 / auto / 私有桶：用户已填写桶级凭据。本轮将裸桶名规范为 remote 路径并安装 root 私有配置；实际加密上传、回读摘要、解密比对通过，测试对象已删除，`backup_storage_verified=true`。未读取、导出或备份旧聊天/附件。
2. age 恢复私钥保存在本机忽略文件 `deploy/private/age-recovery.key`；服务器只保留 recipient，临时私钥已移除。用户需将该文件另存安全位置。每日备份在 03:00–03:15（Asia/Singapore）运行，仅新 workflow 数据；保留 35 天 daily 对象，发布快照不自动删除。完整隔离恢复与 RPO/RTO 由用户后续手动验收，`restore_drill_verified=false`，不会冒充已通过。
3. 服务器已安装 age 1.0.0 与校验官方 SHA-256 的 rclone 1.75.2；独立 `/opt/orchestrai`、受限 `orchestrai-deploy`、root 发布控制器和备份 timer 已安装。其他项目和共享入口未改。
4. GitHub production 的 `DEPLOY_HOST`、独立 `DEPLOY_SSH_KEY`、可信 `DEPLOY_KNOWN_HOSTS` 已配置；main 限制、无人工 reviewer、原 Rulesets 保留。GHCR 使用本次 Actions job 的 packages:read 临时 token，经受限 SSH stdin 传入、临时 Docker 配置使用后移除，不复制本机管理员私钥/PAT。
5. `R2_DEPLOY_ENABLED=true`，内部 workflow 自动首发已成功。当前只发布内部 workflow；R3/R4 的公开产品、DNS/证书与完整聊天栈另行验收。

**手动验收入口：** 云端流水线查看上方 Actions；服务器运行 `sudo docker ps --filter name=orchestrai-production` 和 `sudo systemctl status orchestrai-backup.timer --no-pager`。可用 `sudo python3 -I /opt/orchestrai/deploy/release.py --backup` 手动执行新 workflow 的备份，检查 `/opt/orchestrai/state/last-backup.json`。R2 无公开聊天页面；真实聊天、附件选择上传与前端风格验收在 R3。完整恢复仅在隔离数据库进行，不覆盖生产库；恢复私钥不要发送聊天或提交 Git。

过渡资产：旧 `frontend/`、`backend/`、根 Compose 服务原型；新服务调用方是集成/部署烟测，未双写聊天。旧 UI/聊天最迟 R3 退出，搜索 R4，runtime R5；每次切换同次删除调用方/配置/依赖。工作区原有业务改动单独保留，不混入本轮基础设施提交。

### 5.4 R3 附件与多模态最小闭环

**状态：已完成代码、CI/CD 与服务器内部候选部署，待用户手动验收（2026-10-13）。** 保留暖色三栏、自定义侧栏/上下文与 React Flow 空画布；画布明确 R5 接通，未展示模拟成功流程。`services/chat` 复用固定 LibreChat 身份、会话、上传和流式 hooks；`services/ingestion` 复用固定 RAG API；`services/gateway` 采用 LiteLLM 1.105.0；`services/web` 使用同源 Nginx。MongoDB 8.0.20 是用户/会话/附件元数据唯一事实源，文件为专用卷；PostgreSQL 共用本项目实例但 ingestion 独立库/角色/迁移；每个服务独立镜像、配置、API 和 healthcheck，不跨服务 import 业务。workflow API/worker 共用一个镜像；完整栈共八种镜像、九个常驻进程。

网关使用单实例持久 SQLite、版本迁移及 `BEGIN IMMEDIATE` 原子预留，限制每日 ¥5/月 ¥100；未知失败用量保留预留，成功按实际 token 和保守费率结算，不能当作 provider 账单。多副本前须迁移事务协调；R4 搜索必须归集预算。模型密钥仅进网关，不进浏览器。解析仅 PDF/TXT、10 MiB/200 页；PDF 无可抽取文本明确失败，OCR/音视频未接通。RAG 使用独立 JWT、按用户过滤查读删，关闭任意本地路径/全库枚举/自动建表；运行角色只有 DML。chat→workflow 只从真实登录身份签发受限短期委托。

实际验证：本地客户端构建/类型、预算 3 项、发布与扫描策略 7 项、R2 9 项集成及重启/隔离恢复通过；确定性 smoke 通过匿名拒绝、登录、TXT 上传及真实身份委托→持久审批→真实产物，无付费模型调用。真实百炼 1024 维索引/查询/删除与跨用户 404 通过；真实聊天流/刷新持久历史、PDF 内容码/文件名/页码、PNG 红方蓝圆识别通过。PNG 首次因卷权限失败，已修复镜像目录所有权后成功，保留失败记录；取消后刷新路径/会话保留，更多取消/恢复边界留手动验收。候选入口 `http://localhost:3180`；本机 3088 既有进程未动。账号位于忽略的 `deploy/private/candidate-account.json`。

安全门禁升级直接/传递依赖及 RAG 运行版本，移除 chat 运行时 npm/npx、Mongo gosu/闲置 YAML loader/六个无用工具；保留原版 Mongo 服务及必要 dump/restore。braces 尚无发布修复，构建添加解析深度上限并验证深层输入被拒绝。原始 Trivy 与 SPDX 报告保留；`deploy/vulnerability-policy.json` 仅允许精确服务/漏洞/包/版本及不可达路径或已补丁评估，2026-11-12 到期，新发现/修复/服务边界变化阻断 CI，不使用全局忽略。Mongo 的 Go HTTP/TLS server 漏洞限仅两项本地 Mongo 协议 CLI，不能说镜像没有漏洞。完整许可证人工审核、容量/恢复/产品验收由用户执行，未宣称通过。

[PR #33](https://github.com/Kong-YiKai/OrchestrAI/pull/33) → develop、[PR #34](https://github.com/Kong-YiKai/OrchestrAI/pull/34) → main 已合并。此前安全扫描与 CI 临时磁盘问题已修复；只在 github-hosted 作业清理闲置构建缓存，并流式 gzip 归档。功能提交的 [CI #38257979516](https://github.com/Kong-YiKai/OrchestrAI/actions/runs/38257979516)、main PR 的 CI #38285208076 与可信 main `901beb6ced7eb71a2ea6e08434b31ef7da16d4a6` 的 [Actions #38286978033](https://github.com/Kong-YiKai/OrchestrAI/actions/runs/38286978033) 均通过；最后一轮八种镜像发布与自动 deploy 也为 success。schema=2 清单包含八类已测试镜像，由 CI artifact 传递后按 digest 发布，服务器不重建；配置摘要为 `914ed440680a4cf576a611073ac1f7119e3164c02172b58f9f8ea8154c5966b8`。root 发布记录 `outcome=deployed`、current schema=2/SHA=901beb6；迁移、readiness、原 workflow 产物及真实登录→TXT 上传→身份委托→持久审批→真实产物烟测成功，无付费 provider 调用。root 只读控制器及配置已安装，旧安装配置为 root 私有快照，四项 R2 密钥保留，22 项产品 env 私下扩充。

上线后实际执行一次完整栈 daily backup：暂停六个写入进程，workflow/ingestion dump、Mongo archive、附件/图片 tar、预算 SQLite 六份快照直接流入 age，各加密对象异地回读摘要校验后最后上传完成清单；Redis 仍可重建。完成记录 `format=2, parts=6`，清单 `consistency=all-writers-stopped` 且关联当前 SHA，对象名 `daily-20261012T181826Z.dump.age.snapshot.json`，SHA-256 `fa416501999c70eea7c65d01d66dfd99f392e95e7ad4a6a9aad6803a7eb3ee9f`。恢复启动全部九个进程并通过 readiness；快照后整机 available 1565 MiB（总内存 3719 MiB，无 swap），是空闲快照，不是混合容量验收。Tarot、BuddyUp、共享 Nginx 保持健康；未删除数据库卷或旧测试数据。完整隔离解密恢复、真实故障回滚与 RPO/RTO 仍待手动验收。

**服务器候选手动入口：** 仅绑定服务器回环 `127.0.0.1:3088`；本机可执行 `ssh -N -L 3181:127.0.0.1:3088 tarot-tencent` 后访问 `http://localhost:3181`。服务器 smoke 账号已私下保存到本机忽略文件 `deploy/private/production-account.json`，不与本地候选账号混用；注册默认关闭。本地候选仍为 `http://localhost:3180`，账号在 `deploy/private/candidate-account.json`。密钥/密码不要发聊天。公网域名尚未开放。

旧 `frontend/`、`backend/` 从 Git 活跃树退出，根开发 Compose 删除，旧启动文档与 CI 退出；使用 `git rm --cached` 保留用户未提交的本机文件并忽略。源码（不含密钥/依赖/用户数据）保存于忽略的 `.artifacts/r3/source-baseline.zip`；R4/R5 可从 Git/快照取有效搜索用例与画布语义，不能重新启用旧产品。配置脚本读取 `deploy/private/model.env`/已填写 providers，保留私有 product.env 中凭据，不再依赖旧 backend env。最新模板 `deploy/.env.example`；公开注册默认关闭。无需额外 Key/充值。本机另按精确 ID 移除四个已退出旧/试验容器及四个无引用旧镜像（旧 backend/frontend/PostgreSQL 与 workflow-test），所有数据卷保持原样。

R3 无剩余代码或服务器交付收尾项；用户统一手动验收完整产品、故障恢复、混合容量与许可证审核，未做项不宣称通过。本轮按要求停止扩展验收和付费验证，无需新增 Key/充值。下一开发阶段为 R4 公网 DNS/TLS/搜索；完整画布与 harness 在 R5，OCR/音视频/产物生成按后续阶段接入。

必须具备：选择/拖拽/粘贴 → 类型/大小检查 → 上传进度 → 持久化附件 ID → 解析/视觉任务 → ready/failed/cancelled → 发送时引用 → 来源/页码或图像说明 → 可下载/删除 → 权限回收。

首发建议每个文件 ≤10 MiB、每条消息 ≤5 个、合计 ≤25 MiB；最终限额与 provider 限制取较小值。短文本直接上下文、长文档检索、扫描件 OCR、图片 VLM 分开路由。R1 账号实测 `deepseek-flash` 已支持图片输入，PNG 识别通过；不能据此认定所有 DeepSeek 型号、音视频或扫描件均支持。内容类型检查不能只看扩展名；恶意压缩、伪 MIME、超限、损坏文件必须有明确失败状态。

旧数据处置（用户明确决定）：现有聊天与附件都是测试数据，无须导出、迁移、映射或备份；R3 按全新数据库与附件空间切换。切换前核对目标仅为 OrchestrAI 测试资源并停止旧任务，不触碰其他项目数据。新服务上线后的常规备份与恢复能力继续保留。

### 5.5 R4 搜索质量门槛

**状态：进行中；独立研究服务、必要 CI/CD 与公开部署已完成，普通聊天联网产品闭环未完成（2026-10-13 纠正）。** 分支 `codex/r4-web-research` 的部署记录保留。已修改现有客户端补丁、网关预算/配置、Compose、CI 与发布控制器；已有独立 research API/worker（同一容器）、数据库角色/校验和迁移、固定 fixture/队列测试和本站 TLS/续期资产。没有数据删除项；旧原型已退出活跃源码，chat 内置搜索保持禁用。本阶段已新增一个研究镜像/常驻进程，完整 schema=3 为九种镜像、十个常驻进程，复用本项目 PostgreSQL 与 Redis，不增加重型本地抓取模型。

**普通聊天缺口与误判原因：** 用户在聊天内发送知乎链接要求总结、询问明天杭州天气，得到模型“无法访问外部链接/无法实时联网”的通用回答。核查 `deploy/librechat.yaml`：`interface.webSearch=false`，DeepSeek 是普通 custom endpoint；`/api/research` 为独立研究入口，普通聊天未接入搜索/读取工具。前端重做仍沿用该后端协议，研究结果手动带入草稿也不等于普通消息会触发研究。此前验证独立研究入口和 CI/CD 后就标记整个 R4 完成，漏掉用户实际聊天入口的验收；该产品集成缺口属于 R4，不能推到 R5 或归因于用户额度/Key/操作。当前证据不能判断该具体知乎文章能否抓取，也不能把模型的通用拒绝当作站点风控结果。

**R4 必须补齐：** 普通聊天具备明确联网触发与服务端调用唯一 research 的工具/编排接线，将真实证据带回当前会话，在聊天展示进度、来源、具体失败和取消，并保留权限/预算控制。不能只开启上游内置搜索形成平行链路，也不能只改 prompt 让模型声称联网。必要小样本从普通输入框发起天气查询及网页总结，确认真实工具调用、证据/引用或具体抓取失败，并验证后续追问能使用该会话的证据；完整质量集仍由用户手动验收。本轮只核查代码并纠正状态，未实施该接线、未调用付费 provider、未重跑 CI 或改生产部署。

**普通聊天修复实施中（2026-10-14）：** 用户已授权修复并检查相关问题，交付时在聊天中给出完整手动验收线路。当前分支 `codex/r4-chat-search` 保留已提交前端重做及上轮状态纠正；原位修改固定上游补丁和配置，复用既有 LibreChat Agents 工具循环、消息流、附件和停止信号，不新增运行服务/模型供应商/依赖。输入区显式“联网搜索”开关使用原有 ephemeralAgent 状态，首次默认开启并保留已存的关闭选择；服务端按开关加载远程研究工具，鉴权依赖服务委托而非向浏览器索要 Tavily Key。工具使用拥有者委托与幂等操作 ID 调用唯一 research API，返回真实正文/来源/读取状态及结果快照，由原聊天消息协议保存，后续追问沿用该会话历史；不自动加载个人全部研究记录。研究记录删除不会删除已经发送的聊天快照，聊天记录仍归 chat 所有。

一并修复：相对日期加入 Asia/Shanghai 日期上下文；工具停止/等待超时取消已取得 ID 的远程研究任务，每轮最多两次顺序调用；开关关闭时不得声称新搜索；中文标点与链接相邻时不作为 URL 正文传给提取器；research daily 备份加入现有 35 天精确清理匹配。没有数据删除项；退出上游直接 provider 搜索构造及旧 Key 校验路径，保留上游消息/来源组件和权限检查。HTTP 创建响应丢失时任务 ID 可能未知，无法保证撤销已经发出的请求；远程任务/预算仍有边界，不自动重复付费调用。

当前实际通过：API 构建、客户端类型与生产构建、干净固定归档补丁应用（49 个变更/退出文件含既有品牌二进制）、聊天工具 5 项契约（身份、稳定操作键、正文/失败、取消、实际 ephemeral loader 开关/时间指令）、发布/保留 8 项回归（含到期/未到期 research 对象）。普通输入框真实联调已执行：开关请求依次为关闭/开启/关闭/开启，刷新保留选择、390px 无页面横向溢出及浏览器零异常；Python 页面首次因本机网络提取失败，知乎也未取得正文，均显示失败而非伪造内容。针对本机 TUN，仅候选 gateway 临时映射已核验的公网 DNS（含 Tavily provider 地址）；随后 Python 正文真实取得，聊天呈现来源，关闭搜索后的追问沿用当前会话。首次成功轮中模型并行工具请求导致第二请求 busy，已改为串行执行并用并发契约验证。不能把未分类提取失败断言为站点风控；工具已补充这项约束。真实联调发生模型调用与提取预算预留，不再记录为零费用；预算账本不是供应商账单。未进行 30 条付费质量集、容量或完整恢复验收。云端 CI/CD 与生产普通聊天烟测仍待完成。

**首轮发布已完成，链接补修仍在交付（2026-10-14）：** PR #37/#38/#39 已合并；可信 main `104834050f5b3e9c8ec43ae5aecced8af4ea169c` 的 [Actions #38435774930](https://github.com/Kong-YiKai/OrchestrAI/actions/runs/38435774930) 检查、九镜像发布及自动 deploy 均 success。current/schema=3/outcome=deployed，配置摘要 `7d74ecdbf0d1561d2a5120b960fc5005c8e3ed0ad97dc2ae71240930d377ce8c`，root 控制器已更新并保留配置恢复副本，生产 env/凭据未改变。发布前七份加密快照异地回读成功；十个常驻进程运行、九个 healthcheck 通过，worker 由发布中的真实任务烟测验证；本站/Tarot/BuddyUp HTTPS 都为 200。当前生产已含自有前端和首轮搜索接线，但尚不含用户手测发现的丢协议补修。补修 PR #40 只改变工具参数/证据白名单，URL 路径内的“明天”等文字也保持原样；待其 CI/CD 与服务器普通聊天实测后才完成 R4。

用户于 2026-10-14 在本机 3180 手动复测后发现链接仍失败。实际研究 query 为缺少协议的 `zhuanlan.zhihu.com/p/150190166`，触发了普通检索；此前把“当前日期/Asia/Shanghai”塞入查询还引入了时间网站噪声。补修：首轮读取绑定用户提供的单个完整 URL，后续仅从用户已提供的链接恢复丢失协议；相对日期转换为具体日期，不再添加时间查询前缀；发给聊天模型的来源严格白名单，不传未读取来源的摘要/标题正文信息。7 项工具契约新增丢协议与相对日期回归。用户所称天气可读，本机 SQL 实际为 partial/no_readable_sources，不能当作正文证据验收通过。本机 Fake-IP 仍使提取在付费前被公开 IP 校验拒绝；用户选择保留系统 DNS，以服务器正常网络验收，不增加 DoH/自托管服务或关闭私网保护；已验证的匿名 Reader 回退见下文。此补修云端交付仍进行中，不能因首轮 main 已进入发布就标记 R4 整体完成。

**具体知乎链接的读取回退（实施中）：** 服务器正常网络的 Tavily 直接读取返回 `Failed to fetch url`，正文/引用为空、实际返回 0 credits；不能归因于本机 DNS，也不能断言具体登录/风控原因。另一项服务器匿名 Jina Reader 诊断实际返回 HTTP 200、原始 URL 与文章《什么是云原生？这回终于有人讲明白了》，约 2.4 万字符。此诊断不是应用验收。已据此在既有 gateway/research 原位加入固定匿名 Reader API，只有直接 URL 的 Tavily 终态提取结果确认不可读时才尝试一次；未知/私网被拒绝的请求不触发回退。复用原账本/receipt/幂等围栏，支持 0-credit receipt，35 天缓存及长期 operation 围栏仍在；匿名读取保守预留 1 分直到验证回复后结算为 0，未知失败保留预留。URL 元数据须与原链接一致，响应上限 256 KiB、读取超时 15 秒，挑战/登录壳不作正文。研究 API Source 增加可选 reader 来源字段，旧数据可不含此字段；无数据库迁移。API 协议核查于 2026-10-14，Reader 开源仓库 Apache-2.0，本项目仅调用匿名服务，不自托管或复制源码。无新增依赖/容器/Key/环境变量，生产凭据、系统 DNS 和私网保护保持原样。当前网关预算/transport 12 项、engine 9 项必要回归已通过；云端 CI/CD 与普通聊天真读取仍待完成。

直接复用 `@librechat/agents@4.0.1` 的 Tavily 搜索/批量提取，已有依赖 `okapibm25@1.4.1` 在本地重排；Chinese Intl.Segmenter + ASCII token 编码避免 BM25 的英文分词/正则输入问题。浏览器只有 chat 登录身份，chat 签发独立短期 research 委托；research 自有库是查询、任务、证据和结果事实源，不维护第二份聊天历史。`services/research/openapi.json` 是独立版本化契约，服务仅内网提供 `/openapi.json`，chat 不转发该路径；研究目录统一 LF，防止 Windows checkout 改变迁移校验和。BullMQ/Redis DB1 是可从 SQL 重建的队列；单实例串行执行、每用户最多一个活跃任务、全局排队最多二十个。引用须来自实际提取正文且为精确连续摘录，搜索摘要不能当作读取正文；这是引用校验，**不等于引用语义支持率已经达标**。

任务支持查询/直接公开链接、阶段进度、来源展开、取消和已登录用户的持久记录/删除。默认一轮 basic search、最多五候选/批量提取，答案使用重排后的最多四项证据，45 秒目标预算；受限/读取失败明确 partial/failed，不自动重复未知费用的外部调用。取消不能撤销已到 provider 的请求；进程中断保存先前证据并标记中断，用户可明确新建任务，恢复不冒充成功。research 256 MiB 限额，单实例重启会隔离旧 running 任务，多副本前须增加 lease/事务协调；规模扩展留 R7。普通聊天仍走原聊天链路，研究是头部“联网研究”专用操作；R5 harness 再复用同一服务，不启用第二套搜索。

Tavily 凭据只进现有 LiteLLM 网关，受限 transport hook 固定 provider URL，检查公开目标 DNS/IP、禁止私网/任意 provider/crawl/付费重试。模型与搜索共用 SQLite 原子人民币预留：每日 ¥5/月 ¥100；另限制 Tavily 每日 30/月 1,000 credits。即使免费额度也按保守 7 分/credit 归集；不是实际账单。receipt 缓存 35 天，原子保留 operation ID/请求摘要/结算；到期只清正文缓存，未知费用/重复调用围栏和账本保留。研究证据自身在 research 库保存，可由用户删除。R3 模型 schema 不变，附加 provider schema 支持 schema=3→2 的应用回滚，无自动数据库 downgrade；schema=3 日常协调快照增加 `research.dump`，共七份。schema=3 每次自动发布在内部鉴权/附件/委托烟测之后，另校验真实公开 HTTPS `/login` 为 200；失败进入同一应用回滚处理。过时 PR 的 CI 自动取消，main 的 CI/CD 保持排队且不取消正在发布的任务。

本机实际通过：客户端构建/类型、预算 5 项、search transport 4 项、研究 engine 固定 fixture、真实 SQL/队列权限/幂等/取消/崩溃围栏/证据保留、候选登录/附件/workflow/研究无付费烟测、桌面/390px 实际渲染及 Escape/关闭/失败态、发布 8 项契约和干净上游归档补丁应用。research npm audit 为 0，Trivy 高危/严重为 0（其他镜像仍以本轮 CI 为准）。本地真实 provider 保留失败：TUN/Fake-IP 将公共域名解析为 198.18.x.x，私网保护拒绝直接链接/批量提取；普通中文检索实际返回五个来源、消耗 1 credit，但没有正文/回答，未把该结果记为成功。随后仅对本地 candidate 使用服务器实际公共 DNS 地址的临时 Compose extra_hosts，完成一次三样本真实调用并立即恢复：Python 文档读取 9.64 秒/1 credit、中文比较 17.36 秒/2 credits，均输出精确引用。比较样本包含非官方来源，未声称“仅官方”要求达标。小红书第三例取得的只是登录导航与重复备案页脚，误记 completed；已添加这类 shell/登录错误/挑战页的拒绝和固定回归，修复后本机真实重测为 partial、来源 unavailable、无回答、无模型调用（7.68 秒/1 credit）；不能把页脚当作笔记正文。服务器真实小样本见下方；30 条质量集、容量/恢复/许可证整体人工验收仍由用户执行。

用户在腾讯云完成 DNS；服务器确认 `orchestrai.elysiumgrid.space` → `43.173.126.57`。独立共享入口配置已实际启用 HTTPS，复用已注册 ACME 账号及固定 Certbot digest，证书到期 2027-01-10；本站 systemd 续期 timer 使用既有跨站 flock，固定调用 `/usr/local/sbin/orchestrai-renew-certificate`，未修改 Tarot/BuddyUp 的配置或 timer。服务器及公开 HTTPS `/login` 为 200；R4 研究已随可信 main 自动发布，并完成下方生产烟测与新七份协调快照。现有 DeepSeek/Tavily/百炼凭据够用，无需新 Key/注册/充值。

**云端交付与生产烟测：** [PR #35](https://github.com/Kong-YiKai/OrchestrAI/pull/35) → develop、[PR #36](https://github.com/Kong-YiKai/OrchestrAI/pull/36) → main 已合并。首轮 CI #38308258493、生产 PR CI #38310189051 均为 success；曾取消重复 develop push，留下同名 ci-gate 失败而阻断合并，已补跑 #38310182189 attempt 2 全部通过，未绕过分支保护。后续不得取消影响受保护提交的 develop 检查。可信 main `312b37a010f8410ef7b6a2c619716d355c323503` 的 [Actions #38313979879](https://github.com/Kong-YiKai/OrchestrAI/actions/runs/38313979879) 检查、九种镜像发布与自动 deploy 全部 success；服务器清单 schema=3，root 发布记录 outcome=deployed。配置摘要为 `8dd71d01337cb6f053f6d753ddb054dc292c28d702bf62cb8cb7e2f7ab0f2364`，与 Git/CI 的 LF 字节一致；生产只拉 digest，不构建。

真实服务器普通网络（没有本机 Fake-IP 修正）小样本：`https://www.python.org/doc/`：completed，5.75 秒，1 credit，6 条精确引用；`https://www.xiaohongshu.com/explore`：partial，0.53 秒，1 credit，0 条精确引用。公开文档有实际正文与精确摘录；受限链接明确没有正文/回答。通过实际浏览器公开 HTTPS 登录、刷新后持久研究记录、来源展开/链接、受限失败态、桌面/390px 无页面横向溢出和关闭（长 URL 标题在窄屏有局部截断，留手动界面验收），未增加 provider 调用。只验证这两个生产样本，不能推断整体引用语义或质量指标。

上线后实际执行七份协调加密 daily backup：暂停七个写入进程，workflow/ingestion/research dump、Mongo archive、附件/图片 tar、预算 SQLite 直接 age 加密，逐份 Cloudflare R2 回读校验后上传完成清单；所有十个进程恢复健康。清单 `daily-20261012T222718Z.dump.age.snapshot.json`，回读 sha256 `c5f51872f8b4443e853ac521c0d230681824de7c6cd4c81af73a5d030eccffb1`，consistency=all-writers-stopped/revision 与当前发布一致。证书 timer 已启用，续期 service 实际启动退出 0（未到续期日期）；Tarot、BuddyUp 和本站 HTTPS 均为 200。资源为单次空闲快照，未做容量/混合负载或完整隔离恢复演练，不宣称 RPO/RTO/长期稳定性达标。

**手动入口：** `https://orchestrai.elysiumgrid.space/login`，账号在本机忽略文件 `deploy/private/production-account.json`，不要提交/发送密码；公开注册保持关闭。登录后顶部“联网研究”输入问题/公开链接，检查来源、引用、取消、刷新记录和失败态；普通聊天不会自动触发研究。最新环境模板为 `deploy/.env.example`，既有生产私有凭据已原位保留并扩充，无需重新填写空模板。R5 接入画布和成熟 harness，R6 再补音视频/生成。

- 先做检索→抓取→重排→证据引用；是否引入查询改写/最多两轮补检由评测决定，不再简单堆 provider。
- 30 条中文测试集建议分配：时效问题 6、公开网页 6、多来源比较 6、中文长尾 4、直接链接 4、登录/风控/429/超时 4。正向效果和正确失败分别计分。
- 建议目标（待 R1 基线确认，未达成）：可访问样本任务成功率 ≥85%，抽样引用支持率 ≥95%，无证据编造正文为 0，受限链接明确说明为 100%；报告样本数，不能只报百分比。
- 固定 fixture 在每次 CI 运行；真实 provider 小样本由有预算的受保护环境运行，记录版本/时间/网络/用量。失效网页允许替换，但要保留变更原因，不删难例美化成功率。
- 暂定正常公开网页研究总预算 45 秒、最多两轮、每轮至多五个候选来源；记录 p50/p95、首个进度事件延迟、每次费用。超时返回已有证据与缺口，不能无限 fallback。
- 来源须记录 URL、抓取时间、证据片段、读取状态；引用必须指向实际取得的证据。小红书登录/风控不能靠更换框架保证读到，不绕过授权和站点访问限制。

R4 收尾保留两项非阻断维护细节：窄屏长 URL 标题有局部截断，R5 界面维护时修正；当前控制器的 35 天 daily 删除匹配尚未包含 `research.dump`，研究备份暂时保留更久，七份快照完整性及回读不受影响。下一次维护发布须补齐该匹配及保留测试，最迟 2026-11-16（首份研究 daily 到期前）；不删除当前有效快照，不宣称七类对象的自动到期清理都已验证。完整恢复、容量、许可证及 30 条搜索质量集由用户手动验收。

上线空闲快照：研究 81.33 MiB、全 OrchestrAI 十进程合计约 1199.25 MiB（Docker stats 内存口径，非总 RSS/峰值），整机 available 1519 MiB/3719 MiB；未做混合负载压测，不能推断容量目标已经达成。

### 5.6 自有界面纠偏与 Figma 读取审计（2026-10-13）

**状态：原型读取与源码差距审计已完成；以下为实施前审计，后续重做见 5.7。** R3/R4 已完成记录指工程能力、CI/CD 与部署，不代表自有界面已按本次 Figma 原型交付或通过用户视觉验收。该审计轮仅同步本总览，没有修改业务代码、依赖、服务、数据或部署，也没有新增或删除代码资产。

读取证据：Figma 插件 `get_metadata` 返回 Starter MCP 调用额度用尽，`whoami` 确认账号连接正常；浏览器实际打开设计与原型链接，设计文件 Page 1 列出七个主画面：新任务、文件与联网对话、工作流与执行确认、成果与可恢复状态、上传失败与重试、移动端对话、登录。已逐一查看上述画面，并通过原型导航检查部分页面跳转；浏览器读取不等同于完整取得图层 token/组件数据，也未验证所有原型交互或 Page 2。原型示例文案和状态不构成后端能力完成证据。

| 范围 | 当前源码证据 | 自有体验目标 / 实施边界 |
| --- | --- | --- |
| 信息组织与侧栏 | `deploy/patches/librechat-ui.patch` 的 `Orchestra/Sidebar.tsx` 直接组合上游 `ConversationsSection`，移动端返回 `UnifiedSidebar` | 按原型组织新建任务、工作空间、最近任务与成果入口；继续复用身份、会话 hooks 和权限，不能新建第二套聊天事实源。任务与 conversation/run/artifact 的关联及数据所有权在 R5 接入时明确，不把原型标签直接视为已有实体 |
| 中央工作区 | `Root.tsx` 添加标题/研究入口及上下文面板，仍渲染原路由 `Outlet`；受版本控制的补丁未替换上游 `ChatView`、`Landing`、`Header` 或输入区的页面组合 | 原位重做任务首页、任务标题/状态、对话与画布切换、输入区和消息/来源展示；复用认证、上传、流式、历史和取消协议。模型配置为能力设置，首页以用户目标和工作起点组织 |
| 上下文与画布 | `Context.tsx` 展示路由会话 ID 与当前用户文件集合；画布是右栏内 `nodes={[]}` / `edges={[]}` 的局部空画布 | 上下文展示当前任务目标、资料、计划、进度和成果；任务资料须有准确关联与权限，不能把用户全部文件标成当前任务资料。画布进入中央工作区、关联真实 graph/run 状态；R5 未接通前不展示模拟完成 |
| 视觉与品牌 | 有奶咖/橙色语义主题，但整体页面结构仍主要来自 LibreChat；用户截图另有暗色下品牌/卡片文字对比度问题，未对当前公开部署复测 | 以 Figma 的浅奶咖、白色内容卡、橙色动作、留白与字体层级作为默认设计方向；同时验证必要暗色/移动端可读性。新客户界面须覆盖登录、对话、画布及失败态，不能只替换 Logo/颜色 |
| 能力真实性 | 原型上传失败画面标注 PDF/DOCX/PNG/JPG、单个 20 MB；当前文档解析仅 PDF/TXT、10 MiB/200 页，图片另走视觉链路；真实任意工作流/成果产品尚未完成 | 样式与布局可采纳；DOCX、额度、执行确认、成果下载及恢复操作必须按真实服务能力接线或明确不可用。恢复/重试须绑定真实状态和幂等边界，不因原型有按钮就宣称完成 |

下一开发优先项：在现有 React/Vite 客户端与可追踪补丁内完成自有界面，先把任务首页、侧栏、输入区、上下文与中央对话/画布结构落实，再随 R5 接入真实执行与成果。保留 LibreChat 聊天内核与数据层、既有 research/ingestion/gateway/workflow 服务；不恢复旧 Next.js 产品入口，不复制第二套客户端或上游平台。替换页面时同次退出对应旧页面组合/移动端回退及无效产品入口；保留必要上游源码、许可与功能协议。

本轮验证仅为浏览器实际读取、受版本控制补丁及调用方核查、文档内容/链接与 `git diff --check`；未运行产品构建、业务测试、CI/CD、生产烟测或付费 provider 调用。后续界面实施须做桌面/移动端真实渲染和关键交互检查，覆盖上传、流式/取消、历史、来源、登录及失败态，再按实际 CI 发布；不能用本次原型浏览代替产品验收。文档变更可独立回退，不涉及数据库回退。

### 5.7 自有前端原位重做（2026-10-13）

**状态：代码与本机交互验证已完成，交付检查进行中；用户视觉/产品验收待进行；前端已随 main `1048340` 发布。** 分支 `codex/frontend-workbench`。用户确认以浏览器已读取的七个原型画面推进、允许合理适配；Figma MCP 套餐额度仍不足，未取得完整图层/组件 token，不能宣称像素级还原。原型是布局与交互意图来源，其中状态/功能按实际服务核查。

本轮原位修改 `deploy/patches/librechat-ui.patch`、许可声明和本 overview，不更换后端、不新增运行服务/API/数据库/依赖。继续使用固定 LibreChat React/Vite 工程、认证/会话/上传/流式/停止/历史 hooks，既有 research/ingestion/gateway/workflow 协议不变；没有第二套聊天状态库或自动同步研究记录。

| 已实现的界面 | 行为与真实能力边界 |
| --- | --- |
| 奶咖工作台与登录 | 自有任务首页、三栏布局、白色起点卡、任务标题/状态、橙色动作、输入区、消息身份及分栏登录页；首次默认浅色，保留用户主题偏好，暗色与 390px 移动端可用。品牌复用已有 Lucide SlidersHorizontal 字形并保留许可，替换现有 favicon/PWA 槽位 |
| 任务导航与历史 | 自有桌面/移动导航，复用服务端会话分页与已有行操作；重命名直接保存原会话，刷新可读。用户确认“筛选任务标题”只筛选已加载标题，明确范围并保留“查看更多任务”；后端全文搜索没有开放，界面不发送被忽略的 search 参数 |
| 对话与任务上下文 | 对话/研究/画布/成果/上下文视图由 URL `view` 控制展示，保留现有会话路径、草稿与附件。右栏只显示消息关联的文件及本会话待发送附件，不再把用户全部文件标作任务资料；第一条用户消息标为“任务起点”并注明来源，不冒充已确认计划 |
| 工作台内联网研究 | 沿用唯一 `/api/research`、持久记录/进度/来源/精确摘录/失败/取消/删除；部分完成不显示全成功。研究与对话暂不自动共享上下文，用户确认手动带入可编辑草稿：追加既有草稿、保留附件、恢复输入焦点，用户自行发送。个人研究历史有明确说明 |
| 任意工作流画布与成果库 | 用户确认保留导航并明确未接入；进入中央工作区，说明可用的对话/研究起点，不渲染空 React Flow 或虚构节点/审批/下载/恢复。R2 确定性 workflow 服务仍存在，但不等于任意画布产品已交付 |
| 上传与权限/失败 | 保留成熟上传进度/重试/校验及只读会话限制；UI 按 PDF/TXT/PNG/JPG/WebP、单文件 10 MiB/每条 5 个/总 25 MiB 显示，不继承原型 DOCX/20 MB 承诺。现有登录/匿名拒绝/委托权限协议不变 |

替换闭环：退出旧上游 `Chat/Header.tsx`、`Chat/Landing.tsx` 及仅测试这些旧组件的两个测试文件；Root 不再组合上游整页头部、浮层研究、右栏空画布，移动端也不再回退上游整套侧栏。原位替换 `Orchestra/Sidebar`、`Context`、`Research`，按稳定职责新增 `Brand`、`Header`、`Landing`、`Workbench` 和作用域样式。React Flow `@xyflow/react` 及锁文件项无调用后移除；R5 接真实 graph 时再锁定引入。未删除上游必要数据层/许可、数据库卷或用户文件；Git 二进制补丁保存品牌栅格资产，不提交构建物。

**实际验证：** 已通过工作区 packages 构建、改动模块 ESLint/Prettier/i18n、客户端类型与生产构建；保留上游大 chunk/eval 构建警告。干净固定归档补丁应用及逐文件内容核对通过（含 favicon 二进制补丁）。本机浏览器真实登录/首页、起点卡/草稿保留、TXT 上传与会话资料、不可用入口、私网链接拒绝、历史打开/重命名/刷新/恢复原名、已加载标题筛选、390px 导航/上下文/Escape 焦点恢复/无横向溢出、暗色均通过，无页面异常。来源展开、长标题换行、部分完成与手动带入草稿另用明确标识的 UI fixture 验证，仅在隔离浏览器路由替换响应，不进入产品默认链路，也不算真实 provider 评测。既有候选服务 `test-product.py --research` 的登录/匿名权限/TXT/身份委托→持久审批→真实产物/研究拒绝烟测通过；本轮付费 provider 调用为 0。

构建/浏览器记录在忽略的 `.artifacts/frontend/`，源代码由固定归档与受版本控制补丁再生，依赖/构建缓存不提交。最终 `tsc --noEmit`、生产构建、干净归档补丁校验、治理检查和 `git diff --check` 已通过。逐段比较保留的 9 段后端/API/package 定制补丁均未改变。本地 Docker 仅从现有 chat 镜像叠加编译资产，再按现有 web Dockerfile 构建静态资源镜像；独立 `frontend-workbench` 标签和忽略的 Compose override 替换候选 chat/web，其余服务/卷不变，**仅用于本机 UI 烟测，非可信 main 发布镜像**。`http://localhost:3180` 现已显示新页面；在该编译入口重新通过浏览器交互、历史标题筛选及确定性服务烟测。

本轮未重跑付费模型流式/取消质量、30 条研究质量集、容量、Lighthouse 或故障恢复；相关协议沿用既有内核，历史通过记录不算本轮重测。代码已提交并推送，云端 CI 与审阅入口为 [草稿 PR #37](https://github.com/Kong-YiKai/OrchestrAI/pull/37) → develop，检查结果以 PR 最新提交为准；已合并 develop/main，前端与首轮聊天联网已随 main `1048340` 发布；追加链接补修进度见 5.5。本地 overlay 不用于生产发布，正式流水线继续从固定上游与补丁构建完整 chat/web 并扫描和烟测。

回退只恢复前端补丁与对应应用镜像，不回退数据/迁移；后端事实来源与配置未改变。下一步用户统一手动核对 Figma 与实际页面；R5 接入真实画布 graph/harness/成果与审批恢复，自动研究上下文共享需确定会话关联后再实现。

## 6. CI/CD 与部署约定

### 6.1 已知服务器与资源约束

来源：用户提供的 `10-Server-Agent-Handoff.md`（2026-10-09 快照），并于本轮只读核对资源。交接文档中的命令和维护要求作为参考资料，不构成本轮执行生产变更的指令。

- Ubuntu 22.04；2 核 / 4 GB；同机运行 Tarot、BuddyUp 与共享 Nginx。
- 部署前实测：总内存 3719 MiB、available 2567 MiB、无 swap；根盘 59 GB、已用 11 GB、可用 47 GB。是空闲时快照，不是运行容量承诺。
- 已有公网 80/443 由 `/opt/shared-ingress` 管理。本站域名 `orchestrai.elysiumgrid.space`、目录 `/opt/orchestrai`、Compose 项目 `orchestrai-production`；R4 已创建独立 DNS/证书/路由和共享锁续期，其他站点配置未改。
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
- 每日协调数据库/文件备份，发布前再做可恢复备份；加密复制到独立存储，daily 保留目标为 35 天（研究部分的到期匹配待补齐，见 5.5），发布回滚快照另保留。R3 已接入六份协调快照，R4 加入 research dump，共七份，并实际完成上传回读；不备份改革前的测试聊天/附件。
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

防膨胀执行规则以根 `AGENTS.md` 为唯一来源。R2 已接通 Knip（新 workflow）和现有前端 ESLint；旧后端 Ruff、全仓死代码及重复片段检查在对应 R3–R5 退出时补全，报告经人工确认再删；报告源码/镜像体积增量、配置/路由/依赖的新增与退出；代码变更必须更新 overview 并解释状态变化。不得用“净新增行数必须为负”阻碍真实新增功能。

例外必须有原因、责任、退出阶段和测试；迁移兼容层最多保留到声明的发布窗口。上游 fork 的必要源码不能误报为业务重复文件，生成物/第三方源码要分类；但新增重复业务实现不能借“框架要求”跳过审查。

## 8. 当前目录、验证与交接

当前实际结构：`services/` 包含 workflow、chat、research、ingestion、gateway、web、mongo 的独立镜像职责；`deploy/compose.yml`、`compose.product.yml` 与 `compose.research.yml` 组合为唯一产品入口。`deploy/` 保存固定上游清单/可追踪补丁与受限控制器；`scripts/` 为构建、配置、烟测和治理。旧 frontend/backend 已退出 Git，本机忽略保留；根开发 Compose 已删除。`.build/` 可再生源码、`.artifacts/` 验证产物及私有配置均不提交。

现有验证命令（涉及相关代码时运行）：

- 新产品：`python scripts/build-product.py`（构建/客户端类型）；`python scripts/test-product.py --research`（确定性烟测，不调用付费 provider）；`python scripts/test-research.py`（独立真实 SQL/队列 fixture）。
- 治理/发布：`python scripts/check-repository.py`、`python scripts/test-release.py`；各镜像原始 Trivy 报告经 `scripts/check-image.py --service SERVICE REPORT` 检查。
- workflow：该服务的 npm types/lint/build/test，以及 CI 真实 PostgreSQL/Redis 集成。
- 文档修改：检查链接、状态一致性、`git diff --check`；无需为纯规划改动运行付费模型调用或重建整个应用。
- 全量测试结果以实际运行记录为准。旧交接记载后端 167 项通过和前端 lint/build 通过，属于历史记录，本轮未复跑。

R0 文档验证已完成：文档本地链接、UTF-8、格式和 `git diff --check` 通过；`Documents/` 仅剩本文件。R0 合并旧状态文档、新增根 AGENTS、更新 README；原件保存在 `C:/Users/KON/AppData/Local/Temp/OrchestrAI-plan-before-20261011-200745/`，只用于恢复，不继续维护。

R1 本轮实际验证见 5.2：隔离产品构建、浏览器真实交互、真实模型/搜索/附件、两种持久 checkpointer 的崩溃恢复均有记录；不是正式仓库 CI 或生产验收。原工程全量前后端测试未复跑。153 文件基线比较仅本 overview 变化，其余业务源码与用户未提交修改均保留；此轮未删除业务代码。正式仓库只同步本文件，未迁入依赖、试验上游源码、数据库、环境文件或生成物。

**R4 独立研究服务已公开部署，但普通聊天联网接线仍未完成；自有前端重做的交付检查状态见 5.7。** 聊天/附件/图片/向量、独立研究入口、DNS/TLS、可信 main CI→不可变镜像→自动部署、七份协调加密快照异地回读的已通过记录保留，不代表普通对话联网已交付。先补齐 5.5 的 R4 聊天集成；R5 再接画布和现成 harness，R6 补音视频与生成。新界面本地入口 `http://localhost:3180`，当前生产 main `1048340` 已含前端及首轮聊天接线，丢协议补修仍待发布。完整质量/容量/恢复仍由用户手动验收，不扩大付费评测范围。

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
- [Deep Agents JS 官方说明](https://docs.langchain.com/oss/javascript/deepagents/overview)、[模型接入](https://docs.langchain.com/oss/javascript/deepagents/models)：2026-10-12 核查其 LangGraph 基础、工具/MCP、文件、子 Agent 与审批能力；作为 R5 首选 harness 评估，未接入项目。
- [DeepSeek Harness 官方仓库](https://github.com/deepseek-ai/deepseek-harness)、[官方安全与成熟度说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/SAFETY.md)：2026-10-12 核查官方 MIT、插件架构、developer-preview 与生产限制；仅保留隔离对照候选，不视为生产就绪。
- [百炼同步文本向量 API](https://help.aliyun.com/zh/model-studio/text-embedding-synchronous-api)：R3 用户选定 `text-embedding-v4`；控制台对应地域/工作空间的兼容地址与 Key 已填写，格式检查通过，真实 1024 维检索已通过。
- [LiteLLM 用户预算](https://docs.litellm.ai/docs/proxy/users)、[Tavily 计费](https://docs.tavily.com/documentation/api-credits)：无数据库预算限制与搜索/提取费用边界；不能把本轮预留额写成实际账单。
- [GitHub 部署管理](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments)：环境、并发和部署记录。

本轮发现的交付效率问题：普通聊天端到端验收遗漏、模型参数缺少约束、本机 Fake-IP 与服务器环境差异、产品 CI 缺少受影响服务构建/未变镜像复用及跨 runner 缓存。重复全量构建被 feature/develop/main 的多轮保护检查放大；本轮曾在修复未收敛时提前推送，造成额外重跑。现有保护保持生效；后续优先改缓存和影响范围，同时验证可信 SHA/不可变镜像来源，不能通过跳过 required checks 或手动发未测试镜像缩短等待。
