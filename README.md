# Scout — Intelligent Semantic Search & Dynamic AI Workspace

**Semantic Search Chatbot — Intelligent Workspace Edition**

Scout is a modular, API-first, multi-tenant-ready intelligent AI workspace built with **TanStack Start**, **React 19**, **Tailwind CSS v4**, **Supabase (PostgreSQL + pgvector + Row-Level Security)**, and the **Lovable AI Gateway**.

Unlike traditional text-only chatbots, Scout understands natural-language requests, executes hybrid semantic + full-text + metadata retrieval over authorized event records, generates grounded explanations, and dynamically composes **schema-validated interactive UI components** (cards, sortable/grouped tables, comparison matrices, 9 chart types, interactive React Flow + Mermaid diagrams, validated dynamic forms, live dashboards, timelines, kanban boards, checklists, and exportable reports).

---

## Key Capabilities

### 1. Intelligent Chat Workspace (`/`)
- Streaming SSE conversational interface with stage indicators (`Understanding your question` → `Searching relevant records` → `Validating generated interface`).
- Explicit `ConversationContext` state retention for multi-turn follow-ups (*"Show only online events"*, *"Now compare them by date"*, *"Create a chart"*, *"Hide the description column"*).
- Configurable search mode (`hybrid`, `semantic`, `keyword`) and AI model selector.
- Saved & searchable session history (persisted in Supabase `chat_sessions` / `chat_messages` when signed in, with guest `localStorage` continuity).
- Follow-up suggestion pills, response regeneration, stop generation, and search quality feedback (`useful`, `irrelevant`, `incorrect_info`).

### 2. Hybrid Semantic Search Engine (`/search`)
- **Vector similarity** (`pgvector` HNSW cosine index over 768-dim `google/gemini-embedding-001` vectors in `event_embeddings`).
- **Full-text keyword search** (PostgreSQL weighted `tsvector` GIN index `search_tsv` with safe sanitized OR-tsquery generation).
- **Strict metadata filtering** (`format`, `category`, `technologies`, `dateStart..dateEnd`, `city`, `is_free`) verified server-side and post-filtered so semantic similarity never overrides hard constraints.
- **Configurable ranking** (`0.50 Semantic + 0.30 Keyword + 0.20 Metadata` in hybrid mode) with transparent score breakdowns and evidence-backed match explanations.
- Honest fallback when vector embeddings or provider keys are unavailable — switches cleanly to keyword + metadata retrieval without fabricating semantic scores.

### 3. Controlled Dynamic UI Generation Engine (`src/lib/ui/`)
All AI-selected UI components come from an allowlisted frontend registry (`src/components/dynamic-ui/ComponentRegistry.tsx`) and are strictly validated via Zod (`validateUISpec`) before rendering. **Zero arbitrary JavaScript, `eval`, or raw AI-generated HTML is ever executed.**
- **Event Cards & KPI Strips** (`event_cards`, `kpi_cards`)
- **Interactive Data Tables & Comparison Matrices** (`data_table`, `comparison_table`) — sorting, pagination, global search, column visibility/resizing, grouping (`category`, `format`, `month`), row selection, CSV/JSON export, and natural-language table commands.
- **9 Chart Types via Recharts** (`bar`, `horizontal_bar`, `stacked_bar`, `line`, `area`, `pie`, `donut`, `scatter`, `kpi`) with accessible screen-reader data tables and CSV export.
- **Interactive Diagrams via React Flow & Strict Mermaid** (`flowchart`, `architecture`, `process`, `sequence`, `er_diagram`, `mind_map`, `decision_tree`, `user_journey`, `state`) with zoom, pan, minimap, node inspector, SVG/PNG export, and Mermaid directive sanitization.
- **Dynamic Forms via React Hook Form + Zod** (`dynamic_form`) — conditional field visibility, multi-step support, live facets, and strictly allowlisted actions (`filter_search`, etc.).
- **Composite Interactive Dashboards** (`dashboard`), **Timelines** (`timeline`), **Kanban Boards** (`kanban`), **Checklists** (`checklist`), and **Exportable Reports** (`report_summary`).

### 4. Saved Dashboards & Templates (`/dashboards`, `/dashboards/$id`)
- Reusable report templates, private & workspace-shared dashboards (`saved_dashboards`), live interactive filter bars, widget reordering/resizing/adding, authorized data refresh, duplication, and CSV/JSON/Markdown export.

### 5. Multi-Tenant Workspaces, Auth, & Observability (`/workspace`, `/admin`, `/auth`, `/profile`)
- **Authentication**: Email/password sign-in/up, Google & Lovable OAuth, password reset, profile editing, and private `avatars` storage bucket uploads.
- **Multi-Tenant RBAC & RLS**: `owner`, `admin`, `editor`, `member`, `viewer` roles enforced by PostgreSQL Row-Level Security (`is_tenant_member`, `has_tenant_role`) and server-side guards.
- **Workspace Event Studio**: Editors can publish/manage private workspace events with automatic SHA-256 deduplicated embedding indexing.
- **Observability & Index Health**: Search latency (p95), success/low-confidence/no-result rates, token & cost tracking, UI schema validation rate, rate-limit/security flags, and embedding index management.

---

## Architecture & Security Model

