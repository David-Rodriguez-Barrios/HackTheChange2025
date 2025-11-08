export type PriorityAlert = {
  alertName: string;
  level: AlertLevelType
  url: string;
  location: string;
  time: Date
}

export const AlertLevel = {
  NONE: "NONE",
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH"
}

export type AlertLevelType = typeof AlertLevel[keyof typeof AlertLevel]