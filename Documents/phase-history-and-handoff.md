# OrchestrAI — 交接手册与历史归档

> 新的 AI 或开发者先读本文件的“交接”一节，再读 `project-overview.md` 和 `AGENTS.md`，然后按 AGENTS.md 的改动地图只打开相关文件，**不需要通读全部源码或历史**。历史条目按时间倒序，每次交付追加一条，每条不超过 10 行。更早的长篇过程记录在 Git 历史中，可查看 `Documents/project-overview.md` 在提交 `867e76d` 及更早的版本。

## 交接（随每次交付更新）

- **当前阶段：** R5 已由用户手动验收（2026-10-19，基本功能通过），正在按用户反馈做 R5 改进：A、B、C 三批改进已全部上线；下一步 R6（画图/视频/3D 生成工具接入目录中已列出的模型、音视频与文档产物）（见历史条目 2026-10-19）。之后进入 R6（音视频与产物生成）。R4 待用户手动验收。
- **查服务器：** 用户授权通过其电脑上的 Desktop Commander 执行 `ssh tarot-tencent "sudo -n …"`（日志、状态、OrchestrAI 镜像清理、同步 `/opt/orchestrai/deploy` 中的配置摘要文件；不读、不改 `secrets/`，不动 Tarot 和 BuddyUp）。PowerShell 引号复杂时，把脚本 base64 后在服务器端 `echo … | base64 -d | sudo -n bash` 执行。
- **Git：** 生产版本为 main `28b8609`（release 128，C 批，PR #86/#87）；develop 与 main 内容一致。会话代理不允许删除远端分支，已合并的旧分支由用户在本机删除；建议在 GitHub 开启 “Automatically delete head branches”。
- **服务器：** 腾讯云 Ubuntu 22.04，2 核 / 4 GB，与 Tarot、BuddyUp、共享 Nginx（`/opt/shared-ingress`）同机。部署目录 `/opt/orchestrai`，Compose 项目 `orchestrai-production`，只绑定回环端口 `127.0.0.1:3088`。SSH 别名 `tarot-tencent` 在用户本机。
- **本机：** Windows + Docker Desktop（context 为 `desktop-linux`）。候选环境 `http://localhost:3180`，Compose 项目 `orchestrai-r3`，账号在 `deploy/private/candidate-account.json`。本机 TUN/Fake-IP 会把公网域名解析成 198.18.x.x，research 的私网保护会拒绝这些地址，所以本机真实联网测试不可靠，联网验收以服务器为准。
- **私有文件（Git 忽略，绝不提交或发到聊天里）：** `deploy/private/`，包括 `product.env`、`model.env`、`providers.json`、账号文件和 `age-recovery.key`。
- **Key：** DeepSeek、Tavily、百炼（embedding）已配置。其他模型在服务器 `secrets/production.env` 里加对应 key（见 `services/gateway/models.json` 的 `key` 字段，如 `DASHSCOPE_API_KEY`、`MOONSHOT_API_KEY`）后重新发布或重启网关即可在节点里选择。
- **改 chat 的方式：** 直接编辑 `services/chat/overlay/` 下的源码；只有上游文件的接入点才改 `services/chat/patches/*.patch`。`.build/` 会自动重建，不要手动编辑。
- **CI 耗时：** 调整前 main 全流程约 32 分钟。调整后只改 chat 时约 16 分钟（PR CI 约 10–13 分钟），未改动的服务直接复用 main 发布的 `inputs-<hash>` 镜像；纯文档改动不构建、不发布。

## 历史（倒序）

### 2026-10-19 R5 改进 C 批：节点模型、联网、资料、讨论
- 网关：`models.json` 作为唯一模型目录（DeepSeek Flash / Pro、通义千问、Kimi、GLM、豆包、GPT、Claude、Gemini，以及画图/视频/3D 待接入项）；`render.py` 启动时只为有 key 的文本模型生成 LiteLLM 路由，`budget.py` 按各模型价目预留和结算，`/orchestrai/models` 返回目录与可用状态。compose 给网关加了 7 个可选 key（`DASHSCOPE_API_KEY` 等，未设即不可选），已同步到服务器。
- workflow：节点 `model`（按节点模型计价、估算）、`tools.web`（`web_search` / `web_read` 走网关 Tavily 计量通道，worker 增加 `RESEARCH_GATEWAY_KEY`）、节点资料（`POST/DELETE /projects/:id/inputs`，存为 `inputs/<节点>/`）、节点讨论（`GET/POST /projects/:id/chat`，迁移 `004_node_chats.sql`；讨论记录写进节点说明，花费计入团队预算）。
- 画布：节点面板加模型选择（未配 key 的灰掉，画图/视频/3D 标注 R6 接入）、能力开关、资料上传与删除、「讨论」抽屉；工作记录显示用户给的资料和搜索词。
- 验证：网关 16 个单测通过，本地真起 LiteLLM 验证路由与拒绝未配置模型；workflow 19 个测试（含 INTEGRATION=1）通过；Playwright 走完选模型、开联网、上传资料、讨论、运行节点、查看工作记录。

