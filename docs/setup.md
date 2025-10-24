# Setup & Deployment Runbook

> Tested on a clean clone (Windows 11 / macOS / Linux). Steps below
> reproduce a from-scratch local run.

## Prerequisites
- **Python 3.11 — REQUIRED, and 3.11 ONLY.** The dependency set (incl.
  `torch`/sentence-transformers and `chromadb`) fails to build/install cleanly
  on **3.13**; do not use a bare `python -m venv .venv`, which may resolve to
  3.13. Create the venv explicitly with `python3.11 -m venv .venv` (or
  `py -3.11 -m venv .venv` on Windows). `backend/.python-version` is set to
  `3.11` so pyenv/IDE tooling picks the right version automatically. Confirm
  with `python3.11 --version` (or `py -3.11 --version`) **before** creating it.
- **Node.js 20+** (for the frontend)
- **PostgreSQL 14+** with an empty DB (e.g. `synapse`)
- **Groq** + **Gemini** API keys (Gemini is the fallback)
- ~1.2 GB free disk for the `all-MiniLM-L6-v2` model + torch
  (downloaded on first run)

---

## OCR (scanned images & PDFs)

OCR extracts text from uploaded **PNG/JPG** images and **scanned/image-only
PDFs** (PDFs whose pages have no embedded text layer). It is automatic — no
upload-time option is needed.

**Engine 1 — Tesseract (default, free, local).** OCR needs the Tesseract binary
on the host; `pytesseract` is only the Python wrapper.

- Linux: `sudo apt-get install -y tesseract-ocr` (extra langs: `tesseract-ocr-de`)
- macOS: `brew install tesseract`
- Windows: install the [Tesseract installer](https://github.com/UB-Mannheim/tesseract/wiki)
  and add it to `PATH`.
- Docker / Render: already included in `Dockerfile` (`tesseract-ocr`).

If Tesseract is missing, the upload **still succeeds** — a clear note chunk is
stored instead of crashing the pipeline.

**Engine 2 — Vision-LLM fallback (opt-in, has API cost).** Set in `.env`:

```bash
OCR_VISION_FALLBACK_ENABLED=true   # uses Gemini (preferred) or Groq if no Gemini key
OCR_LANGUAGE=eng                   # Tesseract language pack(s)
OCR_DPI=300                        # render DPI for scanned PDF pages
```

Enable this when Tesseract is not installed, or to improve accuracy on
handwritten / low-quality scans. Requires `GEMINI_API_KEY` or `GROQ_API_KEY`.

---

## Local backend (API only — Windows / macOS / Linux)

```bash
cd backend
# Use Python 3.11 EXPLICITLY — never bare `python -m venv .venv` (may be 3.13).
python3.11 -m venv .venv        # Windows (py launcher): py -3.11 -m venv .venv
.venv\Scripts\activate            # Windows (Git Bash: source .venv/Scripts/activate)
# source .venv/bin/activate     # macOS / Linux

pip install -r requirements.txt
cp .env.example .env           # then fill GROQ_API_KEY / GEMINI_API_KEY / JWT_SECRET_KEY
alembic upgrade head            # create tables
```

Run:
```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
- API → http://localhost:8000/api/v1
- Docs → http://localhost:8000/docs
- Health → http://localhost:8000/health

> The backend is **API-only**. It does **not** serve the frontend
> (the React SPA is deployed separately).

## Local frontend (React SPA)

```bash
cd frontend
npm install
cp .env.example .env        # optional; sets VITE_API_BASE_URL
npm run dev                  # → http://localhost:5173
```

The client defaults to `http://localhost:8000/api/v1`. To point at a
different backend, set `VITE_API_BASE_URL` in `frontend/.env`
and rebuild.

Other scripts:
```bash
npm run build      # tsc -b && vite build  → dist/
npm run preview    # serve the production build
npm run lint       # oxlint
```

## Tests

```bash
# Backend (Python 3.11 venv)
cd backend
pytest            # 23 tests: auth, pipeline, retrieval, retrieval-metrics, quiz scoring, contract
pytest -q         # quiet

# Frontend (Vitest unit/component + Playwright e2e)
cd frontend
npm test          # Vitest unit/component tests (api client, hooks, ui primitives)
npm run test:e2e  # Playwright end-to-end against the real backend+frontend stack
```

The backend e2e script (`tests/e2e_phase2.py`) and feature walkthrough
(`scripts/manual_walkthrough.py`) are standalone manual runners that hit a live
server and are intentionally **not** collected by pytest.

---

## Local full-stack with Docker

```bash
docker compose up --build
# backend (API) → http://localhost:8000
# postgres         → localhost:5432
```
Data (chroma + uploads + postgres) persists in mounted volumes under
`backend/chroma_db`, `backend/storage`, and the `pgdata` volume.

---

## Frontend on Vercel (static SPA)

1. Import the repo into Vercel and **set the project root to `frontend/`**
   (so Vercel builds the SPA and ignores the backend).
2. Framework preset: **Vite**. Build command `npm run build`, output `dist/`.
3. Set the **build-time** env var `VITE_API_BASE_URL` to your
   deployed backend's `/api/v1` URL (e.g.
   `https://synapse.onrender.com/api/v1`). It is inlined at build.
