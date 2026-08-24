import { useEffect, useRef, useState } from "react";

/**
 * Counts up from 0 to `target` on first mount only.
 * Re-renders are ignored — the animation fires exactly once.
 * @param target  The final number to reach
 * @param duration  Animation duration in ms (default 900)
 */
export function useCountUp(target: number, duration = 800): number {
  const [value, setValue] = useState(0);
  const currentValRef = useRef(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);

    const from = currentValRef.current;
    if (from === target) {
      setValue(target);
      return;
    }

    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextVal = Math.round(from + (target - from) * eased);
      currentValRef.current = nextVal;
      setValue(nextVal);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        currentValRef.current = target;
        setValue(target);
      }
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, duration]);

  return value;
}
