# OrchestrAI

OrchestrAI combines a custom warm three-column chat interface with independent AI services. LibreChat supplies authentication, conversations, streaming and attachment handling. The workflow service runs agent teams on Open Multi-Agent with BullMQ and PostgreSQL: a commander model drafts roles and a task graph, the user edits it on a React Flow canvas, and the team writes text deliverables that can be previewed, downloaded or saved to a local folder.

Before changing the project, read the handoff section of [phase-history-and-handoff](Documents/phase-history-and-handoff.md), the [project overview](Documents/project-overview.md) and the [development rules](AGENTS.md). The rules include a change map listing which files own each feature: prefer editing or deleting existing code over adding patches on top.

## Product candidate

Requires Docker with Linux containers and Python 3.11+. No host Node/Python dependency installation is needed for product services.

1. Copy [deploy/providers.example.json](deploy/providers.example.json) to ignored `deploy/private/providers.json` if it does not exist. Fill the Aliyun embedding key and regional compatible `/v1` URL; retain `text-embedding-v4`, 1024 dimensions.
2. Put `DEEPSEEK_API_KEY` and `TAVILY_API_KEY` in ignored `deploy/private/model.env`. Existing `product.env` keys are retained when rebuilding configuration. No keys belong in the browser.
3. Run:

```bash
python scripts/configure-product.py
python scripts/build-product.py
python scripts/test-product.py --start --research
```

Open `http://localhost:3088`. Registration defaults closed; the smoke account is written to ignored `deploy/private/candidate-account.json`. For a custom loopback port set `PRODUCT_PORT` and `PRODUCT_URL` in private `product.env`, then pass the same URL to `test-product.py --url`.

TXT, text-based PDF, PNG, JPEG and WebP are supported. File limits are 10 MiB each, five per message, 25 MiB total. PDF is limited to 200 pages; scanned documents without extractable text return a failure until OCR is added. Text chat, image understanding, embeddings and Tavily calls share one gateway and atomic daily/monthly CNY budget. Tavily also has separate credit limits.

The globe icon in the composer is the single web-search switch for ordinary chat (highlighted when on) and retains your choice. The sidebar's **联网研究** opens owned independent records using the same research service. Questions use Tavily search, supplied public URLs use extraction; a known direct-page extraction failure can make one anonymous Jina Reader attempt. Unknown provider operations are fenced without retry. BM25 ranks actual retrieved text, with source links, exact evidence quotes and read/unread states. Tasks, cancellation and history persist. Independent research can be appended to a draft before you send it.

The **画布** view builds agent teams. Describe a goal and the commander proposes roles (planner, artist, programmer, sound, camera, approver or whatever the goal needs) and tasks: dependencies run in order, independent tasks run in parallel, and a task can be peer-reviewed or discussed by other roles before it counts. Edit tasks, roles, links and reviews, then run. Runs are checkpointed in PostgreSQL, so a restarted worker resumes without repeating finished tasks; one active run per user, bounded by `WORKFLOW_RUN_TOKENS` (default 400k tokens) and the gateway's CNY budget. Agents only read and write text files in a per-run workspace (no shell or network); files are stored with the run and shown under **我的成果**, where Chromium browsers can write them into a chosen local folder.

```bash
docker compose --env-file deploy/private/product.env -f deploy/compose.yml -f deploy/compose.product.yml -f deploy/compose.research.yml -p orchestrai-r3 logs -f
docker compose --env-file deploy/private/product.env -f deploy/compose.yml -f deploy/compose.product.yml -f deploy/compose.research.yml -p orchestrai-r3 stop
```

## Checks and deployment

```bash
python scripts/test-services.py
python scripts/test-release.py
python scripts/test-research.py --project orchestrai-r3
python scripts/check-repository.py
git diff --check
```

LibreChat customisation lives in `services/chat/overlay/` (owned source files, edited directly) plus small upstream patches in `services/chat/patches/`; `scripts/prepare-upstreams.py` assembles them into the generated `.build/` tree. CI rebuilds only images whose inputs changed (unchanged images are reused from main by content hash) and skips builds for documentation-only changes. It checks client types, runs real service/database smoke tests and scans runtime images. Tested images are preserved and published by digest from the same trusted main SHA. The root-owned controller validates the manifest, takes coordinated encrypted backups and performs forward migrations/readiness checks. Application rollback does not downgrade databases. Server first installation requires administrator configuration; ordinary main releases use the restricted deployment identity automatically.

[deploy/.env.example](deploy/.env.example) is the current deployment template. Preserve existing infrastructure credentials when extending a production installation. Secrets belong only in ignored private files and root-owned server configuration, never in chat, Git or image layers.

The legacy prototype has exited the active source tree and CI. Its Git history and local source snapshot retain the reference implementation; local uncommitted files were not overwritten. Source bundles, dependencies, build outputs and runtime data are separate from tracked product code.

See [NOTICE](deploy/NOTICE.md) for upstream versions and license boundaries. R4 added search and the dedicated ingress at `orchestrai.elysiumgrid.space`; R5 adds agent teams. Production and manual acceptance status is maintained only in the overview.
