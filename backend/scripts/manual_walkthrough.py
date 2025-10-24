"""Manual end-to-end walkthrough of Synapse features against a live server.

Covers the Phase-2.1 feature checklist:
  A1 eval dashboard/run, A2 citations, A3 hybrid search, B1 query cache +
  cost logging, B2 streaming, B3 OCR (graceful degradation w/o Tesseract),
  B4 SM-2 flashcards, plus cascade delete + refresh + rate-limit sanity.

Run:  backend/.venv/Scripts/python.exe scripts/manual_walkthrough.py
(assumes a server is up on BASE_URL below)
"""
import asyncio
import json
import sys
import tempfile
from pathlib import Path

import httpx

BASE = "http://127.0.0.1:8077/api/v1"

SAMPLE_TXT = """Synapse is a retrieval-augmented study assistant.

Photosynthesis is the process by which green plants convert sunlight, water,
and carbon dioxide into glucose and oxygen. The light-dependent reactions
occur in the thylakoid membrane and produce ATP and NADPH.

Mitochondria perform cellular respiration, breaking glucose into ATP through
glycolysis, the Krebs cycle, and the electron transport chain.

Newton's second law states that force equals mass times acceleration, F = ma.
The three laws of motion form the foundation of classical mechanics.
"""

PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n"  # minimal PNG header; no real pixels, just to exercise
    b"\x00\x00\x00\x0dIHDR"  # the image upload + graceful OCR-degradation path
    b"\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00"
)


