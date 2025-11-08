import React, { createContext, useContext, } from "react";
import type {PriorityAlert } from "../types/sharedTypes";


// Define the shape of your context
export interface AlertsContextType {
  priorityAlerts: Map<string, PriorityAlert>;
  setPriorityAlerts: React.Dispatch<React.SetStateAction<Map<string, PriorityAlert>>>;
}

// Create the context with default empty map
export const AlertsContext = createContext<AlertsContextType>({
  priorityAlerts: new Map(),
  setPriorityAlerts: ()=>{}  
}
);

export function useAlerts() {
  return useContext(AlertsContext);
}


