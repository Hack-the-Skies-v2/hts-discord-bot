import { beforeEach, describe, expect, it } from "vitest";
import { answerQuestion, getPointsMessage, linkAccount } from "../src/handlers.js";
import type { Question } from "../src/logic.js";
import type { Store } from "../src/store.js";

const question: Question = { id: "q1", question: "?", choices: ["right", "wrong"], correctIndex: 0, timeLimitSeconds: 30 };

function fakeStore(accepted = true, cap: number | null = null) {
  const links = new Map<string, string>();
  const answered = new Set<string>();
  const balances = new Map<string, number>();
  const store: Store = {
    getLinkedUserId: async (d) => links.get(d) ?? null,
    findUserIdByEmail: async (e) => (e === "hacker@example.com" ? "user-1" : null),
    isAcceptedParticipant: async () => accepted,
    linkDiscord: async (d, u) => {
      if ([...links.entries()].some(([id, user]) => user === u && id !== d)) return "user-taken";
      links.set(d, u);
      return "ok";
    },
    listQuestions: async () => [question],
    markQuestionAsked: async () => {},
    getQuestion: async () => question,
    recordAnswer: async (u, q) => (answered.has(`${u}:${q}`) ? false : (answered.add(`${u}:${q}`), true)),
    getTriviaProgress: async (u) => ({ earned: (balances.get(u) ?? 0) / 10, max: cap }),
    awardTriviaPoints: async (u) => (balances.set(u, (balances.get(u) ?? 0) + 10), 10),
    getBalance: async (u) => balances.get(u) ?? 0,
    leaderboard: async () => [],
  };
  return { store, balances };
}

describe("linkAccount", () => {
  it("links a known email, rejects unknown and malformed ones", async () => {
    const { store } = fakeStore();
    expect(await linkAccount(store, "d1", "hacker@example.com")).toMatch(/Linked/);
    expect(await linkAccount(store, "d1", "ghost@example.com")).toMatch(/couldn't find/);
    expect(await linkAccount(store, "d1", "nope")).toMatch(/email address/);
  });
  it("refuses to link accounts that aren't accepted", async () => {
    const { store } = fakeStore(false);
    expect(await linkAccount(store, "d1", "hacker@example.com")).toMatch(/hasn't been accepted/);
    expect(await store.getLinkedUserId("d1")).toBeNull();
  });
  it("refuses to link one HTS account to two Discords", async () => {
    const { store } = fakeStore();
    await linkAccount(store, "d1", "hacker@example.com");
    expect(await linkAccount(store, "d2", "hacker@example.com")).toMatch(/already linked/);
  });
});

describe("trivia cap", () => {
  it("stops awarding once the hacker reaches the cap and doesn't record the answer", async () => {
    const { store, balances } = fakeStore(true, 2);
    await linkAccount(store, "d1", "hacker@example.com");
    const q = (id: string): Question => ({ ...question, id });
    const base = { discordId: "d1", choiceIndex: 0, postedAtMs: 0, nowMs: 1_000 };
    expect(await answerQuestion(store, { ...base, question: q("a") })).toEqual({ status: "correct", points: 10 });
    expect(await answerQuestion(store, { ...base, question: q("b") })).toEqual({ status: "correct", points: 10 });
    expect(await answerQuestion(store, { ...base, question: q("c") })).toEqual({ status: "capped", max: 2 });
    expect(balances.get("user-1")).toBe(20);
  });
  it("wrong answers never count toward the cap", async () => {
    const { store } = fakeStore(true, 1);
    await linkAccount(store, "d1", "hacker@example.com");
    const base = { discordId: "d1", postedAtMs: 0, nowMs: 1_000 };
    expect(await answerQuestion(store, { ...base, question: { ...question, id: "a" }, choiceIndex: 1 })).toEqual({ status: "wrong" });
    expect(await answerQuestion(store, { ...base, question: { ...question, id: "b" }, choiceIndex: 0 })).toEqual({ status: "correct", points: 10 });
  });
});

describe("answerQuestion", () => {
  let ctx: ReturnType<typeof fakeStore>;
  const args = (over = {}) => ({ discordId: "d1", question, choiceIndex: 0, postedAtMs: 0, nowMs: 5_000, ...over });

  beforeEach(async () => {
    ctx = fakeStore();
    await linkAccount(ctx.store, "d1", "hacker@example.com");
  });

  it("awards points for a correct, on-time answer", async () => {
    expect(await answerQuestion(ctx.store, args())).toEqual({ status: "correct", points: 10 });
    expect(await getPointsMessage(ctx.store, "d1")).toContain("10");
  });
  it("gives no points for a wrong answer and doesn't leak the answer", async () => {
    expect(await answerQuestion(ctx.store, args({ choiceIndex: 1 }))).toEqual({ status: "wrong" });
    expect(ctx.balances.size).toBe(0);
  });
  it("rejects late answers without recording them", async () => {
    expect(await answerQuestion(ctx.store, args({ nowMs: 31_000 }))).toEqual({ status: "expired" });
  });
  it("only lets each hacker answer once", async () => {
    await answerQuestion(ctx.store, args());
    expect(await answerQuestion(ctx.store, args())).toEqual({ status: "already-answered" });
    expect(ctx.balances.get("user-1")).toBe(10);
  });
  it("requires a linked account", async () => {
    expect(await answerQuestion(ctx.store, args({ discordId: "stranger" }))).toEqual({ status: "not-linked" });
  });
});
