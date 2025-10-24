import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "synapse_tips";

type TipState = Record<string, true>;

function load(): TipState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TipState) : {};
  } catch {
    return {};
  }
}

function save(state: TipState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode / quota — tips just won't persist */
  }
}

interface TipsCtx {
  isDismissed: (id: string) => boolean;
  dismiss: (id: string, permanent?: boolean) => void;
  /** Re-arm every tip so they show again on next visit. */
  reset: () => void;
  hasDismissedAny: boolean;
}

const Ctx = createContext<TipsCtx | null>(null);

export function TipsProvider({ children }: { children: ReactNode }) {
  const [dismissed, setDismissed] = useState<TipState>(() => load());

  const isDismissed = useCallback(
    (id: string) => Boolean(dismissed[id]),
    [dismissed],
  );

  const dismiss = useCallback((id: string, _permanent = true) => {
    setDismissed((prev) => {
      const next = { ...prev, [id]: true as const };
      save(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setDismissed({});
    save({});
  }, []);

  const value = useMemo<TipsCtx>(
    () => ({
      isDismissed,
      dismiss,
      reset,
      hasDismissedAny: Object.keys(dismissed).length > 0,
    }),
    [isDismissed, dismiss, reset, dismissed],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTips(): TipsCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTips must be used within a TipsProvider");
  return ctx;
}
