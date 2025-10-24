# Synapse — Architecture

Synapse is a retrieval-augmented **study assistant**: users upload course
material, and the app answers questions, generates quizzes/notes/flashcards,
and runs an eval harness to measure retrieval quality. It is a two-tier app:

- **Backend** — an async **FastAPI** service (Python 3.11) that owns the
  database, vector store, embeddings, LLM calls, and scheduling.
- **Frontend** — a **React 19 + TypeScript + Vite** SPA, deployed separately
  (Vercel) and talking to the API over `fetch` (CORS-enabled).

The backend is **API-only**: it never serves the SPA. The SPA is built to
static files and hosted on Vercel; the API runs on Render (or any ASGI host).

## Layered backend

```
Browser (React SPA)
        │  fetch /api/v1/*   (Bearer auth, 401→refresh→retry)
        ▼
api/v1/*      routes only — parse request, call a service, return a schema
        │
services/*    business logic — orchestrate repositories + ai/*
        │
repositories/*  SQLAlchemy DB access — ownership enforced here (user_id filter)
        │
models/*      SQLAlchemy tables
        ▼
PostgreSQL  +  ChromaDB (one vector collection per user)
```

Hard rules (verified by audit):

- Routes **never touch the database directly** — they call services.
- Repositories are the only layer that issues SQL, and they filter every read
  by `user_id` so one user can never read another's data.
- Every request/response body is a **Pydantic schema** (`schemas/*`); config
  comes only from `core/config.py` (pydantic-settings), never hardcoded.
- Custom exceptions (`core/exceptions.py`) map to a uniform JSON error shape
  `{"error": {"message", "code"}}` via a global handler in `main.py`. The
  TypeScript client reads `error.message` (older clients dropped it — fixed).

## Document pipeline

1. `POST /documents/upload` saves the file to `STORAGE_PATH` and creates a
   `Document` row with `processing_status = pending`.
