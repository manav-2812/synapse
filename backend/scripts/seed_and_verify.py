"""Seed 5 users with real data and verify every new feature end-to-end.

Hits the running dev backend at http://127.0.0.1:8000. Creates 5 users,
uploads a document per user (local embeddings), sends a real chat message
(Groq), generates a note / quiz / flashcard set per user, then exercises the
new CRUD endpoints: avatar upload, password + email change, conversation
rename, message rename + delete, and rename/edit for notes, quizzes,
flashcards, and documents.

Run:  .venv/Scripts/python scripts/seed_and_verify.py
"""
from __future__ import annotations

import asyncio
import io
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx
from PIL import Image
from sqlalchemy import delete

# Allow cleaning stale seed/probe users from prior runs.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.core.database import AsyncSessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402

BASE = "http://127.0.0.1:8000/api/v1"
SAMPLE_TEXTS = [
    "Photosynthesis is the process by which green plants convert sunlight, water, and "
    "carbon dioxide into glucose and oxygen. The light-dependent reactions occur in the "
    "thylakoid membranes and produce ATP and NADPH. The Calvin cycle uses those to fix CO2.",
    "The French Revolution (1789) overthrew the monarchy. Key phases included the "
    "National Assembly, the Reign of Terror under Robespierre, and the rise of Napoleon. "
    "It promoted liberty, equality, and fraternity across Europe.",
    "Newton's second law states that force equals mass times acceleration (F = ma). "
    "Gravity is a universal force; the inverse-square law describes planetary orbits. "
    "Calculus was independently developed by Newton and Leibniz.",
    "Supply and demand determine market prices. When demand exceeds supply, prices rise; "
    "when supply exceeds demand, prices fall. Elasticity measures how quantity responds "
    "to price changes. equilibrium is where supply meets demand.",
    "DNA is a double helix of nucleotides (A, T, C, G). Replication is semi-conservative: "
    "each new strand pairs with a template strand. Transcription makes mRNA; translation "
    "builds proteins at ribosomes using codons.",
]


def ts() -> str:
    return datetime.now(timezone.utc).strftime("%H:%M:%S")


def log(msg: str) -> None:
    print(f"[{ts()}] {msg}", flush=True)


