# Reused software

OrchestrAI builds fixed upstream archives plus small reviewable patches and an owned
overlay. Source archive hashes, commits, patch/overlay paths and the upstream hashes
of replaced files are recorded in `upstreams.json`; generated checkouts remain
outside Git. Images retain the upstream root license; `services/chat/LICENSE.librechat.txt`
covers LibreChat-derived files in the overlay.

| Component | Locked version | License / scope |
| --- | --- | --- |
| LibreChat | v0.8.8, e8f3be08623663d4ad7f7241e693c94469b63bb0 | Root MIT; API package ISC; package dependencies have their own licenses |
| LibreChat RAG API | v0.9.0, 4985b37b8b5d4519d68eceedfef1e63624012f9d | MIT; patched authentication, ownership, bounded parsing and controlled schema |
| LiteLLM | 1.105.0 | MIT community proxy; enterprise features are not enabled |
| pgvector | 0.8.7, f37c13f68b57d2c3472b2214fbcff699d6d34876 | PostgreSQL License; extension compiled against the runtime PostgreSQL base |
| MongoDB | 8.0.20 | SSPL-1.0; internal application database, not a public database hosting API |
| Lucide React | 0.528.0 | ISC, with Feather-derived icons under MIT; existing UI dependency. The rotated SlidersHorizontal glyph also supplies the brand mark and favicon/PWA derivatives; both notices are embedded in the generated logo.svg |
| LibreChat Agents | 4.0.1 | MIT; research reuses the existing upstream search/extraction tool, not a second chat platform |
| okapibm25 | 1.4.1 | MIT; existing Agents dependency, local ranking without another provider |
| BullMQ / jose / pg | 5.81.5 / 6.1.0 / 8.16.3 | MIT; shared versions with workflow, independently deployed research state/queue/auth |
| Open Multi-Agent (`@open-multi-agent/core`) | 1.21.2 | MIT; workflow worker's agent-team runtime (task graph, Postgres checkpoints, consensus review). Agents get only file read/write/edit/glob tools sandboxed to a per-run temporary directory; shell, MCP and network tools are not enabled |
| React Flow (`@xyflow/react`) | 12.12.0 | MIT; team canvas in the chat client |

Open WebUI, Dify and awwo-canvas (MIT, commander/canvas UX) are product references only; neither codebase is copied or
deployed. Python runtime dependencies are pinned in each service's requirements.
LibreChat uses its pinned npm lock with `services/chat/patches/dependencies.patch`. Product CI
produces per-image SPDX and vulnerability reports; an SPDX file does not by itself
confirm that every dependency license has been reviewed. Upstream overrides and
incomplete license metadata require review during upgrades.

Runtime hardening: MongoDB keeps server 8.0.20; signed vendor packages pin
mongosh 2.13.0/database-tools 100.19.1 and Ubuntu TLS packages. Unused privileged
launcher, YAML loader and administration tools are removed. Only dump/restore
remain for encrypted snapshots. Chat runs Node directly without npm/npx; shell
MCP via npx is not enabled in this product runtime. R5 agent teams run in the separate
workflow worker, which reaches models only through the budgeted gateway.

The tracked LibreChat dependency patch upgrades affected production dependencies. A bounded
braces parser guard is applied and checked during image build pending an upstream
release. Raw security reports retain all findings. Exact, expiring runtime
assessments are in `vulnerability-policy.json`; changing execution boundaries or
upgrading versions requires reassessment. This is not a zero-vulnerability claim.

## External reader API

Jina Reader is used through its fixed anonymous HTTPS API after a known direct-page Tavily extraction failure. API contract verified 2026-10-14 against [official Reader documentation](https://jina.ai/reader/) and [reader repository](https://github.com/jina-ai/reader). The open source repository is Apache-2.0; its code is not bundled or self-hosted here. API availability/rate limits and service terms remain separate from the software license. No paid Reader key is sent or configured.
