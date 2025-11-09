import { type JSX, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { PriorityAlert, AlertLevelType } from "../types/sharedTypes";
import { AlertsContext, type AlertSelection } from "./AlertsContext";
import { AlertLevel } from "../types/sharedTypes";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

// Check if we should use simulated alerts from batch analysis
const USE_BATCH_ALERTS = import.meta.env.VITE_USE_BATCH_ALERTS === "true";
const BATCH_ALERTS_FILE = import.meta.env.VITE_BATCH_ALERTS_FILE || "/api/videos/client_alerts_Critical1.json";

interface BatchAlertPayload {
  type: string;
  id: string;
  alertName: string;
  level: AlertLevelType;
  rawLevel: string;
  location: string;
  url: string;
  time: string;
  source: string;
  frameNumber: number;
  timestampSeconds: number;
  objects: string[];
  videoPath: string;
  videoDuration: number;
}

export function AlertsProvider({ children }: { children: ReactNode }): JSX.Element {

  const [priorityAlerts, setPriorityAlerts] = useState<Map<string, PriorityAlert>>(new Map());
  const [selectedAlert, setSelectedAlert] = useState<AlertSelection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const batchAlertsTimerRef = useRef<ReturnType<typeof setTimeout>[]>([]);

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

  // Process alert payload (shared logic for websocket and batch simulation)
  const processAlertPayload = useCallback((payload: BatchAlertPayload | any, isBatchSimulation = false) => {
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
      // Use current time for batch simulations, otherwise use payload time or fallback to current
      time: isBatchSimulation ? new Date() : (payload.time ? new Date(payload.time) : new Date()),
      rawLevel: payload.rawLevel,
      source: payload.source,
    };

    setPriorityAlerts((prev) => {
      const next = new Map(prev);
      next.set(alertId, alert);
      // keep only the latest 50 alerts to limit memory
      while (next.size > 50) {
        const firstKey = next.keys().next().value;
        if (firstKey) {
          next.delete(firstKey);
        }
      }
      return next;
    });
  }, []);

  // Load and simulate batch alerts
  useEffect(() => {
    if (!USE_BATCH_ALERTS) {
      return;
    }

    const loadBatchAlerts = async () => {
      try {
        const response = await fetch(BATCH_ALERTS_FILE);
        if (!response.ok) {
          console.warn(`Failed to load batch alerts: ${response.status}`);
          return;
        }

        const batchData = await response.json();
        const alerts = batchData.alerts || [];

        console.log(`📊 Loaded ${alerts.length} batch alerts for simulation`);
        console.log(`   Video: ${batchData.sourceVideo}`);
        console.log(`   Duration: ${batchData.videoDuration}s`);

        // Schedule each alert to be dispatched at its timestamp
        alerts.forEach((alert: BatchAlertPayload) => {
          const delayMs = Math.max(0, alert.timestampSeconds * 1000);
          const timerId = setTimeout(() => {
            console.log(
              `🔔 Dispatching simulated alert at ${alert.timestampSeconds.toFixed(1)}s: ${alert.alertName}`
            );
            processAlertPayload(alert, true); // Pass true for isBatchSimulation
          }, delayMs);

          batchAlertsTimerRef.current.push(timerId);
        });

        console.log(`⏱️  Scheduled ${alerts.length} alerts for playback`);
      } catch (err) {
        console.error("Failed to load batch alerts", err);
      }
    };

    loadBatchAlerts();

    return () => {
      // Clear all scheduled timers on cleanup
      batchAlertsTimerRef.current.forEach(clearTimeout);
      batchAlertsTimerRef.current = [];
    };
  }, [processAlertPayload]);

  // WebSocket connection for live alerts
  useEffect(() => {
    // Always connect to WebSocket for live alerts 
    if (USE_BATCH_ALERTS) {
      console.log("ℹ️ Batch alert simulation mode is enabled alongside live alerts");
    }

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
        processAlertPayload(payload);
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
  }, [processAlertPayload]);

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