### 2026-10-19 R5 改进 B 批：运行控制、工作记录、团队预算
- 后台（`services/workflow`）：不再让 OMA 跑整张图，改为自己按节点调度（每个节点一次 `runAgent`，互审/讨论由我们自己的循环实现），每个项目一个“活的”运行；`POST /projects/:id/control {action: run|pause, task?}` 运行或暂停整个团队/单个节点；已开始或完成的节点锁定（`lockViolations`）；“运行团队”前检查工作流连通（`checkRunnable`，错误码 `workflow_invalid`）；总指挥按用户的修改要求重新设计并原样保留已开始的节点（`design_note`）；节点工作记录写入 team_events（type=log）；包装模型适配器记录模型说明和用量，按价目表记账到 `spent_cny`，超出团队预算自动暂停（`budget_exhausted`）；最后的节点用 `deliver` 工具登记交付文件。迁移 `003_nodes.sql`。`WORKFLOW_RUN_TOKENS` 删除（compose.yml 已同步到服务器）。
- 画布：运行按钮随状态变为 运行团队 / 暂停 / 继续 / 已完成；进度条显示“3/5 完成 · 进行中/暂停在/失败/下一步「某节点」”，点击定位到该节点；节点面板可单独运行、暂停、继续、编辑、删除；工作记录抽屉（用到的资料 → 过程 → 产出）；交付归入画布右侧并按文件夹分组，大窗口预览；双击空白处加节点、拖线到空白处新建并连好节点、连线圆点放大；预算与预估花费显示和修改；删除“我的成果”视图，画布页不再显示对话概览栏。
- 验证：workflow 16 个测试（含 INTEGRATION=1，本地 Postgres 16 + Redis，含从 002 迁移）全部通过，knip/audit 干净；本地起 chat + workflow（脚本化模型），Playwright 走完：建团队（含预算）→ 删线再连上 → 加孤立节点运行被拦下 → 删除 → 运行 → 打开工作记录 → 暂停 → 继续 → 已完成 → 交付预览。

### 2026-10-19 界面整理 A 批（用户验收 R5 后的反馈）
- 用户验收 R5 基本功能通过，提出 6 条改进，分三批：A 界面小修；B 运行控制（节点单独运行/暂停/继续、工作记录、成果归入画布、连线与增删校验、用户填预算并在运行前预估花费）；C 节点能力（模型选择含图像/3D/视频模型、能力开关、节点聊天）。
- A 批：所有回复的头部统一显示 OrchestrAI 品牌，不再显示模型名和图标（改在共用的 `MessageRow`，覆盖普通、工具和搜索回复，并删掉 `MessageRender` 里的旧改动）；右侧栏改为“对话概览”：本对话、资料、工作区三块，全部走翻译键；界面默认中文（用户在设置里另选语言时仍按用户选择）；工具菜单删掉重复的“网络搜索”和无效的固定按钮（输入框的地球图标是唯一开关）。
- 验证：本地 client 构建与 tsc 通过；本地起 chat + Mongo，用 Playwright 在 1440 和 390 宽度截图检查回复头部、侧栏和工具菜单（文件搜索的固定按钮正常）。

### 2026-10-19 服务器磁盘清理与发布后自动清理镜像
- 服务器磁盘 94%：OrchestrAI 每次发布按 digest 拉取 9 个镜像，旧的从不删除（161 个镜像、可回收 35.8 GB，chat 镜像每个数 GB）。手动保留在用镜像与当前/上一次发布镜像后删除 133 个旧镜像和闲置的 `mongo:8.0.20`，磁盘降到 32%；其他项目、数据卷、备份、构建缓存未动。
- `deploy/release.py` 发布成功后自动执行同样的清理（只删 `ghcr.io/kong-yikai/orchestrai/` 下既不在用、也不属于当前或上一次发布的镜像，失败不影响发布），记录在 `release-N.json` 的 `pruned_images`。该文件参与配置摘要，已同步到服务器（旧版备份 `/opt/orchestrai/state/release.py.before-prune`）。
- 同批修复 web 基础镜像新出的 libexpat、libx11 高危漏洞（`apk upgrade`）。验证：release 116 自动删除 9 个旧镜像（只留 116 与 109 两套），共 28 个镜像，磁盘 30%，所有容器运行正常，`/login` 200。

