import {
  SlashCommandBuilder,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";

export const commandNames = {
  register: "register",
  list: "list",
  delete: "delete",
  setBase: "set-base",
  setThreshold: "set-threshold",
  help: "help",
} as const;

export type CommandName = (typeof commandNames)[keyof typeof commandNames];

export const slashCommands = [
  new SlashCommandBuilder()
    .setName(commandNames.register)
    .setDescription("商品URLを登録して価格の値下がりを監視します")
    .addStringOption((option) =>
      option
        .setName("url")
        .setDescription("監視する商品のURL")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("name").setDescription("商品名").setRequired(true),
    )
    .addNumberOption((option) =>
      option
        .setName("threshold")
        .setDescription("通知する割引率（%）。未指定の場合は10%")
        .setMinValue(0)
        .setMaxValue(100)
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName(commandNames.list)
    .setDescription("登録済みの商品を表示します")
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("詳細を表示する商品名")
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName(commandNames.delete)
    .setDescription("指定した商品のURL登録を削除します")
    .addStringOption((option) =>
      option.setName("name").setDescription("商品名").setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("url").setDescription("削除するURL").setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName(commandNames.setBase)
    .setDescription("指定したURLの基準価格を変更します")
    .addStringOption((option) =>
      option.setName("name").setDescription("商品名").setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("url").setDescription("対象URL").setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("price")
        .setDescription("新しい基準価格（円）")
        .setMinValue(1)
        .setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName(commandNames.setThreshold)
    .setDescription("指定したURLの通知しきい値を変更します")
    .addStringOption((option) =>
      option.setName("name").setDescription("商品名").setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("url").setDescription("対象URL").setRequired(true),
    )
    .addNumberOption((option) =>
      option
        .setName("percent")
        .setDescription("通知する割引率（%）")
        .setMinValue(0)
        .setMaxValue(100)
        .setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName(commandNames.help)
    .setDescription("使い方を表示します"),
] as const;

export function buildSlashCommandDefinitions(): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  return slashCommands.map((command) => command.toJSON());
}

export function buildSlashCommands(): typeof slashCommands {
  return slashCommands;
}
