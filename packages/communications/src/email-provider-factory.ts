import type { EmailProvider } from "./email-provider.js";
import { BrevoEmailProvider } from "./adapters/brevo.provider.js";

/**
 * Selects the email backend from environment config (EMAIL_PROVIDER).
 * Brevo is the default per the project's cost-conscious free-tier choice;
 * Resend/Mailgun/SendGrid can be added as adapters later without touching
 * any calling code.
 */
export function createEmailProvider(): EmailProvider {
  const provider = process.env.EMAIL_PROVIDER ?? "brevo";

  switch (provider) {
    case "brevo":
      return new BrevoEmailProvider(
        process.env.BREVO_API_KEY ?? "",
        process.env.EMAIL_FROM_ADDRESS ?? "",
        process.env.EMAIL_FROM_NAME ?? "London Property AI",
        process.env.BREVO_WEBHOOK_SECRET
      );
    default:
      throw new Error(`Unknown EMAIL_PROVIDER: ${provider}`);
  }
}
