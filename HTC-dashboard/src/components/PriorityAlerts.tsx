import { useAlerts } from "../contexts/AlertsContext";
import { AlertLevel } from "../types/sharedTypes";
import { PriorityAlertCard } from "./PriorityAlertCard";
import './PriorityAlerts.css';


export function PriorityAlerts() {
  const { priorityAlerts } = useAlerts();

  const alertsArray = priorityAlerts instanceof Map ? Array.from(priorityAlerts.values()) : [];

  const highCount = alertsArray.filter(a => a.level === AlertLevel.HIGH).length;
  const mediumCount = alertsArray.filter(a => a.level === AlertLevel.MEDIUM).length;
  const lowCount = alertsArray.filter(a => a.level === AlertLevel.LOW).length;

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
        {alertsArray.length > 0 ? (
          alertsArray.map((alert, idx) => (
            <PriorityAlertCard
              key={idx}
              alertName={alert.alertName}
              level={alert.level}
              location={alert.location}
              time={alert.time}
            />
          ))
        ) : (
          <PriorityAlertCard alertName="No Alerts" level={AlertLevel.NONE} />
        )}
      </div>
    </div>
  );
}