import { useEffect, useState } from "react";
import type { AlertLevelType } from "../types/sharedTypes";

interface PriorityAlertCardProps {
  alertName: string;
  level: AlertLevelType;
  location?: string;
  time?: Date;
}
export function PriorityAlertCard({ alertName, level, location, time }: PriorityAlertCardProps) {
  const levelClass = `priority-${level.toLowerCase()}`;
  const [relativeTime, setRelativeTime] = useState("");

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

  return (
    <div className="priority-alert-card">
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