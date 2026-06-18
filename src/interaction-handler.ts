import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  Interaction,
  Message,
} from "discord.js";
import { commandNames } from "./commands";
import { parseRegistrationMessage } from "./message-registration";
import type {
  PriceFetchResult,
  ProductSummary,
  ProductUrl,
  ProductUrlWithProduct,
  RegisterProductInput,
} from "./types";

const defaultThresholdPercent = 10;

export type RegisterProductRepositoryInput = RegisterProductInput & {
  basePrice: number;
  lastPrice: number;
};

export type SaleNotifyRepository = {
  registerProduct(
    input: RegisterProductRepositoryInput,
  ): Promise<ProductUrl | ProductUrlWithProduct | void>;
  listProducts(): Promise<ProductSummary[]>;
  listProductUrls(name: string): Promise<Array<ProductUrl | ProductUrlWithProduct>>;
  deleteProductUrl(input: { name: string; url: string }): Promise<boolean>;
  deleteProductUrlsByName(name: string): Promise<number>;
  setBasePrice(input: {
    name: string;
    url: string;
    basePrice: number;
  }): Promise<ProductUrl | ProductUrlWithProduct | null>;
  setThresholdPercent(input: {
    name: string;
    url: string;
    thresholdPercent: number;
  }): Promise<ProductUrl | ProductUrlWithProduct | null>;
};

export type PriceApi = {
  fetchPrice(url: string): Promise<PriceFetchResult | null>;
};

export type InteractionHandlerDependencies = {
  repository: SaleNotifyRepository;
  pricing: PriceApi;
  defaultThresholdPercent?: number;
  logger?: Pick<Console, "error">;
};

export function createInteractionHandler(
  deps: InteractionHandlerDependencies,
): (interaction: Interaction) => Promise<void> {
  return async (interaction) => {
    if (interaction.isAutocomplete()) {
      await handleAutocompleteInteraction(interaction, deps);
      return;
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    await handleChatInputCommand(interaction, deps);
  };
}

export async function handleAutocompleteInteraction(
  interaction: AutocompleteInteraction,
  deps: InteractionHandlerDependencies,
): Promise<void> {
  try {
    const focused = interaction.options.getFocused(true);

    if (
      (interaction.commandName === commandNames.list ||
        interaction.commandName === commandNames.delete) &&
      focused.name === "name"
    ) {
      const products = await deps.repository.listProducts();
      await interaction.respond(
        toAutocompleteChoices(
          products.map((product) => product.name),
          String(focused.value),
        ),
      );
      return;
    }

    if (interaction.commandName === commandNames.delete && focused.name === "url") {
      const name = interaction.options.getString("name")?.trim();
      const urls = name
        ? (await deps.repository.listProductUrls(name)).map((entry) => entry.url)
        : [];

      await interaction.respond(
        toAutocompleteChoices(["all", ...urls], String(focused.value)),
      );
      return;
    }

    await interaction.respond([]);
  } catch (error) {
    deps.logger?.error(error);
    await interaction.respond([]);
  }
}

export function createMessageRegistrationHandler(
  deps: InteractionHandlerDependencies,
): (message: Message) => Promise<void> {
  return async (message) => {
    if (message.author.bot) {
      return;
    }

    const parsed = parseRegistrationMessage(message.content);
    if (!parsed) {
      return;
    }

    const response = await registerProductFromInput({
      name: parsed.name,
      url: parsed.url,
      thresholdPercent:
        deps.defaultThresholdPercent ?? defaultThresholdPercent,
      deps,
    });

    await message.reply(response);
  };
}

export async function handleChatInputCommand(
  interaction: ChatInputCommandInteraction,
  deps: InteractionHandlerDependencies,
): Promise<void> {
  try {
    switch (interaction.commandName) {
      case commandNames.register:
        await handleRegisterCommand(interaction, deps);
        return;
      case commandNames.list:
        await handleListCommand(interaction, deps);
        return;
      case commandNames.delete:
        await handleDeleteCommand(interaction, deps);
        return;
      case commandNames.setBase:
        await handleSetBaseCommand(interaction, deps);
        return;
      case commandNames.setThreshold:
        await handleSetThresholdCommand(interaction, deps);
        return;
      case commandNames.help:
        await reply(interaction, formatHelp());
        return;
      default:
        await reply(interaction, "未対応のコマンドです。`/help` を確認してください。", true);
    }
  } catch (error) {
    deps.logger?.error(error);
    await reply(
      interaction,
      "処理中にエラーが発生しました。時間をおいてもう一度お試しください。",
      true,
    );
  }
}

async function handleRegisterCommand(
  interaction: ChatInputCommandInteraction,
  deps: InteractionHandlerDependencies,
): Promise<void> {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply();
  }

  const url = interaction.options.getString("url", true);
  const name = interaction.options.getString("name", true).trim();
  const thresholdPercent =
    interaction.options.getNumber("threshold") ??
    deps.defaultThresholdPercent ??
    defaultThresholdPercent;

  const response = await registerProductFromInput({
    name,
    url,
    thresholdPercent,
    deps,
  });

  await reply(interaction, response);
}