- **Prompt-Injection Defense** (`src/lib/ai/security.ts`): Retrieved event records are wrapped in untrusted `<retrieved_records data_only="true">` delimiters; suspicious override attempts are flagged and never alter permissions.
- **No LLM-Generated SQL**: All search and analytics operations invoke parameterized PostgreSQL RPCs (`search_events`, `get_events_by_ids`, `event_facets`) and deterministic TypeScript aggregation (`computeKpis`, `groupCount`).
- **Dynamic UI Security** (`src/lib/ui/validator.ts`): Strict Zod `.strict()` schema rejection of unknown keys/components, bounded component count (max 8) & payload size, `https://`-only URL validation, and Mermaid script/callback stripping.
- **Server-Only Secrets**: `LOVABLE_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are loaded strictly inside `*.server.ts` modules dynamically imported inside API handlers, never shipped to client bundles.

---

## REST API Reference (`/api/v1/*`)

| Endpoint | Method(s) | Purpose |
| --- | --- | --- |
| `/api/v1/health` | `GET` | Runtime & provider configuration check |
| `/api/v1/chat` | `POST` | AI orchestration & SSE streaming chat workspace |
| `/api/v1/chat/sessions` | `GET`, `POST` | List, search, and create saved conversations |
| `/api/v1/chat/sessions/:id` | `GET`, `PATCH`, `DELETE` | Fetch, rename/save, or delete a conversation |
| `/api/v1/chat/sessions/:id/messages` | `GET` | Retrieve persisted session messages & UI specs |
| `/api/v1/search/hybrid` | `POST` | Hybrid semantic + FTS + metadata search |
| `/api/v1/search/semantic` | `POST` | Semantic vector-focused search |
| `/api/v1/search/facets` | `GET` | Authorized categories, cities, technologies & counts |
| `/api/v1/search/history` | `GET` | Recent query history |
| `/api/v1/search/feedback` | `POST` | Record search quality ratings & comments |
| `/api/v1/embeddings/status` | `GET` | Embedding coverage & index status |
| `/api/v1/embeddings/generate` | `POST` | Index pending events (editor/platform_admin) |
| `/api/v1/embeddings/reindex` | `POST` | Force reindex events (editor/platform_admin) |
| `/api/v1/ui/generate` | `POST` | Generate validated dynamic UI specification |
| `/api/v1/ui/validate` | `POST` | Validate a UI specification against strict schema |
| `/api/v1/ui/artifacts/:id` | `GET`, `PATCH` | Fetch or update validated UI artifact |
| `/api/v1/dashboards` | `GET`, `POST` | List or save workspace dashboards |
| `/api/v1/dashboards/:id` | `GET`, `PATCH`, `DELETE` | View, update, or delete dashboard |
| `/api/v1/dashboards/:id/duplicate` | `POST` | Duplicate a dashboard |
| `/api/v1/dashboards/:id/export` | `POST` | Export dashboard records (JSON, CSV, Markdown) |
| `/api/v1/analytics/query` | `POST` | Multi-dimension authorized event analytics |
| `/api/v1/analytics/aggregate` | `POST` | Custom dimension aggregations & KPIs |
| `/api/v1/analytics/metrics` | `GET` | Operational & search observability metrics |
| `/api/v1/events` | `GET`, `POST` | List public/workspace events or create event |
| `/api/v1/events/:id` | `PATCH`, `DELETE` | Update or delete workspace event |
| `/api/v1/workspaces` | `GET`, `POST` | List or create team workspaces |
| `/api/v1/workspaces/:id/members` | `GET`, `POST`, `PATCH`, `DELETE` | Manage workspace members & RBAC roles |
| `/api/v1/workspaces/:id/audit` | `GET` | View workspace audit logs (admin/owner) |

---

## Local Setup & Development

### 1. Prerequisites
- **Node.js >= 22** or **Bun >= 1.2**
- A Supabase project with the SQL migrations in `drizzle/migrations/` applied (including `0000_workspace_core_schema.sql` and `0001_seed_sample_events.sql` for the 48 sample events).

### 2. Environment Variables
Copy `.env.example` to `.env` and fill in your values (never commit real secrets):

```sh
cp .env.example .env
```

- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`: Public Supabase project config.
- `SUPABASE_SERVICE_ROLE_KEY`: Server-only key required for writing `event_embeddings` and persistent `search_queries` telemetry.
- `LOVABLE_API_KEY`: Server-only AI Gateway key for Gemini/OpenAI chat completions and `google/gemini-embedding-001` vector embeddings. (When omitted locally, Scout operates cleanly using deterministic NLP parsing and PostgreSQL FTS + metadata search.)

### 3. Install, Test, Typecheck, and Run

```sh
bun install
bun run test          # Run Vitest unit & orchestration tests
bun x tsc --noEmit    # Strict TypeScript check
bun run lint          # ESLint + Prettier checks
bun run dev           # Start local dev server (http://localhost:3000)
bun run build         # Production Cloudflare/Nitro + Vite build
```

---

## Test Suite

Tests live in `src/test/`:
- `ranking.test.ts` — Tokenization, safe tsquery building, semantic normalization, hybrid ranking, match explanations, low-confidence flags.
- `filters.test.ts` — Filter sanitization, reversed date-range correction, strict metadata predicates, UTC bounds.
- `intent-parser.test.ts` — Multi-constraint NLP extraction, relative dates, follow-up refinement merging, diagrams/forms/table commands.
- `ui-validator.test.ts` — Allowlisted component validation, unknown-key rejection, XSS/URL/Mermaid sanitization, payload limits, table commands.
- `security.test.ts` — Prompt-injection detection, untrusted record delimiter escaping, CSV formula-injection neutralization.
- `orchestrator.test.ts` — All 8 PRD end-to-end scenarios (cards, comparison tables, charts, flowcharts, forms, dashboards, zero-result handling, cross-tenant denial).
- `app-routing.test.tsx` — Route tree matching across all application pages.
