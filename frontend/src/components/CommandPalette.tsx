import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../hooks/useTheme";
import { Icon } from "./ui/Icon";

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: string;
  run: () => void;
}

export function CommandPalette() {
  const { logout, user } = useAuth();
  const { toggle } = useTheme();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const commands = useMemo<Command[]>(() => {
    const go = (to: string, label: string, icon: string): Command => ({
      id: `nav:${to}`,
      label,
      icon,
      run: () => navigate(to),
    });
    const list: Command[] = [
      {
        id: "action:ask-ai",
        label: "Ask AI about your documents",
        hint: "global search",
        icon: "sparkles",
        run: () => navigate("/chat"),
      },
      go("/", "Go to Dashboard", "grid"),
      go("/documents", "Go to Documents", "doc"),
      go("/chat", "Go to Chat", "chat"),
      go("/quiz", "Go to Quiz", "quiz"),
      go("/flashcards", "Go to Flashcards", "card"),
      go("/notes", "Go to Notes", "notes"),
      go("/analytics", "Go to Analytics", "chart"),
      {
        id: "action:upload",
        label: "Upload a document",
        icon: "upload",
        run: () => navigate("/documents"),
      },
      {
        id: "action:theme",
        label: "Toggle light / dark theme",
        icon: "moon",
        run: () => toggle(),
      },
      {
        id: "action:shortcuts",
        label: "Keyboard shortcuts",
        hint: "?",
        icon: "keyboard",
        run: () => window.dispatchEvent(new CustomEvent("synapse:shortcuts")),
      },
      {
        id: "action:logout",
        label: "Log out",
        icon: "logout",
        run: () => void logout(),
      },
    ];
    if (!user) {
      list.push(
        go("/login", "Go to Sign in", "grid"),
        go("/signup", "Go to Sign up", "grid"),
      );
    }
    return list;
  }, [navigate, toggle, logout, user]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onCustom = () => setOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("synapse:command-palette", onCustom);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("synapse:command-palette", onCustom);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Close on Escape at the document level (not just when the input is focused),
  // so the palette always dismisses — matches Modal's behaviour.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  function close() {
    setOpen(false);
  }

  // Trap focus within the dialog while it is open (Phase C4 a11y).
  function onDialogKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    const root = dialogRef.current;
    if (!root) return;
    const focusable = root.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function run(cmd: Command) {
    close();
    cmd.run();
  }

  function onInputKey(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filtered[active];
      if (cmd) run(cmd);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onClick={close}
      role="presentation"
    >
      <div
        className="cmd-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        ref={dialogRef}
        onKeyDown={onDialogKey}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cmd-search">
          <Icon name="search" size={16} />
          <input
            ref={inputRef}
            className="cmd-input"
            placeholder="Type a command…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            aria-label="Command search"
          />
          <kbd className="cmd-kbd">esc</kbd>
        </div>
        <div className="cmd-list">
          {filtered.length === 0 ? (
            <div className="cmd-empty muted">No matching commands.</div>
          ) : (
            filtered.map((c, i) => (
              <button
                key={c.id}
                className={`cmd-item ${i === active ? "active" : ""}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => run(c)}
              >
                <Icon name={c.icon} size={16} />
                <span>{c.label}</span>
                {c.hint && <span className="cmd-hint">{c.hint}</span>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