async function handleListCommand(
  interaction: ChatInputCommandInteraction,
  deps: InteractionHandlerDependencies,
): Promise<void> {
  const name = interaction.options.getString("name")?.trim();

  if (name) {
    const entries = await deps.repository.listProductUrls(name);
    await reply(interaction, formatProductUrlList(name, entries));
    return;
  }

  const products = await deps.repository.listProducts();
  await reply(interaction, formatProductSummaryList(products));
}

async function handleDeleteCommand(
  interaction: ChatInputCommandInteraction,
  deps: InteractionHandlerDependencies,
): Promise<void> {
  const name = interaction.options.getString("name", true).trim();
  const url = interaction.options.getString("url", true).trim();

  if (url === "all") {
    const deletedCount = await deps.repository.deleteProductUrlsByName(name);
    await reply(
      interaction,
      deletedCount > 0
        ? `削除しました: ${name}\n${deletedCount}件`
        : `対象の登録が見つかりませんでした: ${name}`,
      deletedCount === 0,
    );
    return;
  }

  const deleted = await deps.repository.deleteProductUrl({ name, url });

  await reply(
    interaction,
    deleted
      ? `削除しました: ${name}\n${url}`
      : `対象の登録が見つかりませんでした: ${name}\n${url}`,
    !deleted,
  );
}

async function handleSetBaseCommand(
  interaction: ChatInputCommandInteraction,
  deps: InteractionHandlerDependencies,
): Promise<void> {
  const name = interaction.options.getString("name", true).trim();
  const url = interaction.options.getString("url", true);
  const basePrice = interaction.options.getInteger("price", true);
  const updated = await deps.repository.setBasePrice({ name, url, basePrice });

  await reply(
    interaction,
    updated
      ? `基準価格を更新しました: ${name}\n基準価格: ${formatYen(basePrice)}\n${url}`
      : `対象の登録が見つかりませんでした: ${name}\n${url}`,
    !updated,
  );
}

async function handleSetThresholdCommand(
  interaction: ChatInputCommandInteraction,
  deps: InteractionHandlerDependencies,
): Promise<void> {
  const name = interaction.options.getString("name", true).trim();
  const url = interaction.options.getString("url", true);
  const thresholdPercent = interaction.options.getNumber("percent", true);
  const updated = await deps.repository.setThresholdPercent({
    name,
    url,
    thresholdPercent,
  });

  await reply(
    interaction,
    updated
      ? `しきい値を更新しました: ${name}\n通知条件: ${formatPercent(thresholdPercent)}以上の値下げ\n${url}`
      : `対象の登録が見つかりませんでした: ${name}\n${url}`,
    !updated,
  );
}

