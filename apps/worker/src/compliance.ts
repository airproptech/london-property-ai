import { config as apiConfigShape } from "./config.js";

export interface ComplianceCheckInput {
  marketingOptIn: boolean;
  status: string; // lead status — must not be 'opted_out'
  lastContactAt: Date | null;
  now?: Date;
}

export interface ComplianceCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Every follow-up send must pass through this before dispatch. Any failure
 * here means the followup row is marked 'skipped' with the reason — never
 * silently dropped, per the project's compliance requirements.
 */
export function checkCompliance(input: ComplianceCheckInput): ComplianceCheckResult {
  const now = input.now ?? new Date();

  if (input.status === "opted_out") {
    return { allowed: false, reason: "Lead has opted out of marketing communications" };
  }

  if (!input.marketingOptIn) {
    return { allowed: false, reason: "Lead has not given marketing opt-in consent" };
  }

  if (input.lastContactAt) {
    const hoursSinceLastContact = (now.getTime() - input.lastContactAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastContact < apiConfigShape.followups.minHoursBetweenMessages) {
      return {
        allowed: false,
        reason: `Frequency cap: only ${hoursSinceLastContact.toFixed(1)}h since last contact, minimum is ${apiConfigShape.followups.minHoursBetweenMessages}h`,
      };
    }
  }

  if (isWithinQuietHours(now, apiConfigShape.followups.quietHoursStart, apiConfigShape.followups.quietHoursEnd)) {
    return { allowed: false, reason: "Within configured quiet hours" };
  }

  return { allowed: true };
}

function isWithinQuietHours(now: Date, start: string, end: string): boolean {
  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = (startH ?? 0) * 60 + (startM ?? 0);
  const endMinutes = (endH ?? 0) * 60 + (endM ?? 0);

  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }
  // Quiet hours span midnight (e.g. 21:00 - 08:00)
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}
