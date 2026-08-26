import type { EmailProvider, SendEmailInput, SendEmailResult, EmailEvent } from "../email-provider.js";

/**
 * Brevo (formerly Sendinblue) transactional email provider.
 * Free tier: 300 emails/day (~9,000/month) — chosen as the primary
 * provider for this project specifically for that higher free volume
 * and because Brevo's terms are more permissive of marketing/cold
 * outbound than Resend's (Resend's terms treat unsolicited outreach
 * as a suspension risk).
 *
 * API reference: https://developers.brevo.com/docs/send-a-transactional-email
 */
export class BrevoEmailProvider implements EmailProvider {
  private readonly apiBase = "https://api.brevo.com/v3";

  constructor(
    private readonly apiKey: string,
    private readonly fromEmail: string,
    private readonly fromName: string,
    private readonly webhookSecret?: string
  ) {
    if (!apiKey) {
      throw new Error("BREVO_API_KEY is not configured.");
    }
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const response = await fetch(`${this.apiBase}/smtp/email`, {
      method: "POST",
      headers: {
        "api-key": this.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: this.fromEmail, name: this.fromName },
        to: [{ email: input.to }],
        subject: input.subject,
        htmlContent: input.html,
        textContent: input.text,
        // Brevo lets you attach custom headers; we use this to carry our
        // internal tracking id through to webhook events for correlation.
        headers: input.trackingId ? { "X-Tracking-Id": input.trackingId } : undefined,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Brevo send failed (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as { messageId: string };
    return { providerMessageId: data.messageId, raw: data };
  }

  verifyWebhookSignature(rawBody: string | Buffer, headers: Record<string, string>): boolean {
    // Brevo's webhook verification is typically done via a shared secret
    // passed as a query param or header on the configured webhook URL,
    // rather than an HMAC signature scheme like Stripe/GitHub use.
    // Implement the exact check once the webhook is configured in the
    // Brevo dashboard and the real secret format is confirmed — left
    // explicit here rather than guessed, per project rule against
    // claiming untested integrations work.
    if (!this.webhookSecret) {
      throw new Error(
        "BREVO_WEBHOOK_SECRET is not configured — cannot verify webhook authenticity."
      );
    }
    return headers["x-webhook-secret"] === this.webhookSecret;
  }

  parseWebhookEvents(payload: unknown): EmailEvent[] {
    // Brevo sends webhook events as either a single object or an array,
    // depending on configuration. Normalize to an array.
    const events = Array.isArray(payload) ? payload : [payload];

    return events.map((raw: any) => ({
      type: mapBrevoEventType(raw.event),
      email: raw.email,
      trackingId: raw["X-Tracking-Id"] ?? raw.tag,
      clickedUrl: raw.link,
      timestamp: raw.date ?? new Date().toISOString(),
      raw,
    }));
  }
}

function mapBrevoEventType(brevoEvent: string): EmailEvent["type"] {
  const map: Record<string, EmailEvent["type"]> = {
    delivered: "delivered",
    opened: "opened",
    click: "clicked",
    hard_bounce: "bounced",
    soft_bounce: "bounced",
    spam: "complained",
    unsubscribed: "unsubscribed",
    request: "sent",
  };
  return map[brevoEvent] ?? "sent";
}
