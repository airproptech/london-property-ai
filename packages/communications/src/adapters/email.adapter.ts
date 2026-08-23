import type { CommunicationAdapter, SendMessageInput, SendMessageResult } from "../adapter.js";

/**
 * Email adapter targeting Resend's API (free tier: 3,000 emails/mo).
 * Swap RESEND_API_KEY / provider without touching any calling code —
 * that's the point of the adapter interface.
 *
 * NOTE: This is a Phase 2 scaffold. The actual fetch call to Resend's
 * API is intentionally left unimplemented until credentials exist and
 * can be tested — per project rule: never claim an integration works
 * without testing it against a real account.
 */
export class EmailAdapter implements CommunicationAdapter {
  readonly channel = "email" as const;

  constructor(private readonly apiKey: string, private readonly fromAddress: string) {}

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    if (!this.apiKey) {
      throw new Error("RESEND_API_KEY is not configured.");
    }

    // TODO (Phase 7): implement actual Resend API call once credentials
    // are provisioned and this can be tested end-to-end.
    throw new Error("EmailAdapter.send() not yet implemented — pending Phase 7 wiring.");
  }

  verifyWebhookSignature(rawBody: string | Buffer, headers: Record<string, string>): boolean {
    // TODO (Phase 7): implement Resend's webhook signature verification.
    return false;
  }
}
