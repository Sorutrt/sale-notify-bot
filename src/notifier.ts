import type { Client } from "discord.js";
import type { NotificationPayload } from "./types";

export type Notifier = (payload: NotificationPayload) => Promise<void>;

type SendableChannel = {
  send(message: string): Promise<unknown>;
};

function formatPrice(value: number): string {
  return `${Math.round(value).toLocaleString("ja-JP")}円`;
}

export function formatPriceDropNotification({
  productName,
  url,
  currentPrice,
  basePrice,
  discountPercent,
}: NotificationPayload): string {
  return [
    `セール通知: ${productName}`,
    `現在価格: ${formatPrice(currentPrice)} (${discountPercent.toFixed(1)}% OFF)`,
    `基準価格: ${formatPrice(basePrice)}`,
    url,
  ].join("\n");
}

export function createDiscordNotifier(
  client: Client,
  channelId: string,
): Notifier {
  return async (payload) => {
    const channel = await client.channels.fetch(channelId);

    if (!channel || !("send" in channel) || typeof channel.send !== "function") {
      throw new Error(`Discord channel is not sendable: ${channelId}`);
    }

    await (channel as SendableChannel).send(formatPriceDropNotification(payload));
  };
}

