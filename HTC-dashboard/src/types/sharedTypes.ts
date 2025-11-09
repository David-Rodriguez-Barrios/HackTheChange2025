export type PriorityAlert = {
  id?: string;
  alertName: string;
  level: AlertLevelType;
  url: string;
  location: string;
  time: Date;
  rawLevel?: string;
  source?: string;
};

export const AlertLevel = {
  NONE: "NONE",
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH"
}

export type AlertLevelType = typeof AlertLevel[keyof typeof AlertLevel]