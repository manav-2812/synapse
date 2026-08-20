# Synapse — Development & Execution Runbook

Quick copy-paste blocks for running the backend and frontend services.

---

## ⚡ Quick Copy & Paste Commands

### 🔹 Backend (Terminal 1)
```powershell
cd backend
.\.venv\Scripts\Activate.ps1
alembic upgrade head
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 🔹 Frontend (Terminal 2)
```powershell
cd frontend
npm install
npm run dev
```

---

## 🚀 Unified Runner (All-in-One)

Runs both frontend and backend concurrently in a single terminal with colored logs:

```powershell
python run_dev.py
```

---

## 🛠️ Testing & Quality Commands

### Backend Tests
```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pytest
```

### Frontend Tests
```powershell
cd frontend
npm test
npm run test:e2e
```

---

## 🌐 Local Service URLs

| Service | URL | Description |
| :--- | :--- | :--- |
| **Frontend UI** | [http://localhost:5173](http://localhost:5173) | Web Application |
| **Backend API** | [http://127.0.0.1:8000/api/v1](http://127.0.0.1:8000/api/v1) | FastAPI Endpoints |
| **API Docs (Swagger)** | [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) | Interactive API Documentation |
| **Health Check** | [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health) | System Health Status |
