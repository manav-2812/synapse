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
  { keys: [MOD, "K"], label: "Open command palette" },
  { keys: ["?"], label: "Show this shortcuts menu" },
  { keys: ["/"], label: "Focus search / palette" },
  { keys: ["g", "d"], label: "Go to Documents" },
  { keys: ["g", "c"], label: "Go to Chat" },
  { keys: ["g", "q"], label: "Go to Quiz" },
  { keys: ["g", "f"], label: "Go to Flashcards" },
  { keys: ["g", "n"], label: "Go to Notes" },
  { keys: ["g", "a"], label: "Go to Analytics" },
  { keys: ["Esc"], label: "Close palette / dialog" },
  { keys: ["↑", "↓"], label: "Move in lists & palette" },
  { keys: ["↵"], label: "Confirm / open" },
];

const GO: Record<string, string> = {
  d: "/documents",
  c: "/chat",
  q: "/quiz",
  f: "/flashcards",
  n: "/notes",
  a: "/analytics",
};

/**
 * Global keyboard shortcuts (help overlay + `g`-prefix navigation).
 * Mount once near the app root. Ignores key events while the user is typing
 * in a field so letters don't trigger navigation.
 */
export function useShortcuts(onHelp: () => void) {
  const navigate = useNavigate();
  const [awaitingGo, setAwaitingGo] = useState(false);

  useEffect(() => {
    let goTimer: ReturnType<typeof setTimeout> | undefined;

    const onKey = (e: KeyboardEvent) => {
      // Always allow palette close / escape handling elsewhere.
      if (e.key === "Escape") {
        setAwaitingGo(false);
        return;
      }

      // `?` (Shift+/) opens help — unless typing in a field.
      if (e.key === "?" && !isTypingTarget(e.target)) {
        e.preventDefault();
        onHelp();
        return;
      }

      // `/` focuses search by opening the palette.
      if (e.key === "/" && !isTypingTarget(e.target)) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("synapse:command-palette"));
        return;
      }

      if (isTypingTarget(e.target)) return;

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