### 2026-10-16 R5 生产实测与加固（PR #66–#73 及收尾）
- 实测：总指挥 20 秒组建团队；并行、互审、讨论、文件产出正常。问题与处理：成果多套一层文件夹（提示词 + 本地保存剥离）；HTML 预览图片不显示（内联相对图片）；汇总任务上下文不足（网关 200 KB、压缩阈值 16k）；任务卡片加实时进度（team_runs.task_states.activity + activity 事件）。
- 两次 worker 在角色用满 12 轮后空转（CPU 满、无模型调用），本地无法复现；加每任务 15 分钟上限与看门狗（`src/watchdog.mjs`）。
- 根因（看门狗抓到后本地复现）：OMA 1.21.2 的运行级 `maxTokenBudget` 在仍有任务进行时被超出，调度循环每轮 `requestStop` 都重新唤醒自己，形成微任务死循环（CPU 满、事件循环饿死）。改为不把上限交给 OMA，由 engine 统计 token、超限走 abort 路径（error_code `run_token_budget`），并加回归测试。
- 最终生产实测完整通过：5 角色 5 任务约 3 分钟全部完成；网关记账约 ¥1.6。收尾：团队 API 遇 401 时用刷新 cookie 续期一次（页面长时间打开后不再显示“服务不可用”）。
- 第三次实测因当日 ¥5 预算用完而部分完成（当日 ¥4.44，多为前两次空转消耗）；网关改为按请求大小预留预算，预算用完时界面明确提示。

### 2026-10-16 R5 智能体团队（PR #64）
- 选型：执行层用 Open Multi-Agent 1.21.2（MIT），替换 LangGraph 验证流程；awwo-canvas 只参考画布与总指挥交互。
- workflow：总指挥（`designer.mjs`）按目标生成角色和任务图；`plan.mjs` 校验；`engine.mjs` 把方案映射成 OMA 任务（依赖按标题、互审 = refute、讨论 = lens，审查者只读文件），检查点写 `team_checkpoints`，工作区文件写 `team_files`，崩溃后 `restore()` 不重做已完成任务。API 见 `api.mjs` 路由表；每用户同时一个运行。
- gateway：输出上限 2048 → 8192、上下文 60 → 100 KB、单次预留 20 → 35 分、超时 60 → 180 s、并发 2 → 4。
- chat：画布 / 我的成果两个视图接入真实团队（React Flow），HTML 成果只在 sandbox iframe 中预览，本地保存用 File System Access API。删除了“尚未接入”占位视图和文案。
- 测试：workflow 11 项（真实 Postgres + Redis，假模型覆盖并行、审查、崩溃恢复、取消、outbox）；本地用真实 API + 假模型 worker 在 Chromium 中走通创建 → 编辑 → 运行 → 预览。

### 2026-10-16 只保留一个联网开关
- 用户要求输入框只保留一个小地球。删除自加的“联网搜索 · 开启”按钮（`client.patch` 中 ChatForm 的按钮、`Globe` 导入和 4 个文案键，以及 `workbench.css` 中对应样式），保留上游的地球图标。两者控制的是同一个状态，首次默认开启、记住选择的逻辑不变。
- 生产复测（main `c936da7`）：混问天气和链接时，天气段落的角标指向天气来源，文档段落的角标指向 Python 文档，角标问题已解决。
- 上线后（main `876bb0b`）发现：上游地球图标在开关关闭时会隐藏（只有固定或开启时才显示），关掉后就找不到入口。改为始终显示，用高亮区分开关状态（`client.patch` 中的 `WebSearch.tsx`）。
- main `ca04da3` 部署后复测：关闭联网时地球图标仍显示，开、关切换后也不会消失。
- 删除一轮问答生产复测通过：三轮对话中删除第二轮（“最喜欢的颜色是橙色”）后，追问“列出我告诉过你的所有信息”，只答出代号和住址；第一轮保留，上下文链没有断。

