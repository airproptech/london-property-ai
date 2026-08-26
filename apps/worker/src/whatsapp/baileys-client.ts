import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  type WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import qrcodeTerminal from "qrcode-terminal";
import pino from "pino";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

// Auth state persisted to a file in a Docker-managed volume — survives
// container restarts without needing to re-scan the QR code, as long as
// the volume itself isn't deleted.
const AUTH_STATE_DIR = process.env.WHATSAPP_AUTH_DIR ?? "/app/auth_info";

// Self-imposed conservative send pacing — Baileys has no official rate
// limit to respect, so sending too fast/bot-like is the main cause of a
// number getting flagged. This is deliberately cautious.
const MIN_MS_BETWEEN_SENDS = 3000;

let lastSendAt = 0;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS_BEFORE_ALERT = 5;

export type IncomingMessageHandler = (from: string, text: string) => Promise<void>;

export class BaileysClient {
  private sock: WASocket | null = null;
  private onIncomingMessage: IncomingMessageHandler | null = null;
  private onConnectionLost: (() => Promise<void>) | null = null;

  setIncomingMessageHandler(handler: IncomingMessageHandler) {
    this.onIncomingMessage = handler;
  }

  /** Called when reconnection attempts are exhausted — hook this up to notify_human. */
  setConnectionLostHandler(handler: () => Promise<void>) {
    this.onConnectionLost = handler;
  }

  async connect(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_STATE_DIR);
    const { version } = await fetchLatestBaileysVersion();

    this.sock = makeWASocket({
      version,
      auth: state,
      // QR printing disabled — pairing code is used instead, since a
      // single-device (phone-only) setup can't scan a QR shown on the
      // same phone. If a second device is ever used to run Termius,
      // the QR still appears via connection.update's `qr` field below.
      printQRInTerminal: false,
    });

    this.sock.ev.on("creds.update", saveCreds);

    // Pairing code flow: request a short code to type into WhatsApp
    // (Settings → Linked Devices → Link a Device → "Link with phone
    // number instead") rather than scanning a QR code.
    if (!this.sock.authState.creds.registered) {
      const phoneNumber = (process.env.WHATSAPP_NUMBER ?? "").replace(/[^0-9]/g, "");
      if (!phoneNumber) {
        throw new Error(
          "WHATSAPP_NUMBER is not set — required to request a pairing code. Set it in .env as digits only, e.g. 18706962412 (no +, spaces, or dashes)."
        );
      }

      // Small delay recommended by Baileys docs before requesting the code.
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const code = await this.sock.requestPairingCode(phoneNumber);
      console.log("\n=== WhatsApp Pairing Code ===");
      console.log(`Code: ${code}`);
      console.log("On the phone, go to: WhatsApp > Settings > Linked Devices > Link a Device > \"Link with phone number instead\"");
      console.log("Enter the code above. It expires after a short time — restart the worker to get a new one if needed.\n");
    }

    this.sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // Still shown for completeness/fallback if run from a second device.
      if (qr) {
        console.log("\n=== WhatsApp QR Code (alternative to pairing code) ===\n");
        qrcodeTerminal.generate(qr, { small: true });
      }

      if (connection === "open") {
        logger.info("WhatsApp connected successfully.");
        reconnectAttempts = 0;
      }

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        if (loggedOut) {
          logger.error(
            "WhatsApp session logged out — the linked device was unlinked from the phone. Re-linking (new QR scan) required."
          );
          if (this.onConnectionLost) await this.onConnectionLost();
          return;
        }

        reconnectAttempts += 1;
        logger.warn(
          { attempt: reconnectAttempts },
          "WhatsApp connection closed — attempting reconnect."
        );

        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS_BEFORE_ALERT) {
          logger.error(
            "WhatsApp reconnection failed repeatedly — escalating. The number may need manual re-linking."
          );
          if (this.onConnectionLost) await this.onConnectionLost();
        }

        // Exponential-ish backoff, capped.
        const delayMs = Math.min(reconnectAttempts * 5000, 60000);
        setTimeout(() => this.connect(), delayMs);
      }
    });

    this.sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;

      for (const msg of messages) {
        if (msg.key.fromMe) continue; // ignore our own outbound messages
        const from = msg.key.remoteJid;
        const text =
          msg.message?.conversation ?? msg.message?.extendedTextMessage?.text ?? null;

        if (from && text && this.onIncomingMessage) {
          await this.onIncomingMessage(from, text);
        }
      }
    });
  }

  /**
   * Sends a WhatsApp message with self-imposed rate limiting.
   * `to` should be a phone number in international format without '+'
   * (e.g. "18706962412"); the WhatsApp JID suffix is added automatically.
   */
  async sendMessage(to: string, text: string): Promise<{ id: string | null | undefined }> {
    if (!this.sock) {
      throw new Error("BaileysClient is not connected. Call connect() first.");
    }

    const now = Date.now();
    const waitMs = MIN_MS_BETWEEN_SENDS - (now - lastSendAt);
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    lastSendAt = Date.now();

    const jid = to.includes("@") ? to : `${to.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
    const result = await this.sock.sendMessage(jid, { text });
    return { id: result?.key.id };
  }

  isConnected(): boolean {
    return this.sock !== null;
  }
}

export const baileysClient = new BaileysClient();
