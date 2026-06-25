<p align="center">
  <img src="frontend/public/favicon.svg" width="72" alt="Synapse logo" />
</p>

<h1 align="center">Synapse</h1>

<p align="center">
  <b>An AI study assistant built on retrieval-augmented generation.</b><br />
  Upload course notes and PDFs, then chat with answers that are grounded in and
  cited to your own documents — and generate quizzes, notes, and
  spaced-repetition flashcards from the same material.
</p>

<p align="center">
  <a href="https://.vercel.app"><img src="https://img.shields.io/badge/%F0%9F%94%97_Live_Demo-synapse.vercel.app-0070F3?style=for-the-badge&logo=vercel&logoColor=white" alt="Live Demo" /></a>
</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License: MIT" /></a>
  <a href="https://www.python.org/"><img src="https://img.shields.io/badge/python-3.11-3776AB.svg" alt="Python 3.11" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-20%2B-339933.svg" alt="Node 20+" /></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-19-61DAFB.svg" alt="React 19" /></a>
  <a href="https://fastapi.tiangolo.com/"><img src="https://img.shields.io/badge/FastAPI-0.115.5-009688.svg" alt="FastAPI 0.115.5" /></a>
  <a href="https://www.postgresql.org/"><img src="https://img.shields.io/badge/PostgreSQL-16-336791.svg" alt="PostgreSQL 16" /></a>
  <a href="https://www.trychroma.com/"><img src="https://img.shields.io/badge/ChromaDB-0.6.3-ff6b6b.svg" alt="ChromaDB 0.6.3" /></a>
  <a href="#-quality--performance"><img src="https://img.shields.io/badge/Lighthouse-desktop%20100%20%7C%20mobile%2095%E2%80%9399-brightgreen.svg" alt="Lighthouse scores" /></a>
  <a href="#-testing"><img src="https://img.shields.io/badge/tests-23%20backend%20%2B%2036%20frontend-brightgreen.svg" alt="Test count" /></a>
  <a href="https://github.com/manav-2812/Synapse/actions/workflows/ci.yml"><img src="https://github.com/manav-2812/Synapse/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="#-getting-started"><img src="https://img.shields.io/badge/status-production%20ready-blue.svg" alt="Status" /></a>
</p>

<p align="center">
  <a href="#overview">Overview</a> ·
  <a href="#features">Features</a> ·
  <a href="#screenshots">Screenshots</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#database-schema">Database</a> ·
  <a href="#api-reference">API</a> ·
  <a href="#getting-started">Getting Started</a> ·
  <a href="#testing">Testing</a> ·
  <a href="#quality--performance">Quality</a> ·
  <a href="#deployment">Deployment</a> ·
  <a href="#configuration-reference">Configuration</a> ·
  <a href="#security">Security</a> ·
  <a href="#roadmap">Roadmap</a> ·
  <a href="#contributing">Contributing</a> ·
  <a href="#license">License</a>
</p>

---

## Overview

Synapse is a **retrieval-augmented generation (RAG) study assistant**. A user uploads
college material — PDF, DOCX, TXT, or scanned PNG/JPG — and Synapse answers
questions, generates exam-style answers, adaptive quizzes, structured notes, and
flip flashcards. Every answer is **cited** to the exact passage in the source
document, so the student can verify it rather than trust a black box.

The system is built around two non-negotiable design goals:

1. **It works end-to-end with real AI answers grounded in real uploaded
   documents** — not a mocked demo. The retrieval layer is *measured*, not
   assumed: a built-in evaluation harness scores precision, recall, MRR, and NDCG
   against a labelled dataset and trends the results over time.
2. **It is engineered to a production standard** — a typed API with uniform error
   handling, a layered backend with enforced data-ownership boundaries, a
   Linear-inspired frontend with light/dark design tokens, and a clean Lighthouse
   profile across every route.

> Synapse is a **two-tier application**: an async FastAPI backend that owns the
> database, vector store, embeddings, and LLM calls, and a React 19 SPA that is
> deployed separately and talks to the API over `fetch`. The backend is
> **API-only** — it never serves the SPA.

---

## Features

### Ingestion & retrieval
- **Multi-format ingestion** — PDF, DOCX, TXT, and PNG/JPG. Scanned pages and
  image-only PDFs are run through OCR (Tesseract by default, with an optional
  vision-LLM fallback).
- **Background processing pipeline** — parse → clean → chunk → embed → index, with
  live `pending → processing → completed | failed` status polling and cancelable
  uploads. A failed job stores a safe `error_message` and never hangs.
- **Hybrid retrieval** — dense semantic search (Chroma) blended with a sparse
  BM25 keyword index, so both conceptual queries ("what is photosynthesis") and
  keyword queries ("Einstein 1905 photoelectric effect") rank correctly. Blend
  weights are configurable and swept by the eval harness.

### Conversational study
- **Streaming chat with grounded citations** — answers stream token-by-token over
  Server-Sent Events (SSE). Every claim carries clickable source chips
  (`document_name · page N`) that open the exact excerpt.
