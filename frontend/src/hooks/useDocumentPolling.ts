import { useEffect, useRef } from "react";
import { documentsApi } from "../api/documents";
import { ApiError } from "../api/client";
import type { DocumentResponse, DocumentStatusResponse } from "../types/api";

/**
 * Polls only documents that are still `pending`/`processing`, stops a given
 * document once it reaches `completed`/`failed` (or returns 404/removed),
 * applies exponential backoff (2s -> 4s) after the first ~10s, and cleans up
 * all timers on unmount.
 */
export function useDocumentPolling(
  docs: DocumentResponse[],
  onStatus: (id: string, status: DocumentStatusResponse) => void,
): void {
  const docsRef = useRef(docs);
  docsRef.current = docs;
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  const timers = useRef<Record<string, number>>({});

  useEffect(() => {
    const active = docsRef.current.filter(
      (d) =>
        d.processing_status === "pending" ||
        d.processing_status === "processing",
    );

    const activeIds = new Set(active.map((d) => d.id));
    // Clean up timers for docs that are no longer pending/processing or were deleted
    Object.keys(timers.current).forEach((id) => {
      if (!activeIds.has(id)) {
        window.clearTimeout(timers.current[id]);
        delete timers.current[id];
      }
    });

    active.forEach((d) => {
      if (timers.current[d.id]) return; // already polling this one

      const start = Date.now();
      const tick = async () => {
        try {
          const s = await documentsApi.status(d.id);
          onStatusRef.current(d.id, s);
          if (
            s.processing_status === "completed" ||
            s.processing_status === "failed"
          ) {
            window.clearTimeout(timers.current[d.id]);
            delete timers.current[d.id];
            return;
          }
        } catch (err) {
          // If document was deleted or not found (404/410), stop polling immediately
          if (err instanceof ApiError && (err.status === 404 || err.status === 410)) {
            window.clearTimeout(timers.current[d.id]);
            delete timers.current[d.id];
            return;
          }
          /* transient network issue; the next tick will retry */
        }
        const elapsed = Date.now() - start;
        // Stop polling after 3 minutes max to prevent unbounded polling
        if (elapsed > 180000) {
          window.clearTimeout(timers.current[d.id]);
          delete timers.current[d.id];
          return;
        }
        const delay = elapsed > 10000 ? 4000 : 2000;
        timers.current[d.id] = window.setTimeout(tick, delay);
      };

      timers.current[d.id] = window.setTimeout(tick, 2000);
    });
  }, [docs]);

  useEffect(() => {
    const map = timers.current;
    return () => {
      Object.values(map).forEach((t) => window.clearTimeout(t));
      timers.current = {};
    };
  }, []);
}
