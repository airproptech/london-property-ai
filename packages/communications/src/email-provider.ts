export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string; // plain-text fallback
  trackingId?: string; // our internal id, threaded through as a custom header for webhook correlation
}

export interface SendEmailResult {
  providerMessageId: string;
  raw?: unknown;
}

export interface EmailEvent {
  type: "sent" | "delivered" | "opened" | "clicked" | "bounced" | "complained" | "unsubscribed";
  email: string;
  trackingId?: string;
  clickedUrl?: string;
  timestamp: string;
  raw?: unknown;
}

/**
 * Every email provider (Brevo, Resend, Mailgun, SendGrid) implements this.
 * The campaign/sequence engine depends only on this interface — switching
 * providers is an env var + one new adapter file, not a rewrite.
 */
export interface EmailProvider {
  send(input: SendEmailInput): Promise<SendEmailResult>;
  verifyWebhookSignature(rawBody: string | Buffer, headers: Record<string, string>): boolean;
  parseWebhookEvents(payload: unknown): EmailEvent[];
}