- **Flexible scope** — chat within a single document or across the whole library.

### Study tools
- **Spaced-repetition flashcards (SM-2)** — each card carries full scheduling
  state (`ease_factor`, `interval_days`, `repetitions`, `due_date`). A focused
  "Due for review" session surfaces what is actually due.
- **Quizzes** — MCQ and short-answer generation, auto-scored with explanations
  that feed topic-level analytics.
- **Notes** — summaries, exam answers, and formula sheets on demand.

### Insight & quality
- **Analytics dashboard** — documents uploaded, questions asked, quizzes taken,
  average score, weak/strong topics, and a **Usage & Cost** trend (tokens,
  estimated cost, and cache-hit rate).
- **Retrieval evaluation dashboard** — precision@k / recall@k / MRR / NDCG trended
  across runs, answering *"how do we know the RAG actually retrieves the right
  context?"*
- **Query cache** — identical questions return instantly; every LLM call is
  metered for cost.

### Experience & platform
- Light / dark themes, a command palette (⌘K), and byte-level upload progress.
- Accessible (skip-link, focus styles, labelled controls, `prefers-reduced-motion`)
  and SEO-ready (meta + Open Graph tags, `robots.txt`, `sitemap.xml`).
- JWT authentication with rotating, single-use refresh tokens and bcrypt password
  hashing.

---

## Screenshots

<p align="center">
  <img src="docs/screenshots/dashboard.png" width="47%" alt="Dashboard" />
  <img src="docs/screenshots/chat.png" width="47%" alt="Chat with citations" />
</p>
<p align="center">
  <img src="docs/screenshots/documents.png" width="47%" alt="Documents" />
  <img src="docs/screenshots/flashcards.png" width="47%" alt="Flashcards" />
</p>
<p align="center">
  <img src="docs/screenshots/analytics.png" width="47%" alt="Analytics" />
  <img src="docs/screenshots/quiz.png" width="47%" alt="Quiz" />
</p>
<p align="center">
  <img src="docs/screenshots/notes.png" width="47%" alt="Notes" />
  <img src="docs/screenshots/eval.png" width="47%" alt="Eval dashboard" />
</p>

<details>
  <summary>Auth & profile views</summary>

<p align="center">
  <img src="docs/screenshots/login.png" width="47%" alt="Login" />
  <img src="docs/screenshots/signup.png" width="47%" alt="Signup" />
</p>
<p align="center">
  <img src="docs/screenshots/profile.png" width="47%" alt="Profile" />
</p>
</details>

<details>
  <summary>Mobile (390 × 844)</summary>

<p align="center">
  <img src="docs/screenshots/dashboard-mobile.png" width="32%" alt="Dashboard mobile" />
  <img src="docs/screenshots/chat-mobile.png" width="32%" alt="Chat mobile" />
</p>
</details>

---

## Architecture

Synapse separates concerns into a clean client/server split. The React SPA runs in
the browser (deployed to Vercel); the FastAPI service runs on an ASGI host
(Render, Railway, or Docker) and owns all data and model access.

```mermaid
flowchart TB
  subgraph Browser["Browser — React 19 SPA (Vercel)"]
    UI[React Router pages]
    Client[Typed fetch client<br/>401 → refresh → retry]
  end
  subgraph Backend["FastAPI — Python 3.11 (Render / Docker)"]
    Routes["api/v1/*  (routes only)"]
    Services["services/*  (business logic)"]
    Repos["repositories/*  (ownership filter)"]
    AI["ai/*  loaders · processing · embeddings · rag · llm · study · eval"]
  end
  PG[("PostgreSQL 16<br/>+ Alembic migrations")]
  Chroma[("ChromaDB<br/>one collection per user")]
  LLM{{"LLM  Groq → Gemini fallback"}}

  UI -->|HTTPS / CORS| Client
  Client -->|/api/v1| Routes
  Routes --> Services --> Repos
  Repos --> PG
  Services --> AI --> Chroma
  AI -. "stream tokens" .-> LLM
```

### Layered backend

```
Browser (React SPA)
        │  fetch /api/v1/*   (Bearer auth, 401→refresh→retry)
        ▼
api/v1/*        routes only — parse request, call a service, return a schema
        │
services/*      business logic — orchestrate repositories + ai/*
        │
repositories/*  SQLAlchemy DB access — ownership enforced here (user_id filter)
        │
models/*        SQLAlchemy tables
        ▼
PostgreSQL 16  +  ChromaDB (one vector collection per user)
```

**Architectural invariants (enforced by audit):**
- Routes **never touch the database directly** — they call services.
- Repositories are the only layer that issues SQL, and they filter every read by
  `user_id`, so one user can never read another's data.
- Every request/response body is a **Pydantic schema** (`schemas/*`); all config
  comes from `core/config.py` (pydantic-settings), never hardcoded.
