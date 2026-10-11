import type { Question } from "../src/logic.js";
import type { Store } from "../src/store.js";

export const questions: Question[] = [
  { id: "q1", question: "One?", choices: ["right", "wrong"], correctIndex: 0, timeLimitSeconds: 10 },
  { id: "q2", question: "Two?", choices: ["wrong", "right"], correctIndex: 1, timeLimitSeconds: 10 },
  { id: "q3", question: "Three?", choices: ["right", "wrong"], correctIndex: 0, timeLimitSeconds: 10 },
];

type Options = { accepted?: boolean; cap?: number | null; pool?: Question[] };

/** In-memory Store. "linked" is a Discord id that is already linked to user-1. */
export function fakeStore({ accepted = true, cap = null, pool = questions }: Options = {}) {
  const links = new Map<string, string>([["linked", "user-1"]]);
  const rows = new Map<string, { correct: boolean; responded: boolean }>(); // `${user}:${question}`
  let earned = 0;

  const store: Store = {
    getLinkedUserId: async (d) => links.get(d) ?? null,
    findUserIdByEmail: async (e) => (e === "hacker@example.com" ? "user-2" : null),
    isAcceptedParticipant: async () => accepted,
    linkDiscord: async (d, u) => {
      if ([...links.entries()].some(([id, user]) => user === u && id !== d)) return "user-taken";
      links.set(d, u);
      return "ok";
    },
    listUnseenQuestions: async (u) => pool.filter((q) => !rows.has(`${u}:${q.id}`)),
    issueQuestion: async (u, q) => (rows.has(`${u}:${q}`) ? false : (rows.set(`${u}:${q}`, { correct: false, responded: false }), true)),
    getQuestion: async (id) => pool.find((q) => q.id === id) ?? null,
    respondToQuestion: async (u, q, correct) => {
      const row = rows.get(`${u}:${q}`);
      if (!row || row.responded) return false;
      rows.set(`${u}:${q}`, { correct, responded: true });
      return true;
    },
    getTriviaProgress: async () => ({ earned, max: cap }),
    awardTriviaPoints: async () => (earned++, 10),
    getBalance: async () => earned * 10,
    leaderboard: async () => [{ discordId: "1", balance: 5 }],
  };
  return { store, rows, earnedCount: () => earned };
}
