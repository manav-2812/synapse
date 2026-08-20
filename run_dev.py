import os
import sys
import subprocess
import threading
import signal
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"

# ANSI Colors
CYAN = "\033[96m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BOLD = "\033[1m"
RESET = "\033[0m"

# Enable VT100 colors on Windows if possible
if sys.platform == "win32":
    os.system("color")

def find_backend_python() -> str:
    """Locate the Python interpreter in backend/.venv or fallback to current sys.executable."""
    if sys.platform == "win32":
        venv_python = BACKEND_DIR / ".venv" / "Scripts" / "python.exe"
    else:
        venv_python = BACKEND_DIR / ".venv" / "bin" / "python"
    
    if venv_python.exists():
        return str(venv_python)
    return sys.executable

def stream_output(pipe, prefix: str, color: str):
    """Stream stdout/stderr line by line with a colored prefix."""
    try:
        for line in iter(pipe.readline, ''):
            if not line:
                break
            print(f"{color}{prefix}{RESET} {line.rstrip()}", flush=True)
    except Exception:
        pass
    finally:
        pipe.close()

def main():
    python_bin = find_backend_python()
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"

    print(f"\n{BOLD}{CYAN}=============================================={RESET}")
    print(f"{BOLD}{CYAN}      Starting Synapse Development Stack      {RESET}")
    print(f"{BOLD}{CYAN}=============================================={RESET}\n")

    print(f"{YELLOW}• Backend directory:{RESET}  {BACKEND_DIR}")
    print(f"{YELLOW}• Frontend directory:{RESET} {FRONTEND_DIR}")
    print(f"{YELLOW}• Python binary:{RESET}      {python_bin}")
    print(f"\n{GREEN}• Frontend UI:{RESET}        http://localhost:5173")
    print(f"{GREEN}• Backend API:{RESET}        http://localhost:8000/api/v1")
    print(f"{GREEN}• Swagger Docs:{RESET}       http://localhost:8000/docs\n")
    print(f"{BOLD}Press Ctrl+C to stop both servers gracefully.{RESET}\n")
    print(f"{CYAN}----------------------------------------------{RESET}\n")

    processes = []

    try:
        # 1. Start Backend with Uvicorn
        backend_cmd = [
            python_bin,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            "8000",
            "--reload"
        ]
        
        backend_proc = subprocess.Popen(
            backend_cmd,
            cwd=str(BACKEND_DIR),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            encoding="utf-8",
            errors="replace"
        )
        processes.append(backend_proc)

        t_backend = threading.Thread(
            target=stream_output,
            args=(backend_proc.stdout, "[BACKEND]", CYAN),
            daemon=True
        )
        t_backend.start()

        # 2. Start Frontend with Vite
        frontend_cmd = [npm_cmd, "run", "dev"]
        frontend_proc = subprocess.Popen(
            frontend_cmd,
            cwd=str(FRONTEND_DIR),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            encoding="utf-8",
            errors="replace"
        )
        processes.append(frontend_proc)

        t_frontend = threading.Thread(
            target=stream_output,
            args=(frontend_proc.stdout, "[FRONTEND]", GREEN),
            daemon=True
        )
        t_frontend.start()

        # Wait for processes
        for p in processes:
            p.wait()

    except KeyboardInterrupt:
        print(f"\n\n{YELLOW}Shutting down Synapse servers...{RESET}")
    finally:
        for p in processes:
            if p.poll() is None:
                if sys.platform == "win32":
                    subprocess.call(["taskkill", "/F", "/T", "/PID", str(p.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                else:
                    p.terminate()
        print(f"{GREEN}All servers stopped successfully.{RESET}\n")

if __name__ == "__main__":
    main()
