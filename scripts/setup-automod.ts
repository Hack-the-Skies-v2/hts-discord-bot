// One-time setup: creates Discord AutoMod rules matching the HTS server rules.
// After this runs, Discord enforces them itself (no bot or server needs to be running).
// The bot needs the "Manage Server" permission in the guild. Safe to re-run: existing "HTS:" rules are skipped.
import "dotenv/config";

const token = process.env.DISCORD_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;
const alertChannelId = process.env.DISCORD_ALERT_CHANNEL_ID;
if (!token || !guildId) throw new Error("Set DISCORD_TOKEN and DISCORD_GUILD_ID");

const BLOCK = { type: 1 };
const alert = alertChannelId ? [{ type: 2, metadata: { channel_id: alertChannelId } }] : [];
const base = { event_type: 1, enabled: true, actions: [BLOCK, ...alert] };

const rules = [
  // "No harassment, sexism, racism, or hate speech" / "No NSFW or obscene content"
  { name: "HTS: profanity, sexual content and slurs", trigger_type: 4, trigger_metadata: { presets: [1, 2, 3] } },
  // "No spam"
  { name: "HTS: spam", trigger_type: 3 },
  { name: "HTS: mention spam", trigger_type: 5, trigger_metadata: { mention_total_limit: 5 } },
  // "No self-promotion (server invites, advertisements) without staff permission"
  {
    name: "HTS: server invites",
    trigger_type: 1,
    trigger_metadata: { regex_patterns: ["discord\\.gg/\\w+", "discord(app)?\\.com/invite/\\w+"] },
  },
];

const api = (path: string, init?: RequestInit) =>
  fetch(`https://discord.com/api/v10${path}`, {
    ...init,
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json", "User-Agent": "DiscordBot (hts, 0.1)" },
  });

const existing: { name: string }[] = await (await api(`/guilds/${guildId}/auto-moderation/rules`)).json();
if (!Array.isArray(existing)) throw new Error(`Could not list AutoMod rules (does the bot have Manage Server?): ${JSON.stringify(existing)}`);

for (const rule of rules) {
  if (existing.some((r) => r.name === rule.name)) {
    console.log(`skip (exists): ${rule.name}`);
    continue;
  }
  const res = await api(`/guilds/${guildId}/auto-moderation/rules`, { method: "POST", body: JSON.stringify({ ...base, ...rule }) });
  console.log(res.ok ? `created: ${rule.name}` : `FAILED ${res.status}: ${rule.name} ${await res.text()}`);
}
