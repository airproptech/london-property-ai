/**
 * Centralized env var access. Nothing else in the API should call
 * process.env directly — go through this so required vars fail loudly
 * at boot, not silently at request time.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const config = {
  nodeEnv: optional("NODE_ENV", "development"),
  port: parseInt(optional("API_PORT", "4000"), 10),
  logLevel: optional("LOG_LEVEL", "info"),
  apiBaseUrl: optional("API_BASE_URL", "http://localhost:4000"),
  dashboardBaseUrl: optional("DASHBOARD_BASE_URL", "http://localhost:3000"),

  jwt: {
    accessSecret: () => required("JWT_ACCESS_SECRET"),
    refreshSecret: () => required("JWT_REFRESH_SECRET"),
    accessTtl: optional("JWT_ACCESS_TTL", "15m"),
    refreshTtl: optional("JWT_REFRESH_TTL", "30d"),
  },

  rateLimit: {
    max: parseInt(optional("RATE_LIMIT_MAX", "100"), 10),
    window: optional("RATE_LIMIT_WINDOW", "1m"),
  },

  ai: {
    provider: optional("AI_PROVIDER", "anthropic"),
    model: optional("AI_MODEL", "claude-sonnet-4-6"),
  },

  followups: {
    quietHoursStart: optional("FOLLOWUP_QUIET_HOURS_START", "21:00"),
    quietHoursEnd: optional("FOLLOWUP_QUIET_HOURS_END", "08:00"),
    minHoursBetweenMessages: parseInt(optional("FOLLOWUP_MIN_HOURS_BETWEEN_MESSAGES", "48"), 10),
  },
};
