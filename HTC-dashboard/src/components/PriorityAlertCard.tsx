import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import type { AlertLevelType } from "../types/sharedTypes";

interface PriorityAlertCardProps {
  alertName: string;
  level: AlertLevelType;
  location?: string;
  time?: Date;
  onSelect?: () => void;
  isActive?: boolean;
}
export function PriorityAlertCard({
  alertName,
  level,
  location,
  time,
  onSelect,
  isActive,
}: PriorityAlertCardProps) {
  const levelClass = `priority-${level.toLowerCase()}`;
  const [relativeTime, setRelativeTime] = useState("");
  const isInteractive = typeof onSelect === "function";

  // Helper to compute "seconds ago" or "minutes ago"
  const computeRelativeTime = () => {
    if (!time) return "";
    const now = new Date();
    const diffMs = now.valueOf() - time.valueOf();
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 60) return `${diffSec} sec${diffSec !== 1 ? "s" : ""} ago`;
    const diffMin = Math.floor(diffSec / 60);
    return `${diffMin} min${diffMin !== 1 ? "s" : ""} ago`;
  };
  useEffect(() => {
    setRelativeTime(computeRelativeTime());
    const interval = setInterval(() => {
      setRelativeTime(computeRelativeTime());
    }, 5000);
    return () => clearInterval(interval);
  }, [time]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!isInteractive) {
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect?.();
      }
    },
    [isInteractive, onSelect]
  );

  return (
    <div
      className={[
        "priority-alert-card",
        isInteractive ? "priority-alert-card--interactive" : "",
        isActive ? "priority-alert-card--active" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onClick={isInteractive ? onSelect : undefined}
      onKeyDown={handleKeyDown}
    >
      <div className="alert-top">
        <div>
          <span className={`priority-dot ${levelClass}`}></span>
          {level}
        </div>
        <div>{relativeTime}</div>
      </div>
      <div className="alert-message">{alertName}</div>
      {location && <div className="alert-bottom">{location}</div>}
    </div>
  );
}