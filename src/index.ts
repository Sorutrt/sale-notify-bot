import type { InteractionReplyOptions } from "discord.js";
import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import cron from "node-cron";
import { loadConfig } from "./config";
import { createDatabase } from "./db";
import { createInteractionHandler } from "./interaction-handler";
import { createMessageRegistrationHandler } from "./interaction-handler";
import { createDiscordNotifier } from "./notifier";
import { fetchPrice } from "./pricing";
import { createRepository } from "./repository";
import { runPriceCheck } from "./price-checker";

const config = loadConfig();
const db = createDatabase(config.databasePath);
const repository = createRepository(db);
const pricing = {
  fetchPrice: (url: string) => fetchPrice(url, { userAgent: config.userAgent }),
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const handleInteraction = createInteractionHandler({
  repository,
  pricing,
  logger: console,
});
const handleMessageRegistration = createMessageRegistrationHandler({
  repository,
  pricing,
  logger: console,
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);

  const notify = createDiscordNotifier(client, config.discordNotifyChannelId);
  cron.schedule(config.priceCheckCron, async () => {
    try {
      await runPriceCheck({ repository, fetchPrice, notify });
    } catch (error) {
      console.error("Price check failed", error);
    }
  });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() && !interaction.isAutocomplete()) {
    return;
  }

  try {
    await handleInteraction(interaction);
  } catch (error) {
    console.error("Interaction handling failed", error);
    if (interaction.isAutocomplete()) {
      return;
    }

    const message = "処理中にエラーが発生しました。ログを確認してください。";
    const response: InteractionReplyOptions = {
      content: message,
      flags: MessageFlags.Ephemeral,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(response);
    } else {
      await interaction.reply(response);
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  try {
    await handleMessageRegistration(message);
  } catch (error) {
    console.error("Message registration failed", error);
    await message.reply("価格を取得できなかったため登録できませんでした。対応サイトの URL か確認してください。");
  }
});

await client.login(config.discordToken);
