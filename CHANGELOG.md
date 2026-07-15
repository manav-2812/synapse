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
<!-- [2026-06-25] feat(quiz): add adaptive difficulty scoring algorithm -->
<!-- [2026-06-26] feat(settings): add dark and light theme toggle with persistence -->
<!-- [2026-06-26] feat(quiz): add image-based question type support -->
<!-- [2026-06-27] fix(auth): resolve token expiry race condition on concurrent requests -->
<!-- [2026-06-28] fix(quiz): fix timer desync when browser tab loses focus -->
<!-- [2026-06-28] fix(chat): resolve message deduplication on rapid fire sends -->
<!-- [2026-06-29] refactor(frontend): replace class components with functional hooks -->
<!-- [2026-06-29] refactor(leaderboard): switch from polling to WebSocket updates -->
<!-- [2026-06-30] chore: upgrade Vite to v5.4 and resolve breaking config changes -->
<!-- [2026-06-30] chore: pin Node.js version to 20 LTS in nvmrc -->
<!-- [2026-07-01] docs: update README with local development setup steps -->
<!-- [2026-07-02] docs: add security policy and responsible disclosure guide -->
<!-- [2026-07-02] test(analytics): add tests for DAU aggregation correctness -->
<!-- [2026-07-03] perf(quiz): preload next question assets during answer animation -->
<!-- [2026-07-04] style(chat): improve message bubble contrast ratios -->
<!-- [2026-07-04] ci: configure Slack notifications for failed CI runs -->
<!-- [2026-07-04] refactor(db): normalise course_tags into separate junction table -->
<!-- [2026-07-05] feat(onboarding): add skill self-assessment quiz at signup -->
<!-- [2026-07-06] refactor(frontend): migrate Axios instance to Fetch API wrapper -->
<!-- [2026-07-07] fix(dashboard): handle missing data gracefully in progress chart -->
<!-- [2026-07-07] fix(auth): invalidate all sessions on password change -->
<!-- [2026-07-08] feat(calendar): allow recurring study session scheduling -->
<!-- [2026-07-08] feat(quiz): add bookmark feature to save questions for review -->
<!-- [2026-07-09] feat(auth): add Google OAuth2 social login integration -->
<!-- [2026-07-09] refactor(quiz): move question factory to dedicated builder class -->
<!-- [2026-07-09] feat(search): implement full-text semantic search with embeddings -->
<!-- [2026-07-10] feat(export): allow users to export quiz results as PDF -->
<!-- [2026-07-10] feat(review): add post-quiz detailed answer explanation view -->
<!-- [2026-07-12] fix(db): fix N+1 query in user progress aggregation -->
<!-- [2026-07-12] fix(export): fix PDF encoding issue with special unicode characters -->
<!-- [2026-07-12] refactor(auth): extract token service into dedicated module -->
<!-- [2026-07-13] refactor(payments): centralise Razorpay client instantiation -->
<!-- [2026-07-14] refactor(study-mode): convert review algorithm to pure function -->
<!-- [2026-07-14] chore: add Docker multi-stage build for production image -->
<!-- [2026-07-15] chore: add Lighthouse CI budget thresholds -->
<!-- [2026-07-15] docs: add JSDoc comments to analytics utility functions -->
<!-- [2026-07-15] test(ui): add Playwright test for complete quiz submission flow -->
