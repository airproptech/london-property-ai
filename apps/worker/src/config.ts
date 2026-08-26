function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const config = {
  nodeEnv: optional("NODE_ENV", "development"),
  logLevel: optional("LOG_LEVEL", "info"),
  redisUrl: () => required("REDIS_URL"),
  followups: {
    quietHoursStart: optional("FOLLOWUP_QUIET_HOURS_START", "21:00"),
    quietHoursEnd: optional("FOLLOWUP_QUIET_HOURS_END", "08:00"),
    minHoursBetweenMessages: parseInt(optional("FOLLOWUP_MIN_HOURS_BETWEEN_MESSAGES", "48"), 10),
  },
  pollIntervalMs: parseInt(optional("FOLLOWUP_POLL_INTERVAL_MS", "300000"), 10), // 5 min default
  whatsappProvider: optional("WHATSAPP_PROVIDER", ""),
};
