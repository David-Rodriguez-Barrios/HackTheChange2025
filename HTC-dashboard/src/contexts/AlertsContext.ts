import React, { createContext, useContext } from "react";
import type { PriorityAlert } from "../types/sharedTypes";

export interface AlertSelection {
  id: string;
  requestedAt: number;
}

// Define the shape of your context
export interface AlertsContextType {
  priorityAlerts: Map<string, PriorityAlert>;
  setPriorityAlerts: React.Dispatch<React.SetStateAction<Map<string, PriorityAlert>>>;
  selectedAlert: AlertSelection | null;
  selectAlert: (alertId: string | null) => void;
  clearAlertSelection: () => void;
}

// Create the context with default empty map
export const AlertsContext = createContext<AlertsContextType>({
  priorityAlerts: new Map(),
  setPriorityAlerts: () => {},
  selectedAlert: null,
  selectAlert: () => {},
  clearAlertSelection: () => {},
});

export function useAlerts() {
  return useContext(AlertsContext);
}

