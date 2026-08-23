import type { Channel } from "@lpai/shared";

export interface SendMessageInput {
  to: string; // email address, phone number, or WhatsApp number depending on adapter
  body: string;
  subject?: string; // used by EmailAdapter only
  metadata?: Record<string, unknown>;
}

export interface SendMessageResult {
  providerMessageId: string;
  raw?: unknown;
}

/**
 * Every communication channel implements this interface. The AI agent and
 * follow-up worker depend only on this interface, never on a specific
 * provider's SDK — swapping Resend for Postmark, or adding Twilio, means
 * writing one new adapter, not touching calling code.
 */
export interface CommunicationAdapter {
  readonly channel: Channel;
  send(input: SendMessageInput): Promise<SendMessageResult>;
  /** Verifies an inbound webhook's signature came from this provider. */
  verifyWebhookSignature(rawBody: string | Buffer, headers: Record<string, string>): boolean;
}
