import { useEffect, useRef, useState, type RefObject } from "react";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Animate a numeric value from 0 -> `target` when it scrolls into view.
 * Respects prefers-reduced-motion (snaps to the final value).
 * Returns [currentValue, ref] - attach `ref` to the rendered number node so
 * visibility can be observed before the count-up starts.
 */
export function useCountUp(
  target: number,
  durationMs = 900,
): [number, RefObject<HTMLDivElement | null>] {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    setValue(0);
    started.current = false;

    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }

    const run = () => {
      if (started.current) return;
      started.current = true;
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / durationMs);
        setValue(Math.round(easeOutCubic(p) * target));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      run();
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          run();
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [target, durationMs]);

  return [value, ref];
}
