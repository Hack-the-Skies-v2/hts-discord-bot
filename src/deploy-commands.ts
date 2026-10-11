import "dotenv/config";
import { REST, Routes } from "discord.js";
import { commands } from "./commands.js";

const token = process.env.DISCORD_TOKEN ?? process.env.BOT_TOKEN ?? process.env.bot_token;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;
if (!token || !clientId) throw new Error("Missing DISCORD_TOKEN or DISCORD_CLIENT_ID");

const rest = new REST().setToken(token);
const route = guildId ? Routes.applicationGuildCommands(clientId, guildId) : Routes.applicationCommands(clientId);
await rest.put(route, { body: commands });
console.log(`Registered ${commands.length} commands${guildId ? ` to guild ${guildId}` : " globally"}.`);
