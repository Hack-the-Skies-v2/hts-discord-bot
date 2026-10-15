// Converts Open Trivia DB (https://opentdb.com) questions into rows for public.trivia_questions.

export type OpenTdbQuestion = {
  type: "multiple" | "boolean";
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
};

export type SeedRow = { question: string; choices: string[]; correct_index: number; time_limit_seconds: number };

// Open Trivia DB category ids: https://opentdb.com/api_category.php
export const DEFAULT_CATEGORIES = [18, 17, 19, 9, 30]; // Computers, Science & Nature, Mathematics, General Knowledge, Gadgets

export function buildUrl(amount: number, category: number): string {
  return `https://opentdb.com/api.php?amount=${amount}&category=${category}&encode=url3986`;
}

export function shuffle<T>(items: T[], random = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Returns null for questions that wouldn't display well as 2-4 buttons. */
export function toSeedRow(q: OpenTdbQuestion, timeLimitSeconds = 10, random = Math.random): SeedRow | null {
  const question = decodeURIComponent(q.question).trim();
  const correct = decodeURIComponent(q.correct_answer).trim();
  const wrong = q.incorrect_answers.map((a) => decodeURIComponent(a).trim());

  const choices = q.type === "boolean" ? ["True", "False"] : shuffle([correct, ...wrong], random);
  const correctIndex = choices.indexOf(correct);

  if (!question || question.length > 400) return null;
  if (correctIndex < 0 || choices.length < 2 || choices.length > 4) return null;
  if (choices.some((c) => !c || c.length > 80) || new Set(choices).size !== choices.length) return null;
  return { question, choices, correct_index: correctIndex, time_limit_seconds: timeLimitSeconds };
}
