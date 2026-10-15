import { isValidEmail, isWithinTimeLimit, pickQuestion, type AnswerOutcome, type Question } from "./logic.js";
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

export type StartOutcome =
  | { status: "not-linked" }
  | { status: "capped"; max: number }
  | { status: "none-left" }
  | { status: "question"; question: Question };

/** Issues this hacker a question they haven't seen. Asking for one uses it up, even if they never answer. */
export async function startTrivia(store: Store, discordId: string, random = Math.random): Promise<StartOutcome> {
  const userId = await store.getLinkedUserId(discordId);
  if (!userId) return { status: "not-linked" };
  const { earned, max } = await store.getTriviaProgress(userId);
  if (max !== null && earned >= max) return { status: "capped", max };

  let unseen = await store.listUnseenQuestions(userId);
  if (unseen.length === 0) {
    // They've seen the whole pool: let the ones they missed or skipped come around again.
    await store.recycleQuestions(userId);
    unseen = await store.listUnseenQuestions(userId);
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const question = pickQuestion(unseen, new Set(), random);
    if (!question) return { status: "none-left" };
    if (await store.issueQuestion(userId, question.id)) return { status: "question", question };
    unseen.splice(unseen.indexOf(question), 1); // issued by a concurrent request; try another
  }
  return { status: "none-left" };
}

export async function answerQuestion(
  store: Store,
  args: { discordId: string; question: Question; choiceIndex: number; postedAtMs: number; nowMs: number },
): Promise<AnswerOutcome> {
  const { discordId, question, choiceIndex, postedAtMs, nowMs } = args;
  const userId = await store.getLinkedUserId(discordId);
  if (!userId) return { status: "not-linked" };

  const onTime = isWithinTimeLimit(postedAtMs, nowMs, question.timeLimitSeconds);
  const correct = onTime && choiceIndex === question.correctIndex;
  // Closing the question is atomic, so only the first click (or the expiry) counts.
  if (!(await store.respondToQuestion(userId, question.id, correct))) return { status: "already-answered" };

  if (!onTime) return { status: "expired" };
  if (!correct) return { status: "wrong" };

  const { earned, max } = await store.getTriviaProgress(userId);
  if (max !== null && earned >= max) return { status: "capped", max };
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
      return "⏰ Time's up! That one's gone, try `/trivia` for another.";
    case "capped":
      return `You've already earned points for ${outcome.max} correct trivia answers, the maximum. Thanks for playing!`;
    case "already-answered":
      return "You already answered this one.";
    case "correct":
      return `✅ Correct! +${outcome.points} points.`;
    case "wrong":
      return "❌ Not quite! Try `/trivia` for another question.";
  }
}

export function startMessage(outcome: Exclude<StartOutcome, { status: "question" }>): string {
  switch (outcome.status) {
    case "not-linked":
      return "Link your HTS account first with `/link email:<your HTS email>`, then try `/trivia` again.";
    case "capped":
      return `You've already earned points for ${outcome.max} correct trivia answers, the maximum. Thanks for playing!`;
    case "none-left":
      return "You've seen every trivia question. Great job!";
  }
}
