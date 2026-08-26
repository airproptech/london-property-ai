import type { Channel } from "@lpai/shared";
import type { CommunicationAdapter, SendMessageInput, SendMessageResult } from "@lpai/communications";
import { baileysClient } from "./baileys-client.js";

/**
 * Implements the shared CommunicationAdapter interface on top of Baileys.
 * Deliberately lives in apps/worker, not packages/communications — Baileys
 * holds a single live socket connection, and only the worker process
 * should ever own that connection. The API process never touches this.
 *
 * verifyWebhookSignature doesn't apply here (Baileys has no webhooks —
 * inbound messages arrive via the live socket's event stream instead,
 * handled in baileys-client.ts's messages.upsert listener) so it always
 * returns false; nothing should ever call it for this adapter.
 */
export class BaileysWhatsAppAdapter implements CommunicationAdapter {
  readonly channel: Channel = "whatsapp";

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    if (!baileysClient.isConnected()) {
      throw new Error("WhatsApp (Baileys) is not connected. Check worker logs for QR/reconnect status.");
    }

    const result = await baileysClient.sendMessage(input.to, input.body);

    return {
      providerMessageId: result.id ?? "unknown",
      raw: result,
    };
  }

  verifyWebhookSignature(): boolean {
    return false;
  }
}
