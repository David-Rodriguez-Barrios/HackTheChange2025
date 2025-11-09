import { type JSX, type ReactNode, useState } from "react";
import type { PriorityAlert } from "../types/sharedTypes";
import { AlertsContext } from "./AlertsContext";
import { AlertLevel } from "../types/sharedTypes";
export function AlertsProvider({ children }: { children: ReactNode }): JSX.Element {

  const initialAlerts = new Map<string, PriorityAlert>([
    ["1", { alertName: "Knife Detected", level: AlertLevel.HIGH, url: "https://www.youtube.com/watch?v=B5aYsHr013s", location: "Dalhouse station", time: new Date() },
    ],
    ["2", { alertName: "Fire Detected", level: AlertLevel.HIGH, url: "https://youtu.be/5TCg63SdAXo?si=cjK3f6dqTSsqg0k6&t=15", location: "Unknown", time: new Date() },
    ],
    ["3", {
      alertName: "People Pushing", level: AlertLevel.MEDIUM, url: "https://www.youtube.com/shorts/Q-M4svTbGz4", location: "Unknown", time: new Date()
    }]
  ])
  const [priorityAlerts, setPriorityAlerts] = useState<Map<string, PriorityAlert>>(initialAlerts);

  return (
    <AlertsContext.Provider value={{ priorityAlerts, setPriorityAlerts }}>
      {children}
    </AlertsContext.Provider>
  );
}