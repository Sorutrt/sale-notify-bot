export type AppConfig = {
  discordToken: string;
  discordClientId: string;
  discordGuildId?: string;
  discordNotifyChannelId: string;
  databasePath: string;
  priceCheckCron: string;
  userAgent: string;
};

function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): AppConfig {
  const config: AppConfig = {
    discordToken: readRequiredEnv("DISCORD_TOKEN"),
    discordClientId: readRequiredEnv("DISCORD_CLIENT_ID"),
    discordNotifyChannelId: readRequiredEnv("DISCORD_NOTIFY_CHANNEL_ID"),
    databasePath: process.env.DATABASE_PATH || "./sale-notify.db",
    priceCheckCron: process.env.PRICE_CHECK_CRON || "*/10 * * * *",
    userAgent: process.env.USER_AGENT || "sale-notify-bot/0.1",
  };

  if (process.env.DISCORD_GUILD_ID) {
    config.discordGuildId = process.env.DISCORD_GUILD_ID;
  }

  return config;
}
