import { useMemo } from "react";
import { useAlerts } from "../contexts/AlertsContext";
import { AlertLevel } from "../types/sharedTypes";
import { PriorityAlertCard } from "./PriorityAlertCard";
import './PriorityAlerts.css';


export function PriorityAlerts() {
  const { priorityAlerts, selectAlert, selectedAlert } = useAlerts();

  const alertsEntries = useMemo(() => {
    if (!(priorityAlerts instanceof Map)) {
      return [];
    }
    const entries = Array.from(priorityAlerts.entries());
    entries.sort(([, a], [, b]) => {
      if (!a.time || !b.time) return 0;
      return b.time.getTime() - a.time.getTime();
    });
    return entries;
  }, [priorityAlerts]);

  const highCount = alertsEntries.filter(([, alert]) => alert.level === AlertLevel.HIGH).length;
  const mediumCount = alertsEntries.filter(([, alert]) => alert.level === AlertLevel.MEDIUM).length;
  const lowCount = alertsEntries.filter(([, alert]) => alert.level === AlertLevel.LOW).length;

  return (
    <div className="priority-alerts-panel">
      <div className="priority-alerts-header">
        <h2>Priority Alerts</h2>
        <div className="priority-alerts-stats">
          <div className="stat-card stat-critical">
            <div className="count">{highCount}</div>
            <div className="label">Critical</div>
          </div>
          <div className="stat-card stat-warning">
            <div className="count">{mediumCount}</div>
            <div className="label">Warning</div>
          </div>
          <div className="stat-card stat-info">
            <div className="count">{lowCount}</div>
            <div className="label">Info</div>
          </div>
        </div>
      </div>
      <div className="priority-alerts-scroll">
        {alertsEntries.length > 0 ? (
          alertsEntries.map(([alertId, alert]) => (
            <PriorityAlertCard
              key={alertId}
              alertName={alert.alertName}
              level={alert.level}
              location={alert.location}
              time={alert.time}
              isActive={selectedAlert?.id === alertId}
              onSelect={() => selectAlert(alertId)}
            />
          ))
        ) : (
          <PriorityAlertCard alertName="No Alerts" level={AlertLevel.NONE} />
        )}
      </div>
    </div>
  );
}