async function registerProductFromInput(input: {
  name: string;
  url: string;
  thresholdPercent: number;
  deps: InteractionHandlerDependencies;
}): Promise<string> {
  if (!input.name) {
    return "商品名を指定してください。";
  }

  if (!isHttpUrl(input.url)) {
    return "URLは `http://` または `https://` で始まる形式で指定してください。";
  }

  const price = await input.deps.pricing.fetchPrice(input.url).catch((error) => {
    input.deps.logger?.error("Price fetch failed during registration", error);
    return null;
  });
  if (!price) {
    return `価格を取得できなかったため登録できませんでした。\n${input.url}`;
  }

  await input.deps.repository.registerProduct({
    name: input.name,
    url: input.url,
    thresholdPercent: input.thresholdPercent,
    basePrice: price.price,
    lastPrice: price.price,
  });

  return [
    `登録しました: ${input.name}`,
    `基準価格: ${formatYen(price.price)}`,
    `通知条件: ${formatPercent(input.thresholdPercent)}以上の値下げ`,
    input.url,
  ].join("\n");
}

function formatProductSummaryList(products: ProductSummary[]): string {
  if (products.length === 0) {
    return "登録済みの商品はありません。";
  }

  const lines = products
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "ja"))
    .map((product) => {
      const price =
        product.minBasePrice === null || product.maxBasePrice === null
          ? "基準価格未設定"
          : product.minBasePrice === product.maxBasePrice
            ? `基準価格 ${formatYen(product.minBasePrice)}`
            : `基準価格 ${formatYen(product.minBasePrice)}〜${formatYen(product.maxBasePrice)}`;

      return `- ${product.name}: ${product.urlCount}件 / ${price}`;
    });

  return ["登録済みの商品", ...lines].join("\n");
}

function formatProductUrlList(
  name: string,
  entries: Array<ProductUrl | ProductUrlWithProduct>,
): string {
  if (entries.length === 0) {
    return `「${name}」の登録は見つかりませんでした。`;
  }

  const lines = entries.map((entry) =>
    [
      `- ${entry.url}`,
      `  基準価格: ${formatYen(entry.basePrice)}`,
      `  現在価格: ${entry.lastPrice === null ? "未取得" : formatYen(entry.lastPrice)}`,
      `  通知条件: ${formatPercent(entry.thresholdPercent)}以上の値下げ`,
    ].join("\n"),
  );

  return [`「${name}」の登録URL`, ...lines].join("\n");
}

function formatHelp(): string {
  return [
    "使えるコマンド",
    "- `/register url:<URL> name:<商品名> threshold:<割引率>`: 商品URLを登録します。",
    "- `/list`: 登録済みの商品一覧を表示します。",
    "- `/list name:<商品名>`: 商品に紐づくURLを表示します。",
    "- `/delete name:<商品名> url:<URL|all>`: 登録URLを削除します。`all` で商品ごと削除します。",
    "- `/set-base name:<商品名> url:<URL> price:<円>`: 基準価格を変更します。",
    "- `/set-threshold name:<商品名> url:<URL> percent:<割引率>`: 通知しきい値を変更します。",
    "通常メッセージでも `<URL> <商品名>` または `<商品名> <URL>` 形式なら登録できます。",
  ].join("\n");
}

function toAutocompleteChoices(values: string[], focusedValue: string) {
  const normalizedFocusedValue = focusedValue.toLocaleLowerCase();
  const seen = new Set<string>();

  return values
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .filter((value) => {
      if (seen.has(value)) {
        return false;
      }
      seen.add(value);
      return value.toLocaleLowerCase().includes(normalizedFocusedValue);
    })
    .slice(0, 25)
    .map((value) => ({
      name: value.length > 100 ? `${value.slice(0, 97)}...` : value,
      value,
    }));
}

async function reply(
  interaction: ChatInputCommandInteraction,
  content: string,
  ephemeral = false,
): Promise<void> {
  if (interaction.deferred || interaction.replied) {
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply({ content });
      return;
    }

    await interaction.followUp({ content, ephemeral });
    return;
  }

  await interaction.reply({ content, ephemeral });
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function formatYen(value: number): string {
  return `${value.toLocaleString("ja-JP")}円`;
}

function formatPercent(value: number): string {
  return `${value.toLocaleString("ja-JP", {
    maximumFractionDigits: 2,
  })}%`;
}
