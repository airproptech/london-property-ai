import type { CommunicationAdapter, SendMessageInput, SendMessageResult } from "../adapter.js";

/**
 * WhatsApp adapter targeting Meta's Cloud API directly (avoids Twilio markup).
 * Intentionally unimplemented in Phase 2 — this project has no WhatsApp
 * number or Meta app yet. Scaffolded now so the interface boundary is
 * correct from day one; real implementation happens in Phase 7.
 *
 * This adapter, its number, and its credentials are entirely independent
 * of the separate hostel WhatsApp project — do not share a phone number,
 * app ID, or access token between the two.
 */
export class WhatsAppAdapter implements CommunicationAdapter {
  readonly channel = "whatsapp" as const;

  constructor(
    private readonly phoneNumberId: string,
    private readonly accessToken: string,
    private readonly webhookVerifyToken: string
  ) {}

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    throw new Error("WhatsAppAdapter.send() not yet implemented — pending Phase 7 wiring.");
  }

  verifyWebhookSignature(rawBody: string | Buffer, headers: Record<string, string>): boolean {
    // TODO (Phase 7): implement Meta's X-Hub-Signature-256 verification.
    return false;
  }
}
