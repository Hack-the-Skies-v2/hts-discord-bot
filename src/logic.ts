export type Question = {
  id: string;
  question: string;
  choices: string[];
  correctIndex: number;
  timeLimitSeconds: number;
};

export type AnswerOutcome =
  | { status: "not-linked" }
  | { status: "expired" }
  | { status: "capped"; max: number }
  | { status: "already-answered" }
  | { status: "correct"; points: number }
  | { status: "wrong" };

export const CHOICE_LABELS = ["A", "B", "C", "D"];

export function isWithinTimeLimit(postedAtMs: number, nowMs: number, limitSeconds: number): boolean {
  return nowMs - postedAtMs <= limitSeconds * 1000;
}

export function formatQuestion(q: Question): string {
  const lines = q.choices.map((choice, i) => `**${CHOICE_LABELS[i]})** ${choice}`);
  return `**${q.question}**\n${lines.join("\n")}\n\nYou have ${q.timeLimitSeconds}s. One answer per question!`;
}

export function pickQuestion(questions: Question[], askedIds: Set<string>, random = Math.random): Question | null {
  const fresh = questions.filter((q) => !askedIds.has(q.id));
  if (fresh.length === 0) return null;
  return fresh[Math.floor(random() * fresh.length)];
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function formatLeaderboard(rows: { discordId: string; balance: number }[]): string {
  if (rows.length === 0) return "No one is on the leaderboard yet!";
  const medals = ["🥇", "🥈", "🥉"];
  return rows
    .map((row, i) => `${medals[i] ?? `${i + 1}.`} <@${row.discordId}> — ${row.balance} pts`)
    .join("\n");
}