def make_png(seed: int) -> bytes:
    img = Image.new("RGB", (64, 64), (seed * 40 % 255, (seed * 90) % 255, (seed * 17) % 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


class Result:
    def __init__(self) -> None:
        self.checks: list[tuple[str, bool, str]] = []

    def add(self, name: str, ok: bool, detail: str = "") -> bool:
        self.checks.append((name, ok, detail))
        mark = "PASS" if ok else "FAIL"
        log(f"  [{mark}] {name}" + (f" — {detail}" if detail else ""))
        return ok

    def summary(self) -> None:
        passed = sum(1 for _, ok, _ in self.checks if ok)
        total = len(self.checks)
        print("\n" + "=" * 64)
        print(f"VERIFICATION SUMMARY: {passed}/{total} checks passed")
        print("=" * 64)
        for name, ok, detail in self.checks:
            if not ok:
                print(f"  FAIL: {name} — {detail}")
        print("=" * 64)


class UserSession:
    def __init__(self, client: httpx.Client, email: str, password: str, name: str) -> None:
        self.client = client
        self.email = email
        self.password = password
        self.name = name
        self.doc_id: str | None = None
        self.conv_id: str | None = None
        self.note_id: str | None = None
        self.quiz_id: str | None = None
        self.flashcard_id: str | None = None


async def cleanup_prior_runs() -> int:
    """Delete seed*/probe users left by earlier verification runs."""
    async with AsyncSessionLocal() as s:
        patterns = [
            User.email.like("seed%@example.com"),
            User.email.like("seed%.renamed@example.com"),
            User.email.like("probe@%"),
        ]
        stmt = delete(User).where(patterns[0] | patterns[1] | patterns[2])
        res = await s.execute(stmt)
        await s.commit()
        return res.rowcount or 0


def main() -> None:
    res = Result()
    users: list[UserSession] = []
    creds: list[tuple[str, str]] = []

    # NOTE: intentionally NOT cleaning prior seed data — the seeded test users
    # and their documents are kept so the UI can be explored with real data.

    with httpx.Client(base_url=BASE, timeout=120.0) as client:
        # --- Sign up 5 users ---
        log("Creating 5 users…")
        for i in range(5):
            email = f"seed{i+1}@example.com"
            password = "Password123"
            name = f"Seed User {i+1}"
            r = client.post(
                "/auth/signup",
                json={"email": email, "password": password, "full_name": name},
            )
            ok = res.add(f"signup user {i+1} ({email})", r.status_code == 201, f"HTTP {r.status_code}")
            if not ok:
                continue
            u = UserSession(client, email, password, name)
            # capture the access token from the signup response
            token = r.json()["access_token"]
            client.headers["Authorization"] = f"Bearer {token}"
            users.append(u)
            creds.append((email, password))

        if not users:
            res.summary()
            sys.exit(1)

        # --- Per-user data + feature checks ---
        for i, u in enumerate(users):
            # re-fetch a valid token for this user
            lr = client.post("/auth/login", json={"email": u.email, "password": u.password})
            token = lr.json()["access_token"]
            client.headers["Authorization"] = f"Bearer {token}"
            log(f"User {i+1}: uploading document + generating study data…")

            # Upload a document (text -> local embeddings)
            txt = SAMPLE_TEXTS[i % len(SAMPLE_TEXTS)].encode()
            up = client.post(
                "/documents/upload",
                files={"file": (f"notes_{i+1}.txt", txt, "text/plain")},
            )
            doc_ok = up.status_code == 201
            res.add(f"user {i+1}: document upload", doc_ok, f"HTTP {up.status_code}")
            if doc_ok:
                u.doc_id = up.json()["id"]

            # Poll processing status until completed
            if u.doc_id:
                done = False
                for _ in range(60):
                    st = client.get(f"/documents/{u.doc_id}/status").json()
                    if st["processing_status"] == "completed":
                        done = True
                        break
                    if st["processing_status"] == "failed":
                        break
                    time.sleep(1)
                res.add(f"user {i+1}: document processed", done,
                        f"status={st['processing_status']}")

            # Send a real chat message (Groq) scoped to the doc
            conv_id = None
            if u.doc_id:
                with client.stream(
                    "POST", "/chat/message",
                    json={"message": "Summarize the key points in one sentence.",
                          "document_scope": [u.doc_id]},
                ) as s:
                    for line in s.iter_lines():
                        if line.startswith("data:"):
                            payload = line[5:].strip()
                            if '"type": "done"' in payload or '"type":"done"' in payload:
                                try:
                                    import json
                                    data = json.loads(payload)
                                    conv_id = data.get("value", {}).get("conversation_id")
                                except Exception:
                                    pass
                u.conv_id = conv_id
                res.add(f"user {i+1}: chat message + conversation", bool(conv_id),
                        f"conv={conv_id}")

            # Generate a note
            nr = client.post("/study/notes", json={"note_type": "short_notes",
                                                    "document_scope": [u.doc_id] if u.doc_id else None})
            if nr.status_code == 201:
                u.note_id = nr.json()["id"]
            res.add(f"user {i+1}: generate note", nr.status_code == 201, f"HTTP {nr.status_code}")

            # Generate a quiz
            qr = client.post("/study/quiz", json={"difficulty": "easy", "question_count": 3,
                                                  "document_scope": [u.doc_id] if u.doc_id else None})
            if qr.status_code == 201:
                u.quiz_id = qr.json()["id"]
            res.add(f"user {i+1}: generate quiz", qr.status_code == 201, f"HTTP {qr.status_code}")

            # Generate flashcards
            fr = client.post("/study/flashcards", json={"count": 4,
                                                        "document_scope": [u.doc_id] if u.doc_id else None})
            if fr.status_code == 201 and fr.json():
                u.flashcard_id = fr.json()[0]["id"]
            res.add(f"user {i+1}: generate flashcards", fr.status_code == 201 and bool(fr.json()),
                    f"HTTP {fr.status_code}, n={len(fr.json()) if fr.status_code == 201 else 0}")

            # --- Avatar upload + serve check ---
            png = make_png(i + 1)
            av = client.post("/users/me/avatar", files={"file": ("avatar.png", png, "image/png")})
            av_ok = av.status_code == 200 and bool(av.json().get("profile_image_url"))
            avatar_url = av.json().get("profile_image_url") if av.status_code == 200 else None
            res.add(f"user {i+1}: avatar upload", av_ok, f"url={avatar_url}")
            if avatar_url:
                g = client.get(avatar_url)
                res.add(f"user {i+1}: avatar served", g.status_code == 200 and "image" in g.headers.get("content-type", ""),
                        f"HTTP {g.status_code}")

            # --- Password change + re-login ---
            new_pw = "NewPass456"
            pr = client.patch("/users/me", json={"current_password": u.password, "new_password": new_pw})
            pw_ok = pr.status_code == 200
            res.add(f"user {i+1}: change password", pw_ok, f"HTTP {pr.status_code}")
            if pw_ok:
                u.password = new_pw
                login_new = client.post("/auth/login", json={"email": u.email, "password": new_pw})
                login_old = client.post("/auth/login", json={"email": u.email, "password": "Password123"})
                res.add(f"user {i+1}: login with new password", login_new.status_code == 200)
                res.add(f"user {i+1}: old password rejected", login_old.status_code in (401, 400))
                # refresh token after login for subsequent calls
                token = login_new.json()["access_token"]
                client.headers["Authorization"] = f"Bearer {token}"

            # --- Email change (user 1 only, to demonstrate) ---
            if i == 0:
                new_email = "seed1.renamed@example.com"
                er = client.patch("/users/me", json={"email": new_email, "current_password": u.password})
                em_ok = er.status_code == 200
                res.add("user 1: change email", em_ok, f"HTTP {er.status_code}")
                if em_ok:
                    u.email = new_email
                    creds[0] = (new_email, u.password)
                    login_new = client.post("/auth/login", json={"email": new_email, "password": u.password})
                    res.add("user 1: login with new email", login_new.status_code == 200)
                    token = login_new.json()["access_token"]
                    client.headers["Authorization"] = f"Bearer {token}"

            # --- Conversation rename ---
            if u.conv_id:
                rr = client.patch(f"/chat/conversations/{u.conv_id}", json={"title": f"Renamed Chat {i+1}"})
                res.add(f"user {i+1}: rename conversation", rr.status_code == 200 and rr.json().get("title") == f"Renamed Chat {i+1}",
                        f"HTTP {rr.status_code}")

            # --- Message rename + delete ---
            if u.conv_id:
                det = client.get(f"/chat/conversations/{u.conv_id}").json()
                msgs = det.get("messages", [])
                user_msg = next((m for m in msgs if m["role"] == "user"), None)
                if user_msg:
                    mid = user_msg["id"]
                    ur = client.patch(f"/chat/conversations/{u.conv_id}/messages/{mid}",
                                       json={"content": "EDITED: " + user_msg["content"][:40]})
                    res.add(f"user {i+1}: rename message", ur.status_code == 200 and "EDITED" in ur.json().get("content", ""),
                            f"HTTP {ur.status_code}")
                    dr = client.delete(f"/chat/conversations/{u.conv_id}/messages/{mid}")
                    after = client.get(f"/chat/conversations/{u.conv_id}").json()
                    still_there = any(m["id"] == mid for m in after.get("messages", []))
                    res.add(f"user {i+1}: delete message", dr.status_code == 200 and not still_there,
                            f"HTTP {dr.status_code}, present_after={still_there}")

            # --- Note rename ---
            if u.note_id:
                nr2 = client.patch(f"/study/notes/{u.note_id}", json={"title": "Renamed Note", "content": "Updated content."})
                res.add(f"user {i+1}: rename/edit note", nr2.status_code == 200 and nr2.json().get("title") == "Renamed Note",
                        f"HTTP {nr2.status_code}")

            # --- Quiz rename ---
            if u.quiz_id:
                qr2 = client.patch(f"/study/quiz/{u.quiz_id}", json={"title": "Renamed Quiz"})
                res.add(f"user {i+1}: rename quiz", qr2.status_code == 200 and qr2.json().get("title") == "Renamed Quiz",
                        f"HTTP {qr2.status_code}")

            # --- Flashcard edit ---
            if u.flashcard_id:
                fr2 = client.patch(f"/study/flashcards/{u.flashcard_id}", json={"front": "EDITED front", "back": "EDITED back"})
                ok_f = fr2.status_code == 200 and fr2.json().get("front") == "EDITED front"
                res.add(f"user {i+1}: edit flashcard", ok_f, f"HTTP {fr2.status_code}")

            # --- Document rename ---
            if u.doc_id:
                dr2 = client.patch(f"/documents/{u.doc_id}", json={"original_filename": "Renamed notes.txt"})
                res.add(f"user {i+1}: rename document", dr2.status_code == 200 and dr2.json().get("original_filename") == "Renamed notes.txt",
                        f"HTTP {dr2.status_code}")

        # --- Aggregate counts (>= 5 of each entity) ---
        log("Aggregating totals across all users…")
        total_users = len(users)
        # Counts per the LAST authenticated user only reflect that user; gather explicitly:
        agg = {"documents": 0, "conversations": 0, "notes": 0, "quizzes": 0, "flashcards": 0}
        for u in users:
            lr = client.post("/auth/login", json={"email": u.email, "password": u.password})
            token = lr.json()["access_token"]
            client.headers["Authorization"] = f"Bearer {token}"
            agg["documents"] += len(client.get("/documents").json())
            agg["conversations"] += len(client.get("/chat/conversations").json())
            agg["notes"] += len(client.get("/study/notes").json())
            agg["quizzes"] += len(client.get("/study/quiz").json())
            agg["flashcards"] += len(client.get("/study/flashcards").json())
        res.add(">=5 users", total_users >= 5, f"n={total_users}")
        res.add(">=5 documents", agg["documents"] >= 5, f"n={agg['documents']}")
        res.add(">=5 conversations", agg["conversations"] >= 5, f"n={agg['conversations']}")
        res.add(">=5 notes", agg["notes"] >= 5, f"n={agg['notes']}")
        res.add(">=5 quizzes", agg["quizzes"] >= 5, f"n={agg['quizzes']}")
        res.add(">=5 flashcards", agg["flashcards"] >= 5, f"n={agg['flashcards']}")

    print("\nSeed credentials (you can log in to inspect the UI):")
    for email, password in creds:
        print(f"  - {email} / {password}")
    res.summary()


if __name__ == "__main__":
    main()
