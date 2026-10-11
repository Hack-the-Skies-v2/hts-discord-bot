# HTS Discord bot

Trivia + points for HTS 2026 (message moderation is Discord AutoMod, see below). Talks to the same Supabase project as the website.

It is a **serverless "interactions" bot**: Discord POSTs each slash command / button click to `api/interactions.ts`, so no always-on process is needed.

## Commands
- `/link email` — accepted hackers/mentors/judges (and organizers) link Discord to their HTS account
- `/points` — your balance
- `/leaderboard` — top 10 (linked hackers only)
- `/trivia` — any linked hacker gets their own private question (A/B/C/D buttons, **10 seconds**). Asking uses the question up, so nobody sees the same one twice. Correct = +10 pts via the `Discord trivia` point action, capped at 5 correct answers per hacker (`point_actions.max_redemptions`).

## Setup
1. Apply the SQL files in `supabase/` in order (`...create_discord_bot`, `...trivia_asked_at`, `...trivia_cap`, `...trivia_personal`).
2. `cp .env.example .env`, fill it in, then `npm install`, `npm run seed`, `npm run deploy-commands`.
3. Deploy this folder (`discord-bot/` as the project root) to Vercel (or any host that supports Web `Request`/`Response` handlers). Set the same env vars in the host's dashboard (`DISCORD_PUBLIC_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
4. In the Developer Portal → General Information, set **Interactions Endpoint URL** to `https://<your-deployment>/api/interactions`. Discord sends a signed PING to verify it.
5. Invite the bot with scopes `bot applications.commands`.

## Moderation (AutoMod)
`npm run setup-automod` creates AutoMod rules from the server rules (profanity/slurs/sexual content, spam, mention spam, invite links). It needs `DISCORD_GUILD_ID`, optionally `DISCORD_ALERT_CHANNEL_ID`, and the bot needs the Manage Server permission. Discord enforces the rules itself afterwards. Name-format and Devpost/GitHub rules can't be automated.

`npm test` and `npm run typecheck` need no credentials.
