import { and, eq, gt, sql } from "drizzle-orm";
import { getDb, schema } from "@lpai/database";

/**
 * Atomically reserves one credit from the account with the most remaining
 * credits, using a row-level lock so two concurrent jobs can never both
 * claim the same last credit. This is the one function that should ever
 * decrement remainingCredits for a manual (non-search) operation — never
 * update that column directly elsewhere.
 */
export async function reserveCredit(): Promise<{ id: string; accountName: string; apiKeyEnvVar: string }> {
  const db = getDb();

  return db.transaction(async (tx) => {
    const [account] = await tx.execute(sql`
      SELECT id, account_name, api_key_env_var, remaining_credits
      FROM prospeo_accounts
      WHERE active = true AND remaining_credits > 0
      ORDER BY remaining_credits DESC
      LIMIT 1
      FOR UPDATE
    `) as unknown as Array<{ id: string; account_name: string; api_key_env_var: string; remaining_credits: number }>;

    if (!account) {
      throw new Error("No active Prospeo account has available credits.");
    }

    await tx
      .update(schema.prospeoAccounts)
      .set({
        remainingCredits: account.remaining_credits - 1,
        totalCreditsUsed: sql`${schema.prospeoAccounts.totalCreditsUsed} + 1`,
        updatedAt: sql`now()`,
      })
      .where(eq(schema.prospeoAccounts.id, account.id));

    return {
      id: account.id,
      accountName: account.account_name,
      apiKeyEnvVar: account.api_key_env_var,
    };
  });
}

/** Refreshes remaining_credits for every active account from Prospeo's own balance check. */
export async function syncAllAccountCredits(
  checkCredits: (apiKey: string) => Promise<{ remaining: number; limit: number; renewalDate: string | null }>
) {
  const db = getDb();
  const accounts = await db.select().from(schema.prospeoAccounts).where(eq(schema.prospeoAccounts.active, true));

  const results = [];
  for (const account of accounts) {
    const apiKey = process.env[account.apiKeyEnvVar];
    if (!apiKey) {
      results.push({ account: account.accountName, error: `Missing env var ${account.apiKeyEnvVar}` });
      continue;
    }

    try {
      const credits = await checkCredits(apiKey);
      await db
        .update(schema.prospeoAccounts)
        .set({
          remainingCredits: credits.remaining,
          monthlyLimit: credits.limit,
          renewalDate: credits.renewalDate,
          lastCreditCheck: sql`now()`,
        })
        .where(eq(schema.prospeoAccounts.id, account.id));
      results.push({ account: account.accountName, remaining: credits.remaining });
    } catch (err) {
      results.push({ account: account.accountName, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}

/** Checks account balances against configured alert thresholds and returns any that should trigger a notification. */
export async function checkCreditAlerts(): Promise<
  Array<{ accountName: string; remaining: number; limit: number; percentRemaining: number }>
> {
  const db = getDb();
  const thresholds = (process.env.PROSPEO_ALERT_THRESHOLDS ?? "50,25,10,0")
    .split(",")
    .map((t) => parseInt(t.trim(), 10));

  const accounts = await db
    .select()
    .from(schema.prospeoAccounts)
    .where(and(eq(schema.prospeoAccounts.active, true), gt(schema.prospeoAccounts.monthlyLimit, 0)));

  const alerts = [];
  for (const account of accounts) {
    if (!account.remainingCredits || !account.monthlyLimit) continue;
    const percentRemaining = (account.remainingCredits / account.monthlyLimit) * 100;
    const crossedThreshold = thresholds.find((t) => percentRemaining <= t);
    if (crossedThreshold !== undefined) {
      alerts.push({
        accountName: account.accountName,
        remaining: account.remainingCredits,
        limit: account.monthlyLimit,
        percentRemaining,
      });
    }
  }
  return alerts;
}