2. A FastAPI `BackgroundTasks` job runs `services/processing_service`:
   - **Load** text: `ai/loaders` — PyMuPDF (PDF), python-docx (DOCX),
     Pillow + **pytesseract** (PNG/JPG, and scanned/image-only PDF pages),
     plain read (TXT).
   - **Clean + chunk** in `ai/processing` (token-aware chunking via tiktoken;
     `CHUNK_TOKENS=240` fits `all-MiniLM-L6-v2`'s 256-token window).
   - **Embed** each chunk with Sentence-Transformers `all-MiniLM-L6-v2`
     (local, CPU).
   - **Persist** vectors into the user's Chroma collection `user_{user_id}`
     with metadata (`document_id`, `page_number`, `chunk_index`).
3. Status is polled by the frontend via `GET /documents/{id}/status`
   (`pending → processing → completed | failed`). A failed job stores a
   safe `error_message` and never hangs.

**OCR (B3).** Tesseract (free, local) is the default engine; the Docker image
and Render include it. If Tesseract is missing or returns nothing, the upload
**still succeeds** — a clear "text not extracted" note chunk is stored instead
of crashing. An opt-in vision-LLM fallback (`OCR_VISION_FALLBACK_ENABLED`) can
recover text via Gemini/Groq at API cost.

## RAG chat (hybrid retrieval + streaming)

`POST /chat/message` is an **SSE stream** (`text/event-stream`):

1. Embed the query, then **hybrid retrieve** top-k grounded chunks from the
   user's Chroma collection (optionally scoped to one document).
2. **Hybrid search (A3).** Retrieval is hand-rolled (no LangChain):
   `ai/rag/retriever.py` blends **semantic** vector similarity (Chroma) with a
   **BM25** keyword index (`ai/rag/bm25.py`, built from the user's chunks) using
   `hybrid_semantic_weight * semantic_norm + hybrid_bm25_weight * bm25_norm`.
   The blend consistently out-ranks pure semantic on keyword-style queries
   (verified by the retrieval eval).
3. Emit a `sources` SSE event so the UI can render **citation chips (A2)** —
   each source carries `document_id`, `document_name`, `chunk_text`,
   `page_number`, and a relevance `score`.
4. Stream the LLM answer token-by-token as `token` SSE events
   (**streaming, B2**): Groq is primary, **Gemini** is the automatic fallback
   in `ai/llm/response_generator` (a mid-stream Groq failure re-streams from
   Gemini rather than swallowing the error).
5. Persist the assistant message + `AnswerSource` rows, then emit a `done`
   event with `conversation_id`.

SSE wire format (consumed by `frontend/src/api/chat.ts`):

```
data: {"type":"sources","value":[...]}
<blank line>
data: {"type":"token","value":"Hello"}
<blank line>
data: {"type":"done","value":{"conversation_id":"...","message_id":"...","title":"..."}}
<blank line>
```

## Query cache + cost logging (B1)

`ai/llm/cache.py` is an in-memory **LRU** cache keyed by the normalized prompt
(`RESPONSE_CACHE_MAX_SIZE` / `RESPONSE_CACHE_TTL_SECONDS`). Identical questions
return instantly (the live walkthrough observed a 0.09 s repeat vs ~seconds for
the first call). Every LLM call is metered in `ai/llm/tokens.py` and written to
the `llm_usage_logs` table; `GET /analytics/usage` aggregates
`total_tokens`, `total_cost` (from per-provider `*-COST_PER_1M` rates), and
`cache_hit_rate`.

## Study tools (SM-2 spaced repetition)

`ai/study` reuses the same hand-rolled retriever with different prompt
templates:

- `POST /study/notes` → summaries / exam answers / formula sheets.
- `POST /study/quiz` → MCQ / short-answer; `POST /study/quiz/submit` scores
  answers and feeds analytics.
- `POST /study/flashcards` → front/back pairs (**B4**). Each new card is
  immediately due (`interval_days=0`). `POST /study/flashcards/{id}/review`
  applies the **SM-2** algorithm (`ai/study/sm2.py`): it updates
  `ease_factor`, `interval_days`, `repetitions`, and `due_date` from the review
  quality (0–5). `GET /study/flashcards/due` returns due cards.

## Eval pipeline (A1)

`app/eval` measures retrieval quality on a labelled dataset
(`eval/eval_dataset.py`) through the **real** pipeline:

- `POST /eval/run` retrieves each query's gold chunks, computes
  `precision@k`, `recall@k`, `MRR`, and `NDCG`, and runs a hybrid-weight sweep
  (the live run picked `semantic=0.70 / bm25=0.30` by MRR). Results are stored
  in `eval_runs`.
- `GET /eval/runs` returns history for the trends chart on the eval dashboard.

## Analytics

`analytics_service.get_dashboard` aggregates per-document quiz performance into
weak / strong topic lists and feeds the dashboard cards; `get_usage` returns
token/cost trends from `llm_usage_logs`.

## Auth

JWT **access** (20 min) + rotating **refresh** (7 d) via `python-jose`;
passwords hashed with bcrypt (`passlib`). `auth_service.refresh` rejects any
presented `jti` that isn't the stored `last_refresh_jti` and rotates it on every
success — so a refresh token is single-use and cannot be replayed;
`logout` nulls `last_refresh_jti`. Every route is protected by the
`get_current_user` dependency.

## Configuration & deployment

All config is environment-driven (`backend/.env`, see `.env.example`). The
frontend's `VITE_API_BASE_URL` is inlined at build time.

- **API (Render / Docker):** `backend/Dockerfile` (Python 3.11-slim, includes
  Tesseract) builds the image; `render.yaml` defines the web service, attached
  Postgres 16, two persistent disks (`/app/chroma_db`, `/app/storage`), and runs
  `alembic upgrade head` as a pre-deploy step. `CHROMA_TELEMETRY_OPTOUT=true`
  keeps logs clean.
- **SPA (Vercel):** `frontend/vercel.json` (Vite framework, `dist` output, SPA
  rewrite). Set `VITE_API_BASE_URL` to the deployed API and add the Vercel
  origin to the backend's `ALLOWED_ORIGINS`.
- **Local:** `docker compose up --build` runs Postgres + API; the SPA runs via
  `npm run dev`. See `docs/setup.md`.
