import { REST, Routes } from "discord.js";
import { buildSlashCommands } from "./commands";
import { loadConfig } from "./config";

const config = loadConfig();
const rest = new REST({ version: "10" }).setToken(config.discordToken);
const commandData = buildSlashCommands().map((command) => command.toJSON());

if (config.discordGuildId) {
  await rest.put(
    Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId),
    { body: commandData },
  );
  console.log(`Registered ${commandData.length} guild commands.`);
} else {
  await rest.put(Routes.applicationCommands(config.discordClientId), {
    body: commandData,
  });
  console.log(`Registered ${commandData.length} global commands.`);
}
