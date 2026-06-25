# Contributing to Synapse

Thanks for your interest in improving Synapse! This guide covers local
setup, conventions, and the PR process.

## Getting started

See [`docs/setup.md`](docs/setup.md) for the full runbook.

> **Note:** Backend requires Python **3.11** explicitly (`python3.11 -m venv .venv`). Python 3.13 breaks dependencies like `torch`, `chromadb`, and `sentence-transformers`.

```bash
# Backend (API)
cd backend && python3.11 -m venv .venv

# macOS/Linux
source .venv/bin/activate

# Windows
.venv\Scripts\activate

pip install -r requirements.txt
cp .env.example .env         # fill keys
alembic upgrade head
uvicorn app.main:app --reload
```

## Architecture rules (please respect these)

The backend is strictly layered — see [`docs/architecture.md`](docs/architecture.md):

- **Routes never touch the DB directly.** Routes → services → repositories → models.
- **Ownership is enforced at the repository layer** (`user_id = current_user.id`).
- **Every request/response is a Pydantic schema.** No ad-hoc dicts.
- **Config comes only from `core/config.py`**. Never hardcode secrets or paths.
- **Keep files under ~400 lines.**

On the frontend:

- **No `any` in response types** — mirror backend schemas in `src/types/api.ts`.
- **All API calls go through `src/api/*`** (which use the shared `client.ts` 
  that reads `data.error.message`).
- **Reuse UI primitives** in `src/components/ui/` and layout in
  `src/components/layout/`.

## Before you open a PR

Backend:
```bash
cd backend && pytest        # all tests must pass
```

Frontend:
```bash
cd frontend
npm run build               # tsc + vite — must pass with zero type errors
npm run lint                # oxlint — no new errors
```

## Commit & PR conventions

- Write clear, imperative commit messages ("Add upload progress bar").
- Keep PRs focused; one logical change per PR where possible.
- Fill out the PR template (`.github/PULL_REQUEST_TEMPLATE.md`).
- Reference any related issue (`Fixes #123`).
- Do **not** commit secrets, `.env` files, `chroma_db/` or `storage/`.

## Reporting bugs / requesting features

Use the issue templates under `.github/ISSUE_TEMPLATE/`. Include repro
steps, expected vs. actual behavior, and environment details for bugs.