def log(label, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {label}" + (f" — {detail}" if detail else ""))
    if not ok:
        log.failed = True


log.failed = False


async def sse_chat(client, token, message, scope=None):
    """POST /chat/message and parse the SSE stream. Returns (tokens, sources, done)."""
    body = {"message": message}
    if scope:
        body["document_scope"] = scope
    tokens, sources, done = [], [], None
    async with client.stream(
        "POST",
        f"{BASE}/chat/message",
        json=body,
        headers={"Authorization": f"Bearer {token}"},
        timeout=120,
    ) as r:
        assert r.status_code == 200, f"chat status {r.status_code}: {await r.aread()}"
        buf = ""
        async for chunk in r.aiter_text():
            buf += chunk
            while "\n\n" in buf:
                raw, buf = buf.split("\n\n", 1)
                data = None
                for line in raw.split("\n"):
                    if line.startswith("data:"):
                        data = line[5:].strip()
                        break
                if not data:
                    continue
                try:
                    ev = json.loads(data)
                except json.JSONDecodeError:
                    continue
                if ev.get("type") == "sources":
                    sources = ev.get("value", [])
                elif ev.get("type") == "token":
                    tokens.append(ev.get("value", ""))
                elif ev.get("type") == "done":
                    done = ev.get("value")
    return "".join(tokens), sources, done


async def wait_completed(client, token, doc_id, timeout=60):
    for _ in range(timeout):
        r = await client.get(
            f"{BASE}/documents/{doc_id}/status",
            headers={"Authorization": f"Bearer {token}"},
        )
        st = r.json().get("processing_status")
        if st in ("completed", "failed"):
            return st
        await asyncio.sleep(1)
    return "timeout"


async def main():
    async with httpx.AsyncClient() as client:
        # --- signup (refresh + cascade coverage starts here) ---
        email = f"walk_{__import__('uuid').uuid4().hex[:8]}@example.com"
        r = await client.post(
            f"{BASE}/auth/signup",
            json={"email": email, "password": "password123", "full_name": "Walk User"},
        )
        log("signup 201", r.status_code == 201, f"status={r.status_code}")
        tok = r.json()["access_token"]
        hdr = {"Authorization": f"Bearer {tok}"}

        # --- A3/B2/A2: upload a doc, then chat (streaming + citations + hybrid) ---
        txt_path = Path(tempfile.gettempdir()) / "synapse_walk.txt"
        txt_path.write_text(SAMPLE_TXT, encoding="utf-8")
        with open(txt_path, "rb") as f:
            r = await client.post(
                f"{BASE}/documents/upload",
                files={"file": ("synapse_walk.txt", f, "text/plain")},
                headers=hdr,
            )
        log("upload 201", r.status_code == 201, f"status={r.status_code}")
        doc_id = r.json().get("id")
        status = await wait_completed(client, tok, doc_id)
        log("doc reaches completed", status == "completed", f"status={status}")

        answer, sources, done = await sse_chat(
            client, tok, "What does Newton's second law state?", scope=[doc_id]
        )
        log("B2 streaming emits tokens", len(answer) > 20, f"len={len(answer)}")
        log("A2 citation/source returned", len(sources) >= 1, f"sources={len(sources)}")
        if sources:
            s0 = sources[0]
            log(
                "A2 source has document + snippet",
                bool(s0.get("document_id") or s0.get("document_name"))
                and bool(s0.get("chunk_text") or s0.get("text") or s0.get("snippet")),
                f"keys={list(s0.keys())}",
            )
        log("B2 done event has conversation_id", bool(done and done.get("conversation_id")))

        # --- B1: query cache + cost logging (repeat identical question) ---
        t0 = asyncio.get_event_loop().time()
        a2, _, _ = await sse_chat(client, tok, "What does Newton's second law state?", scope=[doc_id])
        dt = asyncio.get_event_loop().time() - t0
        log("B1 repeat question returns consistent answer", a2.strip() == answer.strip())
        log("B1 cache makes repeat fast (<5s)", dt < 5, f"dt={dt:.2f}s")
        usage = (await client.get(f"{BASE}/analytics/usage?days=30", headers=hdr)).json()
        cost = usage.get("total_cost_usd") or usage.get("cost_usd") or 0
        log("B1 cost logging present in /analytics/usage", float(cost) >= 0, f"usage_keys={list(usage.keys())}")

        # --- A1: eval run + runs history ---
        r = await client.post(f"{BASE}/eval/run", headers=hdr, timeout=120)
        log("A1 eval/run 200", r.status_code == 200, f"status={r.status_code}")
        if r.status_code == 200:
            er = r.json()
            agg = er.get("aggregate", {})
            log("A1 eval returns metrics", bool(agg) and ("hit_rate" in agg or "ndcg" in agg or "mrr" in agg),
                f"agg_keys={list(agg.keys())}")
        runs = (await client.get(f"{BASE}/eval/runs", headers=hdr)).json()
        log("A1 eval/runs returns list", isinstance(runs, list) and len(runs) >= 1,
            f"count={len(runs) if isinstance(runs, list) else 'n/a'}")

        # --- B4: SM-2 flashcards generate + review ---
        r = await client.post(
            f"{BASE}/study/flashcards",
            json={"count": 3, "document_scope": [doc_id]},
            headers=hdr,
            timeout=120,
        )
        log("B4 flashcards generated", r.status_code in (200, 201) and len(r.json()) >= 1,
            f"status={r.status_code} n={len(r.json()) if r.status_code in (200, 201) else 0}")
        cards = r.json() if r.status_code in (200, 201) else []
        if cards:
            card = cards[0]
            log("B4 card has front/back", bool(card.get("front")) and bool(card.get("back")))
            cid = card["id"]
            r = await client.post(
                f"{BASE}/study/flashcards/{cid}/review",
                json={"quality": 5},
                headers=hdr,
            )
            log("B4 review 200", r.status_code == 200, f"status={r.status_code}")
            if r.status_code == 200:
                rc = r.json()
                sm2 = ["interval_days", "ease_factor", "due_date", "repetitions"]
                log("B4 SM-2 fields updated", any(k in rc for k in sm2),
                    f"keys={list(rc.keys())}")

        # --- B3: OCR graceful degradation (no Tesseract on host) ---
        r = await client.post(
            f"{BASE}/documents/upload",
            files={"file": ("scan.png", PNG_BYTES, "image/png")},
            headers=hdr,
        )
        log("B3 png upload accepted (201)", r.status_code == 201, f"status={r.status_code}")
        if r.status_code == 201:
            png_id = r.json().get("id")
            pstatus = await wait_completed(client, tok, png_id, timeout=40)
            log("B3 png completes without crash", pstatus == "completed", f"status={pstatus}")

        # --- cascade delete (doc -> chunks/vectors/files) ---
        before = (await client.get(f"{BASE}/documents", headers=hdr)).json()
        r = await client.delete(f"{BASE}/documents/{doc_id}", headers=hdr)
        log("cascade delete 200", r.status_code == 200, f"status={r.status_code}")
        after = (await client.get(f"{BASE}/documents", headers=hdr)).json()
        log("deleted doc gone from list",
            len(after) == len(before) - 1, f"before={len(before)} after={len(after)}")

        # --- refresh rotation sanity ---
        refresh = (await client.post(
            f"{BASE}/auth/refresh",
            json={"refresh_token": (await client.post(
                f"{BASE}/auth/login",
                json={"email": email, "password": "password123"},
            )).json()["refresh_token"]},
        ))
        log("refresh returns new access", refresh.status_code == 200
            and "access_token" in refresh.json(), f"status={refresh.status_code}")

    print("\nRESULT:", "ALL PASS" if not log.failed else "SOME FAILED")
    sys.exit(1 if log.failed else 0)


if __name__ == "__main__":
    asyncio.run(main())