- Custom exceptions (`core/exceptions.py`) map to a uniform JSON error shape
  `{"error": {"message", "code"}}` via a global handler in `main.py`. The
  TypeScript client reads `error.message`.

### Document ingestion pipeline

```mermaid
flowchart LR
  A[Upload PDF / DOCX / TXT / Image] --> B[Load + OCR]
  B --> C[Clean + chunk<br/>token-aware ~240 tokens]
  C --> D[Embed<br/>all-MiniLM-L6-v2]
  D --> E["Upsert Chroma<br/>user_{id} collection"]
  E --> F[(status: completed)]
```

1. `POST /documents/upload` saves the file to `STORAGE_PATH` and creates a
   `Document` row with `processing_status = pending`.
2. A FastAPI `BackgroundTasks` job runs `services/processing_service`:
   - **Load** text via `ai/loaders` — PyMuPDF (PDF), python-docx (DOCX),
     Pillow + pytesseract (PNG/JPG and scanned/image-only PDF pages), plain read
     (TXT).
   - **Clean + chunk** in `ai/processing` (token-aware chunking via tiktoken;
     `CHUNK_TOKENS ≈ 240` fits the embedding model's 256-token window).
   - **Embed** each chunk with `all-MiniLM-L6-v2` (local, CPU).
   - **Persist** vectors into the user's Chroma collection `user_{user_id}` with
     metadata (`document_id`, `page_number`, `chunk_index`).
3. Status is polled via `GET /documents/{id}/status`
   (`pending → processing → completed | failed`).

### Chat request lifecycle (SSE)

```mermaid
sequenceDiagram
  participant U as User (SPA)
  participant C as API Client
  participant S as /chat/message (SSE)
  participant R as Retriever (semantic + BM25)
  participant L as LLM (Groq → Gemini)
  participant PG as PostgreSQL

  U->>C: Ask a question (optionally scoped to a doc)
  C->>S: POST /chat/message (Bearer)
  S->>R: Embed query + hybrid retrieve top-k
  R-->>S: Grounded chunks + relevance scores
  S-->>U: event: sources  (citation chips)
  S->>L: Stream prompt (system + chunks + query)
  loop tokens
    L-->>S: token
    S-->>U: event: token
  end
  S-->>U: event: done (message_id, conversation_id)
  S->>PG: Persist message + answer_sources
```

### Hybrid retrieval

Retrieval is hand-rolled (no LangChain). `ai/rag/retriever.py` runs semantic
vector search and a BM25 keyword index in parallel, normalizes both to 0..1, and
blends them:

```
combined = hybrid_semantic_weight * semantic_norm + hybrid_bm25_weight * bm25_norm
```

Keyword-heavy queries that pure semantic search mis-ranks are recovered by BM25 —
verified by the retrieval eval. The eval harness sweeps the weights and selects
the blend with the best MRR.

```mermaid
flowchart LR
  Q[User query] --> E[Embed query<br/>MiniLM-L6-v2]
  E --> S[Semantic search<br/>Chroma top-k]
  Q --> B[BM25 index<br/>over user chunks]
  B --> K[BM25 top-k]
  S --> N1[Normalize 0..1]
  K --> N2[Normalize 0..1]
  N1 --> BL[Blend: w_s·S + w_k·K]
  N2 --> BL
  BL --> R[Re-ranked grounded chunks]
```

### Query cache & cost metering

Before any LLM call, `ai/llm/cache.py` checks an in-memory **LRU** keyed on a hash
of `user_id + normalized_query + document_scope`; a cache hit skips the model. On
every call — cached or not — token counts and an estimated cost (from per-provider
`*-COST_PER_1M` rates) are persisted to `llm_usage_logs`. `GET /analytics/usage`
aggregates tokens, cost, and cache-hit rate.

```mermaid
flowchart LR
  Req[LLM request] --> Cache{In LRU cache?}
  Cache -->|hit| Return[Cached response<br/>cached = true]
  Cache -->|miss| LLM[Call provider<br/>Groq → Gemini fallback]
  LLM --> Meter[Log tokens + cost<br/>llm_usage_logs]
  Meter --> Store[Store in LRU]
  Store --> Return
  Return --> Usage[/GET /analytics/usage<br/>tokens · cost · cache-hit rate/]
```

See [`docs/architecture.md`](docs/architecture.md) for the full layered design,
OCR degradation behavior, and the eval pipeline.

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| **Frontend** | React 19 · TypeScript · Vite 8 · React Router 7 |
| **Backend** | Python 3.11 (required — 3.13 breaks the dependency build) · FastAPI 0.115.5 (async) |
| **Database** | PostgreSQL 16 + SQLAlchemy 2.0 (async) + Alembic |
| **Vector store** | ChromaDB 0.6.3 (one persistent collection per user) |
| **Embeddings** | Sentence-Transformers `all-MiniLM-L6-v2` (local, CPU) |
| **LLM** | Groq `llama-3.3-70b` (primary) · Gemini `gemini-2.5-flash` (fallback) |
| **RAG** | Hand-rolled retriever — semantic (Chroma) + BM25, no LangChain |
| **Auth** | JWT (20-min access + 7-day rotating refresh) · bcrypt |
| **Frontend tests** | Vitest + React Testing Library · Playwright |
| **Backend tests** | pytest + pytest-asyncio |
| **Hosting** | Frontend → Vercel (static SPA) · Backend + Postgres → Render |

---

## Project Structure

```
Synapse/
├── backend/                          # FastAPI app (API only — does NOT serve the UI)
│   ├── app/
│   │   ├── core/                     # config, db, security, logger, exceptions, limiter
│   │   ├── api/v1/                   # routes: auth, users, documents, folders,
│   │   │                             #         chat, study, analytics, eval
│   │   ├── services/                 # business logic (chat, document, processing,
│   │   │                             #         study, analytics, auth, folder, upload)
│   │   ├── repositories/             # DB access (ownership enforced here)
│   │   ├── ai/                       # loaders, processing, embeddings,
│   │   │                             #         vectorstore, rag, llm, study, ocr
│   │   ├── models/                   # SQLAlchemy models (16 application tables)
│   │   ├── schemas/                  # Pydantic request/response models
│   │   ├── eval/                     # retrieval-eval dataset + runner + metrics
│   │   └── main.py                   # FastAPI app, middleware, error handlers
│   ├── alembic/                      # migrations (10 revisions, applied in order)
│   ├── tests/                        # pytest suite (auth, pipeline, retrieval,
│   │   │                             #         quiz scoring, contract, metrics)
│   ├── scripts/                      # manual walkthrough / seeding helpers
│   ├── Dockerfile                    # Python 3.11-slim (Tesseract included)
│   └── requirements.txt
├── frontend/                         # React + TypeScript + Vite SPA
│   ├── src/
│   │   ├── api/                      # typed client (401→refresh→retry)
│   │   ├── components/               # ui/ primitives + layout/ + CommandPalette
│   │   ├── context/                  # AuthContext, TipsContext
│   │   ├── hooks/                    # useTheme, useToast, useDocumentPolling, …
│   │   ├── pages/                    # Dashboard, Documents, Chat, Quiz,
│   │   │                             #         Flashcards, Notes, Analytics,
│   │   │                             #         Eval, Profile, auth/
│   │   ├── types/                    # mirrors backend Pydantic schemas
│   │   └── styles/                   # design-system CSS (tokens in index.css)
│   ├── public/                       # favicon, robots.txt, sitemap.xml, OG image
│   ├── e2e/                          # Playwright end-to-end tests
│   └── src/__tests__/                # Vitest unit/component tests
├── docs/                             # architecture, setup, api,
│   │                                 #         lighthouse-report
├── .github/                          # PR template + issue templates
├── docker-compose.yml · render.yaml · vercel.json (frontend/)
└── README.md · CHANGELOG.md · CONTRIBUTING.md · LICENSE
```

---

## Database Schema

Synapse uses **16 application tables** across auth, content, conversation, study,
analytics, and evaluation. Cascading deletes flow from `users` down; `folders`
self-reference for nested organization. `document_chunks` links each row to a
Chroma vector via `chroma_vector_id` (not a DB foreign key).

```mermaid
erDiagram
  users ||--o| user_profiles : "has"
  users ||--o| analytics : "has"
  users ||--o{ folders : "owns"
  users ||--o{ documents : "owns"
  users ||--o{ conversations : "owns"
  users ||--o{ generated_notes : "owns"
  users ||--o{ quizzes : "owns"
  users ||--o{ flashcards : "owns"
  users ||--o{ study_activity : "logs"
  users ||--o{ eval_runs : "runs"
  users ||--o{ llm_usage_logs : "meters"
  folders ||--o{ folders : "parent / child"
  folders ||--o{ documents : "contains"
  documents ||--o{ document_chunks : "split into"
  conversations ||--o{ messages : "contains"
  messages ||--o{ answer_sources : "cites"
  quizzes ||--o{ questions : "has"
  documents ||--o| flashcards : "sourced from (optional)"

  users {
    uuid id PK
    string email UK
    string full_name
    string password_hash
    string profile_image_url
    bool is_active
    string last_refresh_jti "single-use refresh JTI"
    int daily_study_goal_minutes
  }
  user_profiles {
    uuid id PK
    uuid user_id FK, UK
    string education_level
    string institution
    jsonb preferences
  }
  analytics {
    uuid id PK
    uuid user_id FK, UK
    int total_study_minutes
    int documents_uploaded_count
    int questions_asked_count
    int quizzes_taken_count
    float average_quiz_score
    jsonb weak_topics
    jsonb strong_topics
  }
  folders {
    uuid id PK
    uuid user_id FK
    string name
    uuid parent_folder_id FK "self-reference"
  }
  documents {
    uuid id PK
    uuid user_id FK
    uuid folder_id FK "nullable"
    string file_type
    int file_size_bytes
    string processing_status "pending|processing|completed|failed"
    int page_count
    text error_message
  }
  document_chunks {
    uuid id PK
    uuid document_id FK
    text chunk_text
    int page_number
    int chunk_index
    int token_count
    string chroma_vector_id "links to Chroma vector"
  }
  conversations {
    uuid id PK
    uuid user_id FK
    string title
  }
  messages {
    uuid id PK
    uuid conversation_id FK
    string role "user|assistant"
    text content
    int token_count
  }
  answer_sources {
    uuid id PK
    uuid message_id FK
    uuid document_id "nullable"
    text chunk_text
    int page_number
    float score
  }
  generated_notes {
    uuid id PK
    uuid user_id FK
    string note_type
    string title
    text content
    jsonb document_scope
  }
  quizzes {
    uuid id PK
    uuid user_id FK
    string title
    string difficulty
    float score
    jsonb document_scope
  }
  questions {
    uuid id PK
    uuid quiz_id FK
    string question_type "mcq|short"
    text prompt
    jsonb options
    text correct_answer
    text explanation
    int order_index
  }
  flashcards {
    uuid id PK
    uuid user_id FK
    uuid document_id FK "nullable"
    text front
    text back
    float ease_factor "SM-2"
    int interval_days "SM-2"
    int repetitions "SM-2"
    timestamptz due_date "SM-2"
    timestamptz last_reviewed_at
  }
  study_activity {
    uuid id PK
    uuid user_id FK
    date date "UTC day"
    int minutes
    int sessions
  }
  eval_runs {
    uuid id PK
    uuid user_id FK
    timestamptz timestamp
    json aggregate_scores "precision/recall/MRR/NDCG"
    json raw_results
  }
  llm_usage_logs {
    uuid id PK
    uuid user_id FK
    string provider "groq|gemini"
    string model
    int prompt_tokens
    int completion_tokens
    int total_tokens
    float estimated_cost
    bool cached
    timestamptz created_at
  }
```

Migrations live in `backend/alembic/` (10 revisions, applied in order from an
empty database). `backend/app/models/` is the source of truth for every column,
foreign key, and index. Alembic creates **17 tables total** (16 application tables
plus `alembic_version`).

---

## API Reference

The API is versioned under `/api/v1`. **Interactive docs:** Swagger UI at
`/docs` and ReDoc at `/redoc` (served by FastAPI). **OpenAPI schema:**
`GET /api/v1/openapi.json`. **Health:** `GET /health`.

> All mutating endpoints require a `Bearer <access_token>` header. On `401` the
> client refreshes transparently and retries once. Errors use the uniform shape
> `{"error": {"message": str, "code": str}}`.

### Auth — `/api/v1/auth`
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/auth/signup` | Create account → returns access + refresh tokens |
| POST | `/auth/login` | Authenticate → tokens |
| POST | `/auth/refresh` | Exchange refresh token for a new pair (rotates `jti`) |
| POST | `/auth/logout` | Invalidate the refresh token |

### Users — `/api/v1/users`
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/users/me` | Current user profile |
| PATCH | `/users/me` | Update name / preferences / study goal |
| POST | `/users/me/avatar` | Update avatar |

### Documents & folders — `/api/v1/documents`
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/documents/upload` | Upload + start background ingestion |
| GET | `/documents` | List user's documents (filter by `folder_id`) |
| GET | `/documents/{id}` | Document detail |
| GET | `/documents/{id}/status` | Processing status polling |
| PATCH | `/documents/{id}` | Rename / move |
| DELETE | `/documents/{id}` | Delete (vectors + file + row) |
| POST | `/documents/folders` | Create folder |
| GET | `/documents/folders` | List folders |
| DELETE | `/documents/folders/{id}` | Delete folder |

### Chat — `/api/v1/chat`
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/chat/message` | **SSE stream** — grounded, cited answer |
| GET | `/chat/conversations` | List conversations |
| GET | `/chat/conversations/{id}` | Conversation detail (messages + sources) |
| PATCH | `/chat/conversations/{id}` | Rename conversation |
| DELETE | `/chat/conversations/{id}` | Delete conversation |
| PATCH | `/chat/conversations/{id}/messages/{id}` | Edit a message |
| DELETE | `/chat/conversations/{id}/messages/{id}` | Delete a message |

### Study — `/api/v1/study`
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/study/notes` | Generate notes / summaries |
| GET | `/study/notes` · `/study/notes/{id}` | List / detail note |
| PATCH / DELETE | `/study/notes/{id}` | Update / delete note |
| POST | `/study/quiz` | Generate a quiz |
| POST | `/study/quiz/submit` | Score submitted answers |
| GET | `/study/quiz` · `/study/quiz/{id}` | List / detail quiz |
| PATCH / DELETE | `/study/quiz/{id}` | Update / delete quiz |
| POST | `/study/flashcards` | Generate flashcards |
| GET | `/study/flashcards` · `/study/flashcards/due` | All / due cards |
| POST | `/study/flashcards/{id}/review` | Apply **SM-2** review |
| PATCH / DELETE | `/study/flashcards/{id}` | Update / delete flashcard |

### Analytics — `/api/v1/analytics`
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/analytics/dashboard` | Summary tiles + weak/strong topics |
| GET | `/analytics/usage` | Token / cost / cache-hit trends (query `days`) |

### Eval — `/api/v1/eval`
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/eval/run` | Run retrieval eval (precision/recall/MRR/NDCG + weight sweep) |
| GET | `/eval/runs` | Historical runs for the trends chart |

For full request/response shapes, see [`docs/api.md`](docs/api.md) (generated from
the live OpenAPI schema). The API exposes **44 endpoints** across 9 groups
(auth, users, folders, documents, chat, study, analytics, eval, health).

---

## Getting Started

### Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Python | **3.11** | 3.13 breaks the dependency build (`torch` / `sentence-transformers` / `chromadb`). Create the venv explicitly. |
| Node.js | 20+ | For the Vite frontend (local dev used 24.x). |
| PostgreSQL | 16 | Local instance, or Docker. |
| Groq + Gemini keys | — | For the LLM (Groq primary, Gemini fallback). |
| (Optional) Tesseract | — | For OCR of scanned images; the app degrades gracefully without it. |

> **Python 3.11 only.** `backend/.python-version` pins `3.11`. On Windows use
> `py -3.11`; elsewhere `python3.11`. Never `python -m venv .venv` (may resolve to
> 3.13). Confirm with `python3.11 --version` before creating the environment.

### 1. Backend (API only)

```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate            # Windows (Git Bash): source .venv/Scripts/activate
pip install -r requirements.txt
cp .env.example .env                 # fill GROQ_API_KEY / GEMINI_API_KEY / JWT_SECRET_KEY
alembic upgrade head                 # create tables
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

- API base: `http://localhost:8000/api/v1`
- Docs: `http://localhost:8000/docs`
- Health: `http://localhost:8000/health`

### 2. Frontend (React SPA)

```bash
cd frontend
npm install
cp .env.example .env                 # optional; sets VITE_API_BASE_URL
npm run dev                          # → http://localhost:5173
```

The client defaults to `http://localhost:8000/api/v1`. Point it elsewhere by
setting `VITE_API_BASE_URL` in `frontend/.env` (rebuild after changing).

Other scripts: `npm run build` (type-check + bundle to `dist/`),
`npm run preview` (serve the production build), `npm run lint` (oxlint).

### 3. Docker (full stack, local)

```bash
docker compose up --build
# backend → http://localhost:8000   postgres → localhost:5432
```

Data (Chroma vectors, uploads, Postgres) persists in mounted volumes under
`backend/chroma_db`, `backend/storage`, and the `pgdata` volume.

See [`docs/setup.md`](docs/setup.md) for the full runbook, including OCR engine
setup, troubleshooting, and the deploy configuration.

---

## Testing

### Continuous integration

Synapse runs a GitHub Actions workflow (`.github/workflows/ci.yml`) on every push
and pull request targeting `main`. It covers:

- **Backend** — `pytest` on **Python 3.11** against a **real PostgreSQL 16**
  service container, with the `all-MiniLM-L6-v2` embedding model pre-downloaded
  and cached. Runs strictly: any test failure **or** warning fails the job.
- **Frontend** — Vitest unit/component tests, `oxlint`, and a production
  `vite build` (type-check + bundle) on **Node 20**.

The full-stack Playwright e2e suite is **not** wired into per-PR CI (it requires
a live LLM); it is run locally — see below. See the CI badge at the top of this
README for the current status.

### Local

```bash
# Backend — pytest (real Postgres + real Chroma + real embeddings)
cd backend && pytest                 # 23 passed, 0 failures, 0 warnings

# Frontend — Vitest unit/component (api client, hooks, UI primitives)
cd frontend && npm test              # 26 passed

# Frontend — Playwright e2e (signup → upload → chat citation → flashcard → quiz → analytics)
cd frontend && npm run test:e2e      # 10 passed (against the real stack + live LLM)
```

The Playwright suite uses `workers: 1` and client-side navigation to stay stable
against a single local backend; it expects `GROQ_API_KEY` / `GEMINI_API_KEY` in
the backend environment and boots its own backend (`uvicorn`, port 8011) and a
production frontend preview (`vite preview`, port 4173) via the `webServer`
config in `playwright.config.ts`. The backend e2e walkthrough
(`scripts/manual_walkthrough.py`) is a standalone manual runner that hits a live
server and is intentionally not collected by pytest.

---

## Quality & Performance

Audited on **real Chrome (Lighthouse 13)** against a compressing static server
that mirrors Vercel (gzip/brotli + immutable hashed assets).

| Route | Desktop Perf | Mobile Perf | A11y | BP | SEO |
|-------|:---:|:---:|:---:|:---:|:---:|
| / (redirect → /login) · /login · /signup | 100 | 99 | 100 | 100 | 100 |
| /dashboard · /documents · /quiz · /flashcards · /notes · /analytics · /eval · /profile | 100 | 99 | 100 | 100 | 100 |
| /chat | 100 | **95** | 100 | 100 | 100 |

- **Console errors / warnings:** 0 on every route (logged-in + logged-out).
- **`axe-core` violations:** 0 on every route.
- **Failed (4xx/5xx) requests:** 0.
- **Dead links / no-op buttons:** none.

The single sub-95 mobile score (`/chat` at 95) is an inherent property of a
streaming chat UI under emulated mobile throttling (the first token + citation
chips arrive over SSE from a live LLM). It remains well inside the ≥ 90 target,
and accessibility, best-practices, and SEO are perfect. Full methodology and
per-fix notes: [`docs/lighthouse-report.md`](docs/lighthouse-report.md).

### Engineering highlights

**Hybrid search (BM25 + semantic).** Every query runs dense semantic search
(Chroma) *and* a sparse BM25 index (`rank_bm25`, pure Python), normalized to 0..1
and blended with tunable weights (`HYBRID_SEMANTIC_WEIGHT` /
`HYBRID_BM25_WEIGHT`). Keyword-heavy queries that pure semantic search mis-ranks
are recovered by BM25 — verified by a unit test and the retrieval eval.

**Citations with source highlighting.** Each answer is grounded in retrieved
chunks; the backend returns full provenance per chunk (`document_id`,
`document_name`, `chunk_id`, `page_number`, `snippet_text`). The UI renders
clickable chips; clicking opens the exact excerpt highlighted. This proves answers
come from your material, not hallucination.

**Retrieval eval dashboard (`/eval`).** A labelled dataset (question → expected
answer → expected source triples) runs through the *real* pipeline. For each
question the backend computes precision@k, recall@k, MRR, and NDCG, and persists
an aggregate run. The dashboard plots score trends across runs — a concrete answer
to *"how do you know your RAG actually retrieves the right context?"*

**Query caching & cost analytics.** Before any LLM call, the pipeline checks an
in-memory **LRU** keyed on `hash(user_id + normalized_query + document_scope)`; a
cache hit skips the model entirely. On every call — cached or not — token counts
and an estimated cost are persisted to `llm_usage_logs`. `GET /analytics/usage`
aggregates tokens, cost, and cache-hit rate; the Analytics page renders a
**Usage & Cost** card.

**Spaced-repetition flashcards (SM-2).** Each card carries SM-2 state
(`ease_factor`, `interval_days`, `repetitions`, `due_date`). Rating recall quality
(Again/Hard/Good/Easy → quality 0/3/4/5) updates the ease factor and computes the
next interval. `GET /study/flashcards/due` drives a focused "Due for review"
session — real spaced repetition.

```mermaid
stateDiagram-v2
  [*] --> New : card created (interval_days = 0, due)
  New --> Learning : review (quality < 3)
  New --> Reviewing : review (quality >= 3)
  Learning --> Learning : quality < 3 (interval reset to 1d)
  Learning --> Reviewing : quality >= 3 (interval grows)
  Reviewing --> Reviewing : quality >= 3 (interval × ease_factor)
  Reviewing --> Learning : quality < 3 (lapse → interval reset)
  Reviewing --> [*] : deleted
```

---

## Deployment

```mermaid
flowchart TB
  Dev[Developer] -->|git push| GH[(GitHub)]
  GH -->|build + host SPA| Vercel[Vercel: React SPA]
  GH -->|deploy service| Render[Render: FastAPI + Postgres 16]
  Render --> PG[(PostgreSQL 16)]
  Render --> Disk1[(/app/chroma_db disk)]
  Render --> Disk2[(/app/storage disk)]
  Vercel -->|HTTPS /api/v1| Render
  User[Browser] -->|static assets| Vercel
  User -->|API calls| Render
```

| Component | Where | Config |
|-----------|-------|--------|
| Frontend | Vercel (static, Vite) | root = `frontend/`; set `VITE_API_BASE_URL` at build |
| Backend | Render / Railway | `render.yaml` (web + Postgres 16 + 2 disks) |
| Local full-stack | Docker | `Dockerfile` + `docker-compose.yml` |

**Backend (Render).** `render.yaml` defines a web service, attached Postgres 16,
two persistent disks (`/app/chroma_db`, `/app/storage`), and runs
`alembic upgrade head` as a pre-deploy step. Set `JWT_SECRET_KEY`,
`GROQ_API_KEY`, `GEMINI_API_KEY`, and `ALLOWED_ORIGINS` (must include the Vercel
URL) in the dashboard.

**Frontend (Vercel).** `frontend/vercel.json` uses the Vite preset, outputs
`dist`, and rewrites all paths to `index.html` (SPA). Set `VITE_API_BASE_URL` to
the deployed API.

See [`docs/setup.md`](docs/setup.md) for the full deploy runbook, including OCR
engine setup and troubleshooting.

---

## Configuration Reference

**Backend** (`backend/.env`) — see [`backend/.env.example`](backend/.env.example).
Required values must be set; the rest have sensible defaults.

| Variable | Required | Description |
|----------|:---:|-------------|
| `DATABASE_URL` | ✅ | `postgresql+asyncpg://user:pass@host:5432/synapse` |
| `JWT_SECRET_KEY` | ✅ | Signs access/refresh tokens (≥ 32 random chars) |
| `GROQ_API_KEY` | ✅ | Primary LLM |
| `GEMINI_API_KEY` | ✅ | Fallback LLM |
| `CHROMA_PERSIST_PATH` | | Vector store dir (default `./chroma_db`) |
| `STORAGE_PATH` | | Uploaded-file dir (default `./storage`) |
| `ALLOWED_ORIGINS` | | CORS allow-list (must include the frontend origin) |
| `JWT_ALGORITHM` | | Token algorithm (default `HS256`) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | | Access token TTL (default `20`) |
| `REFRESH_TOKEN_EXPIRE_DAYS` | | Rotating refresh TTL (default `7`) |
| `APP_ENV` | | `development` \| `production` |
| `MAX_UPLOAD_SIZE_MB` | | Upload guardrail (default `50`) |
| `ALLOWED_EXTENSIONS` | | `pdf,docx,txt,png,jpg,jpeg` |
| `HYBRID_SEMANTIC_WEIGHT` | | Semantic blend weight (default `0.6`) |
| `HYBRID_BM25_WEIGHT` | | BM25 blend weight (default `0.4`) |
| `RESPONSE_CACHE_MAX_SIZE` | | LRU cache capacity (default `256`) |
| `RESPONSE_CACHE_TTL_SECONDS` | | LRU cache TTL (default `3600`) |
| `GROQ_INPUT_COST_PER_1M` / `GROQ_OUTPUT_COST_PER_1M` | | USD per 1M tokens for cost metering |
| `GEMINI_INPUT_COST_PER_1M` / `GEMINI_OUTPUT_COST_PER_1M` | | USD per 1M tokens for cost metering |
| `OCR_VISION_FALLBACK_ENABLED` | | Vision-LLM OCR fallback (default `false`) |
| `OCR_LANGUAGE` / `OCR_DPI` | | Tesseract language pack / render DPI |
| `CHROMA_TELEMETRY_OPTOUT` | | Set `true` to silence Chroma telemetry |

**Frontend** (`frontend/.env`):

| Variable | Description |
|----------|-------------|
| `VITE_API_BASE_URL` | API base URL, inlined at build time |

---

## Security

For vulnerability reporting instructions and security disclosures, see [`SECURITY.md`](SECURITY.md).

- **Passwords** are hashed with bcrypt (`passlib`); plaintext is never stored.
- **JWT auth** uses a 20-minute access token and a 7-day refresh token.
- **Refresh-token rotation** — `auth_service.refresh` rejects any presented `jti`
  that is not the stored `last_refresh_jti` and rotates it on every success, so a
  refresh token is single-use and cannot be replayed. `logout` nulls
  `last_refresh_jti`.
- **Data ownership** — repositories filter every read by `user_id`; one user can
  never read another's documents, conversations, or study data. Enforced in the
  data-access layer, not the routes.
- **Uniform error shape** — exceptions never leak stack traces; clients receive
  `{"error": {"message", "code"}}`.
- **Upload guardrails** — extension allow-list and size cap (`MAX_UPLOAD_SIZE_MB`).
- **Rate limiting** — `slowapi` guards the API; tune via `core/limiter.py`.

---

## Roadmap

- **Full-stack e2e in CI** — backend unit tests (pytest, real PostgreSQL 16) and
  frontend unit/component tests, lint, and build now run automatically in CI on
  every push and PR (see the status badge). The Playwright e2e suite still runs
  locally against a live LLM; wiring it into CI (a scheduled/manual run against
  the real stack with `GROQ_API_KEY` / `GEMINI_API_KEY` secrets) is the
  remaining step.
- **Multi-document chat scope + inline citation anchors** in the streamed answer.
- **Streaming study generation** — flashcards/quiz questions appear progressively.
- **Usage-based rate limiting & per-user cost caps** from `llm_usage_logs` metering.
- **OCR vision fallback on by default in prod** once Tesseract isn't guaranteed.
- **Self-hosted web fonts** (woff2) to restore the custom type without a CDN
  dependency.

---

## Contributing

Contributions are welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md) for branch
conventions, the test setup, and PR expectations. Issues and PRs use the templates
in [`.github/`](.github/).

---

## License

Released under the [MIT License](LICENSE).

---

## Author

**Manav Baghel**

- Email: [manavbaghhel@gmail.com](mailto:manavbaghhel@gmail.com)
- GitHub: [@manav-2812](https://github.com/manav-2812)
- Repository: [github.com/manav-2812/Synapse](https://github.com/manav-2812/Synapse)