### 2026-10-15 删除一轮问答
- 新功能：用户消息悬浮栏新增删除按钮（两次点击确认），删除该提问及全部回答（包括重新生成的兄弟回答），后续轮次改接到上一轮，被删内容不再计入上下文。
- 实现：新增 overlay `orchestra/turns.ts`（服务端路由，只读写当前用户的消息；先改挂后续消息，再删除，保证上下文链不会断）和 `Orchestra/DeleteTurn.tsx`（按钮，成功后同步更新本地消息缓存）；补丁里只加了路由挂载、导出和悬浮栏的一处接入。
- 验证：路由契约测试覆盖删除中间一轮、改挂后续轮次、拒绝删除回答、其他用户的消息不可见、未登录返回 401；客户端 `tsc --noEmit` 和 ESLint 通过。
- 生产实测发现：第二次点击没有发出删除请求，按钮一直停在待确认状态。原因是悬浮栏沿用了按钮首次渲染时的点击处理函数，读到的“已确认”状态一直是旧的。改为用 ref 读取确认状态和登录令牌。
### 2026-10-15 来源角标与联网调用对齐
- 问题：一轮里有两次联网调用时，正文角标会指向另一次调用的来源。原因是工具结果没有给出角标，模型只能自己猜 `turn` 编号。
- 修复（只改 `research.ts` 和测试）：每个已读来源都带上与界面附件一致的 anchor（本次调用的 turn 加该来源在列表中的位置），引用说明改为使用 anchor，不再用 Markdown 链接。
- 验证：chat 工具契约 10 项通过（新增：第二次调用的来源 anchor 为 `turn1searchN`）。

### 2026-10-15 R4 生产实测与聊天联网修复
- 最终发布：PR #48/#50 → main `a51fe84`，部署成功。复测同一消息中混问天气和链接：两次工具调用分别取得天气来源（日期正确为 10-16）和文档正文，`21∼24℃` 显示正常；但天气段落的来源角标指向了 Python 文档，原因是两次调用的来源编号冲突，已记为下一个待修项。
- 首次使用镜像复用的发布（release 66，main `d0b14dd`）被发布控制器拒绝：复用的镜像带的是原构建提交的 revision 标签，而 `release.py` 要求所有镜像的标签都等于本次发布的提交。拒绝发生在停机和备份之前，生产仍停留在 `3fef692`，没有受影响。修复：复用镜像时只重打 revision 标签（各层不变），`release.py` 不需要改，也不需要服务器同步。
- PR #42 → develop、PR #43 → main（`4e46bbd`）：Reader 回退上线，CI、发布、部署全部成功。
- 生产实测（普通聊天）：天气查询真实调用研究并给出具体日期和来源；知乎专栏经 Reader 读取成功；关闭联网后的追问不重新搜索。
- 实测发现三个问题，本次一并修复（只改 overlay 的 `research.ts`、`client.patch` 中的 `tilde.ts`、`server.patch` 中的一行调用，以及测试）：
  1. 模型偶尔把 `\n` 当字面文字输出，导致 Markdown 失效。原因是证据以转义 JSON 传入；改为 JSON 头加纯文本正文块，并在指令中要求正常换行。
  2. 聊天工具把每个来源的正文截断到 3000 字，模型误报“抓取中断”。改为单来源 12000 字、多来源共享 12000 字，并带 `truncated` 标记。
  3. 用户发小红书链接时，模型没有调用工具就用英文拒答。改为：消息中有链接时，指令明确要求先用该完整链接调用 web_search，并用用户的语言回答。
- 另外修复数值范围显示：`20~25℃` 这类范围成对出现时被渲染成删除线，改为范围波浪号使用 `∼` 显示。
- `prepare-upstreams.py` 在生成目录中提交原始上游并打 `upstream` 标签，刷新补丁只需一条 `git diff upstream` 命令（见 AGENTS.md）。
- 本地验证：chat 工具契约 9 项通过（新增 2 项），客户端 `tsc --noEmit` 通过，三份补丁能干净应用。
- 部署后复测（main `3fef692`）发现：同一条消息里同时有天气问题和链接时，天气搜索被替换成了那个链接（“首轮绑定唯一链接”的规则过宽）。改为只有当查询里出现该链接的域名时才替换。复测 Python 文档总结正常，并正确说明了截断；小红书链接改为先调用工具，再用中文说明只取到了页面框架。

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
