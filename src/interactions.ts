import { answerQuestion, getPointsMessage, linkAccount, outcomeMessage } from "./handlers.js";
import { CHOICE_LABELS, formatLeaderboard, formatQuestion, pickQuestion, type Question } from "./logic.js";
import type { Store } from "./store.js";

const MANAGE_GUILD = 1n << 5n;
const EPHEMERAL = 64;

type Interaction = {
  type: number;
  data?: { name?: string; custom_id?: string; options?: { name: string; value: string }[] };
  member?: { user?: { id: string }; permissions?: string };
  user?: { id: string };
  message?: { timestamp: string };
};

export type InteractionResponse = { type: number; data?: Record<string, unknown> };

const reply = (content: string, extra: Record<string, unknown> = {}): InteractionResponse => ({
  type: 4,
  data: { content, flags: EPHEMERAL, ...extra },
});

function triviaButtons(q: Question) {
  return [
    {
      type: 1,
      components: q.choices.map((_, i) => ({ type: 2, style: 1, label: CHOICE_LABELS[i], custom_id: `trivia:${q.id}:${i}` })),
    },
  ];
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
        const perms = BigInt(interaction.member?.permissions ?? "0");
        if (!(perms & MANAGE_GUILD)) return reply("Only organizers can post trivia.");
        const question = pickQuestion(await store.listQuestions(), new Set(), random);
        if (!question) return reply("No unasked trivia questions left. Add more and run `npm run seed`.");
        await store.markQuestionAsked(question.id);
        return { type: 4, data: { content: formatQuestion(question), components: triviaButtons(question) } };
      }
    }
    return reply("Unknown command.");
  }

  if (interaction.type === 3 && interaction.data?.custom_id?.startsWith("trivia:")) {
    const [, questionId, choice] = interaction.data.custom_id.split(":");
    const question = await store.getQuestion(questionId);
    const postedAtMs = interaction.message ? Date.parse(interaction.message.timestamp) : NaN;
    if (!question || Number.isNaN(postedAtMs)) return reply("This question is closed.");

    const outcome = await answerQuestion(store, { discordId, question, choiceIndex: Number(choice), postedAtMs, nowMs });
    if (outcome.status === "expired") {
      const answer = `${CHOICE_LABELS[question.correctIndex]}) ${question.choices[question.correctIndex]}`;
      return reply(`⏰ Time's up! The answer was **${answer}**.`);
    }
    return reply(outcomeMessage(outcome));
  }

  return reply("Unsupported interaction.");
}
