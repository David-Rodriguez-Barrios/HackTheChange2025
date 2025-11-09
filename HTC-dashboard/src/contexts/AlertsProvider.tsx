import { type JSX, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { PriorityAlert, AlertLevelType } from "../types/sharedTypes";
import { AlertsContext, type AlertSelection } from "./AlertsContext";
import { AlertLevel } from "../types/sharedTypes";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

export function AlertsProvider({ children }: { children: ReactNode }): JSX.Element {

  const [priorityAlerts, setPriorityAlerts] = useState<Map<string, PriorityAlert>>(new Map());
  const [selectedAlert, setSelectedAlert] = useState<AlertSelection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const selectAlert = useCallback((alertId: string | null) => {
    if (!alertId) {
      setSelectedAlert(null);
      return;
    }
    setSelectedAlert({
      id: alertId,
      requestedAt: Date.now(),
    });
  }, []);

  useEffect(() => {
    const wsProtocol = BACKEND_URL.startsWith("https://") ? "wss://" : "ws://";
    const wsUrl = `${wsProtocol}${BACKEND_URL.replace(/^https?:\/\//, "")}/api/websocket/alerts`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("Connected to priority alerts websocket");
    };

    ws.onmessage = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.type !== "priority_alert") {
          return;
        }

        const generatedId =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2);

        const alertId = typeof payload.id === "string" && payload.id.length > 0 ? payload.id : generatedId;
        const normalizedLevel = typeof payload.level === "string" ? payload.level.toUpperCase() : "";
        const allLevels = Object.values(AlertLevel) as AlertLevelType[];
        const level: AlertLevelType = allLevels.includes(normalizedLevel as AlertLevelType)
          ? (normalizedLevel as AlertLevelType)
          : AlertLevel.MEDIUM;

        const alert: PriorityAlert = {
          id: alertId,
          alertName: payload.alertName ?? payload.reason ?? "Priority alert",
          level,
          url: payload.url ?? "",
          location: payload.location ?? (payload.source ? payload.source : "Unknown"),
          time: payload.time ? new Date(payload.time) : new Date(),
          rawLevel: payload.rawLevel,
          source: payload.source,
        };

        setPriorityAlerts((prev) => {
          const next = new Map(prev);
          next.set(alertId, alert);
          // keep only the latest 50 alerts to limit memory
          while (next.size > 50) {
            const firstKey = next.keys().next().value;
            next.delete(firstKey);
          }
          return next;
        });
      } catch (err) {
        console.error("Failed to parse priority alert message", err);
      }
    };

    ws.onerror = (err) => {
      console.error("Priority alerts websocket error", err);
    };

    ws.onclose = () => {
      console.warn("Priority alerts websocket disconnected");
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!selectedAlert) {
      return;
    }
    if (!priorityAlerts.has(selectedAlert.id)) {
      setSelectedAlert(null);
    }
  }, [priorityAlerts, selectedAlert]);

  return (
    <AlertsContext.Provider
      value={{
        priorityAlerts,
        setPriorityAlerts,
        selectedAlert,
        selectAlert,
        clearAlertSelection: () => setSelectedAlert(null),
      }}
    >
      {children}
    </AlertsContext.Provider>
  );
}