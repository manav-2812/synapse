import { useEffect, useState } from "react";
import { subscribeServerStatus, type ServerStatus } from "../../api/client";
import { Icon } from "./Icon";

export function ServerWarmupBanner() {
  const [status, setStatus] = useState<ServerStatus>({
    isWakingUp: false,
    justWokeUp: false,
    activeRequests: 0,
    elapsedSeconds: 0,
  });

  useEffect(() => {
    return subscribeServerStatus(setStatus);
  }, []);

  if (!status.isWakingUp && !status.justWokeUp) {
    return null;
  }

  const isSuccess = status.justWokeUp && !status.isWakingUp;

  return (
    <div
      className={`syn-server-warmup-banner ${isSuccess ? "syn-warmup-success" : "syn-warmup-active"}`}
      role="status"
      aria-live="polite"
    >
      <div className="syn-warmup-content">
        <div className="syn-warmup-badge">
          {isSuccess ? (
            <Icon name="check" size={14} className="syn-warmup-icon-check" />
          ) : (
            <span className="syn-warmup-pulse-dot" />
          )}
        </div>
        <div className="syn-warmup-text-wrap">
          <div className="syn-warmup-title">
            {isSuccess ? "Server is ready!" : "Waking up server instance..."}
            {!isSuccess && status.elapsedSeconds > 0 && (
              <span className="syn-warmup-timer">{status.elapsedSeconds}s</span>
            )}
          </div>
          <div className="syn-warmup-sub">
            {isSuccess
              ? "Connection established. Loading your data..."
              : "Render spins down on inactivity. First request takes ~30–50s."}
          </div>
        </div>
      </div>
      {!isSuccess && <div className="syn-warmup-progress-bar" />}
    </div>
  );
}
