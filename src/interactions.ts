import { answerQuestion, getPointsMessage, linkAccount, outcomeMessage, startMessage, startTrivia } from "./handlers.js";
import { CHOICE_LABELS, formatLeaderboard, formatQuestion, type Question } from "./logic.js";
import type { Store } from "./store.js";

const EPHEMERAL = 64;
const DISCORD_EPOCH_MS = 1420070400000n;

type Interaction = {
  type: number;
  data?: { name?: string; custom_id?: string; options?: { name: string; value: string }[] };
  member?: { user?: { id: string } };
  user?: { id: string };
  message?: { id?: string; timestamp?: string };
};

export type InteractionResponse = { type: number; data?: Record<string, unknown> };

const reply = (content: string, extra: Record<string, unknown> = {}): InteractionResponse => ({
  type: 4,
  data: { content, flags: EPHEMERAL, ...extra },
});

/** Edits the question message in place (removing the buttons) so it can't be clicked twice. */
const updateMessage = (content: string): InteractionResponse => ({ type: 7, data: { content, components: [] } });

function triviaButtons(q: Question) {
  return [
    {
      type: 1,
      components: q.choices.map((_, i) => ({ type: 2, style: 1, label: CHOICE_LABELS[i], custom_id: `trivia:${q.id}:${i}` })),
    },
  ];
}

/** When the question message was created: its timestamp, or the time encoded in its snowflake id. */
function messageTimeMs(message?: { id?: string; timestamp?: string }): number {
  const fromTimestamp = message?.timestamp ? Date.parse(message.timestamp) : NaN;
  if (!Number.isNaN(fromTimestamp)) return fromTimestamp;
  if (message?.id && /^\d+$/.test(message.id)) return Number((BigInt(message.id) >> 22n) + DISCORD_EPOCH_MS);
  return NaN;
}

export async function handleInteraction(
  interaction: Interaction,
  store: Store,
  nowMs = Date.now(),
  random = Math.random,
): Promise<InteractionResponse> {
  if (interaction.type === 1) return { type: 1 }; // PING

  const discordId = interaction.member?.user?.id ?? interaction.user?.id;
  if (!discordId) return reply("I couldn't tell who you are.");

  if (interaction.type === 2) {
    switch (interaction.data?.name) {
      case "link": {
        const email = interaction.data.options?.find((o) => o.name === "email")?.value ?? "";
        return reply(await linkAccount(store, discordId, email.trim()));
      }
      case "points":
        return reply(await getPointsMessage(store, discordId));
      case "leaderboard":
        return { type: 4, data: { content: formatLeaderboard(await store.leaderboard(10)), allowed_mentions: { parse: [] } } };
      case "trivia": {
        const outcome = await startTrivia(store, discordId, random);
        if (outcome.status !== "question") return reply(startMessage(outcome));
        return reply(formatQuestion(outcome.question), { components: triviaButtons(outcome.question) });
      }
    }
    return reply("Unknown command.");
  }

  if (interaction.type === 3 && interaction.data?.custom_id?.startsWith("trivia:")) {
    const [, questionId, choice] = interaction.data.custom_id.split(":");
    const question = await store.getQuestion(questionId);
    const postedAtMs = messageTimeMs(interaction.message);
    if (!question || Number.isNaN(postedAtMs)) return updateMessage("This question is closed.");

    const outcome = await answerQuestion(store, { discordId, question, choiceIndex: Number(choice), postedAtMs, nowMs });
    return updateMessage(outcomeMessage(outcome));
  }

  return reply("Unsupported interaction.");
}