4. Add your Vercel URL to the backend's `ALLOWED_ORIGINS`.

---

## Backend on Render (or Railway)

1. Create a **Web Service** from the repo, **Root Directory = `backend`**.
2. `render.yaml` is committed and defines:
   - `buildCommand: pip install -r requirements.txt`
   - `startCommand: uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - `preDeployCommand: alembic upgrade head`
   - `healthCheckPath: /health`
   - an attached **Postgres 16** database
   - two **disks** (`/app/chroma_db`, `/app/storage`) so vectors and
     uploads survive deploys (disks need a paid plan)
3. Set **secret** env vars in the dashboard (never commit them):
   - `JWT_SECRET_KEY` (≥32 random chars)
   - `GROQ_API_KEY`, `GEMINI_API_KEY`
   - `ALLOWED_ORIGINS` = your Vercel URL
4. First deploy runs migrations automatically, then serves on `$PORT`.

---

## Environment reference (`.env`)

| Var | Example | Notes |
|-----|---------|-------|
| `DATABASE_URL` | `postgresql+asyncpg://user:pass@host:5432/synapse` | async driver |
| `CHROMA_PERSIST_PATH` | `./chroma_db` | local Chroma folder |
| `STORAGE_PATH` | `./storage` | uploaded files |
| `JWT_SECRET_KEY` | 64-hex | HS256 signing key |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `20` | access token TTL |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | rotating refresh TTL |
| `GROQ_API_KEY` | `gsk_...` | primary LLM |
| `GEMINI_API_KEY` | `...` | fallback LLM |
| `ALLOWED_ORIGINS` | `http://localhost:5173,https://app.vercel.app` | comma-separated |
| `APP_ENV` | `development` \| `production` | `production` disables dev-only behavior |
| `MAX_UPLOAD_SIZE_MB` | `50` | guardrail |
| `ALLOWED_EXTENSIONS` | `pdf,docx,txt,png,jpg,jpeg` | guardrail |

Frontend build var:

| Var | Example | Notes |
|-----|---------|-------|
| `VITE_API_BASE_URL` | `http://localhost:8000/api/v1` | inlined at build time |

---

## Troubleshooting
- **`module 'bcrypt' has no attribute '__about__'`** — old `passlib` +
  new `bcrypt` mismatch. Fixed by pinning `bcrypt==4.2.1` in
  `requirements.txt`; if you hit it, `pip install -r requirements.txt` again.
- **Chroma telemetry warnings** — disabled (`anonymized_telemetry=False`).
- **First-run slowness** — `torch` + `all-MiniLM-L6-v2` download once.
- **Port in use** — ensure no stale `uvicorn` process holds `8000`.
- **CORS errors from the SPA** — the frontend's `VITE_API_BASE_URL` must
  match an origin listed in the backend's `ALLOWED_ORIGINS`.
