import { type JSX, type ReactNode, useEffect, useRef, useState } from "react";
import type { PriorityAlert } from "../types/sharedTypes";
import { AlertsContext } from "./AlertsContext";
import { AlertLevel } from "../types/sharedTypes";

type BackendAlert = {
  id: string;
  alertName: string;
  level: string;
  location?: string;
  time?: string;
  url?: string;
};

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:3000";

function toPriorityAlert(alert: BackendAlert): PriorityAlert {
  const level =
    alert.level === AlertLevel.HIGH ||
    alert.level === AlertLevel.MEDIUM ||
    alert.level === AlertLevel.LOW
      ? alert.level
      : AlertLevel.LOW;

  return {
    id: alert.id,
    alertName: alert.alertName,
    level,
    location: alert.location,
    url: alert.url,
    time: alert.time ? new Date(alert.time) : undefined,
  };
}

export function AlertsProvider({ children }: { children: ReactNode }): JSX.Element {
  const [priorityAlerts, setPriorityAlerts] = useState<Map<string, PriorityAlert>>(new Map());
  const websocketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    let isMounted = true;

    const updateAlertsMap = (alerts: PriorityAlert[]) => {
      setPriorityAlerts(new Map(alerts.map((alert) => [alert.id, alert])));
    };

    const handleIncomingAlert = (alert: PriorityAlert) => {
      setPriorityAlerts((prev) => {
        const updated = new Map(prev);
        updated.set(alert.id, alert);
        return updated;
      });
    };

    const fetchInitialAlerts = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/alerts`);
        if (!response.ok) {
          throw new Error(`Failed to fetch alerts: ${response.status}`);
        }
        const data = await response.json();
        if (Array.isArray(data?.alerts)) {
          const alerts = data.alerts.map(toPriorityAlert);
          updateAlertsMap(alerts);
          console.log("[Alerts] Loaded initial alerts:", alerts);
        }
      } catch (error) {
        console.error("Failed to load alerts", error);
      }
    };

    const connectWebSocket = () => {
      const wsUrl = BACKEND_URL.replace(/^http/i, "ws");
      const socket = new WebSocket(`${wsUrl}/api/websocket/alerts`);
      websocketRef.current = socket;

      socket.onopen = () => {
        console.log("[Alerts] WebSocket connected");
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          console.log("[Alerts] WebSocket message:", payload);
          if (payload?.type === "history" && Array.isArray(payload.alerts)) {
            const alerts = payload.alerts.map(toPriorityAlert);
            updateAlertsMap(alerts);
          } else if (payload?.type === "alert" && payload.alert) {
            handleIncomingAlert(toPriorityAlert(payload.alert));
          }
        } catch (err) {
          console.error("Error parsing alert message", err);
        }
      };

      socket.onerror = (event) => {
        console.error("Alert WebSocket error", event);
        socket.close();
      };

      socket.onclose = () => {
        websocketRef.current = null;
        if (isMounted) {
          console.warn("[Alerts] WebSocket closed; retrying in 3s");
          reconnectTimeoutRef.current = window.setTimeout(connectWebSocket, 3000);
        }
      };
    };

    fetchInitialAlerts().catch((err) => console.error(err));
    connectWebSocket();

    return () => {
      isMounted = false;
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      if (websocketRef.current) {
        websocketRef.current.close();
      }
    };
  }, []);

  return (
    <AlertsContext.Provider value={{ priorityAlerts, setPriorityAlerts }}>
      {children}
    </AlertsContext.Provider>
  );
}