import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const isTypingTarget = (el: EventTarget | null): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
};

const MOD = typeof navigator !== "undefined" && /mac/i.test(navigator.platform)
  ? "⌘"
  : "Ctrl";

/** Shortcut descriptor for the help overlay. */
export interface Shortcut {
  keys: string[];
  label: string;
}

export const SHORTCUTS: Shortcut[] = [
  { keys: [MOD, "K"], label: "Command Palette" },
  { keys: [MOD, "B"], label: "Toggle Sidebar" },
  { keys: ["Alt", "C"], label: "Quick AI Chat" },
  { keys: [MOD, "/"], label: "Search Documents" },
  { keys: ["Alt", "T"], label: "Toggle Dark Mode" },
  { keys: ["?"], label: "Show shortcuts menu" },
  { keys: ["g", "s"], label: "Go to Search" },
  { keys: ["g", "d"], label: "Go to Documents" },
  { keys: ["g", "c"], label: "Go to Chat" },
  { keys: ["g", "q"], label: "Go to Quiz" },
  { keys: ["g", "f"], label: "Go to Flashcards" },
  { keys: ["g", "n"], label: "Go to Notes" },
  { keys: ["g", "a"], label: "Go to Analytics" },
  { keys: ["Esc"], label: "Close dialog" },
];

const GO: Record<string, string> = {
  s: "/search",
  d: "/documents",
  c: "/chat",
  q: "/quiz",
  f: "/flashcards",
  n: "/notes",
  a: "/analytics",
  p: "/profile",
};

/**
 * Global keyboard shortcuts (Command Palette, Sidebar, Chat, Docs, Theme, and `g`-navigation).
 */
export function useShortcuts(onHelp: () => void) {
  const navigate = useNavigate();
  const [awaitingGo, setAwaitingGo] = useState(false);

  useEffect(() => {
    let goTimer: ReturnType<typeof setTimeout> | undefined;

    const onKey = (e: KeyboardEvent) => {
      // 1. Command Palette: Ctrl+K / Cmd+K
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("synapse:command-palette"));
        return;
      }

      // 2. Toggle Sidebar: Ctrl+B / Cmd+B or Ctrl+\
      if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === "b" || e.key === "\\")) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("synapse:toggle-app-sidebar"));
        return;
      }

      // 3. Quick AI Chat: Alt+C
      if (e.altKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        navigate("/chat");
        return;
      }

      // 4. Search Documents: Ctrl+/ / Cmd+/
      if ((e.metaKey || e.ctrlKey) && (e.key === "/" || e.key === "?")) {
        e.preventDefault();
        navigate("/documents");
        return;
      }

      // 5. Practice Quiz: Alt+Q
      if (e.altKey && e.key.toLowerCase() === "q") {
        e.preventDefault();
        navigate("/quiz");
        return;
      }

      // 6. Flashcards Review: Alt+F
      if (e.altKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        navigate("/flashcards");
        return;
      }

      // 7. Smart Notes: Alt+N
      if (e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        navigate("/notes");
        return;
      }

      // 8. Learning Analytics: Alt+A
      if (e.altKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        navigate("/analytics");
        return;
      }

      // 9. Toggle Dark Mode: Alt+T
      if (e.altKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
        const nextTheme = currentTheme === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", nextTheme);
        localStorage.setItem("synapse_theme", nextTheme);
        window.dispatchEvent(new CustomEvent("synapse:toggle-theme"));
        return;
      }

      // Escape
      if (e.key === "Escape") {
        setAwaitingGo(false);
        return;
      }

      // Single-key shortcuts (skip if typing in an input field)
      if (isTypingTarget(e.target)) return;

      // `?` (Shift+/) opens help
      if (e.key === "?") {
        e.preventDefault();
        onHelp();
        return;
      }

      // `/` navigates to search
      if (e.key === "/") {
        e.preventDefault();
        navigate("/search");
        return;
      }

      const k = e.key.toLowerCase();

      if (awaitingGo) {
        const to = GO[k];
        if (to) {
          e.preventDefault();
          setAwaitingGo(false);
          navigate(to);
        } else {
          setAwaitingGo(false);
        }
        return;
      }

      if (k === "g") {
        e.preventDefault();
        setAwaitingGo(true);
        goTimer = setTimeout(() => setAwaitingGo(false), 1200);
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (goTimer) clearTimeout(goTimer);
    };
  }, [navigate, onHelp, awaitingGo]);
}
