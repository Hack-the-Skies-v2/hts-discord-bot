import { describe, expect, it } from "vitest";
import { answerQuestion, getPointsMessage, linkAccount, startTrivia } from "../src/handlers.js";
import { fakeStore, questions } from "./fakeStore.js";

const [q1, q2] = questions;
const base = { discordId: "linked", postedAtMs: 0, nowMs: 5_000 };

describe("linkAccount", () => {
  it("links a known, accepted email and rejects unknown, malformed and unaccepted ones", async () => {
    const { store } = fakeStore();
    expect(await linkAccount(store, "d9", "hacker@example.com")).toMatch(/Linked/);
    expect(await linkAccount(store, "d9", "ghost@example.com")).toMatch(/couldn't find/);
    expect(await linkAccount(store, "d9", "nope")).toMatch(/email address/);
    expect(await linkAccount(fakeStore({ accepted: false }).store, "d9", "hacker@example.com")).toMatch(/hasn't been accepted/);
  });
  it("refuses to link one HTS account to two Discords", async () => {
    const { store } = fakeStore();
    await linkAccount(store, "d9", "hacker@example.com");
    expect(await linkAccount(store, "d10", "hacker@example.com")).toMatch(/already linked/);
  });
});

describe("startTrivia", () => {
  it("requires a linked account", async () => {
    expect(await startTrivia(fakeStore().store, "stranger")).toEqual({ status: "not-linked" });
  });

  it("issues each question once before repeating any", async () => {
    const { store } = fakeStore();
    const seen = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const res = await startTrivia(store, "linked");
      expect(res.status).toBe("question");
      if (res.status === "question") seen.add(res.question.id);
    }
    expect(seen.size).toBe(3);
  });

  it("recycles missed and skipped questions once the whole pool has been seen", async () => {
    const { store } = fakeStore({ pool: [q1] });
    const first = await startTrivia(store, "linked");
    expect(first).toMatchObject({ status: "question" });
    // never answered, so it's still "issued"; a later one-click expiry closes it as missed
    await store.respondToQuestion("user-1", q1.id, false);
    expect(await startTrivia(store, "linked")).toMatchObject({ status: "question", question: { id: "q1" } });
  });

  it("never recycles a question the hacker got right", async () => {
    const { store } = fakeStore({ pool: [q1] });
    await store.issueQuestion("user-1", q1.id);
    await store.respondToQuestion("user-1", q1.id, true);
    expect(await startTrivia(store, "linked")).toEqual({ status: "none-left" });
  });

  it("gives no new question once the hacker is at the cap", async () => {
    expect(await startTrivia(fakeStore({ cap: 0 }).store, "linked")).toEqual({ status: "capped", max: 0 });
  });
});

describe("answerQuestion", () => {
  it("awards points for a correct, on-time answer", async () => {
    const { store, earnedCount } = fakeStore();
    await store.issueQuestion("user-1", q1.id);
    expect(await answerQuestion(store, { ...base, question: q1, choiceIndex: 0 })).toEqual({ status: "correct", points: 10 });
    expect(earnedCount()).toBe(1);
    expect(await getPointsMessage(store, "linked")).toContain("10");
  });

  it("gives nothing for a wrong answer and doesn't leak the answer", async () => {
    const { store, earnedCount } = fakeStore();
    await store.issueQuestion("user-1", q1.id);
    expect(await answerQuestion(store, { ...base, question: q1, choiceIndex: 1 })).toEqual({ status: "wrong" });
    expect(earnedCount()).toBe(0);
  });

  it("treats an answer after 10 seconds as expired, even if it was right, and burns the question", async () => {
    const { store, earnedCount } = fakeStore();
    await store.issueQuestion("user-1", q1.id);
    expect(await answerQuestion(store, { ...base, question: q1, choiceIndex: 0, nowMs: 10_001 })).toEqual({ status: "expired" });
    expect(earnedCount()).toBe(0);
    expect(await answerQuestion(store, { ...base, question: q1, choiceIndex: 0 })).toEqual({ status: "already-answered" });
  });

  it("accepts an answer right at the 10 second mark", async () => {
    const { store } = fakeStore();
    await store.issueQuestion("user-1", q1.id);
    expect(await answerQuestion(store, { ...base, question: q1, choiceIndex: 0, nowMs: 10_000 })).toMatchObject({ status: "correct" });
  });

  it("only counts the first click", async () => {
    const { store, earnedCount } = fakeStore();
    await store.issueQuestion("user-1", q1.id);
    await answerQuestion(store, { ...base, question: q1, choiceIndex: 0 });
    expect(await answerQuestion(store, { ...base, question: q1, choiceIndex: 0 })).toEqual({ status: "already-answered" });
    expect(earnedCount()).toBe(1);
  });

  it("can't answer a question that was never issued to them", async () => {
    const { store } = fakeStore();
    expect(await answerQuestion(store, { ...base, question: q2, choiceIndex: 1 })).toEqual({ status: "already-answered" });
  });

  it("requires a linked account", async () => {
    const { store } = fakeStore();
    expect(await answerQuestion(store, { ...base, discordId: "stranger", question: q1, choiceIndex: 0 })).toEqual({ status: "not-linked" });
  });

  it("stops awarding at the cap and wrong answers don't count toward it", async () => {
    const { store, earnedCount } = fakeStore({ cap: 1 });
    for (const q of [questions[0], questions[1], questions[2]]) await store.issueQuestion("user-1", q.id);
    expect(await answerQuestion(store, { ...base, question: q1, choiceIndex: 1 })).toEqual({ status: "wrong" });
    expect(await answerQuestion(store, { ...base, question: q2, choiceIndex: 1 })).toEqual({ status: "correct", points: 10 });
    expect(await answerQuestion(store, { ...base, question: questions[2], choiceIndex: 0 })).toEqual({ status: "capped", max: 1 });
    expect(earnedCount()).toBe(1);
  });
});
