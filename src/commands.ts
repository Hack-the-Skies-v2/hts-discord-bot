import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("link")
    .setDescription("Link your Discord to your HTS hacker account")
    .addStringOption((o) => o.setName("email").setDescription("The email you signed up with on the HTS portal").setRequired(true)),
  new SlashCommandBuilder().setName("points").setDescription("See your HTS points balance"),
  new SlashCommandBuilder().setName("leaderboard").setDescription("See the top hackers by points"),
  new SlashCommandBuilder()
    .setName("trivia")
    .setDescription("Post a trivia question (organizers only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
].map((c) => c.toJSON());
