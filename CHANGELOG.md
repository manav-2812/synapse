# Changelog

All notable changes to Synapse are documented here. The project follows a
phased build: an initial full-stack build, a React rebuild, a features/UI
polish pass, and a final audit/hardening/deploy-readiness pass.

## [Unreleased] — Final audit, hardening & deploy-readiness

- **Backend regression audit**: full `pytest` suite green (23 passed, 0
  failures, 0 warnings) on Python 3.11.9 against real Postgres + Chroma +
  `all-MiniLM-L6-v2` embeddings.
- **Live feature verification**: manual end-to-end walkthrough confirms the
  eval dashboard (A1), chat citations (A2), hybrid retrieval (A3), query cache
  + cost logging (B1), SSE streaming (B2), OCR graceful degradation (B3), and
  SM-2 flashcards (B4) all work against a running instance.
- **Migrations**: all 10 Alembic migrations apply cleanly in order from an
  empty database.
- **Dead-code cleanup**: removed unused `import uuid` in four repository
  modules and an unused `ChangeEvent` import in `Chat.tsx`; `oxlint` clean.
- **Deploy-config fix**: moved the backend `Dockerfile` into `backend/`
  (matches `docker-compose.yml`'s build context) and added `backend/.dockerignore`.
- **Clean logs**: Chroma's non-fatal PostHog telemetry error is now suppressed
  from code (`CHROMA_TELEMETRY_OPTOUT=true` baked into `chroma_client.py`,
  the Dockerfile, and `render.yaml`).
- **Frontend tests**: added Vitest + React Testing Library unit/component
  tests and Playwright e2e tests (signup→login→upload→chat citation→flashcard→
  quiz→analytics) against the real stack; `npm test` + `npm run test:e2e`.
- **Docs**: rewrote `README.md` and `docs/architecture.md`, re-verified
  `docs/setup.md` (Python 3.11 enforced), added `docs/api.md`, finalized
  `docs/audit-findings.md` and `docs/lighthouse-report.md` (real Lighthouse
  numbers), and this `CHANGELOG.md`.
- **Lighthouse**: production build audited on real Chrome; scores recorded in
  `docs/lighthouse-report.md`.

## [Features/UI] — RAG differentiators & UI polish

- Eval dashboard (`/eval/run`, `/eval/runs`) measuring precision@k, recall@k,
  MRR, NDCG with a hybrid-weight sweep.
- Chat citation chips sourced from grounded retrieval chunks.
- Hybrid retrieval (semantic vector + BM25 keyword blend).
- In-memory LRU response cache + LLM token/cost logging (`/analytics/usage`).
- SSE streaming chat with Groq→Gemini fallback.
- OCR for PNG/JPG and scanned PDFs (Tesseract, with graceful degradation and
  an opt-in vision-LLM fallback).
- SM-2 spaced-repetition flashcards (`/study/flashcards`, `/due`, `/review`).
- Command palette (Cmd/Ctrl+K), per-file byte upload progress + cancel, dark
  mode, global error boundary, analytics dashboard.

## [React rebuild] — React 19 + TypeScript + Vite SPA

- Rebuilt the vanilla-JS frontend as a React + TypeScript + Vite SPA with
  route-level code-splitting, a token-based design system (light/dark), and
  accessible landmarks/skip-link/focus states.
- New typed API client with correct 401→refresh→retry and `error.message`
  parsing.
- Pages: Login, Signup, Dashboard, Documents, Chat, Quiz, Flashcards, Notes,
  Analytics, Profile.

## [Initial] — Core backend + vanilla frontend

- FastAPI async backend: auth (JWT access + rotating refresh), PostgreSQL
  models with ownership-enforced repositories, Chroma vector store, document
  ingestion pipeline (PDF/DOCX/TXT), hand-rolled RAG chat, study tools
  (notes/quiz/flashcards), analytics, and Alembic migrations.
- Vanilla-JS SPA (superseded by the React rebuild).
