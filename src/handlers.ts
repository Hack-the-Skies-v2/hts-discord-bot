import { isValidEmail, isWithinTimeLimit, type AnswerOutcome, type Question } from "./logic.js";
import type { Store } from "./store.js";

export async function linkAccount(store: Store, discordId: string, email: string): Promise<string> {
  if (!isValidEmail(email)) return "That doesn't look like an email address.";
  const userId = await store.findUserIdByEmail(email);
  if (!userId) return "I couldn't find an HTS account with that email. Sign up on the HTS portal first!";
  if (!(await store.isAcceptedParticipant(userId, email))) {
    return "Your HTS application hasn't been accepted yet, so I can't link you. Ask an organizer if you think this is a mistake.";
  }
  const result = await store.linkDiscord(discordId, userId);
  if (result === "user-taken") return "That HTS account is already linked to a different Discord account. Ask an organizer for help.";
  return "Linked! You can now answer trivia and check your points with `/points`.";
}

export async function answerQuestion(
  store: Store,
  args: { discordId: string; question: Question; choiceIndex: number; postedAtMs: number; nowMs: number },
): Promise<AnswerOutcome> {
  const { discordId, question, choiceIndex, postedAtMs, nowMs } = args;
  const userId = await store.getLinkedUserId(discordId);
  if (!userId) return { status: "not-linked" };
  if (!isWithinTimeLimit(postedAtMs, nowMs, question.timeLimitSeconds)) return { status: "expired" };

  const { earned, max } = await store.getTriviaProgress(userId);
  if (max !== null && earned >= max) return { status: "capped", max };

  const correct = choiceIndex === question.correctIndex;
  const recorded = await store.recordAnswer(userId, question.id, correct);
  if (!recorded) return { status: "already-answered" };

  if (!correct) return { status: "wrong" };
  try {
    return { status: "correct", points: await store.awardTriviaPoints(userId) };
  } catch (err) {
    // Two answers racing past the cap check: the database trigger is the final say.
    if (err instanceof Error && /redemption limit/i.test(err.message)) return { status: "capped", max: max ?? earned };
    throw err;
  }
}

export async function getPointsMessage(store: Store, discordId: string): Promise<string> {
  const userId = await store.getLinkedUserId(discordId);
  if (!userId) return "Link your account first with `/link email:<your HTS email>`.";
  return `You have **${await store.getBalance(userId)}** points.`;
}

export function outcomeMessage(outcome: AnswerOutcome): string {
  switch (outcome.status) {
    case "not-linked":
      return "Link your HTS account first with `/link email:<your HTS email>`, then try the next question.";
    case "expired":
      return "Time's up for this question!";
    case "capped":
      return `You've already earned points for ${outcome.max} correct trivia answers, the maximum. Thanks for playing!`;
    case "already-answered":
      return "You already answered this one.";
    case "correct":
      return `✅ Correct! +${outcome.points} points.`;
    case "wrong":
      return "❌ Not quite! The answer gets revealed when time's up.";
  }
}
