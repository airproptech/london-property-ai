import type { Channel } from "@lpai/shared";
import type { CommunicationAdapter, SendMessageInput, SendMessageResult } from "./adapter.js";

/**
 * Central dispatcher. The AI agent and follow-up worker call
 * `communicationService.send('email', {...})` and never touch
 * a provider SDK directly — adding SMS or website chat later means
 * registering one more adapter here, nothing else changes.
 */
export class CommunicationService {
  private adapters = new Map<Channel, CommunicationAdapter>();

  register(adapter: CommunicationAdapter) {
    this.adapters.set(adapter.channel, adapter);
  }

  async send(channel: Channel, input: SendMessageInput): Promise<SendMessageResult> {
    const adapter = this.adapters.get(channel);
    if (!adapter) {
      throw new Error(`No communication adapter registered for channel: ${channel}`);
    }
    return adapter.send(input);
  }

  getAdapter(channel: Channel): CommunicationAdapter | undefined {
    return this.adapters.get(channel);
  }
}
