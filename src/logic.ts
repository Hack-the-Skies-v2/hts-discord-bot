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

export type LeaderboardRow = {
  discordId: string;
  /** Total HTS points balance (check-in, workshops, trivia, ...). */
  balance: number;
  /** The part of that balance that came from Discord trivia. */
  triviaPoints: number;
  /** Most points trivia can ever give one person (null = no cap). */
  triviaMax: number | null;
};

export function formatLeaderboard(rows: LeaderboardRow[]): string {
  if (rows.length === 0) return "No one is on the leaderboard yet!";
  const medals = ["🥇", "🥈", "🥉"];
  const lines = rows.map((row, i) => {
    const trivia = row.triviaMax === null ? `${row.triviaPoints}` : `${row.triviaPoints}/${row.triviaMax}`;
    return `${medals[i] ?? `${i + 1}.`} <@${row.discordId}> — ${row.balance} pts (trivia ${trivia})`;
  });
  const max = rows[0].triviaMax;
  const note = max === null ? "Scores are total HTS points." : `Scores are total HTS points. Trivia is capped at ${max} points per person.`;
  return `${lines.join("\n")}\n\n_${note}_`;
}
